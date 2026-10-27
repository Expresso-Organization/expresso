import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from run_match_pilot import (
    collect_teacher_labels,
    prepare_teacher_batches,
    teacher_label_coverage,
    train_and_evaluate,
    validate_pilot_artifacts,
)


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


class RunMatchPilotTest(unittest.TestCase):
    def test_prepares_one_prompt_per_profile_and_collects_harness_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profiles_dir = root / "profile-json"
            profiles_dir.mkdir()
            profile_ids = ["profile-a", "profile-b"]
            for profile_id in profile_ids:
                (profiles_dir / f"{profile_id}.json").write_text(
                    json.dumps(
                        {
                            "syntheticProfileId": profile_id,
                            "records": [
                                {
                                    "title": "Data project",
                                    "properties": {"role": "analyst"},
                                    "bodyMd": "Used SQL.",
                                }
                            ],
                        }
                    ),
                    encoding="utf-8",
                )
            profiles = [
                {"profileId": "profile-a", "text": "a", "split": "valid", "sourceAtomIds": []},
                {"profileId": "profile-b", "text": "b", "split": "test", "sourceAtomIds": []},
            ]
            jobs = []
            candidates = []
            for profile_id, split, offset in (("profile-a", "valid", 0), ("profile-b", "test", 20)):
                for index in range(20):
                    job_id = f"job-{offset + index:03d}"
                    jobs.append(
                        {"jobId": job_id, "text": f"job text {job_id}", "split": split, "duplicateGroupId": job_id}
                    )
                    candidates.append({"profileId": profile_id, "jobId": job_id, "split": split})
            _write_jsonl(root / "profiles.jsonl", profiles)
            _write_jsonl(root / "jobs.jsonl", jobs)
            _write_jsonl(root / "candidate-manifest.jsonl", candidates)

            manifest = prepare_teacher_batches(
                profiles_dir=profiles_dir,
                profiles_path=root / "profiles.jsonl",
                jobs_path=root / "jobs.jsonl",
                candidates_path=root / "candidate-manifest.jsonl",
                output_dir=root / "teacher",
            )

            self.assertEqual(manifest["batchCount"], 2)
            self.assertEqual(len(list((root / "teacher" / "prompts").glob("*.md"))), 2)
            response_dir = root / "teacher" / "responses"
            response_dir.mkdir()
            for batch in manifest["batches"]:
                response = {
                    "labels": [
                        {"jobId": job_id, "teacherLabel": index % 4, "reasonCodes": ["SKILL_MATCH"]}
                        for index, job_id in enumerate(batch["jobIds"])
                    ]
                }
                (response_dir / batch["responseFile"]).write_text(json.dumps(response), encoding="utf-8")

            summary = collect_teacher_labels(
                batch_manifest_path=root / "teacher" / "batch-manifest.json",
                responses_dir=response_dir,
                output_path=root / "labels.jsonl",
            )

            self.assertEqual(summary["labels"], 40)
            self.assertEqual(summary["profiles"], 2)
            self.assertTrue(summary["evalMetricsReady"])
            rows = [json.loads(line) for line in (root / "labels.jsonl").read_text().splitlines()]
            self.assertEqual({row["split"] for row in rows}, {"valid", "test"})
            self.assertTrue(all(row["humanLabel"] is None for row in rows))
            scores = [
                {"model": model, "profileId": row["profileId"], "jobId": row["jobId"], "score": float(index)}
                for model in ("frozen-e5-cosine-v1", "match-pilot-mlp-v1")
                for index, row in enumerate(rows)
            ]
            validation = validate_pilot_artifacts(
                profiles=profiles,
                jobs=jobs,
                labels=rows,
                candidate_manifest=candidates,
                candidate_scores=scores,
                expected_profiles=2,
                expected_pairs=40,
            )
            self.assertEqual(validation["scoreRowsByModel"], {"frozen-e5-cosine-v1": 40, "match-pilot-mlp-v1": 40})
            scores_path = root / "candidate-scores.jsonl"
            _write_jsonl(scores_path, scores)
            checkpoint = root / "ranker.pt"
            checkpoint.write_bytes(b"fixture")
            with (
                patch("match_pilot_model.run", return_value={"checkpoint": checkpoint, "candidateScores": scores_path}),
                patch("evaluate_retrieval.run_evaluation", return_value={"fixture": True}) as evaluate,
                patch("evaluate_retrieval.write_results") as write_results,
            ):
                result = train_and_evaluate(
                    jth_pairs_path=root / "jth.jsonl",
                    profiles_path=root / "profiles.jsonl",
                    jobs_path=root / "jobs.jsonl",
                    labels_path=root / "labels.jsonl",
                    candidate_manifest_path=root / "candidate-manifest.jsonl",
                    output_dir=root / "run",
                    require_cuda=True,
                    expected_profiles=2,
                    expected_pairs=40,
                )
            self.assertEqual(result["validation"]["pairs"], 40)
            self.assertEqual(result["status"], "ready")
            evaluate.assert_called_once()
            write_results.assert_called_once()

    def test_teacher_coverage_flags_eval_profiles_without_class_three(self):
        rows = [
            {
                "profileId": profile_id,
                "jobId": f"{profile_id}-job-{index}",
                "split": split,
                "teacherLabel": index % 3,
            }
            for profile_id, split in (("p-valid", "valid"), ("p-test", "test"))
            for index in range(20)
        ]

        coverage = teacher_label_coverage(rows)

        self.assertFalse(coverage["evalMetricsReady"])
        self.assertEqual(coverage["profilesWithoutClass3"], {"valid": ["p-valid"], "test": ["p-test"]})

        all_three = [{**row, "teacherLabel": 3} for row in rows]
        all_three_coverage = teacher_label_coverage(all_three)
        self.assertFalse(all_three_coverage["evalMetricsReady"])
        self.assertEqual(
            all_three_coverage["profilesWithoutNonClass3"],
            {"valid": ["p-valid"], "test": ["p-test"]},
        )


if __name__ == "__main__":
    unittest.main()
