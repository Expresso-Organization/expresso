import json
import tempfile
import unittest
import zipfile
from collections import Counter
from pathlib import Path

from synthetic_profile_batch import build_profile_specs, select_source_entries


EXISTING_PROFILES = [
    {"profileSeed": "ict-new-data-001", "sources": [{"zip": "TL_05.ICT_Female_New.zip", "entry": "used-ict-new.json"}]},
    {"profileSeed": "ict-experienced-platform-001", "sources": [{"zip": "TL_05.ICT_Female_Experienced.zip", "entry": "used-ict-exp.json"}]},
    {"profileSeed": "rnd-new-policy-data-001", "sources": [{"zip": "TL_04.RND_Female_New.zip", "entry": "used-rnd-new.json"}]},
    {"profileSeed": "design-new-001", "sources": [{"zip": "TL_06.Design_Female_New.zip", "entry": "used-design-new.json"}]},
    {"profileSeed": "management-experienced-pm-001", "sources": [{"zip": "TL_01.Management_Female_Experienced.zip", "entry": "used-management-exp.json"}]},
]


def _payload(question, summary):
    return {
        "dataSet": {
            "info": {"occupation": "ICT", "experience": "신입"},
            "question": {"raw": {"text": question}},
            "answer": {
                "raw": {"text": summary},
                "summary": {"text": summary},
                "intent": [{"category": "background"}],
            },
        }
    }


class SyntheticProfileBatchTest(unittest.TestCase):
    def test_specs_expand_existing_five_to_balanced_thirty_profiles(self):
        specs = build_profile_specs(EXISTING_PROFILES)

        self.assertEqual(len(specs), 25)
        all_zip_names = [profile["sources"][0]["zip"] for profile in EXISTING_PROFILES]
        all_zip_names.extend(spec["zip"] for spec in specs)
        genders = Counter("Female" if "_Female_" in name else "Male" for name in all_zip_names)
        self.assertEqual(genders, {"Female": 15, "Male": 15})
        self.assertEqual(len(set(all_zip_names)), 28)
        self.assertEqual(len(all_zip_names) - len(set(all_zip_names)), 2)
        self.assertTrue(all(spec["profileSeed"] not in {item["profileSeed"] for item in EXISTING_PROFILES} for spec in specs))
        self.assertFalse(any("female" in spec["profileSeed"] or "male" in spec["profileSeed"] for spec in specs))

    def test_source_selection_prefers_factual_answers_and_excludes_used_entries(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            zip_path = Path(temp_dir) / "TL_05.ICT_Male_New.zip"
            with zipfile.ZipFile(zip_path, "w") as archive:
                archive.writestr("used.json", json.dumps(_payload("진행한 프로젝트 경험을 말씀해 주세요", "데이터 분석 프로젝트를 수행했습니다."), ensure_ascii=False))
                archive.writestr("factual-a.json", json.dumps(_payload("이전 직장에서 맡은 업무 경험은 무엇입니까", "백엔드 개발 업무를 수행하고 장애를 해결했습니다."), ensure_ascii=False))
                archive.writestr("factual-b.json", json.dumps(_payload("최근 공부하고 있는 기술이 있습니까", "Python을 공부하고 작은 분석 실습을 진행했습니다."), ensure_ascii=False))
                archive.writestr("hypothetical.json", json.dumps(_payload("입사하게 된다면 어떻게 하시겠습니까", "앞으로 열심히 배우고 싶습니다."), ensure_ascii=False))
                archive.writestr("broken.json", '{"dataSet":{"answer":{"summary":{"text":"깨진\n원천"}}}}')

            selected = select_source_entries(zip_path, count=2, excluded_entries={"used.json"})

        self.assertEqual({item["entry"] for item in selected}, {"factual-a.json", "factual-b.json"})
        self.assertTrue(all(item["zip"] == zip_path.name for item in selected))


if __name__ == "__main__":
    unittest.main()
