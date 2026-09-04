"""합성 프로필과 JTH 공고로 Sonnet 적합도 평가 후보쌍을 만든다."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable, Sequence

from match_pilot_data import _candidate_bucket, stable_split


SPLITS = ("train", "valid", "test")
DEFAULT_QUOTAS = (("role", 5), ("adjacent", 3), ("random", 2))
JTH_LABEL_FIELDS = {
    "job_category",
    "expertise_area",
    "skills",
    "years_experience",
    "llm_seniority_level",
    "llm_required_languages_spoken",
    "llm_required_lowest_diploma",
    "llm_required_years_of_work_experience",
    "llm_required_management_experience",
    "llm_required_freelance_experience",
    "llm_required_contract_experience",
    "llm_required_international_work_experience",
    "llm_required_leadership_experience",
    "llm_hard_skills",
    "llm_soft_skills",
    "llm_programming_languages",
    "llm_tools_technologies",
    "llm_certifications",
    "llm_expertise_area",
    "llm_job_category",
    "llm_client_facing_role",
}


def _stable_number(*parts: str) -> int:
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            target.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
            target.write("\n")


def _read_jobs(path: Path) -> dict[str, dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as source:
        rows = list(csv.DictReader(source))
    jobs = {str(row.get("job_id") or "").strip(): row for row in rows if str(row.get("job_id") or "").strip()}
    if len(jobs) != len(rows):
        raise ValueError("jobs.csv contains an empty or duplicate job_id")
    return jobs


def _basic_properties(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {
        str(key): item
        for key, item in sorted(value.items())
        if item not in (None, "", [], {}) and isinstance(item, (str, int, float, bool, list))
    }


def profile_evidence(profile: dict[str, Any]) -> dict[str, Any]:
    """평가에 허용된 사용자 기록 필드만 구조화한다."""
    records = []
    for record in profile.get("records", []):
        if not isinstance(record, dict):
            continue
        record_id = str(record.get("id") or "").strip()
        if not record_id:
            raise ValueError("profile record is missing id")
        records.append(
            {
                "recordId": record_id,
                "title": str(record.get("title") or "").strip(),
                "properties": _basic_properties(record.get("properties")),
                "bodyMd": str(record.get("bodyMd") or "").strip(),
            }
        )
    return {
        "experienceYears": profile.get("careerProfile", {}).get("experienceYears"),
        "records": records,
    }


def profile_evidence_text(profile: dict[str, Any]) -> str:
    evidence = profile_evidence(profile)
    lines = [f"experienceYears: {evidence['experienceYears']}"]
    for record in evidence["records"]:
        lines.extend(
            [
                f"recordId: {record['recordId']}",
                f"title: {record['title']}",
                f"properties: {json.dumps(record['properties'], ensure_ascii=False, sort_keys=True)}",
                f"bodyMd: {record['bodyMd']}",
            ]
        )
    return "\n".join(lines)


def _job_payload(row: dict[str, str]) -> dict[str, str]:
    payload: dict[str, str] = {}
    for key, value in sorted(row.items()):
        normalized = str(value or "").strip()
        if key not in JTH_LABEL_FIELDS or not normalized:
            continue
        if normalized.casefold() in {"false", "none", "null", "n/a", "_rare_skill_"}:
            continue
        if key.startswith("llm_required_") and normalized.casefold() == "0":
            continue
        pieces = [piece for piece in normalized.split(";") if piece and piece != "_rare_skill_"]
        if pieces:
            payload[key] = ";".join(pieces)
    return payload


def build_label_dataset(
    run_root: Path,
    jobs_path: Path,
    output_dir: Path,
    quotas: Sequence[tuple[str, int]] = DEFAULT_QUOTAS,
    expected_profiles: int = 1000,
) -> dict[str, Any]:
    """split을 보존하며 프로필별 role/adjacent/random 후보를 안정적으로 선택한다."""
    run_root = Path(run_root)
    output_dir = Path(output_dir)
    profile_paths = sorted((run_root / "profiles").glob("*/*.json"))
    if len(profile_paths) != expected_profiles:
        raise ValueError(f"expected {expected_profiles} profiles, got {len(profile_paths)}")

    profiles: dict[str, dict[str, Any]] = {}
    profile_hashes: dict[str, str] = {}
    family_splits: dict[str, str] = {}
    profile_splits: Counter[str] = Counter()
    for path in profile_paths:
        profile = json.loads(path.read_text(encoding="utf-8"))
        profile_id = str(profile.get("syntheticProfileId") or "").strip()
        if not profile_id or profile_id in profiles:
            raise ValueError(f"missing or duplicate syntheticProfileId: {path}")
        metadata = profile.get("datasetMeta", {})
        split = str(metadata.get("split") or "").strip()
        family = str(metadata.get("profileFamily") or "").strip()
        if split not in SPLITS or path.parent.name != split:
            raise ValueError(f"profile split does not match path: {path}")
        if not family:
            raise ValueError(f"profile is missing profileFamily: {path}")
        if family in family_splits and family_splits[family] != split:
            raise ValueError(f"profile family crosses splits: {family}")
        family_splits[family] = split
        profiles[profile_id] = profile
        profile_hashes[profile_id] = _sha256(path)
        profile_splits[split] += 1

    jobs = _read_jobs(Path(jobs_path))
    jobs_by_split = {
        split: [job_id for job_id in sorted(jobs) if stable_split(job_id) == split]
        for split in SPLITS
    }
    quota_map = dict(quotas)
    if set(quota_map) != {"role", "adjacent", "random"} or any(value < 0 for value in quota_map.values()):
        raise ValueError("quotas must contain non-negative role, adjacent, random counts")

    profile_rows: list[dict[str, Any]] = []
    pair_rows: list[dict[str, Any]] = []
    selected_job_ids: set[str] = set()
    for profile_id in sorted(profiles):
        profile = profiles[profile_id]
        split = str(profile["datasetMeta"]["split"])
        profile_rows.append(
            {
                "profileId": profile_id,
                "split": split,
                **profile_evidence(profile),
            }
        )
        classified: dict[str, list[str]] = defaultdict(list)
        for job_id in jobs_by_split[split]:
            classified[_candidate_bucket(profile, jobs[job_id])].append(job_id)
        chosen: list[tuple[str, str]] = []
        for bucket, quota in quotas:
            options = sorted(
                classified[bucket],
                key=lambda job_id: (_stable_number("llm-label-candidate-v1", profile_id, bucket, job_id), job_id),
            )
            if len(options) < quota:
                raise ValueError(
                    f"insufficient {bucket} jobs for {profile_id} in {split}: need {quota}, got {len(options)}"
                )
            chosen.extend((job_id, bucket) for job_id in options[:quota])
        if len({job_id for job_id, _ in chosen}) != sum(quota_map.values()):
            raise ValueError(f"candidate selection has duplicate jobs for profile: {profile_id}")
        for job_id, bucket in chosen:
            selected_job_ids.add(job_id)
            pair_rows.append(
                {
                    "profileId": profile_id,
                    "jobId": job_id,
                    "split": split,
                    "candidateBucket": bucket,
                }
            )

    job_rows = [
        {
            "jobId": job_id,
            "split": stable_split(job_id),
            "fields": _job_payload(jobs[job_id]),
        }
        for job_id in sorted(selected_job_ids)
    ]
    pair_rows.sort(key=lambda row: (row["profileId"], row["candidateBucket"], row["jobId"]))
    _write_jsonl(output_dir / "profiles.jsonl", profile_rows)
    _write_jsonl(output_dir / "jobs.jsonl", job_rows)
    _write_jsonl(output_dir / "candidate-manifest.jsonl", pair_rows)
    manifest = {
        "schemaVersion": 1,
        "datasetVersion": "match-llm-labels-1000-v1",
        "profiles": len(profile_rows),
        "jobs": len(job_rows),
        "candidatePairs": len(pair_rows),
        "pairsPerProfile": sum(quota_map.values()),
        "quotas": dict(sorted(quota_map.items())),
        "splitProfiles": dict(sorted(profile_splits.items())),
        "splitPairs": dict(sorted(Counter(row["split"] for row in pair_rows).items())),
        "sourceProfileSha256": dict(sorted(profile_hashes.items())),
        "jobsSha256": _sha256(Path(jobs_path)),
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "data-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-root", type=Path, required=True)
    parser.add_argument("--jobs", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-profiles", type=int, default=1000)
    args = parser.parse_args()
    summary = build_label_dataset(args.run_root, args.jobs, args.output, expected_profiles=args.expected_profiles)
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
