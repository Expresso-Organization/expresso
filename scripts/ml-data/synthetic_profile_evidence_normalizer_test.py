import unittest

from synthetic_profile_evidence_normalizer import build_shards, required_anchors, validate_result


ATOM = {
    "atomId": "atom-1",
    "summary": "노무사 시험 일 차는 합격했지만 이 차에서 떨어져 자격을 취득하지 못했습니다.",
}


class EvidenceNormalizerTest(unittest.TestCase):
    def test_accepts_concise_past_spine_that_preserves_success_and_failure(self):
        result = {
            "status": "accepted",
            "categoryKey": "certification_award",
            "factSpine": "노무사 시험 일 차에 합격했지만 이 차에서 떨어져 자격을 취득하지 못했다.",
            "rejectionReason": "",
        }
        self.assertEqual(validate_result(ATOM, result), [])

    def test_rejects_missing_failure_or_invented_number(self):
        result = {
            "status": "accepted",
            "categoryKey": "certification_award",
            "factSpine": "노무사 시험 3차에 합격해 자격을 취득했다.",
            "rejectionReason": "",
        }
        errors = validate_result(ATOM, result)
        self.assertIn("invented_numbers", errors)
        self.assertIn("missing_anchor", errors)

    def test_rejects_invented_success_and_foreign_script(self):
        atom = {"atomId": "atom-2", "summary": "인턴십에 도전했다."}
        result = {
            "status": "accepted",
            "categoryKey": "education_history",
            "factSpine": "인턴십에 主动 도전해 합격했다.",
            "rejectionReason": "",
        }
        errors = validate_result(atom, result)
        self.assertIn("foreign_script", errors)
        self.assertIn("invented_anchor", errors)

    def test_anchor_matching_does_not_treat_pronunciation_as_achievement(self):
        self.assertNotIn("achievement", required_anchors("발성과 발음 연습을 진행했습니다."))

    def test_allows_explained_resolution_without_inventing_terminal_outcome(self):
        atom = {"atomId": "atom-3", "summary": "협업 과정에서 주문을 문서화했습니다."}
        result = {
            "status": "accepted",
            "categoryKey": "experience",
            "factSpine": "협업 중 몰린 주문을 문서화해 업무 처리 문제를 해결했다.",
            "rejectionReason": "",
        }
        self.assertEqual(validate_result(atom, result), [])

    def test_rejects_invented_improvement_and_completion(self):
        atom = {"atomId": "atom-4", "summary": "인턴으로 신메뉴 개발에 참여했습니다."}
        result = {
            "status": "accepted",
            "categoryKey": "experience",
            "factSpine": "인턴으로 신메뉴 개발에 참여해 제품 품질 개선에 기여하고 업무를 완수했다.",
            "rejectionReason": "",
        }
        self.assertIn("invented_anchor", validate_result(atom, result))

    def test_rejects_work_experience_as_non_work_activity(self):
        atom = {"atomId": "atom-5", "summary": "회사 영업 부서에서 샘플을 정리했습니다."}
        result = {
            "status": "accepted",
            "categoryKey": "activity_leadership",
            "factSpine": "회사 영업 부서에서 관리되지 않던 샘플을 분류하고 정리했다.",
            "rejectionReason": "",
        }
        self.assertIn("category_context", validate_result(atom, result))

    def test_rejection_has_no_fact_spine(self):
        result = {
            "status": "rejected",
            "categoryKey": "experience",
            "factSpine": "",
            "rejectionReason": "비직무 개인사",
        }
        self.assertEqual(validate_result(ATOM, result), [])

    def test_shards_cover_remainder_and_assign_both_devices(self):
        shards = build_shards([f"a-{index}" for index in range(53)], shard_size=25, windows_weight=0.57)
        self.assertEqual(sum(len(shard["atomIds"]) for shard in shards), 53)
        self.assertEqual({shard["device"] for shard in shards}, {"windows", "mac"})


if __name__ == "__main__":
    unittest.main()
