"""한국어 공고 평가 세트를 `fit-v1`과 같은 파일 형식으로 만든다.

파일럿 검증 · 평가 프로필에 수집 한국어 공고를 10건씩 붙인다. 후보 규칙은 파일럿과 같다
(같은 직군 5 · 인접 3 · 무작위 2, `llm_suitability_dataset.DEFAULT_QUOTAS`). 그래서 기존 명령
(`match_experiments.py` · `match_api_scorer.py`)이 이 폴더를 그대로 읽는다.

    python ko_eval_dataset.py --fit-data <fit-v1 data> --profile-root <합성 프로필 run-root> \\
        --jobs jobs-with-requirements.jsonl --output <평가 세트 data>

- `fit-v1`의 `profiles.jsonl`에는 희망 직무가 없다. 원본 합성 프로필(`<run-root>/profiles/<분할>/*.json`의
  `careerProfile.targetRoles`)에서 읽는다(`llm_suitability_dataset.build_label_dataset`와 같은 위치).
- 공고는 공고 ID 해시로 검증 · 평가 반반으로 나눈다. 같은 공고가 두 분할에 들어가지 않는다.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import sys
from typing import Any, Iterable, Sequence


sys.path.insert(0, str(Path(__file__).parent))

from llm_suitability_dataset import DEFAULT_QUOTAS  # noqa: E402
from match_pilot_data import ADJACENT_ROLES  # noqa: E402


SPLITS = ("valid", "test")
# 프로필 희망 직무(합성 프로필 어휘) → 수집 공고 직군(`jobFamily`). 수집기는 개발 직군만 남기므로
# 기획 · PM · 디자인에 대응하는 공고는 없다. DevOps 공고는 수집기가 「인프라 · 플랫폼」으로 분류한다.
ROLE_TO_FAMILY = {
    "백엔드": "백엔드",
    "프론트엔드": "프론트엔드",
    "데이터": "데이터",
    "ML · AI": "ML · AI",
    "모바일": "모바일",
    "DevOps": "인프라 · 플랫폼",
}


def _stable_number(*parts: str) -> int:
    return int.from_bytes(hashlib.sha256("\x1f".join(parts).encode("utf-8")).digest()[:8], "big")


def job_split(job_id: str) -> str:
    return SPLITS[_stable_number("ko-eval-job-v1", job_id) % 2]


def family_sets(roles: Iterable[str]) -> tuple[set[str], set[str]]:
    """(같은 직군, 인접 직군). 인접은 `ADJACENT_ROLES`를 따르고 같은 직군과 겹치지 않는다."""
    roles = list(roles)
    same = {ROLE_TO_FAMILY[role] for role in roles if role in ROLE_TO_FAMILY}
    adjacent = {
        ROLE_TO_FAMILY[other]
        for role in roles
        for other in ADJACENT_ROLES.get(role, ())
        if other in ROLE_TO_FAMILY and other not in roles
    }
    return same, adjacent - same


def bucket(job_family: str | None, same: set[str], adjacent: set[str]) -> str:
    if job_family in same:
        return "role"
    if job_family in adjacent:
        return "adjacent"
    return "random"


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_target_roles(profile_root: Path) -> dict[str, list[str]]:
    paths = sorted((profile_root / "profiles").glob("*/*.json"))
    if not paths:
        raise FileNotFoundError(f"합성 프로필 원본이 없다: {profile_root / 'profiles'}/<분할>/*.json")
    roles: dict[str, list[str]] = {}
    for path in paths:
        profile = json.loads(path.read_text(encoding="utf-8"))
        roles[str(profile["syntheticProfileId"])] = [str(role) for role in profile.get("careerProfile", {}).get("targetRoles", [])]
    return roles


def job_row(job: dict[str, Any]) -> dict[str, Any]:
    """`render_job`이 읽는 `fields`로 옮긴다. 제목 · 직군 · 원문 순서로 렌더된다(`JOB_FIELD_LABELS`)."""
    return {
        "jobId": job["jobId"],
        "split": job_split(job["jobId"]),
        "fields": {"title": job["title"], "job_category": job["jobFamily"], "description": job["descriptionRaw"]},
        # 서비스 요건 추출기의 normalized. 규칙 baseline(`calculateExplainableMatch`)의 입력이다.
        "requirements": job.get("requirements"),
        # 분해된 요건의 문구. 서비스가 재료 순위(`rankMaterials`)에 넘기는 값이다.
        "requirementLabels": job.get("requirementLabels"),
        "sourceBoard": job.get("sourceBoard"),
    }


def build(fit_data: Path, profile_root: Path, jobs_path: Path, output: Path, *, quotas: Sequence[tuple[str, int]] = DEFAULT_QUOTAS) -> dict[str, Any]:
    target_roles = load_target_roles(profile_root)
    profiles = [row for row in _read_jsonl(fit_data / "profiles.jsonl") if row["split"] in SPLITS]
    jobs = [job for job in _read_jsonl(jobs_path) if str(job.get("descriptionRaw") or "").strip()]
    by_split: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for job in jobs:
        by_split[job_split(job["jobId"])].append(job)
    excluded: Counter[str] = Counter()
    chosen_profiles: list[dict[str, Any]] = []
    pairs: list[dict[str, Any]] = []
    used_jobs: set[str] = set()
    for profile in sorted(profiles, key=lambda row: row["profileId"]):
        profile_id = str(profile["profileId"])
        if profile_id not in target_roles:
            raise ValueError(f"원본 프로필에 없는 프로필: {profile_id}")
        same, adjacent = family_sets(target_roles[profile_id])
        if not same:
            excluded["noMatchingFamily"] += 1
            continue
        classified: dict[str, list[str]] = defaultdict(list)
        for job in by_split[profile["split"]]:
            classified[bucket(job.get("jobFamily"), same, adjacent)].append(job["jobId"])
        chosen: list[tuple[str, str]] = []
        for name, quota in quotas:
            options = sorted(classified[name], key=lambda job_id: (_stable_number("ko-eval-candidate-v1", profile_id, name, job_id), job_id))
            if len(options) < quota:
                raise ValueError(f"{profile_id}({profile['split']})의 {name} 후보가 {quota}건보다 적다: {len(options)}")
            chosen.extend((job_id, name) for job_id in options[:quota])
        chosen_profiles.append(profile)
        for job_id, name in chosen:
            used_jobs.add(job_id)
            pairs.append({"profileId": profile_id, "jobId": job_id, "split": profile["split"], "candidateBucket": name})
    job_rows = [job_row(job) for job in sorted(jobs, key=lambda job: job["jobId"]) if job["jobId"] in used_jobs]
    _write_jsonl(output / "profiles.jsonl", chosen_profiles)
    _write_jsonl(output / "jobs.jsonl", job_rows)
    _write_jsonl(output / "candidate-manifest.jsonl", sorted(pairs, key=lambda row: (row["profileId"], row["candidateBucket"], row["jobId"])))
    manifest = {
        "datasetVersion": "ko-eval-v1",
        "quotas": dict(quotas),
        "profiles": len(chosen_profiles),
        "splitProfiles": dict(sorted(Counter(row["split"] for row in chosen_profiles).items())),
        "excludedProfiles": dict(excluded),
        "jobs": len(job_rows),
        "splitJobs": dict(sorted(Counter(row["split"] for row in job_rows).items())),
        "pairs": len(pairs),
        "jobsWithoutRequirements": sum(row["requirements"] is None for row in job_rows),
        "sources": {"fitProfilesSha256": _sha256(fit_data / "profiles.jsonl"), "jobsSha256": _sha256(jobs_path)},
    }
    (output / "data-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifest


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fit-data", type=Path, required=True)
    parser.add_argument("--profile-root", type=Path, required=True)
    parser.add_argument("--jobs", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args(argv)
    print(json.dumps(build(arguments.fit_data, arguments.profile_root, arguments.jobs, arguments.output), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
