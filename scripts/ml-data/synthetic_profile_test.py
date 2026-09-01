import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from synthetic_profile import assemble_profile, extract_evidence_atom, prepare_generation_inputs


SEED_CATEGORIES = [
    {
        "_id": "475106fc-bf88-4a73-9c27-66c648733936",
        "userId": None,
        "key": "experience",
        "isSystem": True,
        "propertySchema": {"role": {"type": "text", "label": "역할", "system": False, "required": False}},
        "sortOrder": 0,
        "name": "경험",
        "icon": "briefcase",
        "defaultView": "table",
        "version": 1,
    },
    *[
        {
            "_id": f"00000000-0000-4000-8000-00000000000{index}",
            "userId": None,
            "key": key,
            "isSystem": True,
            "propertySchema": {},
            "sortOrder": index,
            "name": key,
            "icon": "icon",
            "defaultView": "list",
            "version": 1,
        }
        for index, key in enumerate(
            [
                "project",
                "education_history",
                "certification_award",
                "academic_writing",
                "activity_leadership",
                "skill_tool",
            ],
            start=1,
        )
    ],
]


def bounded_body(prefix):
    return (prefix + " " + ("근거" * 300))[:280]


class SyntheticProfileTest(unittest.TestCase):
    def test_extracts_cost_bounded_evidence_without_demographics(self):
        payload = {
            "dataSet": {
                "info": {
                    "occupation": "ICT",
                    "experience": "NEW",
                    "gender": "FEMALE",
                    "ageRange": "-34",
                },
                "question": {"raw": {"text": "질문" * 100}},
                "answer": {
                    "raw": {"text": "근거" * 200},
                    "summary": {"text": "요약" * 200},
                    "intent": [{"category": "직무역량"}],
                },
            }
        }
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "source.zip"
            with zipfile.ZipFile(archive, "w") as output:
                output.writestr("/entry.json", json.dumps(payload, ensure_ascii=False))

            atom = extract_evidence_atom(archive, "entry.json")

        self.assertEqual(atom["occupation"], "ICT")
        self.assertEqual(atom["experienceLevel"], "NEW")
        self.assertNotIn("gender", atom)
        self.assertNotIn("ageRange", atom)
        self.assertLessEqual(len(atom["question"]), 150)
        self.assertLessEqual(len(atom["summary"]), 300)
        self.assertLessEqual(len(atom["quote"]), 200)

    def test_prepares_one_bounded_input_file_per_manifest_profile(self):
        payload = {
            "dataSet": {
                "info": {"occupation": "ICT", "experience": "NEW"},
                "question": {"raw": {"text": "어떤 프로젝트를 했나요?"}},
                "answer": {
                    "raw": {"text": "Python으로 분석 프로젝트를 진행했습니다."},
                    "summary": {"text": "Python 분석 프로젝트 경험"},
                    "intent": [{"category": "직무역량"}],
                },
            }
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "source.zip"
            with zipfile.ZipFile(archive, "w") as output:
                output.writestr("entry.json", json.dumps(payload, ensure_ascii=False))
            manifest = {
                "profiles": [{
                    "profileSeed": "profile-001",
                    "targetRoles": ["데이터"],
                    "experienceYears": 0,
                    "primaryGoal": "build",
                    "sources": [{"zip": "source.zip", "entry": "entry.json"}],
                }]
            }

            paths = prepare_generation_inputs(manifest, root, root / "inputs")
            prepared = json.loads(paths[0].read_text(encoding="utf-8"))

        self.assertEqual(prepared["spec"]["profileSeed"], "profile-001")
        self.assertEqual(prepared["spec"]["recordCount"], {"min": 4, "max": 6})
        self.assertEqual(prepared["evidence"][0]["atomId"], "aih-71592-entry")
        self.assertEqual(prepared["allowedCategoryKeys"], [category["key"] for category in SEED_CATEGORIES])

    def test_assembles_exact_expresso_objects_and_human_review_queue(self):
        draft = {
            "profileSeed": "profile-001",
            "persona": {
                "targetRoles": ["백엔드"],
                "experienceYears": 2,
                "primaryGoal": "build",
            },
            "records": [
                {
                    "draftId": "r1",
                    "categoryKey": "experience",
                    "title": "API 개발",
                    "properties": {"role": "백엔드 개발"},
                    "bodyMd": bounded_body("Python으로 API를 개발했습니다."),
                    "sourceAtomIds": ["atom-1"],
                },
                *[
                    {
                        "draftId": f"r{index}",
                        "categoryKey": "project",
                        "title": f"프로젝트 {index}",
                        "properties": {},
                        "bodyMd": bounded_body(f"프로젝트 {index}"),
                        "sourceAtomIds": ["atom-1"],
                    }
                    for index in range(2, 5)
                ],
            ],
            "links": [],
            "skills": [
                {
                    "name": "Python",
                    "level": 2,
                    "evidence": [{"draftId": "r1", "quote": "Python"}],
                }
            ],
        }

        profile = assemble_profile(
            draft,
            SEED_CATEGORIES,
            created_at="2026-09-02T00:00:00.000Z",
            source_dataset="AIHUB-71592",
            allowed_atom_ids={"atom-1"},
        )

        self.assertEqual(len(profile["categories"]), 7)
        self.assertEqual(profile["categories"][0]["recordCount"], 1)
        self.assertEqual(profile["categories"][1]["recordCount"], 3)
        self.assertEqual(profile["records"][0]["origin"], "ai")
        self.assertEqual(profile["records"][0]["status"], "organized")
        self.assertEqual(profile["humanReview"], {
            "status": "pending",
            "reviewer": None,
            "reviewedAt": None,
            "decision": None,
            "notes": None,
        })
        skill_id = profile["skills"][0]["id"]
        evidence = profile["skillEvidenceBySkillId"][skill_id][0]
        self.assertEqual(evidence["span"]["quote"], "Python")
        self.assertEqual(evidence["span"]["start"], 0)
        self.assertEqual(evidence["span"]["end"], 6)
        self.assertEqual(profile["provenance"]["recordLineage"][0]["sourceAtomIds"], ["atom-1"])

    def test_rejects_skill_quote_that_is_absent_from_record(self):
        draft = {
            "profileSeed": "profile-002",
            "persona": {"targetRoles": [], "experienceYears": 0, "primaryGoal": "organize"},
            "records": [
                {
                    "draftId": "r1",
                    "categoryKey": "project",
                    "title": "프로젝트",
                    "properties": {},
                    "bodyMd": bounded_body("근거 본문"),
                    "sourceAtomIds": ["atom-1"],
                },
                *[
                    {
                        "draftId": f"r{index}",
                        "categoryKey": "project",
                        "title": f"프로젝트 {index}",
                        "properties": {},
                        "bodyMd": bounded_body(f"프로젝트 {index}"),
                        "sourceAtomIds": ["atom-1"],
                    }
                    for index in range(2, 5)
                ],
            ],
            "links": [],
            "skills": [{"name": "Python", "level": 1, "evidence": [{"draftId": "r1", "quote": "Python"}]}],
        }

        with self.assertRaisesRegex(ValueError, "skill quote"):
            assemble_profile(draft, SEED_CATEGORIES, created_at="2026-09-02T00:00:00.000Z")

    def test_rejects_out_of_budget_drafts_and_unknown_atoms(self):
        draft = {
            "profileSeed": "profile-003",
            "persona": {"targetRoles": ["데이터"], "experienceYears": 0, "primaryGoal": "build"},
            "records": [{
                "draftId": "r1",
                "categoryKey": "project",
                "title": "너무 짧은 초안",
                "properties": {},
                "bodyMd": "짧음",
                "sourceAtomIds": ["unknown-atom"],
            }],
            "links": [],
            "skills": [],
        }

        with self.assertRaisesRegex(ValueError, "4 to 6 records"):
            assemble_profile(draft, SEED_CATEGORIES, allowed_atom_ids={"atom-1"})


if __name__ == "__main__":
    unittest.main()
