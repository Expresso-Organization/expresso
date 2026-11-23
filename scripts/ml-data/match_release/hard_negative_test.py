"""학습 시 양성·복제 기록이 hard negative에 섞이지 않는지 검사합니다."""

import unittest


class HardNegativeTest(unittest.TestCase):
    def test_mining_excludes_all_positives_and_identical_vectors(self):
        import torch
        from fit_hard_negatives import mined_indices
        from runtime import EvidenceHead

        torch.manual_seed(42)
        qv = torch.randn(1, 768)
        rv = torch.randn(5, 768)
        rv[1] = rv[0]
        tensors, count = mined_indices(
            [(0, [0, 1, 2, 3, 4], [0, 2])], EvidenceHead(), qv, rv
        )
        qi, ri, labels, importance = tensors
        self.assertEqual(set(ri[labels == 1].tolist()), {0, 2})
        self.assertNotIn(1, ri[labels == 0].tolist())
        self.assertEqual(count, 2)
        self.assertEqual(set(ri[labels == 0].tolist()), {3, 4})


if __name__ == "__main__":
    unittest.main()
