"""고정 합성 프로필 스냅샷에서 구조 기반 0–100 적합도 학습쌍을 만든다."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from match_pilot_data import (
    CANDIDATE_QUOTAS,
    _candidate_bucket,
    _job_text,
    _read_csv,
    _stable_number,
    _write_jsonl,
    stable_split,
)


LABEL_SOURCE = "structured-weak-label-v1"
SKILL_FIELDS = (
    "skills",
    "llm_hard_skills",
    "llm_programming_languages",
    "llm_tools_technologies",
)
IGNORED_SKILLS = {
    "_rare_skill_",
    "communication",
    "teamwork",
    "problem-solving",
    "analytical thinking",
}


def _profile_text(profile: dict[str, Any]) -> str:
    career = profile.get("careerProfile") or {}
    roles = ", ".join(str(role) for role in career.get("targetRoles", []) if str(role).strip())
    years = career.get("experienceYears")
    parts = [f"targetRoles: {roles}", f"experienceYears: {years}"]
    for record in profile.get("records", []):
        title = str(record.get("title") or "").strip()
        properties = record.get("properties") or {}
        body = str(record.get("bodyMd") or "").strip()
        if title:
            parts.append(f"title: {title}")
        if properties:
            parts.append("properties: " + json.dumps(properties, ensure_ascii=False, sort_keys=True))
        if body:
            parts.append(f"bodyMd: {body}")
    return "\n".join(parts)


def profile_source_atoms(
    profile: dict[str, Any], *, profile_family: str | None = None
) -> list[str]:
    """개별 인터뷰·원천 family lineage만 모으고 공유 통계 calibration은 제외한다."""
    values: set[str] = set()
    if profile_family:
        values.add(f"profile-family:{profile_family}")
    metadata = profile.get("datasetMeta") or {}
    values.update(
        str(value)
        for value in metadata.get("sourceAtomIds", [])
        if str(value).strip()
    )
    for lineage in (profile.get("provenance") or {}).get("recordLineage", []):
        for field in ("sourceAtomIds", "narrativeEvidence", "sourceFamilies"):
            values.update(
                str(value)
                for value in lineage.get(field, [])
                if str(value).strip()
            )
    return sorted(values)


def _required_years(job: dict[str, str]) -> float | None:
    for field in ("llm_required_years_of_work_experience", "years_experience"):
        value = str(job.get(field) or "").strip()
        match = re.search(r"\d+(?:\.\d+)?", value)
        if match:
            return float(match.group())
    return None


def _job_skills(job: dict[str, str]) -> list[str]:
    values: set[str] = set()
    for field in SKILL_FIELDS:
        for value in re.split(r"[;,|]", str(job.get(field) or "")):
            normalized = " ".join(value.casefold().split())
            if len(normalized) >= 2 and normalized not in IGNORED_SKILLS:
                values.add(normalized)
    return sorted(values)


def score_suitability(profile: dict[str, Any], job: dict[str, str]) -> dict[str, Any]:
    """임베딩과 무관한 직무·경력·명시 기술 신호만으로 단일 적합도를 만든다."""
    bucket = _candidate_bucket(profile, job)
    role_points = {"role": 64, "adjacent": 38, "random": 8}[bucket]
    reasons = [{
        "role": "ROLE_MATCH",
        "adjacent": "ROLE_ADJACENT",
        "random": "ROLE_MISMATCH",
    }[bucket]]

    career = profile.get("careerProfile") or {}
    experience = career.get("experienceYears")
    experience = float(experience) if isinstance(experience, (int, float)) and not isinstance(experience, bool) else 0.0
    required = _required_years(job)
    if required is None:
        experience_points = 10
        reasons.append("EXPERIENCE_UNSPECIFIED")
    else:
        gap = required - experience
        if gap <= 0:
            experience_points = 18
            reasons.append("EXPERIENCE_MEETS")
        elif gap <= 1:
            experience_points = 12
            reasons.append("EXPERIENCE_NEAR")
        elif gap <= 3:
            experience_points = 5
            reasons.append("EXPERIENCE_GAP")
        else:
            experience_points = 0
            reasons.append("EXPERIENCE_LARGE_GAP")

    profile_text = _profile_text(profile).casefold()
    skills = _job_skills(job)
    matched = [
        skill
        for skill in skills
        if re.search(
            rf"(?<![0-9A-Za-z]){re.escape(skill)}(?![0-9A-Za-z])",
            profile_text,
        )
    ]
    skill_points = min(18, len(matched) * 9)
    reasons.append("SKILL_EVIDENCE" if matched else "SKILL_NOT_EXPLICIT")
    score = int(max(0, min(100, role_points + experience_points + skill_points)))
    return {
        "suitabilityScore": score,
        "reasonCodes": reasons,
        "bucket": bucket,
    }


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_snapshot(
    snapshot_path: Path,
    run_root: Path,
    *,
    expected_profiles: int | None,
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    entries = snapshot.get("profiles")
    if snapshot.get("schemaVersion") != 1 or not isinstance(entries, list):
        raise ValueError("unexpected profile snapshot schema")
    if snapshot.get("profileCount") != len(entries):
        raise ValueError("profile snapshot count differs")
    if expected_profiles is not None and len(entries) != expected_profiles:
        raise ValueError(
            f"profile snapshot requires exactly {expected_profiles} profiles, got {len(entries)}"
        )
    profile_seeds = [entry.get("profileSeed") for entry in entries]
    paths = [entry.get("path") for entry in entries]
    if len(set(profile_seeds)) != len(profile_seeds):
        raise ValueError("profile snapshot has duplicate profileSeed")
    if len(set(paths)) != len(paths):
        raise ValueError("profile snapshot has duplicate path")
    family_splits: dict[str, str] = {}
    for entry in entries:
        family = str(entry.get("profileFamily") or "")
        split = str(entry.get("split") or "")
        if split not in {"train", "valid", "test"}:
            raise ValueError(f"invalid profile split: {split!r}")
        previous = family_splits.setdefault(family, split)
        if previous != split:
            raise ValueError(f"profileFamily crosses splits: {family}")
    loaded = []
    seen_ids: set[str] = set()
    for entry in entries:
        path = run_root / entry["path"]
        if not path.is_file() or _sha256(path) != entry["sha256"]:
            raise ValueError(f"profile snapshot hash differs: {entry['path']}")
        profile = json.loads(path.read_text(encoding="utf-8"))
        metadata = profile.get("datasetMeta") or {}
        if (
            metadata.get("profileSeed") != entry["profileSeed"]
            or metadata.get("profileFamily") != entry["profileFamily"]
            or metadata.get("split") != entry["split"]
        ):
            raise ValueError(f"profile snapshot metadata differs: {entry['path']}")
        profile_id = str(profile.get("syntheticProfileId") or "")
        if not profile_id or profile_id in seen_ids:
            raise ValueError(f"invalid or duplicate syntheticProfileId: {entry['path']}")
        seen_ids.add(profile_id)
        loaded.append((entry, profile))
    return loaded


def build_snapshot_dataset(
    snapshot_path: Path,
    run_root: Path,
    jobs_path: Path,
    output_dir: Path,
    *,
    expected_profiles: int | None = None,
) -> dict[str, Any]:
    loaded = _load_snapshot(
        Path(snapshot_path), Path(run_root), expected_profiles=expected_profiles
    )
    jobs = {row["job_id"]: row for row in _read_csv(jobs_path) if row.get("job_id")}
    jobs_by_split = {
        split: [job_id for job_id in sorted(jobs) if stable_split(job_id) == split]
        for split in ("train", "valid", "test")
    }
    profile_rows: list[dict[str, Any]] = []
    label_rows: list[dict[str, Any]] = []
    candidate_rows: list[dict[str, str]] = []
    selected_jobs: set[str] = set()
    bucket_counts: Counter[str] = Counter()
    score_counts: Counter[int] = Counter()
    for entry, profile in sorted(loaded, key=lambda item: item[0]["profileSeed"]):
        profile_id = profile["syntheticProfileId"]
        split = entry["split"]
        family = entry["profileFamily"]
        profile_rows.append({
            "profileId": profile_id,
            "text": _profile_text(profile),
            "split": split,
            "sourceAtomIds": profile_source_atoms(profile, profile_family=family),
        })
        classified: dict[str, list[str]] = defaultdict(list)
        for job_id in jobs_by_split[split]:
            classified[_candidate_bucket(profile, jobs[job_id])].append(job_id)
        chosen: list[str] = []
        for bucket, quota in CANDIDATE_QUOTAS:
            options = sorted(
                classified[bucket],
                key=lambda job_id: (
                    _stable_number("snapshot-candidate-v1", profile_id, bucket, job_id),
                    job_id,
                ),
            )
            if len(options) < quota:
                raise ValueError(
                    f"insufficient {bucket} jobs for {profile_id}: need {quota}, got {len(options)}"
                )
            chosen.extend(options[:quota])
        if len(set(chosen)) != sum(quota for _, quota in CANDIDATE_QUOTAS):
            raise ValueError(f"duplicate candidate jobs for {profile_id}")
        for job_id in chosen:
            result = score_suitability(profile, jobs[job_id])
            selected_jobs.add(job_id)
            bucket_counts[result["bucket"]] += 1
            score_counts[result["suitabilityScore"]] += 1
            candidate_rows.append({"profileId": profile_id, "jobId": job_id, "split": split})
            label_rows.append({
                "profileId": profile_id,
                "jobId": job_id,
                "split": split,
                "suitabilityScore": result["suitabilityScore"],
                "labelSource": LABEL_SOURCE,
                "reasonCodes": result["reasonCodes"],
            })
    job_rows = [
        {
            "jobId": job_id,
            "text": _job_text(jobs[job_id]),
            "split": stable_split(job_id),
            "duplicateGroupId": job_id,
        }
        for job_id in sorted(selected_jobs)
    ]
    output_dir = Path(output_dir)
    _write_jsonl(output_dir / "profiles.jsonl", profile_rows)
    _write_jsonl(output_dir / "jobs.jsonl", job_rows)
    _write_jsonl(output_dir / "candidate-manifest.jsonl", candidate_rows)
    _write_jsonl(output_dir / "suitability-labels.jsonl", label_rows)
    output_files = (
        "profiles.jsonl",
        "jobs.jsonl",
        "candidate-manifest.jsonl",
        "suitability-labels.jsonl",
    )
    source_atoms = {atom for row in profile_rows for atom in row["sourceAtomIds"]}
    summary = {
        "schemaVersion": "match-snapshot-data-v2",
        "profiles": len(profile_rows),
        "jobs": len(job_rows),
        "pairs": len(label_rows),
        "splitCounts": {
            split: {
                "profiles": sum(row["split"] == split for row in profile_rows),
                "pairs": sum(row["split"] == split for row in label_rows),
            }
            for split in ("train", "valid", "test")
        },
        "bucketCounts": dict(sorted(bucket_counts.items())),
        "score": {
            "minimum": min(score_counts),
            "maximum": max(score_counts),
            "mean": sum(score * count for score, count in score_counts.items()) / len(label_rows),
        },
        "labelSource": LABEL_SOURCE,
        "lineageContract": "individual-source-atoms-v1",
        "sourceAtomCount": len(source_atoms),
        "nonFamilySourceAtomCount": sum(
            not atom.startswith("profile-family:") for atom in source_atoms
        ),
        "outputSha256": {
            name: _sha256(output_dir / name) for name in output_files
        },
        "snapshotSha256": _sha256(snapshot_path),
        "jobsSha256": _sha256(jobs_path),
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "data-manifest.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--run-root", type=Path, required=True)
    parser.add_argument("--jobs", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-profiles", type=int, default=519)
    arguments = parser.parse_args()
    print(json.dumps(build_snapshot_dataset(
        arguments.snapshot,
        arguments.run_root,
        arguments.jobs,
        arguments.output,
        expected_profiles=arguments.expected_profiles,
    ), ensure_ascii=False))


if __name__ == "__main__":
    main()
