"""519개 스냅샷용 구조 기반 적합도 데이터 빌더 테스트."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from match_snapshot_data import build_snapshot_dataset, score_suitability


def _write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def _read_jsonl(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


class MatchSnapshotDataTest(unittest.TestCase):
    def test_score_uses_role_experience_and_explicit_skill_signals(self) -> None:
        profile = {
            "careerProfile": {"targetRoles": ["백엔드"], "experienceYears": 4},
            "records": [{"title": "API 개발", "properties": {}, "bodyMd": "Python과 Docker로 API를 운영했다."}],
        }
        exact = {
            "job_category": "backend engineer",
            "llm_required_years_of_work_experience": "3",
            "skills": "python;docker;go",
            "llm_hard_skills": "python;docker",
        }
        adjacent = {
            "job_category": "devops engineer",
            "llm_required_years_of_work_experience": "7",
            "skills": "kubernetes",
            "llm_hard_skills": "kubernetes",
        }
        unrelated = {
            "job_category": "designer",
            "llm_required_years_of_work_experience": "7",
            "skills": "figma",
            "llm_hard_skills": "figma",
        }

        self.assertEqual(score_suitability(profile, exact)["suitabilityScore"], 100)
        self.assertEqual(score_suitability(profile, adjacent)["suitabilityScore"], 43)
        self.assertEqual(score_suitability(profile, unrelated)["suitabilityScore"], 13)
        self.assertGreater(
            score_suitability(profile, exact)["suitabilityScore"],
            score_suitability(profile, adjacent)["suitabilityScore"],
        )

    def test_skill_matching_respects_token_boundaries(self) -> None:
        profile = {
            "careerProfile": {"targetRoles": ["백엔드"], "experienceYears": 1},
            "records": [{"title": "Google API", "properties": {}, "bodyMd": "Google Cloud를 사용했다."}],
        }
        job = {
            "job_category": "backend engineer",
            "llm_required_years_of_work_experience": "1",
            "skills": "go",
        }

        self.assertIn("SKILL_NOT_EXPLICIT", score_suitability(profile, job)["reasonCodes"])

    def test_builder_verifies_snapshot_and_preserves_family_split(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            run_root = root / "run"
            jobs_path = root / "jobs.csv"
            output = root / "output"
            snapshot_rows = []
            for index, split in enumerate(("train", "valid", "test"), 1):
                relative = Path("profiles") / split / f"profile-{index}.json"
                path = run_root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                profile = {
                    "syntheticProfileId": f"profile-{index}",
                    "datasetMeta": {
                        "profileSeed": f"seed-{index}",
                        "profileFamily": f"family-{index}",
                        "split": split,
                    },
                    "careerProfile": {"targetRoles": ["백엔드"], "experienceYears": 2},
                    "records": [{"title": "Python API", "properties": {}, "bodyMd": "Python API 개발"}],
                    "provenance": {
                        "recordLineage": [{
                            "narrativeEvidence": [f"atom-{index}"],
                            "sourceFamilies": [f"source-family-{index}"],
                        }]
                    },
                }
                path.write_text(json.dumps(profile, ensure_ascii=False), encoding="utf-8")
                snapshot_rows.append({
                    "profileSeed": f"seed-{index}",
                    "profileFamily": f"family-{index}",
                    "split": split,
                    "path": relative.as_posix(),
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                })
            snapshot = run_root / "snapshot.json"
            snapshot.write_text(
                json.dumps({"schemaVersion": 1, "profileCount": 3, "profiles": snapshot_rows}),
                encoding="utf-8",
            )
            rows = []
            for index in range(900):
                category = "backend engineer" if index < 300 else "devops engineer" if index < 600 else "designer"
                rows.append({
                    "job_id": f"job-{index:03d}",
                    "job_category": category,
                    "skills": "python" if index < 300 else "terraform" if index < 600 else "figma",
                    "expertise_area": category,
                    "years_experience": "1-3 years",
                    "llm_required_years_of_work_experience": "1",
                    "llm_hard_skills": "",
                    "llm_programming_languages": "",
                    "llm_tools_technologies": "",
                })
            _write_csv(jobs_path, rows)

            summary = build_snapshot_dataset(
                snapshot, run_root, jobs_path, output, expected_profiles=3
            )
            profiles = _read_jsonl(output / "profiles.jsonl")
            labels = _read_jsonl(output / "suitability-labels.jsonl")
            candidates = _read_jsonl(output / "candidate-manifest.jsonl")

            self.assertEqual(summary["profiles"], 3)
            self.assertEqual(summary["pairs"], 60)
            self.assertEqual({row["split"] for row in profiles}, {"train", "valid", "test"})
            self.assertTrue(all(
                f"profile-family:family-{index}" in profiles[index - 1]["sourceAtomIds"]
                and f"atom-{index}" in profiles[index - 1]["sourceAtomIds"]
                and f"source-family-{index}" in profiles[index - 1]["sourceAtomIds"]
                for index in range(1, 4)
            ))
            self.assertEqual(len(labels), len(candidates))
            self.assertTrue(all(set(row) == {
                "profileId", "jobId", "split", "suitabilityScore", "labelSource", "reasonCodes"
            } for row in labels))
            self.assertTrue(all(0 <= row["suitabilityScore"] <= 100 for row in labels))

    def test_builder_rejects_a_profile_family_crossing_splits(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot = root / "snapshot.json"
            snapshot.write_text(json.dumps({
                "schemaVersion": 1,
                "profileCount": 2,
                "profiles": [
                    {"profileSeed": "a", "profileFamily": "same", "split": "train", "path": "a", "sha256": "x"},
                    {"profileSeed": "b", "profileFamily": "same", "split": "test", "path": "b", "sha256": "y"},
                ],
            }), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "profileFamily crosses splits"):
                build_snapshot_dataset(snapshot, root, root / "jobs.csv", root / "out", expected_profiles=2)


if __name__ == "__main__":
    unittest.main()
