"""적합도 실험 시험이 함께 쓰는 작은 데이터. torch 없이 읽힌다."""

from __future__ import annotations

import json
from pathlib import Path


SKILLS = ("python", "react", "kafka")
SPLITS = {"train": 4, "valid": 2, "test": 2}
SCORES = (85, 45, 10)


def write_dataset(root: Path) -> tuple[Path, Path, list[tuple[str, str]]]:
    data = root / "data"
    labels_dir = root / "labels"
    data.mkdir()
    labels_dir.mkdir()
    profiles, jobs, candidates, labels = [], [], [], []
    pairs: list[tuple[str, str]] = []
    for split, count in SPLITS.items():
        split_jobs = []
        for job_index, skill in enumerate(SKILLS):
            job_id = f"j-{split}-{job_index}"
            split_jobs.append(job_id)
            jobs.append({"jobId": job_id, "split": split, "fields": {"job_category": f"{skill} developer", "skills": f"{skill};git", "llm_required_years_of_work_experience": "2"}})
        for profile_index in range(count):
            profile_id = f"p-{split}-{profile_index}"
            records = [
                {"recordId": f"{profile_id}-r{record_index}", "title": f"{skill} 프로젝트", "properties": {}, "bodyMd": f"{skill}로 서비스를 만들었다 {profile_index}"}
                for record_index, skill in enumerate(SKILLS)
            ]
            profiles.append({"profileId": profile_id, "split": split, "experienceYears": 1 + profile_index, "records": records})
            for job_index, job_id in enumerate(split_jobs):
                score = SCORES[(job_index + profile_index) % len(SCORES)]
                candidates.append({"profileId": profile_id, "jobId": job_id, "split": split, "candidateBucket": "role"})
                linked = records[job_index]["recordId"]
                labels.append(
                    {
                        "profileId": profile_id,
                        "jobId": job_id,
                        "split": split,
                        "candidateBucket": "role",
                        "matchScore": score,
                        "rubricVersion": "job-profile-fit-v1",
                        "labelSource": "fake-teacher",
                        "requirementAssessments": [
                            {"requirement": "기술", "kind": "must", "coverage": "strong" if score >= 60 else "partial", "evidenceRecordIds": [linked]},
                            {"requirement": "연차", "kind": "must", "coverage": "not_evidenced", "evidenceRecordIds": []},
                        ],
                    }
                )
                pairs.append((profile_id, job_id))
    for name, rows in (("profiles.jsonl", profiles), ("jobs.jsonl", jobs), ("candidate-manifest.jsonl", candidates)):
        (data / name).write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
    (labels_dir / "suitability-labels.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in labels), encoding="utf-8")
    return data, labels_dir, pairs
