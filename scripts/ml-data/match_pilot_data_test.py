"""JTH/Expresso 파일럿 데이터셋 빌더의 누수 방지 계약 테스트."""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path
import sys
import tempfile
import unittest


sys.path.insert(0, str(Path(__file__).parent))

from match_pilot_data import (  # noqa: E402
    build_expresso_candidates,
    build_jth_pretrain,
    map_jth_stage,
)


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _read_jsonl(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


class MatchPilotDataTest(unittest.TestCase):
    def test_maps_jth_stages_to_the_frozen_four_level_scale(self) -> None:
        # 이 매핑이 바뀌면 pretrain supervision의 의미가 달라진다.
        self.assertEqual(map_jth_stage("Application Made"), 1)
        self.assertEqual(map_jth_stage("Resume Sent"), 1)
        self.assertEqual(map_jth_stage("Qualification"), 2)
        self.assertEqual(map_jth_stage("Shortlist"), 2)
        self.assertEqual(map_jth_stage("4th Interview"), 3)
        self.assertEqual(map_jth_stage("Offer Accepted"), 3)

    def test_jth_builder_uses_frozen_shape_and_same_split_negatives(self) -> None:
        # 중복 stage 병합 또는 split 필터가 빠지면 행동 사전학습의 평가 누수가 생긴다.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            candidates = root / "candidates.csv"
            jobs = root / "jobs.csv"
            history = root / "history.csv"
            output = root / "pretrain.jsonl"
            _write_csv(
                candidates,
                [
                    "candidate_id",
                    "skills",
                    "job_category",
                    "llm_sex",
                    "llm_age_bucket",
                    "zipcode",
                    "llm_graduation_recency",
                    "unexpected_future_demographic",
                ],
                [
                    {"candidate_id": "c-0", "skills": "python", "job_category": "backend", "llm_sex": "Male", "llm_age_bucket": "20-29", "zipcode": "75001", "llm_graduation_recency": "0-2", "unexpected_future_demographic": "secret-proxy"},
                    {"candidate_id": "c-2", "skills": "sql", "job_category": "data", "llm_sex": "Female", "llm_age_bucket": "30-39", "zipcode": "13001", "llm_graduation_recency": "5-10", "unexpected_future_demographic": "secret-proxy"},
                    {"candidate_id": "c-9", "skills": "react", "job_category": "frontend", "llm_sex": "Other", "llm_age_bucket": "40-49", "zipcode": "59000", "llm_graduation_recency": "10+", "unexpected_future_demographic": "secret-proxy"},
                ],
            )
            _write_csv(
                jobs,
                ["job_id", "job_category", "skills"],
                [
                    {"job_id": "j-0", "job_category": "backend", "skills": "python"},
                    {"job_id": "j-1", "job_category": "backend", "skills": "go"},
                    {"job_id": "j-5", "job_category": "data", "skills": "sql"},
                    {"job_id": "j-39", "job_category": "data", "skills": "dbt"},
                    {"job_id": "j-19", "job_category": "frontend", "skills": "react"},
                    {"job_id": "j-21", "job_category": "frontend", "skills": "typescript"},
                ],
            )
            _write_csv(
                history,
                ["candidate_id", "job_id", "last_stage_reached"],
                [
                    {"candidate_id": "c-0", "job_id": "j-0", "last_stage_reached": "Resume Sent"},
                    {"candidate_id": "c-0", "job_id": "j-0", "last_stage_reached": "1st Interview"},
                    {"candidate_id": "c-2", "job_id": "j-5", "last_stage_reached": "Qualification"},
                    {"candidate_id": "c-9", "job_id": "j-19", "last_stage_reached": "Application Made"},
                    {"candidate_id": "c-0", "job_id": "j-5", "last_stage_reached": "Offer Accepted"},
                ],
            )

            first = build_jth_pretrain(candidates, jobs, history, output)
            second_output = root / "pretrain-second.jsonl"
            second = build_jth_pretrain(candidates, jobs, history, second_output)

            self.assertEqual(first, second)
            self.assertEqual(_read_jsonl(output), _read_jsonl(second_output))
            records = _read_jsonl(output)
            self.assertTrue(all(
                set(record) == {"profileId", "profileText", "jobId", "jobText", "label", "split"}
                for record in records
            ))
            positives = [record for record in records if record["label"] > 0]
            negatives = [record for record in records if record["label"] == 0]
            self.assertEqual(len(positives), 3)
            self.assertEqual(len(negatives), 3)
            self.assertEqual(
                {(record["profileId"], record["jobId"]): record["label"] for record in positives},
                {
                    ("jth-candidate-c-0", "jth-job-j-0"): 3,
                    ("jth-candidate-c-2", "jth-job-j-5"): 2,
                    ("jth-candidate-c-9", "jth-job-j-19"): 1,
                },
            )
            observed_pairs = {(record["profileId"], record["jobId"]) for record in positives}
            self.assertTrue(all((record["profileId"], record["jobId"]) not in observed_pairs for record in negatives))
            self.assertTrue(all(record["split"] in {"train", "valid", "test"} for record in records))
            self.assertTrue(all("Male" not in record["profileText"] and "20-29" not in record["profileText"] for record in records))
            self.assertTrue(all("zipcode:" not in record["profileText"] for record in records))
            self.assertTrue(all("graduation_recency" not in record["profileText"] for record in records))
            self.assertTrue(all("secret-proxy" not in record["profileText"] for record in records))

    def test_expresso_builder_assigns_30_profiles_to_20_leak_free_candidates_each(self) -> None:
        # profile/job split 또는 후보 수가 달라지면 teacher와 평가 후보군이 불안정해진다.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            profiles_dir = root / "profiles"
            profiles_dir.mkdir()
            jobs = root / "jobs.csv"
            output_dir = root / "candidates"
            for index in range(30):
                profile = {
                    "syntheticProfileId": f"profile-{index:02d}",
                    "careerProfile": {"targetRoles": ["백엔드"]},
                    "records": [
                        {
                            "title": f"프로필 {index}",
                            "properties": {"role": "backend"},
                            "bodyMd": f"Python 서비스 운영 경험 {index}",
                        }
                    ],
                    "provenance": {"recordLineage": [{"sourceAtomIds": ["secret-source"]}]},
                }
                (profiles_dir / f"profile-{index:02d}.json").write_text(
                    json.dumps(profile, ensure_ascii=False), encoding="utf-8"
                )
            _write_csv(
                jobs,
                ["job_id", "job_category", "skills"],
                [
                    {
                        "job_id": f"job-{index:03d}",
                        "job_category": (
                            "backend engineer" if index < 100 else "devops engineer" if index < 200
                            else "data analyst" if index < 300 else "designer"
                        ),
                        "skills": "python",
                    }
                    for index in range(400)
                ],
            )

            manifest = build_expresso_candidates(profiles_dir, jobs, output_dir)
            replay_dir = root / "candidates-replay"
            self.assertEqual(manifest, build_expresso_candidates(profiles_dir, jobs, replay_dir))
            profiles = _read_jsonl(output_dir / "profiles.jsonl")
            candidate_jobs = _read_jsonl(output_dir / "jobs.jsonl")
            candidates = _read_jsonl(output_dir / "candidate-manifest.jsonl")

            self.assertEqual(Counter(profile["split"] for profile in profiles), {"train": 20, "valid": 5, "test": 5})
            self.assertEqual(len(candidates), 600)
            self.assertEqual(set(Counter(candidate["profileId"] for candidate in candidates).values()), {20})
            profiles_by_id = {profile["profileId"]: profile for profile in profiles}
            jobs_by_id = {job["jobId"]: job for job in candidate_jobs}
            self.assertTrue(all(candidate["split"] == profiles_by_id[candidate["profileId"]]["split"] for candidate in candidates))
            self.assertTrue(all(candidate["split"] == jobs_by_id[candidate["jobId"]]["split"] for candidate in candidates))
            def category_for(job_id: str) -> str:
                index = int(job_id.rsplit("-", 1)[1])
                return (
                    "backend engineer" if index < 100 else "devops engineer" if index < 200
                    else "data analyst" if index < 300 else "designer"
                )

            categories_by_profile = {
                profile_id: Counter(category_for(item["jobId"]) for item in candidates if item["profileId"] == profile_id)
                for profile_id in profiles_by_id
            }
            self.assertTrue(all(
                counts["backend engineer"] == 8
                and counts["designer"] == 6
                and counts["devops engineer"] + counts["data analyst"] == 6
                for counts in categories_by_profile.values()
            ))
            self.assertIn("프로필 0", profiles_by_id["profile-00"]["text"])
            self.assertNotIn("secret-source", profiles_by_id["profile-00"]["text"])


if __name__ == "__main__":
    unittest.main()
