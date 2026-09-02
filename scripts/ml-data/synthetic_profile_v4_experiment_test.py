import json
import unittest
import urllib.error

from synthetic_profile_v4_experiment import (
    _detail_length_contract,
    _record_candidate_valid,
    build_output_schema,
    build_cli_parser,
    build_record_repair_schema,
    build_revision_instruction,
    compose_skeleton_bodies,
    evidence_anchor_requirements,
    find_evidence_anchor_conflicts,
    find_unsupported_claims,
    generate_qwen_by_record,
    normalize_run_metadata,
    repair_qwen_records,
    repair_record_indexes,
    sanitize_creative_record,
    score_draft,
    invalid_record_indexes,
    validate_renderer_output,
)


def payload():
    return {
        "profileSeed": "pilot",
        "targetRecordCount": 2,
        "persona": {"targetRoles": ["데이터"], "experienceYears": 2, "primaryGoal": "build"},
        "propertySchema": {"project": {"technologies": "tags"}, "experience": {}},
        "events": [
            {
                "eventId": "ev1",
                "categoryKey": "project",
                "facts": ["Python으로 데이터 20건을 정리했다"],
                "propertyKeys": ["technologies"],
                "propertyValues": {"technologies": ["Python"]},
            },
            {
                "eventId": "ev2",
                "categoryKey": "experience",
                "facts": ["오류 확인 절차를 체크리스트로 정리했다"],
                "propertyKeys": [],
                "propertyValues": {},
            },
        ],
    }


def draft():
    return {
        "status": "generated",
        "profileSeed": "pilot",
        "persona": {"targetRoles": ["데이터"], "experienceYears": 2, "primaryGoal": "build"},
        "records": [
            {
                "draftId": "r1",
                "eventId": "ev1",
                "categoryKey": "project",
                "title": "데이터 정리",
                "properties": {"technologies": ["Python"]},
                "bodyMd": "Python으로 데이터 20건을 정리했다. 정리한 형식을 다시 확인하고 작업 내용을 개인 노트에 남겼다.",
            },
            {
                "draftId": "r2",
                "eventId": "ev2",
                "categoryKey": "experience",
                "title": "오류 확인 절차",
                "properties": {},
                "bodyMd": "반복하던 오류 확인 절차를 체크리스트로 정리했다. 이후 같은 순서대로 확인하며 누락된 항목을 기록했다.",
            },
        ],
    }


class ScoreDraftTests(unittest.TestCase):
    def test_evidence_rewrite_requires_failure_and_success_outcomes_from_source(self):
        changed_payload = payload()
        changed_payload["events"][1]["renderMode"] = "rewrite_evidence"
        changed_payload["events"][1]["facts"] = [
            "노무사 시험 일 차는 합격했지만 이 차에서 떨어졌고 자격 취득은 못했습니다"
        ]
        changed = draft()
        changed["records"][1]["bodyMd"] = "노무사 시험을 준비하며 노동 관련 법률을 공부했다."

        self.assertEqual(
            set(evidence_anchor_requirements(changed_payload["events"][1])),
            {"failure", "success"},
        )
        self.assertEqual(
            find_evidence_anchor_conflicts(changed_payload, changed),
            [{"eventId": "ev2", "recordIndex": 2, "missing": ["failure", "success"]}],
        )
        result = validate_renderer_output(changed_payload, changed, enforce_skeleton=True)
        self.assertIn("record_2_missing_anchor:failure,success", result["errors"])

    def test_scores_valid_draft_without_invented_numbers(self):
        result = score_draft(payload(), draft(), elapsed_seconds=12.5, output_tokens=400)

        self.assertTrue(result["schemaValid"])
        self.assertEqual(result["recordCompletionRate"], 1.0)
        self.assertEqual(result["inventedNumbers"], [])
        self.assertEqual(result["duplicateRecordPairs"], 0)
        self.assertGreater(result["factTokenCoverage"], 0.5)
        self.assertEqual(result["elapsedSeconds"], 12.5)

    def test_scores_short_fact_only_note_with_v41_minimum(self):
        changed = draft()
        changed["records"][0]["bodyMd"] = "Python으로 데이터 20건을 정리했다."

        result = score_draft(payload(), changed, body_min_length=20)

        self.assertTrue(result["schemaValid"])

    def test_detects_numbers_absent_from_corresponding_event(self):
        changed = draft()
        changed["records"][1]["bodyMd"] += " 총 99건을 처리했다."

        result = score_draft(payload(), changed)

        self.assertEqual(result["inventedNumbers"], [{"eventId": "ev2", "values": ["99"]}])

    def test_treats_zero_padded_input_month_as_same_rendered_number(self):
        changed_payload = payload()
        changed_payload["events"][1]["facts"] = ["2021-09부터 오류 확인 업무를 담당했다"]
        changed = draft()
        changed["records"][1]["bodyMd"] = "2021년 9월부터 오류 확인 업무를 담당했다. 반복 확인하던 절차는 체크리스트로 정리해 사용했다."

        result = score_draft(changed_payload, changed)

        self.assertEqual(result["inventedNumbers"], [])

    def test_counts_near_duplicate_record_bodies(self):
        changed = draft()
        changed["records"][1]["bodyMd"] = changed["records"][0]["bodyMd"]

        result = score_draft(payload(), changed)

        self.assertEqual(result["duplicateRecordPairs"], 1)

    def test_counts_resume_style_claims_not_present_in_facts(self):
        changed = draft()
        changed["records"][1]["bodyMd"] += " 업무 효율성을 높이는 데 기여했다."

        result = score_draft(payload(), changed)

        self.assertEqual(result["clicheCount"], 2)

    def test_reports_each_unsupported_effect_marker_against_its_event(self):
        changed = draft()
        changed["records"][1]["bodyMd"] += " 업무 효율성을 높이는 데 기여했다."

        claims = find_unsupported_claims(payload(), changed)

        self.assertEqual(
            claims,
            [{"eventId": "ev2", "recordIndex": 2, "markers": ["기여", "효율", "높이"]}],
        )

    def test_allows_effect_marker_when_the_event_facts_explicitly_support_it(self):
        changed_payload = payload()
        changed_payload["events"][1]["facts"] = ["오류 점검으로 시스템 안정성 유지에 기여했다"]
        changed = draft()
        changed["records"][1]["bodyMd"] = "오류 점검을 반복하며 시스템 안정성 유지에 기여했다. 관련 확인 내용을 개인 기록으로 남겼다."

        self.assertEqual(find_unsupported_claims(changed_payload, changed), [])

    def test_grounding_gate_rejects_structurally_valid_unsupported_effect(self):
        changed = draft()
        changed["records"][1]["bodyMd"] += " 업무 효율성을 높이는 데 기여했다."

        result = validate_renderer_output(payload(), changed, enforce_grounding=True)

        self.assertFalse(result["valid"])
        self.assertEqual(result["errors"], ["record_2_unsupported_claim:기여,효율,높이"])

    def test_creative_skeleton_gate_allows_plausible_detail_absent_from_facts(self):
        changed = draft()
        changed["records"][1]["bodyMd"] += " 팀원과 확인 순서를 조율해 업무 효율을 높였다."

        result = validate_renderer_output(payload(), changed, enforce_skeleton=True)

        self.assertTrue(result["valid"])

    def test_creative_skeleton_gate_rejects_new_precise_numbers(self):
        changed = draft()
        changed["records"][1]["bodyMd"] += " 이 과정에서 오류 99건을 발견했다."

        result = validate_renderer_output(payload(), changed, enforce_skeleton=True)

        self.assertFalse(result["valid"])
        self.assertEqual(result["errors"], ["record_2_invented_number:99"])

    def test_creative_skeleton_gate_rejects_unfinished_sentence(self):
        changed = draft()
        changed["records"][1]["bodyMd"] = "오류 확인 절차를 체크리스트로 정리하고 작업 순서를 다시 확인하던 중 문장이 잘린 상태"

        result = validate_renderer_output(payload(), changed, enforce_skeleton=True)

        self.assertFalse(result["valid"])
        self.assertIn("record_2_incomplete_sentence", result["errors"])

    def test_creative_skeleton_gate_rejects_repeated_sentence_inside_record(self):
        changed = draft()
        changed["records"][1]["bodyMd"] = "오류 확인 절차를 체크리스트로 정리했다. 오류 확인 절차를 체크리스트로 정리했다."

        result = validate_renderer_output(payload(), changed, enforce_skeleton=True)

        self.assertFalse(result["valid"])
        self.assertIn("record_2_repeated_sentence", result["errors"])

    def test_creative_skeleton_gate_rejects_cjk_character_mixing(self):
        changed = draft()
        changed["records"][1]["bodyMd"] += " 마지막에 잘린 한자 酝."

        result = validate_renderer_output(payload(), changed, enforce_skeleton=True)

        self.assertFalse(result["valid"])
        self.assertIn("record_2_foreign_script", result["errors"])

    def test_creative_skeleton_gate_rejects_cjk_character_in_title(self):
        changed = draft()
        changed["records"][1]["title"] = "資料 확인 절차"

        result = validate_renderer_output(payload(), changed, enforce_skeleton=True)

        self.assertFalse(result["valid"])
        self.assertIn("record_2_foreign_script", result["errors"])

    def test_evidence_rewrite_gate_rejects_interview_tone_and_verbatim_source(self):
        changed_payload = payload()
        changed_payload["events"][1]["renderMode"] = "rewrite_evidence"
        changed_payload["events"][1]["facts"] = [
            "오류 확인 절차를 체크리스트로 정리했고 이후 같은 순서로 확인하며 누락된 항목을 기록했습니다"
        ]
        changed = draft()
        changed["records"][1]["bodyMd"] = (
            "오류 확인 절차를 체크리스트로 정리했고 이후 같은 순서로 확인하며 누락된 항목을 기록했습니다. "
            "앞으로도 이렇게 하겠습니다."
        )

        result = validate_renderer_output(changed_payload, changed, enforce_skeleton=True)

        self.assertFalse(result["valid"])
        self.assertIn("record_2_interview_style", result["errors"])
        self.assertIn("record_2_source_verbatim_copy", result["errors"])

    def test_counts_meta_sentence_that_repeats_the_same_fact(self):
        changed = draft()
        changed["records"][1]["bodyMd"] += " 확인 대상은 오류 목록이었다."

        result = score_draft(payload(), changed)

        self.assertEqual(result.get("repetitiveMetaCount"), 1)

    def test_grounding_gate_rejects_meta_sentence_that_repeats_the_same_fact(self):
        changed = draft()
        changed["records"][1]["bodyMd"] += " 확인 대상은 오류 목록이었다."

        result = validate_renderer_output(payload(), changed, enforce_grounding=True)

        self.assertFalse(result["valid"])
        self.assertIn("record_2_repetitive_meta:대상은", result["errors"])

    def test_detects_the_claim_families_seen_in_resume_style_expansion(self):
        cases = {
            "성과를 만들었다.": "성과",
            "절차를 향상했다.": "향상",
            "협업 문화를 강화했다.": "강화",
            "운영 방식을 개선했다.": "개선",
            "기준을 확보했다.": "확보",
            "신뢰를 얻었다.": "신뢰",
            "안정성을 지켰다.": "안정성",
            "일관성을 갖췄다.": "일관성",
            "품질을 관리했다.": "품질",
            "역량을 키웠다.": "역량",
            "능력을 길렀다.": "능력",
            "기술을 습득했다.": "습득",
            "도구를 익혔다.": "익히",
            "업무 이해를 넓혔다.": "이해",
            "실무 기반을 마련했다.": "기반",
            "체계적으로 수행했다.": "체계적",
            "한 단계 성장했다.": "성장",
            "업무를 주도했다.": "주도",
            "수준을 유지했다.": "유지",
            "오류가 감소했다.": "감소",
            "누락을 줄였다.": "줄이",
        }
        for sentence, marker in cases.items():
            with self.subTest(marker=marker):
                changed = draft()
                changed["records"][1]["bodyMd"] += f" {sentence}"

                claims = find_unsupported_claims(payload(), changed)

                self.assertEqual(
                    claims,
                    [{"eventId": "ev2", "recordIndex": 2, "markers": [marker]}],
                )


class OutputSchemaTests(unittest.TestCase):
    def test_specializes_record_sequence_and_property_plan_for_each_input(self):
        schema = build_output_schema(payload())
        records = schema["properties"]["records"]

        self.assertEqual(records["minItems"], 2)
        self.assertEqual(records["maxItems"], 2)
        self.assertNotIn("items", records)
        self.assertEqual(records["prefixItems"][0]["properties"]["eventId"], {"const": "ev1"})
        first_properties = records["prefixItems"][0]["properties"]["properties"]
        self.assertEqual(first_properties["required"], ["technologies"])
        self.assertFalse(first_properties["additionalProperties"])
        second_properties = records["prefixItems"][1]["properties"]["properties"]
        self.assertEqual(second_properties["required"], [])
        self.assertEqual(second_properties["properties"], {})

    def test_allows_v41_to_lower_body_minimum_for_sparse_facts(self):
        schema = build_output_schema(payload(), body_min_length=20)

        first_record = schema["properties"]["records"]["prefixItems"][0]
        self.assertEqual(first_record["properties"]["bodyMd"]["minLength"], 20)

    def test_uses_profile_body_length_upper_bound_in_each_record_schema(self):
        planned_payload = payload()
        planned_payload["bodyLengthPlan"] = {
            "recordMaxChars": 1000,
            "targetMeanChars": 300,
            "toleranceChars": 45,
            "band": "moderately_long",
        }

        schema = build_output_schema(planned_payload, body_min_length=20)

        first_record = schema["properties"]["records"]["prefixItems"][0]
        self.assertEqual(first_record["properties"]["bodyMd"]["maxLength"], 1000)

    def test_uses_each_events_length_window_when_present(self):
        planned_payload = payload()
        planned_payload["bodyLengthPlan"] = {"recordMaxChars": 1000}
        planned_payload["events"][0]["bodyLengthTarget"] = {
            "targetChars": 300,
            "minChars": 270,
            "maxChars": 330,
        }

        schema = build_output_schema(planned_payload, body_min_length=40)

        first_body = schema["properties"]["records"]["prefixItems"][0]["properties"]["bodyMd"]
        self.assertEqual(first_body["minLength"], 270)
        self.assertEqual(first_body["maxLength"], 1000)

    def test_uses_tight_event_maximum_for_very_short_profile(self):
        planned_payload = payload()
        planned_payload["bodyLengthPlan"] = {"recordMaxChars": 1000, "band": "very_short"}
        planned_payload["events"][0]["bodyLengthTarget"] = {
            "targetChars": 100,
            "minChars": 90,
            "maxChars": 140,
        }

        schema = build_output_schema(planned_payload, body_min_length=40)

        first_body = schema["properties"]["records"]["prefixItems"][0]["properties"]["bodyMd"]
        self.assertEqual(first_body["maxLength"], 140)

    def test_forbids_digits_in_body_when_event_facts_have_none(self):
        schema = build_output_schema(payload(), body_min_length=40)

        second_body = schema["properties"]["records"]["prefixItems"][1]["properties"]["bodyMd"]
        self.assertEqual(second_body["pattern"], "^[^0-9]*$")

    def test_requires_skeleton_lead_at_start_of_body(self):
        planned_payload = payload()
        planned_payload["events"][0]["skeletonLead"] = "Python으로 데이터 20건을 정리했다."

        schema = build_output_schema(planned_payload, body_min_length=40)

        first_body = schema["properties"]["records"]["prefixItems"][0]["properties"]["bodyMd"]
        self.assertTrue(first_body["pattern"].startswith(r"^Python으로\ 데이터\ 20건을\ 정리했다\."))

    def test_creative_schema_requests_detail_only_and_reserves_skeleton_length(self):
        planned_payload = payload()
        planned_payload["renderingPolicy"] = "skeleton-grounded-creative-v1"
        planned_payload["bodyLengthPlan"] = {"recordMaxChars": 1000, "band": "very_short"}
        planned_payload["events"][0]["skeletonLead"] = "Python으로 데이터 20건을 정리했다."
        planned_payload["events"][0]["bodyLengthTarget"] = {
            "targetChars": 100,
            "minChars": 90,
            "maxChars": 140,
        }

        schema = build_output_schema(planned_payload, body_min_length=40)
        record = schema["properties"]["records"]["prefixItems"][0]

        self.assertIn("detailMd", record["required"])
        self.assertNotIn("bodyMd", record["properties"])
        detail = record["properties"]["detailMd"]
        lead_length = len(planned_payload["events"][0]["skeletonLead"])
        self.assertEqual(detail["minLength"], 90 - lead_length - 1)
        self.assertEqual(detail["maxLength"], 140 - lead_length - 1)
        self.assertEqual(detail["pattern"], "^[^0-9一-鿿]*$")

    def test_creative_schema_uses_event_maximum_for_every_length_band(self):
        planned_payload = payload()
        planned_payload["renderingPolicy"] = "skeleton-grounded-creative-v1"
        planned_payload["bodyLengthPlan"] = {"recordMaxChars": 1000, "band": "moderately_long"}
        planned_payload["events"][0]["skeletonLead"] = "Python으로 데이터 20건을 정리했다."
        planned_payload["events"][0]["bodyLengthTarget"] = {
            "targetChars": 380,
            "minChars": 323,
            "maxChars": 437,
        }

        schema = build_output_schema(planned_payload, body_min_length=40)
        record = schema["properties"]["records"]["prefixItems"][0]
        detail = record["properties"]["detailMd"]
        lead_length = len(planned_payload["events"][0]["skeletonLead"])

        self.assertEqual(detail["maxLength"], 437 - lead_length - 1)
        self.assertEqual(record["properties"]["title"]["pattern"], "^[^0-9]*$")

    def test_evidence_rewrite_schema_allows_source_numbers_in_full_body(self):
        planned_payload = payload()
        planned_payload["renderingPolicy"] = "skeleton-grounded-creative-v1"
        planned_payload["bodyLengthPlan"] = {"recordMaxChars": 1000, "band": "moderately_long"}
        planned_payload["events"][0]["renderMode"] = "rewrite_evidence"
        planned_payload["events"][0]["skeletonLead"] = ""
        planned_payload["events"][0]["bodyLengthTarget"] = {
            "targetChars": 300,
            "minChars": 270,
            "maxChars": 345,
        }

        schema = build_output_schema(planned_payload, body_min_length=20)
        detail = schema["properties"]["records"]["prefixItems"][0]["properties"]["detailMd"]

        self.assertEqual(detail["pattern"], "^[^一-鿿]*$")


class SkeletonCompositionTests(unittest.TestCase):
    def test_evidence_rewrite_uses_generated_text_as_the_whole_body(self):
        planned_payload = payload()
        planned_payload["renderingPolicy"] = "skeleton-grounded-creative-v1"
        planned_payload["events"][0]["renderMode"] = "rewrite_evidence"
        planned_payload["events"][0]["skeletonLead"] = ""
        planned_payload["events"][0]["bodyLengthTarget"] = {
            "targetChars": 90,
            "minChars": 60,
            "maxChars": 120,
        }
        generated = draft()
        generated["records"][0]["detailMd"] = (
            "Python으로 데이터 20건을 정리했다. 형식이 다른 자료를 비교한 뒤 확인 기준을 메모했다."
        )
        del generated["records"][0]["bodyMd"]

        composed = compose_skeleton_bodies(planned_payload, {"records": [generated["records"][0]]})

        self.assertEqual(
            composed["records"][0]["bodyMd"],
            "Python으로 데이터 20건을 정리했다. 형식이 다른 자료를 비교한 뒤 확인 기준을 메모했다.",
        )

    def test_composes_final_body_from_fixed_skeleton_and_generated_detail(self):
        planned_payload = payload()
        planned_payload["renderingPolicy"] = "skeleton-grounded-creative-v1"
        planned_payload["events"][0]["skeletonLead"] = "Python으로 데이터 20건을 정리했다."
        planned_payload["events"][1]["skeletonLead"] = "오류 확인 절차를 체크리스트로 정리했다."
        generated = draft()
        for record in generated["records"]:
            record["detailMd"] = "작업 과정과 판단을 개인 노트처럼 풀어 적었다."
            del record["bodyMd"]

        composed = compose_skeleton_bodies(planned_payload, generated)

        self.assertEqual(
            composed["records"][0]["bodyMd"],
            "Python으로 데이터 20건을 정리했다. 작업 과정과 판단을 개인 노트처럼 풀어 적었다.",
        )
        self.assertNotIn("detailMd", composed["records"][0])
        self.assertNotIn("bodyMd", generated["records"][0])

    def test_composition_uses_planned_property_values_instead_of_model_invention(self):
        planned_payload = payload()
        planned_payload["renderingPolicy"] = "skeleton-grounded-creative-v1"
        planned_payload["events"][0]["skeletonLead"] = "Python으로 데이터 20건을 정리했다."
        planned_payload["events"][0]["propertyValues"] = {"technologies": ["Python"]}
        planned_payload["events"][1]["skeletonLead"] = "오류 확인 절차를 체크리스트로 정리했다."
        planned_payload["events"][1]["propertyValues"] = {}
        generated = draft()
        generated["records"][0]["properties"] = {"technologies": ["Python3", "가상도구"]}
        for record in generated["records"]:
            record["detailMd"] = record.pop("bodyMd")

        composed = compose_skeleton_bodies(planned_payload, generated)

        self.assertEqual(composed["records"][0]["properties"], {"technologies": ["Python"]})

    def test_sanitizes_repeated_skeleton_numbers_and_length_at_sentence_boundaries(self):
        event = {
            "eventId": "ev1",
            "categoryKey": "project",
            "skeletonLead": "Python으로 데이터 20건을 정리했다.",
            "bodyLengthTarget": {"targetChars": 120, "minChars": 102, "maxChars": 138},
        }
        record = {
            "draftId": "r1",
            "eventId": "ev1",
            "categoryKey": "project",
            "title": "資料3차 데이터 정리",
            "properties": {"technologies": ["Python3"]},
            "detailMd": (
                "Python으로 데이터 20건을 정리했다. "
                "처음에는 자료 형식이 달라 확인 순서를 먼저 정리했다. "
                "중간 점검에서 오류 99건을 찾아 별도 표로 만들었다. "
                "동료와 기준을 맞춘 뒤 같은 흐름으로 다시 살펴봤다. "
                "마지막에는 판단 근거와 남은 문제를 개인 노트에 적었다."
            ),
        }

        sanitized = sanitize_creative_record(
            event,
            record,
            {"technologies": "tags"},
        )

        self.assertEqual(sanitized["title"], "차 데이터 정리")
        self.assertEqual(sanitized["properties"]["technologies"], ["Python"])
        self.assertNotIn("99", sanitized["detailMd"])
        self.assertNotIn("Python으로 데이터 20건을 정리했다.", sanitized["detailMd"])
        final_length = len(event["skeletonLead"] + " " + sanitized["detailMd"])
        self.assertLessEqual(abs(final_length - 120), 30)
        self.assertRegex(sanitized["detailMd"], r"[.!?]$")

    def test_sanitizer_removes_partial_paraphrase_of_long_skeleton(self):
        event = {
            "eventId": "ev1",
            "categoryKey": "experience",
            "skeletonLead": (
                "보험회사 영업 지점장으로 근무하며 마케팅 프로젝트를 수행했고, "
                "군 생활 중 소대장으로 구성원을 관리했다."
            ),
            "bodyLengthTarget": {"targetChars": 220, "minChars": 120, "maxChars": 260},
        }
        record = {
            "title": "영업 프로젝트 수행",
            "properties": {},
            "detailMd": (
                "보험회사 영업 지점장으로 근무하며 고객 유치 프로젝트를 기획하고 실행했다. "
                "초기에는 고객 요구를 분류하고 팀이 확인할 항목을 문서로 정리했다."
            ),
        }

        sanitized = sanitize_creative_record(event, record, {})

        self.assertNotIn("보험회사 영업 지점장으로 근무하며", sanitized["detailMd"])
        self.assertIn("고객 요구를 분류", sanitized["detailMd"])

    def test_discards_unfinished_detail_tail_before_length_selection(self):
        event = {
            "eventId": "ev1",
            "categoryKey": "project",
            "skeletonLead": "데이터 정리 기준을 문서화했다.",
            "bodyLengthTarget": {"targetChars": 120, "minChars": 100, "maxChars": 140},
        }
        record = {
            "draftId": "r1",
            "eventId": "ev1",
            "categoryKey": "project",
            "title": "정리 기준 문서화",
            "properties": {},
            "detailMd": "동료와 기준을 비교해 빠진 항목을 정리했다. 마지막 문장을 쓰다가 멈춘 상태",
        }

        sanitized = sanitize_creative_record(event, record, {})

        self.assertNotIn("멈춘 상태", sanitized["detailMd"])
        self.assertRegex(sanitized["detailMd"], r"[.!?]$")

    def test_short_record_keeps_enough_detail_to_reach_its_minimum(self):
        event = {
            "eventId": "ev1",
            "categoryKey": "project",
            "skeletonLead": "자료를 정리했다.",
            "bodyLengthTarget": {"targetChars": 40, "minChars": 36, "maxChars": 60},
        }
        record = {
            "draftId": "r1",
            "eventId": "ev1",
            "categoryKey": "project",
            "title": "자료 정리",
            "properties": {},
            "detailMd": (
                "먼저 빠진 항목과 서로 다른 자료 형식을 하나씩 확인하고 판단 근거와 확인 순서를 "
                "개인 메모에 모두 정리한 뒤 다시 처음부터 비교했다."
            ),
        }

        sanitized = sanitize_creative_record(event, record, {})
        final_body = " ".join(part for part in (event["skeletonLead"], sanitized["detailMd"]) if part)

        self.assertGreaterEqual(len(final_body), event["bodyLengthTarget"]["minChars"])

    def test_very_short_profile_can_keep_only_the_skeleton_when_it_is_closest(self):
        event = {
            "eventId": "ev1",
            "categoryKey": "project",
            "skeletonLead": "자료를 비교하고 정리 기준을 문서화했다.",
            "bodyLengthTarget": {"targetChars": 47, "minChars": 42, "maxChars": 67},
        }
        record = {
            "draftId": "r1",
            "eventId": "ev1",
            "categoryKey": "project",
            "title": "정리 기준 문서화",
            "properties": {},
            "detailMd": (
                "먼저 서로 다른 자료 형식을 하나씩 확인하고 판단 근거와 확인 순서를 "
                "개인 메모에 모두 정리한 뒤 다시 처음부터 비교했다."
            ),
        }

        sanitized = sanitize_creative_record(
            event,
            record,
            {},
            allow_below_minimum=True,
        )

        self.assertEqual(sanitized["detailMd"], "")

    def test_long_record_contract_requires_enough_raw_detail_and_sentences(self):
        event = {
            "eventId": "ev1",
            "categoryKey": "project",
            "propertyKeys": [],
            "skeletonLead": "자료를 비교하고 정리 기준을 문서화했다.",
            "bodyLengthTarget": {"targetChars": 520, "minChars": 468, "maxChars": 598},
        }
        contract = _detail_length_contract(event)
        candidate = {
            "draftId": "r1",
            "eventId": "ev1",
            "categoryKey": "project",
            "title": "정리 기준 문서화",
            "properties": {},
            "detailMd": "확인 순서를 메모했다. 빠진 항목을 다시 살폈다.",
        }

        self.assertGreaterEqual(contract["minSentences"], 7)
        self.assertFalse(_record_candidate_valid(event, 0, candidate))

    def test_compares_detail_against_each_skeleton_sentence_and_can_keep_only_skeleton(self):
        event = {
            "eventId": "ev1",
            "categoryKey": "project",
            "skeletonLead": "현장 흐름을 조사했다. 조사 결과로 공간 변화안을 기획하고 완성까지 참여했다.",
            "bodyLengthTarget": {"targetChars": 55, "minChars": 40, "maxChars": 65},
        }
        record = {
            "draftId": "r1",
            "eventId": "ev1",
            "categoryKey": "project",
            "title": "공간 변화안 기획",
            "properties": {},
            "detailMd": (
                "현장 흐름을 조사했다. "
                "방문자의 움직임을 살피고 메모를 분류해 팀원들과 공유했다."
            ),
        }

        sanitized = sanitize_creative_record(event, record, {})

        self.assertEqual(sanitized["detailMd"], "")

    def test_generates_creative_profile_as_independent_record_calls(self):
        planned_payload = payload()
        planned_payload["renderingPolicy"] = "skeleton-grounded-creative-v1"
        planned_payload["bodyLengthPlan"] = {
            "recordMaxChars": 1000,
            "targetMeanChars": 100,
            "toleranceChars": 15,
            "band": "very_short",
        }
        for event in planned_payload["events"]:
            event["skeletonLead"] = ". ".join(event["facts"]) + "."
            event["bodyLengthTarget"] = {"targetChars": 100, "minChars": 85, "maxChars": 115}
        calls = []

        def fake_post_json(url, request_payload, timeout):
            calls.append(request_payload)
            event = json.loads(request_payload["messages"][1]["content"])["event"]
            index = next(
                index
                for index, candidate in enumerate(planned_payload["events"], start=1)
                if candidate["eventId"] == event["eventId"]
            )
            record = draft()["records"][index - 1]
            record["detailMd"] = "당시 확인한 흐름과 선택한 작업 순서를 개인 노트처럼 구체적으로 남겼다."
            del record["bodyMd"]
            return {"message": {"content": json.dumps(record, ensure_ascii=False)}, "eval_count": 20}

        generated, metadata = generate_qwen_by_record(
            planned_payload,
            model="qwen-test",
            base_url="http://localhost:11434",
            timeout=30,
            prompt_version="synthetic-profile-v4.2",
            max_attempts=2,
            post_json=fake_post_json,
        )

        self.assertEqual(len(calls), 2)
        self.assertTrue(all(call["format"] == "json" for call in calls))
        self.assertEqual(metadata["recordCalls"], 2)
        self.assertEqual(metadata["parseFailures"], 0)
        self.assertTrue(
            generated["records"][0]["bodyMd"].startswith(
                planned_payload["events"][0]["skeletonLead"]
            )
        )
        self.assertNotIn("detailMd", generated["records"][0])

    def test_retries_one_record_after_transient_ollama_error(self):
        planned_payload = payload()
        planned_payload["renderingPolicy"] = "skeleton-grounded-creative-v1"
        for event in planned_payload["events"]:
            event["skeletonLead"] = ". ".join(event["facts"]) + "."
            event["bodyLengthTarget"] = {"targetChars": 100, "minChars": 60, "maxChars": 140}
        calls = 0

        def flaky_post_json(url, request_payload, timeout):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise urllib.error.HTTPError(url, 500, "temporary", {}, None)
            event = json.loads(request_payload["messages"][1]["content"])["event"]
            index = 1 if event["eventId"] == "ev1" else 2
            record = draft()["records"][index - 1]
            record["detailMd"] = "작업 과정에서 확인한 내용을 정리해 개인 기록으로 남겼다."
            del record["bodyMd"]
            return {"message": {"content": json.dumps(record, ensure_ascii=False)}}

        generated, metadata = generate_qwen_by_record(
            planned_payload,
            model="qwen-test",
            base_url="http://localhost:11434",
            timeout=30,
            max_attempts=2,
            post_json=flaky_post_json,
        )

        self.assertEqual(calls, 3)
        self.assertEqual(metadata["transportFailures"], 1)
        self.assertEqual(len(generated["records"]), 2)

    def test_exhausted_record_calls_leave_explicit_invalid_marker(self):
        planned_payload = payload()
        planned_payload["renderingPolicy"] = "skeleton-grounded-creative-v1"
        for event in planned_payload["events"]:
            event["skeletonLead"] = ". ".join(event["facts"]) + "."
            event["bodyLengthTarget"] = {"targetChars": 80, "minChars": 60, "maxChars": 100}

        def always_fails(url, request_payload, timeout):
            raise urllib.error.HTTPError(url, 500, "temporary", {}, None)

        generated, metadata = generate_qwen_by_record(
            planned_payload,
            model="qwen-test",
            base_url="http://localhost:11434",
            timeout=30,
            max_attempts=1,
            post_json=always_fails,
        )
        validation = validate_renderer_output(planned_payload, generated, enforce_skeleton=True)

        self.assertEqual(metadata["transportFailures"], 2)
        self.assertFalse(validation["valid"])
        self.assertIn("record_1_fields", validation["errors"])

    def test_retries_json_object_that_violates_record_contract(self):
        planned_payload = payload()
        planned_payload["renderingPolicy"] = "skeleton-grounded-creative-v1"
        for event in planned_payload["events"]:
            event["skeletonLead"] = ". ".join(event["facts"]) + "."
            event["bodyLengthTarget"] = {"targetChars": 100, "minChars": 60, "maxChars": 140}
        calls = 0

        def contract_then_valid(url, request_payload, timeout):
            nonlocal calls
            calls += 1
            if calls == 1:
                return {"message": {"content": '{"unexpected": true}'}}
            event = json.loads(request_payload["messages"][1]["content"])["event"]
            index = 1 if event["eventId"] == "ev1" else 2
            record = draft()["records"][index - 1]
            record["detailMd"] = "작업 과정에서 확인한 판단과 진행 순서를 개인 노트로 남겼다."
            del record["bodyMd"]
            return {"message": {"content": json.dumps(record, ensure_ascii=False)}}

        generated, metadata = generate_qwen_by_record(
            planned_payload,
            model="qwen-test",
            base_url="http://localhost:11434",
            timeout=30,
            max_attempts=2,
            post_json=contract_then_valid,
        )

        self.assertEqual(calls, 3)
        self.assertEqual(metadata["contractFailures"], 1)
        self.assertEqual(generated["records"][0]["eventId"], "ev1")


class CliParserTests(unittest.TestCase):
    def test_exposes_v42_prepare_and_qwen_entrypoints(self):
        parser = build_cli_parser()

        prepare = parser.parse_args(["prepare-v4.2", "inputs"])
        generate = parser.parse_args(["qwen-v4.2", "inputs", "outputs"])
        assemble = parser.parse_args(["assemble-v4.2", "inputs", "drafts", "profiles", "--model", "qwen"])

        self.assertEqual(prepare.command, "prepare-v4.2")
        self.assertEqual(generate.command, "qwen-v4.2")
        self.assertEqual(generate.prompt_version, "synthetic-profile-v4.2")
        self.assertEqual(assemble.command, "assemble-v4.2")
        self.assertEqual(assemble.prompt_version, "synthetic-profile-v4.2")


class RevisionInstructionTests(unittest.TestCase):
    def test_length_retry_requests_creative_expansion_without_new_precise_facts(self):
        instruction = build_revision_instruction(
            ["body_length_mean"],
            {
                "targetMeanChars": 460,
                "toleranceChars": 69,
                "band": "very_long",
            },
        )

        self.assertIn("460", instruction)
        self.assertIn("상황·과정·판단·협업", instruction)
        self.assertIn("새 날짜·수치", instruction)

    def test_length_retry_states_the_current_and_record_specific_target(self):
        instruction = build_revision_instruction(
            ["body_length_mean"],
            {"targetMeanChars": 505, "toleranceChars": 76, "band": "very_long"},
            record_length_context={
                "currentBodyChars": 238,
                "targetBodyChars": 520,
                "minBodyChars": 468,
                "maxBodyChars": 598,
                "skeletonChars": 41,
            },
        )

        self.assertIn("현재 최종 본문은 238자", instruction)
        self.assertIn("이 기록의 최종 본문을 520자", instruction)
        self.assertIn("468~598자", instruction)
        self.assertIn("detailMd", instruction)

    def test_number_retry_explains_how_to_preserve_skeleton_without_shortening(self):
        instruction = build_revision_instruction(
            ["record_1_missing_number:2017", "record_3_invented_number:30,90"],
            None,
            payload(),
        )

        self.assertIn("빠진 뼈대 수치", instruction)
        self.assertIn("정성 표현", instruction)
        self.assertIn("본문 길이는 유지", instruction)
        self.assertIn("Python으로 데이터 20건을 정리했다", instruction)
        self.assertIn("본문 첫 문장", instruction)
        self.assertIn("세부 문장 일부를 줄여", instruction)


class RecordRepairTests(unittest.TestCase):
    def test_finds_only_records_named_by_validation_errors(self):
        self.assertEqual(
            invalid_record_indexes(
                ["record_3_invented_number:30", "body_length_mean", "record_1_missing_number:2"]
            ),
            [0, 2],
        )

    def test_profile_mean_error_targets_every_record_when_count_is_known(self):
        self.assertEqual(invalid_record_indexes(["body_length_mean"], record_count=3), [0, 1, 2])
        self.assertEqual(invalid_record_indexes(["body_length_band"], record_count=3), [0, 1, 2])

    def test_profile_mean_error_repairs_only_records_on_the_wrong_side_of_target(self):
        planned = payload()
        planned["bodyLengthPlan"] = {"targetMeanChars": 50}
        for event, target in zip(planned["events"], (45, 55), strict=True):
            event["bodyLengthTarget"] = {
                "targetChars": target,
                "minChars": max(20, target - 10),
                "maxChars": target + 15,
            }
        too_long = draft()
        too_long["records"][0]["bodyMd"] = "가" * 90
        too_long["records"][1]["bodyMd"] = "나" * 52

        indexes = repair_record_indexes(planned, too_long, ["body_length_mean"])

        self.assertEqual(indexes, [0])

    def test_profile_length_error_is_forwarded_to_each_record_repair_prompt(self):
        planned = payload()
        planned["bodyLengthPlan"] = {
            "distributionVersion": "clipped-normal-v2",
            "targetMinChars": 40,
            "targetMaxChars": 800,
            "recordMaxChars": 1000,
            "populationMeanChars": 300,
            "populationStdChars": 160,
            "targetMeanChars": 380,
            "toleranceChars": 57,
            "band": "moderately_long",
        }
        for event in planned["events"]:
            event["skeletonLead"] = ". ".join(event["facts"]) + "."
            event["bodyLengthTarget"] = {"targetChars": 380, "minChars": 342, "maxChars": 437}
        calls = []

        def unchanged_post_json(url, request_payload, timeout):
            calls.append(request_payload)
            repair_input = json.loads(request_payload["messages"][1]["content"])
            index = 0 if repair_input["event"]["eventId"] == "ev1" else 1
            return {"message": {"content": json.dumps(draft()["records"][index], ensure_ascii=False)}}

        repair_qwen_records(
            planned,
            draft(),
            model="qwen-test",
            base_url="http://localhost:11434",
            timeout=30,
            max_rounds=1,
            post_json=unchanged_post_json,
        )

        self.assertEqual(len(calls), 2)
        self.assertTrue(
            all("평균 본문 길이를 380자" in call["messages"][0]["content"] for call in calls)
        )
        repair_input = json.loads(calls[0]["messages"][1]["content"])
        self.assertGreater(repair_input["outputContract"]["detailLength"]["minChars"], 0)
        self.assertGreater(
            repair_input["outputContract"]["detailLength"]["targetChars"],
            repair_input["outputContract"]["detailLength"]["minChars"],
        )

    def test_builds_repair_schema_for_one_existing_record(self):
        changed_payload = payload()
        changed_payload["events"][1]["bodyLengthTarget"] = {
            "targetChars": 100,
            "minChars": 90,
            "maxChars": 110,
        }

        schema = build_record_repair_schema(changed_payload, 1, body_min_length=40)

        self.assertEqual(schema["properties"]["eventId"], {"const": "ev2"})
        self.assertEqual(schema["properties"]["bodyMd"]["minLength"], 90)

    def test_repairs_only_invalid_record_and_revalidates_profile(self):
        changed = draft()
        changed["records"][1]["bodyMd"] += " 오류 99건을 발견했다."
        repaired_record = draft()["records"][1]
        calls = []

        def fake_post_json(url, request_payload, timeout):
            calls.append((url, request_payload, timeout))
            return {"message": {"content": json.dumps(repaired_record, ensure_ascii=False)}}

        repaired, metadata = repair_qwen_records(
            payload(),
            changed,
            model="qwen-test",
            base_url="http://localhost:11434",
            timeout=30,
            prompt_version="synthetic-profile-v4.2",
            post_json=fake_post_json,
        )

        self.assertTrue(metadata["valid"])
        self.assertEqual(repaired["records"][0], changed["records"][0])
        self.assertEqual(repaired["records"][1], repaired_record)
        self.assertEqual(len(calls), 1)
        repair_input = json.loads(calls[0][1]["messages"][1]["content"])
        self.assertNotIn("currentRecord", repair_input)

    def test_changes_seed_between_repair_rounds(self):
        changed = draft()
        changed["records"][1]["bodyMd"] += " 오류 99건을 발견했다."
        calls = []

        def fake_post_json(url, request_payload, timeout):
            calls.append(request_payload)
            return {"message": {"content": json.dumps(changed["records"][1], ensure_ascii=False)}}

        _, metadata = repair_qwen_records(
            payload(),
            changed,
            model="qwen-test",
            base_url="http://localhost:11434",
            timeout=30,
            max_rounds=2,
            post_json=fake_post_json,
        )

        self.assertFalse(metadata["valid"])
        self.assertEqual([call["options"]["seed"] for call in calls], [43, 44])


class RunMetadataTests(unittest.TestCase):
    def test_normalizes_luna_profile_map_and_qwen_row_list(self):
        luna = normalize_run_metadata({
            "model": "gpt-5.6-luna",
            "profiles": {"pilot": {"attempts": 1, "elapsedSeconds": None}},
        })
        qwen = normalize_run_metadata([
            {"profileSeed": "pilot", "attempts": 1, "elapsedSeconds": 12.0},
        ])

        self.assertEqual(luna["pilot"]["attempts"], 1)
        self.assertEqual(qwen["pilot"]["elapsedSeconds"], 12.0)


if __name__ == "__main__":
    unittest.main()
