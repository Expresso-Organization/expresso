import math
import unittest

from retrieval_baselines import (
    build_lexical_scores,
    combine_hybrid_scores,
    min_max_normalize,
    normalize_text,
)


class RetrievalBaselinesTest(unittest.TestCase):
    def test_normalize_text_uses_nfkc_casefold_and_collapses_space(self):
        self.assertEqual(normalize_text("  Ｐｙｔｈｏｎ\n  데이터  "), "python 데이터")

    def test_every_baseline_ranks_relevant_job_above_irrelevant_job(self):
        profiles = {"p-1": "Python SQL 데이터 파이프라인 개발"}
        jobs = {
            "j-relevant": "데이터 엔지니어 Python SQL 파이프라인 구축",
            "j-irrelevant": "브랜드 마케팅 콘텐츠 캠페인 운영",
        }
        pairs = [("p-1", "j-relevant"), ("p-1", "j-irrelevant")]

        scores = build_lexical_scores(profiles, jobs, pairs)

        for model in ("token_overlap", "word_tfidf", "char_tfidf", "bm25"):
            with self.subTest(model=model):
                self.assertGreater(
                    scores[model]["p-1"]["j-relevant"],
                    scores[model]["p-1"]["j-irrelevant"],
                )
                self.assertTrue(
                    math.isfinite(scores[model]["p-1"]["j-relevant"])
                )

    def test_min_max_normalize_maps_constant_scores_to_zero(self):
        self.assertEqual(
            min_max_normalize({"j-1": 3.0, "j-2": 3.0}),
            {"j-1": 0.0, "j-2": 0.0},
        )

    def test_hybrid_weight_is_char_tfidf_share(self):
        char_scores = {"p-1": {"j-1": 1.0, "j-2": 0.0}}
        bm25_scores = {"p-1": {"j-1": 0.0, "j-2": 1.0}}

        self.assertEqual(
            combine_hybrid_scores(char_scores, bm25_scores, char_weight=1.0),
            char_scores,
        )
        self.assertEqual(
            combine_hybrid_scores(char_scores, bm25_scores, char_weight=0.0),
            bm25_scores,
        )


if __name__ == "__main__":
    unittest.main()
