import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from ranking_evaluation import (
    DatasetValidationError,
    cohen_kappa,
    evaluate_gate,
    evaluate_ranking,
    paired_bootstrap,
    validate_dataset,
)


def sample_dataset():
    profiles = [
        {
            "profileId": "p-valid",
            "text": "Python 데이터 엔지니어",
            "split": "valid",
            "sourceAtomIds": ["atom-valid"],
        },
        {
            "profileId": "p-test",
            "text": "Python 데이터 엔지니어",
            "split": "test",
            "sourceAtomIds": ["atom-test"],
        },
    ]
    jobs = []
    labels = []
    for split, profile_id in (("valid", "p-valid"), ("test", "p-test")):
        for index, label in enumerate((3, 2, 1, 0)):
            job_id = f"j-{split}-{index}"
            jobs.append(
                {
                    "jobId": job_id,
                    "text": f"공고 {index}",
                    "split": split,
                    "duplicateGroupId": f"group-{split}-{index}",
                }
            )
            labels.append(
                {
                    "profileId": profile_id,
                    "jobId": job_id,
                    "split": split,
                    "teacherLabel": label,
                    "humanLabel": label if split == "test" else None,
                    "reasonCodes": ["FIXTURE"],
                }
            )
    return profiles, jobs, labels


class RankingMetricsTest(unittest.TestCase):
    def test_perfect_ranking_has_perfect_metrics(self):
        _, _, labels = sample_dataset()
        scores = {
            "p-test": {
                "j-test-0": 4.0,
                "j-test-1": 3.0,
                "j-test-2": 2.0,
                "j-test-3": 1.0,
            }
        }

        result = evaluate_ranking(scores, labels, split="test", label_field="teacherLabel")

        for metric in (
            "ndcgAt10",
            "map",
            "recallAt10",
            "mrrAt10",
            "auc",
            "hardNegativeAccuracy",
        ):
            with self.subTest(metric=metric):
                self.assertAlmostEqual(result["metrics"][metric], 1.0)

    def test_job_id_breaks_score_ties(self):
        labels = [
            {
                "profileId": "p",
                "jobId": "j-a",
                "split": "test",
                "teacherLabel": 3,
                "humanLabel": None,
                "reasonCodes": [],
            },
            {
                "profileId": "p",
                "jobId": "j-b",
                "split": "test",
                "teacherLabel": 0,
                "humanLabel": None,
                "reasonCodes": [],
            },
        ]
        result = evaluate_ranking(
            {"p": {"j-b": 1.0, "j-a": 1.0}},
            labels,
            split="test",
            label_field="teacherLabel",
        )
        self.assertEqual(result["perProfile"]["p"]["ranking"], ["j-a", "j-b"])
        self.assertEqual(result["metrics"]["ndcgAt10"], 1.0)


class DatasetValidationTest(unittest.TestCase):
    def test_rejects_source_atom_crossing_splits(self):
        profiles, jobs, labels = sample_dataset()
        profiles[1]["sourceAtomIds"] = ["atom-valid"]

        with self.assertRaisesRegex(DatasetValidationError, "sourceAtomId"):
            validate_dataset(profiles, jobs, labels)

    def test_rejects_duplicate_job_group_crossing_splits(self):
        profiles, jobs, labels = sample_dataset()
        jobs[4]["duplicateGroupId"] = jobs[0]["duplicateGroupId"]

        with self.assertRaisesRegex(DatasetValidationError, "duplicateGroupId"):
            validate_dataset(profiles, jobs, labels)

    def test_rejects_missing_candidate_score(self):
        profiles, jobs, labels = sample_dataset()
        candidate_scores = []
        for label in labels:
            if label["jobId"] == "j-test-3":
                continue
            candidate_scores.append(
                {
                    "model": "candidate-v1",
                    "profileId": label["profileId"],
                    "jobId": label["jobId"],
                    "score": 1.0,
                }
            )

        with self.assertRaisesRegex(DatasetValidationError, "missing scores"):
            validate_dataset(profiles, jobs, labels, candidate_scores)

    def test_requires_both_valid_and_test_labels(self):
        profiles, jobs, labels = sample_dataset()
        profiles = [profile for profile in profiles if profile["split"] == "test"]
        jobs = [job for job in jobs if job["split"] == "test"]
        labels = [label for label in labels if label["split"] == "test"]

        with self.assertRaisesRegex(DatasetValidationError, "valid and test"):
            validate_dataset(profiles, jobs, labels)


class ComparisonAndGateTest(unittest.TestCase):
    def test_paired_bootstrap_is_deterministic(self):
        candidate = {"p-1": 0.9, "p-2": 0.8, "p-3": 0.7}
        baseline = {"p-1": 0.7, "p-2": 0.6, "p-3": 0.5}

        first = paired_bootstrap(candidate, baseline, iterations=200, seed=42)
        second = paired_bootstrap(candidate, baseline, iterations=200, seed=42)

        self.assertEqual(first, second)
        self.assertAlmostEqual(first["meanDifference"], 0.2)
        self.assertGreater(first["lower95"], 0.0)

    def test_cohen_kappa_is_one_for_identical_labels(self):
        self.assertEqual(cohen_kappa([(0, 0), (1, 1), (2, 2), (3, 3)]), 1.0)

    def test_gate_requires_three_hundred_human_labels(self):
        gate = self._passing_gate(human_label_count=299)
        self.assertEqual(gate["status"], "insufficient_human_labels")

    def test_gate_rejects_untrusted_teacher(self):
        gate = self._passing_gate(teacher_human_kappa=0.59)
        self.assertEqual(gate["status"], "teacher_untrusted")

    def test_gate_requires_candidate_to_beat_strongest_baseline(self):
        gate = self._passing_gate(
            candidate_human_metrics={"ndcgAt10": 0.82, "auc": 0.9},
            strongest_human_metrics={"ndcgAt10": 0.8},
        )
        self.assertEqual(gate["status"], "baseline_not_beaten")

    def test_gate_passes_when_all_conditions_hold(self):
        gate = self._passing_gate()
        self.assertEqual(gate["status"], "passed")

    def test_gate_requires_ten_human_candidates_per_profile(self):
        gate = self._passing_gate(official_candidate_sets_valid=False)
        self.assertEqual(gate["status"], "metric_threshold_failed")

    def _passing_gate(self, **overrides):
        arguments = {
            "human_label_count": 300,
            "teacher_human_kappa": 0.8,
            "candidate_human_metrics": {"ndcgAt10": 0.9, "auc": 0.9},
            "token_human_metrics": {"ndcgAt10": 0.7},
            "strongest_human_metrics": {"ndcgAt10": 0.8},
            "bootstrap": {"lower95": 0.01, "upper95": 0.2, "meanDifference": 0.1},
            "official_candidate_sets_valid": True,
        }
        arguments.update(overrides)
        return evaluate_gate(**arguments)


class EvaluationCliTest(unittest.TestCase):
    def test_cli_writes_metrics_and_summary(self):
        from evaluate_retrieval import main

        profiles, jobs, labels = sample_dataset()
        candidate_scores = [
            {
                "model": "candidate-v1",
                "profileId": label["profileId"],
                "jobId": label["jobId"],
                "score": float(label["teacherLabel"]),
            }
            for label in labels
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = {
                "profiles": root / "profiles.jsonl",
                "jobs": root / "jobs.jsonl",
                "labels": root / "labels.jsonl",
                "candidate": root / "candidate-scores.jsonl",
            }
            self._write_jsonl(paths["profiles"], profiles)
            self._write_jsonl(paths["jobs"], jobs)
            self._write_jsonl(paths["labels"], labels)
            self._write_jsonl(paths["candidate"], candidate_scores)
            output = root / "results"

            exit_code = main(
                [
                    "--profiles",
                    str(paths["profiles"]),
                    "--jobs",
                    str(paths["jobs"]),
                    "--labels",
                    str(paths["labels"]),
                    "--candidate-scores",
                    str(paths["candidate"]),
                    "--output",
                    str(output),
                ]
            )

            self.assertEqual(exit_code, 0)
            metrics = json.loads((output / "metrics.json").read_text(encoding="utf-8"))
            self.assertIn("selectedStrongestBaseline", metrics)
            self.assertIn("candidate-v1", metrics["candidates"])
            self.assertEqual(
                metrics["candidates"]["candidate-v1"]["gate"]["status"],
                "insufficient_human_labels",
            )
            self.assertIn("candidate-v1", (output / "summary.md").read_text(encoding="utf-8"))
            self.assertIn(
                "Test human-label metrics",
                (output / "summary.md").read_text(encoding="utf-8"),
            )

    def test_cli_returns_two_for_leakage(self):
        from evaluate_retrieval import main

        profiles, jobs, labels = sample_dataset()
        jobs[4]["duplicateGroupId"] = jobs[0]["duplicateGroupId"]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_jsonl(root / "profiles.jsonl", profiles)
            self._write_jsonl(root / "jobs.jsonl", jobs)
            self._write_jsonl(root / "labels.jsonl", labels)
            with contextlib.redirect_stderr(io.StringIO()):
                exit_code = main(
                    [
                        "--profiles",
                        str(root / "profiles.jsonl"),
                        "--jobs",
                        str(root / "jobs.jsonl"),
                        "--labels",
                        str(root / "labels.jsonl"),
                        "--output",
                        str(root / "results"),
                    ]
                )
            self.assertEqual(exit_code, 2)

    @staticmethod
    def _write_jsonl(path, rows):
        path.write_text(
            "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
            encoding="utf-8",
        )


if __name__ == "__main__":
    unittest.main()
