from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest


sys.path.insert(0, str(Path(__file__).parent))

from match_evaluation import (
    build_metadata,
    next_version,
    pairwise_accuracy,
    profile_ndcg,
    record_ndcg,
    record_relevance,
    roc_curve,
    rule_requirement_labels,
    rule_requirements,
    screening_recall_curve,
)


class RocCurveTest(unittest.TestCase):
    def test_perfect_separation_has_unit_area(self) -> None:
        result = roc_curve([80, 70, 20, 10], [0.9, 0.8, 0.3, 0.1])
        self.assertEqual(result["auc"], 1.0)
        self.assertEqual((result["positives"], result["negatives"]), (2, 2))
        self.assertEqual(result["points"][0], {"scoreThreshold": None, "fpr": 0.0, "tpr": 0.0})
        self.assertEqual(result["points"][-1]["fpr"], 1.0)

    def test_area_equals_pairwise_probability_with_ties_as_half(self) -> None:
        targets = [90, 65, 40, 30, 10]
        scores = [0.7, 0.5, 0.5, 0.8, 0.1]
        # 양성 {0.7, 0.5} × 음성 {0.5, 0.8, 0.1}: 이김 0.7>0.5 · 0.7>0.1 · 0.5>0.1, 동점 0.5=0.5
        expected = (3 + 0.5) / 6
        self.assertAlmostEqual(roc_curve(targets, scores)["auc"], expected)

    def test_single_class_has_no_area(self) -> None:
        self.assertIsNone(roc_curve([10, 20], [0.1, 0.2])["auc"])


class PairwiseAccuracyTest(unittest.TestCase):
    def test_only_pairs_at_least_min_gap_apart_count(self) -> None:
        rows = [
            {"profileId": "p", "target": 50, "prediction": 1.0},
            {"profileId": "p", "target": 47, "prediction": 2.0},
            {"profileId": "p", "target": 40, "prediction": 0.0},
            {"profileId": "q", "target": 90, "prediction": 0.0},
            {"profileId": "q", "target": 10, "prediction": 0.0},
        ]
        result = pairwise_accuracy(rows)
        # p: (50,47) 차 3 → 제외 · (50,40) 맞음 · (47,40) 맞음 · q: 동점 0.5
        self.assertEqual(result["comparisons"], 3)
        self.assertAlmostEqual(result["accuracy"], 2.5 / 3)


class ProfileMetricTest(unittest.TestCase):
    def test_profile_ndcg_matches_hand_computation(self) -> None:
        rows = [
            {"profileId": "p", "target": 0, "prediction": 0.9},
            {"profileId": "p", "target": 100, "prediction": 0.1},
        ]
        import math

        expected = (0 + 100 / math.log2(3)) / 100
        self.assertAlmostEqual(profile_ndcg(rows)["p"], expected)


class ScreeningRecallTest(unittest.TestCase):
    def test_curve_counts_relevant_jobs_within_top_k(self) -> None:
        scores = {
            "p": [("j1", 0.9), ("j2", 0.8), ("j3", 0.1), ("j4", 0.5)],
            "q": [("j1", 0.2), ("j2", 0.1), ("j3", 0.9), ("j4", 0.3)],
            "r": [("j1", 0.5), ("j2", 0.5), ("j3", 0.5), ("j4", 0.5)],
        }
        relevant = {"p": {"j1", "j3"}, "q": {"j2"}}
        result = screening_recall_curve(scores, relevant)
        self.assertEqual(result["profilesWithRelevant"], 2)
        self.assertEqual(result["poolSize"], 4)
        # p: j1 1위 · j3 4위 / q: j2 4위
        self.assertEqual(result["recallAtK"], [0.25, 0.25, 0.25, 1.0])
        self.assertEqual(result["kForFullRecall"], 4)

    def test_pool_size_must_match(self) -> None:
        with self.assertRaises(ValueError):
            screening_recall_curve({"p": [("j1", 1.0)], "q": [("j1", 1.0), ("j2", 0.0)]}, {})


class ModelBTest(unittest.TestCase):
    def test_record_relevance_takes_max_linked_coverage(self) -> None:
        label = {
            "requirementAssessments": [
                {"coverage": "partial", "evidenceRecordIds": ["r1", "r2"]},
                {"coverage": "strong", "evidenceRecordIds": ["r2"]},
                {"coverage": "not_evidenced", "evidenceRecordIds": []},
            ]
        }
        self.assertEqual(record_relevance(label, ["r1", "r2", "r3"]), {"r1": 50.0, "r2": 100.0, "r3": 0.0})

    def test_unknown_evidence_record_fails(self) -> None:
        with self.assertRaises(ValueError):
            record_relevance({"requirementAssessments": [{"coverage": "strong", "evidenceRecordIds": ["x"]}]}, ["r1"])

    def test_record_ndcg_skips_pairs_without_relevant_record(self) -> None:
        groups = [
            {"relevance": {"a": 100.0, "b": 0.0}, "scores": {"a": 1.0, "b": 0.0}},
            {"relevance": {"a": 0.0, "b": 0.0}, "scores": {"a": 1.0, "b": 0.0}},
        ]
        result = record_ndcg(groups)
        self.assertEqual((result["ndcg"], result["pairs"], result["skippedAllZero"]), (1.0, 1, 1))


class RuleInputTest(unittest.TestCase):
    def test_jth_fields_become_service_requirements(self) -> None:
        job = {
            "fields": {
                "skills": "python;SQL",
                "llm_hard_skills": "sql;docker",
                "llm_soft_skills": "communication",
                "llm_required_years_of_work_experience": "2.5",
                "job_category": "backend developer",
            }
        }
        self.assertEqual(
            rule_requirements(job),
            {"technologies": ["python", "SQL", "docker"], "impacts": [], "roles": ["communication", "3 years"], "conditions": []},
        )
        self.assertEqual(rule_requirement_labels(job), ["python", "SQL", "docker", "communication", "3 years"])

    def test_missing_years_adds_nothing(self) -> None:
        self.assertEqual(rule_requirements({"fields": {"llm_required_years_of_work_experience": "unknown"}})["roles"], [])


class VersionTest(unittest.TestCase):
    def test_next_version_follows_design_doc_format(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(next_version(root, "bi", "v1"), "bi-v1-001")
            (root / "bi-v1-001").mkdir()
            (root / "bi-v1-007").mkdir()
            (root / "cross-v1-003").mkdir()
            self.assertEqual(next_version(root, "bi", "v1"), "bi-v1-008")
            self.assertEqual(next_version(root, "cross", "v1"), "cross-v1-004")

    def test_metadata_lists_design_doc_fields(self) -> None:
        metadata = build_metadata(
            version="bi-v1-001",
            dataset_version="fit-v1",
            encoder="intfloat/multilingual-e5-base",
            labels=[
                {"rubricVersion": "job-profile-fit-v1", "labelSource": "gpt-5.6-luna"},
                {"rubricVersion": "job-profile-fit-v1", "labelSource": "claude-code-sonnet-5"},
            ],
            hashes={"labels": "abc"},
            trained_at="2026-11-10T00:00:00+00:00",
            code_commit="deadbeef",
        )
        self.assertEqual(metadata["rubricVersion"], "job-profile-fit-v1")
        self.assertEqual(metadata["teacherModels"], {"claude-code-sonnet-5": 1, "gpt-5.6-luna": 1})
        for key in ("datasetVersion", "encoder", "trainedAt", "codeCommit"):
            self.assertIn(key, metadata)


if __name__ == "__main__":
    unittest.main()
