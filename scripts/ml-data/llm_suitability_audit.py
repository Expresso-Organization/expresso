"""LLM 적합도 라벨 데이터셋의 완전성과 산술 무결성을 감사한다."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
from statistics import mean
from typing import Any

from llm_suitability_rubric import COVERAGE_POINTS, DIMENSION_WEIGHTS, LABEL_SOURCE, RUBRIC_VERSION


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _expected_scores(assessments: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], int]:
    grouped: dict[str, list[int]] = defaultdict(list)
    for item in assessments:
        grouped[str(item.get("kind"))].append(COVERAGE_POINTS[str(item.get("coverage"))])
    dimensions: dict[str, dict[str, Any]] = {}
    applicable = []
    for kind in DIMENSION_WEIGHTS:
        points = grouped.get(kind, [])
        score = int(math.floor(sum(points) / len(points) + 0.5)) if points else 0
        dimensions[kind] = {"applicable": bool(points), "score": score}
        if points:
            applicable.append(kind)
    if not applicable:
        raise ValueError("no applicable dimensions")
    weight = sum(DIMENSION_WEIGHTS[kind] for kind in applicable)
    total = int(math.floor(sum(dimensions[kind]["score"] * DIMENSION_WEIGHTS[kind] for kind in applicable) / weight + 0.5))
    return dimensions, total


def audit_labels(
    dataset_dir: Path,
    labels_dir: Path,
    *,
    expected_profiles: int = 1000,
    expected_pairs: int = 10000,
    allowed_label_sources: set[str] | None = None,
) -> dict[str, Any]:
    dataset_dir, labels_dir = Path(dataset_dir), Path(labels_dir)
    profiles = _read_jsonl(dataset_dir / "profiles.jsonl")
    jobs = _read_jsonl(dataset_dir / "jobs.jsonl")
    candidates = _read_jsonl(dataset_dir / "candidate-manifest.jsonl")
    labels = _read_jsonl(labels_dir / "suitability-labels.jsonl")
    errors: list[str] = []

    if len(profiles) != expected_profiles:
        errors.append(f"expected {expected_profiles} profiles, got {len(profiles)}")
    if len(candidates) != expected_pairs:
        errors.append(f"expected {expected_pairs} candidate pairs, got {len(candidates)}")
    profile_by_id = {str(row["profileId"]): row for row in profiles}
    job_by_id = {str(row["jobId"]): row for row in jobs}
    if len(profile_by_id) != len(profiles):
        errors.append("duplicate profile IDs")
    if len(job_by_id) != len(jobs):
        errors.append("duplicate job IDs")
    expected = {(str(row["profileId"]), str(row["jobId"])): row for row in candidates}
    if len(expected) != len(candidates):
        errors.append("duplicate candidate pairs")
    actual_pairs = [(str(row.get("profileId")), str(row.get("jobId"))) for row in labels]
    actual_set = set(actual_pairs)
    if len(actual_set) != len(actual_pairs):
        errors.append("duplicate label pairs")
    missing = set(expected) - actual_set
    extra = actual_set - set(expected)
    if missing:
        errors.append(f"missing labels: {len(missing)}")
    if extra:
        errors.append(f"unexpected labels: {len(extra)}")

    score_bands: Counter[str] = Counter()
    bucket_scores: dict[str, list[int]] = defaultdict(list)
    models: set[str] = set()
    rubrics: set[str] = set()
    unknown_evidence = 0
    arithmetic_errors = 0
    split_errors = 0
    for row in labels:
        pair = (str(row.get("profileId")), str(row.get("jobId")))
        if pair not in expected or pair[0] not in profile_by_id or pair[1] not in job_by_id:
            continue
        candidate = expected[pair]
        if not (
            row.get("split") == candidate.get("split") == profile_by_id[pair[0]].get("split") == job_by_id[pair[1]].get("split")
        ):
            split_errors += 1
        if row.get("candidateBucket") != candidate.get("candidateBucket"):
            errors.append(f"candidate bucket mismatch: {pair[0]} / {pair[1]}")
        records = {str(record.get("recordId")) for record in profile_by_id[pair[0]].get("records", [])}
        assessments = row.get("requirementAssessments", [])
        try:
            for assessment in assessments:
                coverage = str(assessment.get("coverage"))
                kind = str(assessment.get("kind"))
                if coverage not in COVERAGE_POINTS or kind not in DIMENSION_WEIGHTS:
                    raise ValueError("unknown coverage or kind")
                evidence = set(map(str, assessment.get("evidenceRecordIds", [])))
                if evidence - records or (coverage == "not_evidenced" and evidence) or (coverage != "not_evidenced" and not evidence):
                    unknown_evidence += 1
            dimensions, score = _expected_scores(assessments)
            if row.get("dimensionScores") != dimensions or row.get("matchScore") != score:
                arithmetic_errors += 1
        except (KeyError, TypeError, ValueError, ZeroDivisionError):
            arithmetic_errors += 1
            continue
        models.add(str(row.get("labelSource")))
        rubrics.add(str(row.get("rubricVersion")))
        numeric_score = int(row["matchScore"])
        band = "00-19" if numeric_score < 20 else "20-39" if numeric_score < 40 else "40-59" if numeric_score < 60 else "60-79" if numeric_score < 80 else "80-94" if numeric_score < 95 else "95-100"
        score_bands[band] += 1
        bucket_scores[str(row["candidateBucket"])].append(numeric_score)
    if split_errors:
        errors.append(f"split mismatches: {split_errors}")
    if unknown_evidence:
        errors.append(f"invalid evidence references: {unknown_evidence}")
    if arithmetic_errors:
        errors.append(f"score arithmetic mismatches: {arithmetic_errors}")
    expected_sources = allowed_label_sources or {LABEL_SOURCE}
    if not models or not models.issubset(expected_sources):
        errors.append(f"label source mismatch: {sorted(models)}")
    if rubrics != {RUBRIC_VERSION}:
        errors.append(f"rubric version mismatch: {sorted(rubrics)}")

    return {
        "qualityGate": "PASS" if not errors else "FAIL",
        "errors": errors,
        "profiles": len(profiles),
        "jobs": len(jobs),
        "candidatePairs": len(candidates),
        "labels": len(labels),
        "missingLabels": len(missing),
        "duplicateLabels": len(actual_pairs) - len(actual_set),
        "splitMismatches": split_errors,
        "invalidEvidenceReferences": unknown_evidence,
        "scoreArithmeticMismatches": arithmetic_errors,
        "scoreBands": dict(sorted(score_bands.items())),
        "bucketScores": {
            bucket: {"count": len(values), "mean": round(mean(values), 3), "min": min(values), "max": max(values)}
            for bucket, values in sorted(bucket_scores.items())
        },
        "labelSources": sorted(models),
        "rubricVersions": sorted(rubrics),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--expected-profiles", type=int, default=1000)
    parser.add_argument("--expected-pairs", type=int, default=10000)
    parser.add_argument("--allowed-label-source", action="append")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = audit_labels(
        args.dataset,
        args.labels,
        expected_profiles=args.expected_profiles,
        expected_pairs=args.expected_pairs,
        allowed_label_sources=set(args.allowed_label_source) if args.allowed_label_source else None,
    )
    rendered = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    if report["qualityGate"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
