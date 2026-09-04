"""LLM 적합도 라벨링 후보 데이터셋 빌더 테스트."""

from __future__ import annotations

import csv
import json
from pathlib import Path
import tempfile
import unittest

from llm_suitability_dataset import build_label_dataset, profile_evidence_text


def _write_jobs(path: Path) -> None:
    rows: list[dict[str, str]] = []
    for index in range(300):
        kind = index % 3
        category = (
            "backend software engineer"
            if kind == 0
            else "devops cloud engineer"
            if kind == 1
            else "graphic designer"
        )
        rows.append(
            {
                "job_id": f"job-{index:04d}",
                "job_category": category,
                "expertise_area": "development" if kind < 2 else "design",
                "skills": "python;api" if kind == 0 else "aws;terraform" if kind == 1 else "figma",
                "llm_required_years_of_work_experience": "2",
            }
        )
    with path.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def _profile(profile_id: str, family: str, split: str) -> dict[str, object]:
    return {
        "syntheticProfileId": profile_id,
        "datasetMeta": {
            "profileFamily": family,
            "split": split,
            "generatorModel": "must-not-leak",
        },
        "careerProfile": {
            "targetRoles": ["백엔드"],
            "experienceYears": 3,
        },
        "records": [
            {
                "id": f"record-{profile_id}",
                "title": "API 운영",
                "properties": {"role": "개발자"},
                "bodyMd": "Python API를 운영하고 장애 원인을 정리했다.",
            }
        ],
        "provenance": {"secret": "must-not-leak"},
    }


def _write_profile(root: Path, profile: dict[str, object]) -> None:
    split = str(profile["datasetMeta"]["split"])  # type: ignore[index]
    path = root / "profiles" / split / f"{profile['syntheticProfileId']}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(profile, ensure_ascii=False), encoding="utf-8")


class LlmSuitabilityDatasetTest(unittest.TestCase):
    def test_profile_evidence_excludes_generation_and_preference_metadata(self) -> None:
        text = profile_evidence_text(_profile("p1", "f1", "train"))

        self.assertIn("record-p1", text)
        self.assertIn("Python API", text)
        self.assertIn("experienceYears: 3", text)
        self.assertNotIn("백엔드", text)
        self.assertNotIn("must-not-leak", text)
        self.assertNotIn("provenance", text)

    def test_builder_creates_stable_bucketed_pairs_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            run_root = root / "run"
            jobs_path = root / "jobs.csv"
            output = root / "output"
            for index, split in enumerate(("train", "valid", "test"), 1):
                _write_profile(run_root, _profile(f"p{index}", f"f{index}", split))
            _write_jobs(jobs_path)

            summary = build_label_dataset(
                run_root,
                jobs_path,
                output,
                quotas=(("role", 1), ("adjacent", 1), ("random", 1)),
                expected_profiles=3,
            )

            self.assertEqual(summary["profiles"], 3)
            self.assertEqual(summary["candidatePairs"], 9)
            pairs = [json.loads(line) for line in (output / "candidate-manifest.jsonl").read_text(encoding="utf-8").splitlines()]
            self.assertEqual({row["candidateBucket"] for row in pairs}, {"role", "adjacent", "random"})
            self.assertTrue(all(row["split"] in {"train", "valid", "test"} for row in pairs))
            manifest = json.loads((output / "data-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["quotas"], {"adjacent": 1, "random": 1, "role": 1})
            self.assertEqual(len(manifest["sourceProfileSha256"]), 3)

    def test_builder_rejects_family_crossing_splits_and_wrong_count(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            run_root = root / "run"
            jobs_path = root / "jobs.csv"
            _write_profile(run_root, _profile("p1", "same", "train"))
            _write_profile(run_root, _profile("p2", "same", "test"))
            _write_jobs(jobs_path)

            with self.assertRaisesRegex(ValueError, "profile family crosses splits"):
                build_label_dataset(run_root, jobs_path, root / "out", expected_profiles=2)
            with self.assertRaisesRegex(ValueError, "expected 3 profiles"):
                build_label_dataset(run_root, jobs_path, root / "out", expected_profiles=3)


if __name__ == "__main__":
    unittest.main()
