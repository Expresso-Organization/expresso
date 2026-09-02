import unittest

from synthetic_profile_v4_experiment import build_output_schema, normalize_run_metadata, score_draft


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
