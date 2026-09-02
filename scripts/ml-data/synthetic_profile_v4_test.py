import json
import statistics
import tempfile
import unittest
from pathlib import Path

from synthetic_profile_v4 import (
    _attach_record_length_targets,
    assign_body_length_plans,
    assemble_profile,
    body_length_band,
    body_mean_tolerance,
    build_body_length_plans,
    build_length_pilot_inputs,
    build_pilot_inputs,
    prepare_length_pilot_inputs,
    prepare_pilot_inputs,
    validate_draft,
)


SEED_CATEGORIES = [
    {
        "_id": f"00000000-0000-4000-8000-00000000000{index}",
        "key": key,
        "name": key,
        "icon": "icon",
        "defaultView": "list",
        "isSystem": True,
        "propertySchema": property_schema,
        "sortOrder": index,
        "version": 1,
    }
    for index, (key, property_schema) in enumerate(
        [
            ("experience", {"role": {"type": "text"}, "organization": {"type": "text"}}),
            ("project", {"role": {"type": "text"}, "technologies": {"type": "tags"}}),
            ("education_history", {"institution": {"type": "text"}, "startMonth": {"type": "date"}}),
            ("certification_award", {"issuer": {"type": "text"}, "issuedMonth": {"type": "date"}}),
            ("academic_writing", {"publication": {"type": "text"}}),
            ("activity_leadership", {"role": {"type": "text"}, "organization": {"type": "text"}}),
            ("skill_tool", {"group": {"type": "text"}}),
        ]
    )
]


def input_payload():
    return {
        "schemaVersion": 4,
        "profileSeed": "v4-profile-001",
        "persona": {"targetRoles": ["데이터"], "experienceYears": 3, "primaryGoal": "build"},
        "targetRecordCount": 3,
        "propertySchema": {
            category["key"]: {
                key: value["type"] for key, value in category["propertySchema"].items()
            }
            for category in SEED_CATEGORIES
        },
        "events": [
            {
                "eventId": "ev1",
                "categoryKey": "education_history",
                "timeOrder": 1,
                "facts": ["정보통신 전공 과정을 이수했다", "2020-03에 시작했다"],
                "propertyKeys": ["institution", "startMonth"],
                "propertyValues": {"institution": "가상 대학교", "startMonth": "2020-03"},
                "provenance": {
                    "surveyCalibration": ["yp2021:v1:education_to_first_job"],
                    "narrativeEvidence": [],
                    "syntheticFields": ["institution"],
                },
            },
            {
                "eventId": "ev2",
                "categoryKey": "project",
                "timeOrder": 2,
                "facts": ["Python으로 공공데이터 정제 프로젝트를 수행했다", "결측값 처리 기준을 문서화했다"],
                "propertyKeys": ["technologies"],
                "propertyValues": {"technologies": ["Python"]},
                "provenance": {
                    "surveyCalibration": [],
                    "narrativeEvidence": ["aih-71592-example"],
                    "syntheticFields": ["project_title"],
                },
            },
            {
                "eventId": "ev3",
                "categoryKey": "experience",
                "timeOrder": 3,
                "facts": ["데이터 운영 업무를 담당했다", "반복 확인 절차를 체크리스트로 정리했다"],
                "propertyKeys": [],
                "propertyValues": {},
                "provenance": {
                    "surveyCalibration": ["yp2021:v1:first_job_role"],
                    "narrativeEvidence": ["aih-71592-work"],
                    "syntheticFields": ["organization"],
                },
            },
        ],
    }


def valid_draft():
    return {
        "status": "generated",
        "profileSeed": "v4-profile-001",
        "persona": {"targetRoles": ["데이터"], "experienceYears": 3, "primaryGoal": "build"},
        "records": [
            {
                "draftId": "r1",
                "eventId": "ev1",
                "categoryKey": "education_history",
                "title": "정보통신 전공 과정",
                "properties": {"institution": "가상 대학교", "startMonth": "2020-03"},
                "bodyMd": "정보통신 전공 과정을 이수하면서 데이터 처리의 기초를 익혔다. 과정은 2020년 3월에 시작했다.",
            },
            {
                "draftId": "r2",
                "eventId": "ev2",
                "categoryKey": "project",
                "title": "공공데이터 정제 프로젝트",
                "properties": {"technologies": ["Python"]},
                "bodyMd": "Python으로 공공데이터의 결측값을 정리했다. 팀에서 같은 기준을 적용할 수 있도록 처리 기준도 문서화했다.",
            },
            {
                "draftId": "r3",
                "eventId": "ev3",
                "categoryKey": "experience",
                "title": "데이터 운영 절차 정리",
                "properties": {},
                "bodyMd": "데이터 운영 업무에서 반복 확인하던 절차를 체크리스트로 정리했다. 이후 같은 순서로 빠짐없이 점검했다.",
            },
        ],
    }


class DraftValidationTests(unittest.TestCase):
    def test_accepts_one_record_per_event_and_exact_property_plan(self):
        result = validate_draft(input_payload(), valid_draft())

        self.assertTrue(result["valid"])
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["propertyCounts"], {"0": 1, "1": 1, "2": 1})

    def test_rejects_missing_event_duplicate_event_and_forbidden_field(self):
        draft = valid_draft()
        draft["records"][1]["eventId"] = "ev1"
        draft["records"][1]["claims"] = []

        result = validate_draft(input_payload(), draft)

        self.assertFalse(result["valid"])
        self.assertIn("record_2_fields", result["errors"])
        self.assertIn("event_sequence", result["errors"])

    def test_rejects_unplanned_property_and_wrong_property_type(self):
        draft = valid_draft()
        draft["records"][2]["properties"] = {"role": ["데이터 운영"]}

        result = validate_draft(input_payload(), draft)

        self.assertFalse(result["valid"])
        self.assertIn("record_3_property_keys", result["errors"])

    def test_rejects_source_ids_or_sensitive_fields_in_visible_text(self):
        draft = valid_draft()
        draft["records"][0]["bodyMd"] += " sampid 12345의 조사 응답을 사용했다."

        result = validate_draft(input_payload(), draft)

        self.assertFalse(result["valid"])
        self.assertIn("record_1_protected_text", result["errors"])

    def test_accepts_short_notional_note_when_v41_minimum_is_selected(self):
        draft = valid_draft()
        draft["records"][0]["bodyMd"] = "정보통신 전공 과정을 2020년 3월에 시작했다."

        v4 = validate_draft(input_payload(), draft)
        v41 = validate_draft(input_payload(), draft, body_min_length=20)

        self.assertFalse(v4["valid"])
        self.assertTrue(v41["valid"])

    def test_rejects_profile_mean_outside_assigned_body_length_tolerance(self):
        planned_input = input_payload()
        planned_input["bodyLengthPlan"] = {
            "distributionVersion": "truncated-normal-v1",
            "upperBoundChars": 300,
            "populationMeanChars": 135,
            "populationStdChars": 60,
            "targetMeanChars": 1,
            "toleranceChars": 5,
            "band": "very_short",
        }

        result = validate_draft(planned_input, valid_draft())

        self.assertFalse(result["valid"])
        self.assertIn("body_length_mean", result["errors"])

    def test_accepts_profile_mean_within_assigned_body_length_tolerance(self):
        draft = valid_draft()
        actual_mean = round(statistics.fmean(len(record["bodyMd"].strip()) for record in draft["records"]), 2)
        planned_input = input_payload()
        planned_input["bodyLengthPlan"] = {
            "distributionVersion": "truncated-normal-v1",
            "upperBoundChars": 300,
            "populationMeanChars": 135,
            "populationStdChars": 60,
            "targetMeanChars": round(actual_mean),
            "toleranceChars": 2,
            "band": "moderately_short",
        }

        result = validate_draft(planned_input, draft)

        self.assertTrue(result["valid"])
        self.assertEqual(result.get("bodyLengthMean"), actual_mean)

    def test_does_not_reject_individual_record_below_event_length_guidance(self):
        draft = valid_draft()
        actual_mean = round(statistics.fmean(len(record["bodyMd"].strip()) for record in draft["records"]), 2)
        planned_input = input_payload()
        planned_input["bodyLengthPlan"] = {
            "distributionVersion": "truncated-normal-v2",
            "targetMinChars": 40,
            "targetMaxChars": 800,
            "recordMaxChars": 1000,
            "populationMeanChars": 300,
            "populationStdChars": 160,
            "targetMeanChars": actual_mean,
            "toleranceChars": 2,
            "band": "moderately_short",
        }
        for event in planned_input["events"]:
            event["bodyLengthTarget"] = {
                "targetChars": 300,
                "minChars": 290,
                "maxChars": 310,
            }

        result = validate_draft(planned_input, draft)

        self.assertTrue(result["valid"])


class AssemblyTests(unittest.TestCase):
    def test_assembles_expresso_profile_with_external_event_provenance(self):
        profile = assemble_profile(
            input_payload(),
            valid_draft(),
            SEED_CATEGORIES,
            generator_model="qwen3:30b-a3b-instruct-2507-q4_K_M",
            created_at="2026-09-02T00:00:00Z",
        )

        self.assertEqual(len(profile["categories"]), 7)
        self.assertEqual(len(profile["records"]), 3)
        self.assertEqual(
            set(profile["records"][0]),
            {"id", "categoryId", "title", "status", "origin", "properties", "bodyMd", "version", "updatedAt"},
        )
        self.assertNotIn("eventId", profile["records"][0])
        self.assertEqual(profile["datasetMeta"]["generatorModel"], "qwen3:30b-a3b-instruct-2507-q4_K_M")
        self.assertEqual(profile["datasetMeta"]["targetRecordCount"], 3)
        self.assertEqual(profile["datasetMeta"]["actualRecordCount"], 3)
        self.assertEqual(profile["provenance"]["recordLineage"][1]["eventId"], "ev2")
        self.assertEqual(profile["provenance"]["recordLineage"][1]["narrativeEvidence"], ["aih-71592-example"])
        self.assertEqual(profile["recordLinks"], [])
        self.assertEqual(profile["skills"], [])

    def test_records_selected_prompt_version_and_uses_it_in_profile_identity(self):
        v4 = assemble_profile(
            input_payload(),
            valid_draft(),
            SEED_CATEGORIES,
            generator_model="qwen",
            prompt_version="synthetic-profile-v4",
            created_at="2026-09-02T00:00:00Z",
        )
        v41 = assemble_profile(
            input_payload(),
            valid_draft(),
            SEED_CATEGORIES,
            generator_model="qwen",
            prompt_version="synthetic-profile-v4.1",
            created_at="2026-09-02T00:00:00Z",
        )

        self.assertEqual(v41["datasetMeta"]["promptVersion"], "synthetic-profile-v4.1")
        self.assertNotEqual(v4["syntheticProfileId"], v41["syntheticProfileId"])

    def test_v41_assembly_accepts_short_fact_only_note(self):
        draft = valid_draft()
        draft["records"][0]["bodyMd"] = "정보통신 전공 과정을 2020년 3월에 시작했다."
        profile = assemble_profile(
            input_payload(),
            draft,
            SEED_CATEGORIES,
            generator_model="qwen",
            prompt_version="synthetic-profile-v4.1",
            created_at="2026-09-02T00:00:00Z",
        )

        self.assertEqual(profile["records"][0]["bodyMd"], draft["records"][0]["bodyMd"])

    def test_preserves_body_length_plan_and_actual_mean_in_dataset_metadata(self):
        draft = valid_draft()
        actual_mean = round(statistics.fmean(len(record["bodyMd"].strip()) for record in draft["records"]), 2)
        planned_input = input_payload()
        planned_input["bodyLengthPlan"] = {
            "distributionVersion": "truncated-normal-v1",
            "upperBoundChars": 300,
            "populationMeanChars": 135,
            "populationStdChars": 60,
            "targetMeanChars": round(actual_mean),
            "toleranceChars": 2,
            "band": "moderately_short",
        }

        profile = assemble_profile(
            planned_input,
            draft,
            SEED_CATEGORIES,
            generator_model="qwen",
            prompt_version="synthetic-profile-v4.1",
            created_at="2026-09-02T00:00:00Z",
        )

        self.assertEqual(profile["datasetMeta"].get("bodyLengthPlan"), planned_input["bodyLengthPlan"])
        self.assertEqual(profile["datasetMeta"].get("actualBodyLengthMean"), actual_mean)

    def test_assembly_refuses_invalid_draft(self):
        draft = valid_draft()
        draft["records"].pop()

        with self.assertRaisesRegex(ValueError, "event_sequence"):
            assemble_profile(input_payload(), draft, SEED_CATEGORIES, generator_model="test")


class PilotInputTests(unittest.TestCase):
    def test_builds_same_three_length_and_property_conditions_for_both_models(self):
        inputs = build_pilot_inputs(input_payload()["propertySchema"])

        self.assertEqual([item["targetRecordCount"] for item in inputs], [5, 9, 14])
        self.assertTrue(all(len(item["events"]) == item["targetRecordCount"] for item in inputs))
        property_counts = {str(count): 0 for count in range(3)}
        for item in inputs:
            for event in item["events"]:
                property_counts[str(len(event["propertyKeys"]))] += 1
                self.assertTrue(any(event["provenance"].values()))
                self.assertEqual(set(event["propertyKeys"]), set(event["propertyValues"]))
        self.assertEqual(property_counts, {"0": 18, "1": 8, "2": 2})

        first_education = inputs[0]["events"][0]
        self.assertNotIn("institution", first_education["propertyKeys"])
        self.assertEqual(first_education["propertyValues"]["startMonth"], "2018-03")

    def test_pilot_inputs_exclude_protected_source_identifiers(self):
        serialized = str(build_pilot_inputs(input_payload()["propertySchema"])).lower()

        for marker in ("sampid", "hid", "gender", "birth", "salary", "income"):
            self.assertNotIn(marker, serialized)

    def test_writes_three_pilot_inputs_with_basic_property_schema_only(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = prepare_pilot_inputs(Path(directory), SEED_CATEGORIES)
            payloads = [json.loads(path.read_text(encoding="utf-8")) for path in paths]

        self.assertEqual(len(paths), 3)
        self.assertEqual(
            payloads[0]["propertySchema"]["experience"],
            {"role": "text", "organization": "text"},
        )
        self.assertNotIn("task", str(payloads))
        self.assertNotIn("outcome", str(payloads))

    def test_builds_one_creative_length_pilot_for_each_band(self):
        payloads = build_length_pilot_inputs({key: {} for key in ()})

        self.assertEqual(
            [payload["bodyLengthPlan"]["band"] for payload in payloads],
            ["very_short", "moderately_short", "moderately_long", "very_long"],
        )
        self.assertEqual(
            [payload["bodyLengthPlan"]["targetMeanChars"] for payload in payloads],
            [100, 220, 380, 520],
        )
        self.assertTrue(
            all(payload["renderingPolicy"] == "skeleton-grounded-creative-v1" for payload in payloads)
        )
        for payload in payloads:
            targets = [event["bodyLengthTarget"]["targetChars"] for event in payload["events"]]
            self.assertAlmostEqual(
                statistics.fmean(targets),
                payload["bodyLengthPlan"]["targetMeanChars"],
                delta=1,
            )
            self.assertGreater(len(set(targets)), 1)
            maxima = [event["bodyLengthTarget"]["maxChars"] for event in payload["events"]]
            self.assertTrue(all(maximum < 800 for maximum in maxima))
            self.assertTrue(
                all(
                    maximum <= round(target * 1.15) + 20
                    for maximum, target in zip(maxima, targets, strict=True)
                )
            )
            self.assertTrue(all(event["skeletonLead"].endswith(".") for event in payload["events"]))

    def test_raises_infeasible_short_profile_target_to_skeleton_mean(self):
        planned = input_payload()
        planned["bodyLengthPlan"] = {
            "distributionVersion": "clipped-normal-v2",
            "targetMinChars": 40,
            "targetMaxChars": 800,
            "recordMaxChars": 1000,
            "populationMeanChars": 300,
            "populationStdChars": 160,
            "targetMeanChars": 40,
            "toleranceChars": 10,
            "band": "very_short",
        }
        planned["events"][0]["facts"] = ["긴 골격 문장 " * 12]

        _attach_record_length_targets(planned)

        lead_lengths = [len(event["skeletonLead"]) for event in planned["events"]]
        targets = [event["bodyLengthTarget"]["targetChars"] for event in planned["events"]]
        self.assertEqual(planned["bodyLengthPlan"]["sampledTargetMeanChars"], 40)
        self.assertTrue(planned["bodyLengthPlan"]["feasibilityAdjusted"])
        self.assertGreaterEqual(planned["bodyLengthPlan"]["targetMeanChars"], round(statistics.fmean(lead_lengths)))
        self.assertTrue(all(target >= lead for target, lead in zip(targets, lead_lengths, strict=True)))

    def test_sparse_profile_tolerance_accounts_for_sentence_granularity(self):
        self.assertEqual(body_mean_tolerance({"toleranceChars": 14}, 3), 30)
        self.assertEqual(body_mean_tolerance({"toleranceChars": 15}, 10), 30)

    def test_body_length_band_uses_population_boundaries(self):
        plan = {"populationMeanChars": 300, "populationStdChars": 160}
        self.assertEqual(body_length_band(116.33, plan), "very_short")
        self.assertEqual(body_length_band(160, plan), "moderately_short")
        self.assertEqual(body_length_band(380, plan), "moderately_long")
        self.assertEqual(body_length_band(520, plan), "very_long")

    def test_rejects_record_that_does_not_start_with_skeleton_lead(self):
        planned_input = input_payload()
        planned_input["events"][0]["skeletonLead"] = "2019년에 교육 과정을 시작했다."

        result = validate_draft(planned_input, valid_draft())

        self.assertFalse(result["valid"])
        self.assertIn("record_1_skeleton_lead", result["errors"])

    def test_writes_four_creative_length_pilot_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = prepare_length_pilot_inputs(Path(directory), SEED_CATEGORIES)

            self.assertEqual(len(paths), 4)
            self.assertTrue(all(path.exists() for path in paths))


class BodyLengthPlanTests(unittest.TestCase):
    def test_assigns_four_bands_from_clipped_normal_quantiles(self):
        plans = build_body_length_plans(30, seed=42)

        targets = [plan["targetMeanChars"] for plan in plans]
        bands = ("very_short", "moderately_short", "moderately_long", "very_long")
        band_counts = {band: sum(plan["band"] == band for plan in plans) for band in bands}
        self.assertEqual(
            band_counts,
            {"very_short": 5, "moderately_short": 10, "moderately_long": 10, "very_long": 5},
        )
        self.assertGreaterEqual(min(targets), 40)
        self.assertLessEqual(max(targets), 800)
        self.assertAlmostEqual(statistics.fmean(targets), 300, delta=5)
        self.assertAlmostEqual(statistics.pstdev(targets), 160, delta=10)
        self.assertTrue(all(plan["recordMaxChars"] == 1000 for plan in plans))
        self.assertTrue(all(plan["distributionVersion"] == "clipped-normal-v2" for plan in plans))

    def test_seed_changes_assignment_order_without_changing_distribution(self):
        first = build_body_length_plans(30, seed=1)
        second = build_body_length_plans(30, seed=2)

        self.assertNotEqual(first, second)
        self.assertEqual(
            sorted(plan["targetMeanChars"] for plan in first),
            sorted(plan["targetMeanChars"] for plan in second),
        )

    def test_attaches_one_plan_to_each_profile_without_mutating_inputs(self):
        payloads = [{"profileSeed": f"profile-{index:03d}"} for index in range(30)]

        planned = assign_body_length_plans(payloads, seed=42)

        self.assertEqual(len(planned), 30)
        self.assertTrue(all("bodyLengthPlan" in payload for payload in planned))
        self.assertTrue(all("bodyLengthPlan" not in payload for payload in payloads))
        self.assertEqual(
            {payload["bodyLengthPlan"]["band"] for payload in planned},
            {"very_short", "moderately_short", "moderately_long", "very_long"},
        )
        self.assertTrue(
            all(payload["renderingPolicy"] == "skeleton-grounded-creative-v1" for payload in planned)
        )

    def test_rejects_creative_plan_when_property_values_are_not_fixed(self):
        payload = input_payload()
        del payload["events"][0]["propertyValues"]

        with self.assertRaisesRegex(ValueError, "propertyValues"):
            assign_body_length_plans([payload], seed=42)


if __name__ == "__main__":
    unittest.main()
