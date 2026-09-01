"""채용 추천 파일럿의 JTH 행동쌍과 Expresso 후보군을 만든다."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


SPLITS = ("train", "valid", "test")
PROTECTED_CANDIDATE_COLUMNS = {"llm_sex", "llm_nationality", "llm_age_bucket"}
STAGE_LABELS = {
    "application made": 1,
    "resume sent": 1,
    "shortlist": 2,
    "qualification": 2,
    "1st interview": 3,
    "2nd interview": 3,
    "3rd interview": 3,
    "4th interview": 3,
    "offer received": 3,
    "offer accepted": 3,
}
ROLE_ALIASES = {
    "백엔드": ("backend", "back-end", "software engineer", "platform engineer"),
    "프론트엔드": ("frontend", "front-end", "front end", "web developer"),
    "데이터": ("data analyst", "data engineer", "data scientist", "analytics", "database"),
    "ML · AI": ("machine learning", "artificial intelligence", "data scientist", " ml ", " ai "),
    "모바일": ("mobile", "android", "ios"),
    "DevOps": ("devops", "sre", "cloud", "infrastructure"),
    "기획 · PM": ("product manager", "project manager", "product owner", "business analyst"),
    "디자인": ("designer", "design", "ux", "ui"),
}
ADJACENT_ROLES = {
    "백엔드": ("DevOps", "데이터"),
    "프론트엔드": ("디자인", "백엔드", "데이터"),
    "데이터": ("ML · AI", "백엔드", "기획 · PM"),
    "ML · AI": ("데이터", "백엔드"),
    "모바일": ("프론트엔드", "백엔드"),
    "DevOps": ("백엔드", "데이터"),
    "기획 · PM": ("데이터", "디자인"),
    "디자인": ("프론트엔드", "기획 · PM"),
}
CANDIDATE_QUOTAS = (("role", 8), ("adjacent", 6), ("random", 6))


def _stable_number(*parts: str) -> int:
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


def stable_split(identifier: str) -> str:
    """ID에서 seed 없이 재현 가능한 80/10/10 split을 계산한다."""
    bucket = _stable_number(identifier) % 10
    if bucket < 8:
        return "train"
    if bucket == 8:
        return "valid"
    return "test"


def map_jth_stage(stage: str) -> int:
    """JTH 최종 단계를 고정된 0–3 supervision 단계로 바꾼다."""
    normalized = " ".join(str(stage or "").split()).casefold()
    if normalized not in STAGE_LABELS:
        raise ValueError(f"unknown JTH stage: {stage!r}")
    return STAGE_LABELS[normalized]


def _read_csv(path: Path) -> list[dict[str, str]]:
    with Path(path).open(encoding="utf-8", newline="") as source:
        return list(csv.DictReader(source))


def _write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with Path(path).open("w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            target.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
            target.write("\n")


def _row_text(row: dict[str, str], excluded: set[str]) -> str:
    parts = []
    for key in sorted(row):
        if key in excluded:
            continue
        value = str(row[key] or "").strip()
        if value:
            parts.append(f"{key}: {value}")
    return "\n".join(parts)


def build_jth_pretrain(
    candidates_path: Path,
    jobs_path: Path,
    history_path: Path,
    output_path: Path,
) -> dict[str, int]:
    """같은 split JTH 상호작용과 비상호작용 음성을 JSONL로 기록한다."""
    candidates = {row["candidate_id"]: row for row in _read_csv(candidates_path) if row.get("candidate_id")}
    jobs = {row["job_id"]: row for row in _read_csv(jobs_path) if row.get("job_id")}
    observed_pairs: set[tuple[str, str]] = set()
    observed_split_jobs: dict[str, set[str]] = defaultdict(set)
    maximum_stages: dict[tuple[str, str], int] = {}
    for row in _read_csv(history_path):
        candidate_id = row.get("candidate_id", "")
        job_id = row.get("job_id", "")
        if candidate_id not in candidates or job_id not in jobs:
            continue
        observed_pairs.add((candidate_id, job_id))
        if stable_split(candidate_id) != stable_split(job_id):
            continue
        observed_split_jobs[candidate_id].add(job_id)
        pair = (candidate_id, job_id)
        maximum_stages[pair] = max(maximum_stages.get(pair, 0), map_jth_stage(row.get("last_stage_reached", "")))

    positives_by_candidate: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for (candidate_id, job_id), stage in sorted(maximum_stages.items()):
        positives_by_candidate[candidate_id].append((job_id, stage))
    rows: list[dict[str, Any]] = []
    job_ids_by_split = {
        split: sorted(job_id for job_id in jobs if stable_split(job_id) == split)
        for split in SPLITS
    }
    for candidate_id in sorted(positives_by_candidate):
        split = stable_split(candidate_id)
        candidate_text = _row_text(candidates[candidate_id], {"candidate_id", *PROTECTED_CANDIDATE_COLUMNS})
        if not candidate_text:
            raise ValueError(f"JTH candidate has no usable text: {candidate_id}")
        positives = sorted(positives_by_candidate[candidate_id])
        for job_id, stage in positives:
            job_text = _row_text(jobs[job_id], {"job_id"})
            if not job_text:
                raise ValueError(f"JTH job has no usable text: {job_id}")
            rows.append({
                "profileId": f"jth-candidate-{candidate_id}",
                "profileText": candidate_text,
                "jobId": f"jth-job-{job_id}",
                "jobText": job_text,
                "split": split,
                "label": stage,
            })
        split_jobs = job_ids_by_split[split]
        available_negative_count = len(split_jobs) - len(observed_split_jobs[candidate_id])
        if available_negative_count < len(positives):
            raise ValueError(f"insufficient same-split JTH negatives for candidate: {candidate_id}")
        negative_jobs: list[str] = []
        offset = _stable_number("jth-negative-v1", candidate_id) % len(split_jobs)
        for index in range(len(split_jobs)):
            job_id = split_jobs[(offset + index) % len(split_jobs)]
            if (candidate_id, job_id) not in observed_pairs:
                negative_jobs.append(job_id)
                if len(negative_jobs) == len(positives):
                    break
        for job_id in negative_jobs:
            rows.append({
                "profileId": f"jth-candidate-{candidate_id}",
                "profileText": candidate_text,
                "jobId": f"jth-job-{job_id}",
                "jobText": _row_text(jobs[job_id], {"job_id"}),
                "split": split,
                "label": 0,
            })
    rows.sort(key=lambda row: (row["split"], row["profileId"], row["label"] == 0, row["jobId"]))
    _write_jsonl(output_path, rows)
    return {
        "negativePairs": sum(row["label"] == 0 for row in rows),
        "positivePairs": sum(row["label"] > 0 for row in rows),
        "totalPairs": len(rows),
    }


def _profile_text(profile: dict[str, Any]) -> str:
    parts: list[str] = []
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
    return "\n".join(parts) or "(no career records)"


def _profile_source_atoms(profile: dict[str, Any]) -> list[str]:
    values = profile.get("datasetMeta", {}).get("sourceAtomIds", [])
    return sorted({str(value) for value in values if str(value).strip()})


def _job_text(row: dict[str, str]) -> str:
    return _row_text(row, {"job_id"})


def _aliases_for(roles: Iterable[str]) -> tuple[str, ...]:
    aliases: list[str] = []
    for role in roles:
        aliases.extend(ROLE_ALIASES.get(role, ()))
    return tuple(aliases)


def _matches_aliases(text: str, aliases: Iterable[str]) -> bool:
    normalized = f" {text.casefold()} "
    return any(alias.casefold() in normalized for alias in aliases)


def _candidate_bucket(profile: dict[str, Any], job: dict[str, str]) -> str:
    roles = profile.get("careerProfile", {}).get("targetRoles", [])
    job_text = " ".join(
        str(job.get(field) or "")
        for field in ("job_category", "expertise_area", "skills")
    )
    if _matches_aliases(job_text, _aliases_for(roles)):
        return "role"
    adjacent_roles = [
        adjacent
        for role in roles
        for adjacent in ADJACENT_ROLES.get(role, ())
        if adjacent not in roles
    ]
    if _matches_aliases(job_text, _aliases_for(adjacent_roles)):
        return "adjacent"
    return "random"


def _stable_profile_splits(profile_ids: Iterable[str]) -> dict[str, str]:
    ordered = sorted(profile_ids, key=lambda profile_id: (_stable_number("expresso-profile-v1", profile_id), profile_id))
    if len(ordered) != 30:
        raise ValueError(f"Expresso candidate builder requires exactly 30 profiles, got {len(ordered)}")
    return {
        profile_id: "train" if index < 20 else "valid" if index < 25 else "test"
        for index, profile_id in enumerate(ordered)
    }


def build_expresso_candidates(
    profiles_dir: Path,
    jobs_path: Path,
    output_dir: Path,
) -> dict[str, int]:
    """30개 Expresso profile에 role/adjacent/random 8/6/6 공고를 배정한다."""
    profiles: dict[str, dict[str, Any]] = {}
    for path in sorted(Path(profiles_dir).glob("*.json")):
        profile = json.loads(path.read_text(encoding="utf-8"))
        profile_id = str(profile.get("syntheticProfileId") or "").strip()
        if not profile_id:
            raise ValueError(f"profile is missing syntheticProfileId: {path}")
        if profile_id in profiles:
            raise ValueError(f"duplicate syntheticProfileId: {profile_id}")
        profiles[profile_id] = profile
    profile_splits = _stable_profile_splits(profiles)
    jobs = {row["job_id"]: row for row in _read_csv(jobs_path) if row.get("job_id")}
    jobs_by_split = {
        split: [job_id for job_id in sorted(jobs) if stable_split(job_id) == split]
        for split in SPLITS
    }

    profile_rows = [
        {
            "profileId": profile_id,
            "sourceAtomIds": _profile_source_atoms(profile),
            "split": profile_splits[profile_id],
            "text": _profile_text(profile),
        }
        for profile_id, profile in sorted(profiles.items())
    ]
    selected_jobs: set[str] = set()
    manifest_rows: list[dict[str, str]] = []
    for profile_id, profile in sorted(profiles.items()):
        split = profile_splits[profile_id]
        classified: dict[str, list[str]] = defaultdict(list)
        for job_id in jobs_by_split[split]:
            classified[_candidate_bucket(profile, jobs[job_id])].append(job_id)
        chosen: list[str] = []
        for bucket, quota in CANDIDATE_QUOTAS:
            options = sorted(
                classified[bucket],
                key=lambda job_id: (_stable_number("expresso-candidate-v1", profile_id, bucket, job_id), job_id),
            )
            if len(options) < quota:
                raise ValueError(f"insufficient {bucket} jobs for {profile_id} in {split}: need {quota}, got {len(options)}")
            chosen.extend(options[:quota])
        if len(set(chosen)) != 20:
            raise ValueError(f"candidate selection has duplicate jobs for profile: {profile_id}")
        for job_id in chosen:
            selected_jobs.add(job_id)
            manifest_rows.append({"profileId": profile_id, "jobId": job_id, "split": split})

    job_rows = [
        {
            "duplicateGroupId": job_id,
            "jobId": job_id,
            "split": stable_split(job_id),
            "text": _job_text(jobs[job_id]),
        }
        for job_id in sorted(selected_jobs)
    ]
    output_dir = Path(output_dir)
    _write_jsonl(output_dir / "profiles.jsonl", profile_rows)
    _write_jsonl(output_dir / "jobs.jsonl", job_rows)
    _write_jsonl(output_dir / "candidate-manifest.jsonl", sorted(manifest_rows, key=lambda row: (row["profileId"], row["jobId"])))
    return {
        "candidatePairs": len(manifest_rows),
        "jobs": len(job_rows),
        "profiles": len(profile_rows),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    jth = commands.add_parser("jth-pretrain")
    jth.add_argument("candidates", type=Path)
    jth.add_argument("jobs", type=Path)
    jth.add_argument("history", type=Path)
    jth.add_argument("output", type=Path)
    expresso = commands.add_parser("expresso-candidates")
    expresso.add_argument("profiles", type=Path)
    expresso.add_argument("jobs", type=Path)
    expresso.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "jth-pretrain":
        summary = build_jth_pretrain(args.candidates, args.jobs, args.history, args.output)
    else:
        summary = build_expresso_candidates(args.profiles, args.jobs, args.output)
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
