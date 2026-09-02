import unittest

from synthetic_profile_v4_experiment import (
    build_output_schema,
    find_unsupported_claims,
    normalize_run_metadata,
    score_draft,
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
            },
            {
                "eventId": "ev2",
                "categoryKey": "experience",
                "facts": ["오류 확인 절차를 체크리스트로 정리했다"],
                "propertyKeys": [],
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
