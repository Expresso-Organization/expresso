import json
import tempfile
import unittest
from pathlib import Path

from synthetic_profile_v452_repair import (
    build_luna_repair_context,
    build_repair_plan,
    format_existing_body,
    merge_authored_repair,
    upgrade_batch_to_v452,
)


class SyntheticProfileV452MigrationTest(unittest.TestCase):
    def test_upgrade_replaces_forced_leads_with_semantic_rewrites_and_keeps_a_backup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "inputs").mkdir()
            manifest = {
                "promptVersion": "synthetic-profile-v4.5.1",
                "profiles": [{"profileSeed": "p1", "sequenceIndex": 1}],
            }
            payload = {
                "profileSeed": "p1",
                "renderingPolicy": "skeleton-grounded-creative-v1",
                "propertySchema": {"skill_tool": {}},
                "bodyLengthPlan": {
                    "distributionVersion": "clipped-normal-v2",
                    "targetMinChars": 40,
                    "targetMaxChars": 800,
                    "recordMaxChars": 1000,
                    "populationMeanChars": 300,
                    "populationStdChars": 160,
                    "targetMeanChars": 220,
                    "toleranceChars": 30,
                    "band": "moderately_short",
                },
                "events": [
                    {
                        "eventId": "ev1",
                        "categoryKey": "skill_tool",
                        "facts": ["소프트웨어 개발 업무에서 Python을 활용했다"],
                        "propertyKeys": [],
                        "propertyValues": {},
                        "renderMode": "fixed_skeleton",
                        "skeletonLead": "소프트웨어 개발 업무에서 Python을 활용했다.",
                    }
                ],
            }
            (root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            (root / "inputs" / "p1.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

            result = upgrade_batch_to_v452(root / "manifest.json")

            upgraded_manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
            upgraded = json.loads((root / "inputs" / "p1.json").read_text(encoding="utf-8"))
            backup = root / "backups" / "v4.5.1-before-v4.5.2" / "inputs" / "p1.json"
            self.assertEqual(upgraded_manifest["promptVersion"], "synthetic-profile-v4.5.2")
            self.assertEqual(upgraded["renderingPolicy"], "semantic-rewrite-creative-v2")
            self.assertEqual(upgraded["events"][0]["renderMode"], "rewrite_evidence")
            self.assertEqual(upgraded["events"][0]["skeletonLead"], "")
            self.assertIn(upgraded["events"][0]["layoutMode"], {"single_paragraph", "multi_paragraph"})
            self.assertTrue(backup.is_file())
            self.assertEqual(result["upgradedInputs"], 1)


class SyntheticProfileV452RepairPlanTest(unittest.TestCase):
    def test_formats_existing_sentences_without_changing_their_text(self):
        body = "첫 번째 작업을 기록했다. 두 번째 판단 근거를 남겼다. 마지막 결과를 정리했다."

        paragraphs = format_existing_body(body, "multi_paragraph")
        checklist = format_existing_body(body, "checklist")

        self.assertIn("\n\n", paragraphs)
        self.assertEqual(checklist.count("\n- "), 2)
        for sentence in ("첫 번째 작업을 기록했다.", "두 번째 판단 근거를 남겼다.", "마지막 결과를 정리했다."):
            self.assertIn(sentence, paragraphs)
            self.assertIn(sentence, checklist)

    def test_plan_targets_repeated_final_sentences_titles_and_wrong_layouts_by_record(self):
        repeated = "소프트웨어 개발 업무에서 Python을 활용했다."
        profiles = {}
        inputs = {}
        for index in range(1, 4):
            seed = f"p{index}"
            profiles[seed] = {
                "datasetMeta": {"profileSeed": seed, "generatorModel": "gpt-5.6-luna"},
                "categories": [{"id": "skill", "key": "skill_tool"}],
                "records": [
                    {
                        "categoryId": "skill",
                        "title": "Python 활용",
                        "bodyMd": repeated + f" 프로필 {index}의 작업 맥락은 서로 달랐다.",
                    }
                ],
            }
            inputs[seed] = {
                "events": [
                    {
                        "eventId": "ev1",
                        "categoryKey": "skill_tool",
                        "layoutMode": "multi_paragraph",
                    }
                ]
            }

        plan = build_repair_plan(profiles, inputs)

        self.assertEqual(set(plan["targets"]), {"p1", "p2", "p3"})
        for target in plan["targets"].values():
            self.assertEqual(target[0]["recordIndex"], 0)
            self.assertEqual(
                set(target[0]["reasons"]),
                {"repeated_final_sentence", "repeated_non_education_title", "layout_mismatch"},
            )
        self.assertEqual(plan["summary"]["targetProfiles"], 3)
        self.assertEqual(plan["summary"]["targetRecords"], 3)

    def test_plan_targets_every_record_that_previously_used_a_fixed_skeleton(self):
        profiles = {
            "p1": {
                "datasetMeta": {"profileSeed": "p1"},
                "records": [{"title": "고유 제목", "bodyMd": "서로 겹치지 않는 충분히 긴 개인 기록을 남겼다."}],
            }
        }
        inputs = {
            "p1": {
                "events": [
                    {"eventId": "ev1", "categoryKey": "experience", "layoutMode": "single_paragraph"}
                ]
            }
        }
        legacy_inputs = {
            "p1": {"events": [{"eventId": "ev1", "renderMode": "fixed_skeleton"}]}
        }

        plan = build_repair_plan(profiles, inputs, legacy_inputs_by_seed=legacy_inputs)

        self.assertEqual(plan["targets"]["p1"][0]["reasons"], ["legacy_fixed_skeleton"])

    def test_repair_context_contains_only_targeted_records_and_current_text(self):
        profiles = {
            "p1": {
                "datasetMeta": {"profileSeed": "p1", "generatorModel": "gpt-5.6-luna"},
                "careerProfile": {"targetRoles": ["백엔드"], "experienceYears": 1},
                "records": [
                    {"title": "기존 제목", "bodyMd": "기존 본문을 충분한 길이로 기록했다."},
                    {"title": "유지 제목", "bodyMd": "그대로 유지할 두 번째 기록이다."},
                ],
            }
        }
        inputs = {
            "p1": {
                "persona": {"targetRoles": ["백엔드"], "experienceYears": 1},
                "events": [
                    {
                        "eventId": "ev1",
                        "categoryKey": "experience",
                        "facts": ["2023년부터 소프트웨어 개발 업무를 맡았다"],
                        "propertyValues": {},
                        "renderMode": "rewrite_evidence",
                        "skeletonLead": "",
                        "layoutMode": "single_paragraph",
                        "bodyLengthTarget": {"targetChars": 120, "minChars": 80, "maxChars": 150},
                    },
                    {"eventId": "ev2", "categoryKey": "project"},
                ],
            }
        }
        plan = {
            "forbiddenExactSentences": ["금지된 완결 문장을 다른 기록에서 반복했다"],
            "forbiddenTitles": ["기존 제목"],
            "targets": {"p1": [{"recordIndex": 0, "eventId": "ev1", "reasons": ["legacy_fixed_skeleton"]}]},
        }

        context = build_luna_repair_context(plan, profiles, inputs, shard_id="repair-round-01")

        self.assertEqual(context["shardId"], "repair-round-01")
        self.assertEqual(len(context["profiles"][0]["events"]), 1)
        event = context["profiles"][0]["events"][0]
        self.assertEqual(event["recordIndex"], 0)
        self.assertEqual(event["currentTitle"], "기존 제목")
        self.assertEqual(event["currentBodyMd"], "기존 본문을 충분한 길이로 기록했다.")
        self.assertEqual(event["postSanitizeLength"]["targetChars"], 120)
        self.assertEqual(event["detailLength"]["targetChars"], 184)
        self.assertEqual(event["minimumSentences"], 11)
        self.assertEqual(event["requiredNumbers"], ["2023"])
        self.assertEqual(event["numericFacts"], ["2023년부터 소프트웨어 개발 업무를 맡았다"])

    def test_merge_replaces_only_targeted_record_and_applies_layout(self):
        payload = {
            "profileSeed": "p1",
            "renderingPolicy": "semantic-rewrite-creative-v2",
            "bodyLengthPlan": {"band": "moderately_long", "recordMaxChars": 1000},
            "propertySchema": {"experience": {}, "project": {}},
            "events": [
                {
                    "eventId": "ev1",
                    "categoryKey": "experience",
                    "facts": ["소프트웨어 개발 업무를 맡았다"],
                    "propertyKeys": [],
                    "propertyValues": {},
                    "renderMode": "rewrite_evidence",
                    "skeletonLead": "",
                    "layoutMode": "checklist",
                    "bodyLengthTarget": {"targetChars": 120, "minChars": 40, "maxChars": 180},
                },
                {
                    "eventId": "ev2",
                    "categoryKey": "project",
                    "facts": ["프로젝트를 마쳤다"],
                    "propertyKeys": [],
                    "propertyValues": {},
                    "renderMode": "rewrite_evidence",
                    "skeletonLead": "",
                    "layoutMode": "single_paragraph",
                    "bodyLengthTarget": {"targetChars": 80, "minChars": 40, "maxChars": 120},
                },
            ],
        }
        draft = {
            "status": "generated",
            "profileSeed": "p1",
            "persona": {},
            "records": [
                {"draftId": "r1", "eventId": "ev1", "categoryKey": "experience", "title": "기존", "properties": {}, "bodyMd": "기존 본문이다."},
                {"draftId": "r2", "eventId": "ev2", "categoryKey": "project", "title": "유지", "properties": {}, "bodyMd": "두 번째 기록은 그대로 유지한다."},
            ],
        }
        authored = {
            "profileSeed": "p1",
            "records": [
                {
                    "eventId": "ev1",
                    "title": "개발 업무 정리",
                    "detailMd": "소프트웨어 개발 업무를 맡아 요청을 정리했다. 변경된 동작과 판단 근거를 기록했다.",
                }
            ],
        }

        merged = merge_authored_repair(
            payload,
            draft,
            authored,
            [{"recordIndex": 0, "eventId": "ev1", "reasons": ["legacy_fixed_skeleton"]}],
        )

        self.assertEqual(merged["records"][0]["title"], "개발 업무 정리")
        self.assertTrue(merged["records"][0]["bodyMd"].startswith("- "))
        self.assertEqual(merged["records"][1], draft["records"][1])

    def test_merge_preserves_body_when_only_the_title_is_repeated(self):
        payload = {
            "profileSeed": "p1",
            "renderingPolicy": "semantic-rewrite-creative-v2",
            "bodyLengthPlan": {"band": "moderately_short", "recordMaxChars": 1000},
            "propertySchema": {"skill_tool": {}},
            "events": [
                {
                    "eventId": "ev1",
                    "categoryKey": "skill_tool",
                    "facts": ["Python을 활용했다"],
                    "propertyKeys": [],
                    "propertyValues": {},
                    "renderMode": "rewrite_evidence",
                    "skeletonLead": "",
                    "layoutMode": "single_paragraph",
                    "bodyLengthTarget": {"targetChars": 100, "minChars": 40, "maxChars": 140},
                }
            ],
        }
        original_body = "기존 본문은 길이와 사건 내용이 모두 정상이라 그대로 보존해야 한다."
        draft = {
            "status": "generated",
            "profileSeed": "p1",
            "persona": {},
            "records": [
                {"draftId": "r1", "eventId": "ev1", "categoryKey": "skill_tool", "title": "Python 활용", "properties": {}, "bodyMd": original_body}
            ],
        }
        authored = {
            "profileSeed": "p1",
            "records": [{"eventId": "ev1", "title": "입력 자료 자동 정리", "detailMd": "짧게 다시 썼다."}],
        }

        merged = merge_authored_repair(
            payload,
            draft,
            authored,
            [{"recordIndex": 0, "eventId": "ev1", "reasons": ["repeated_non_education_title"]}],
        )

        self.assertEqual(merged["records"][0]["title"], "입력 자료 자동 정리")
        self.assertEqual(merged["records"][0]["bodyMd"], original_body)


if __name__ == "__main__":
    unittest.main()
