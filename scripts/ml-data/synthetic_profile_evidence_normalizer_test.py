import unittest

from synthetic_profile_evidence_normalizer import build_shards, validate_result


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
