"""프로필–공고 baseline과 후보 모델을 같은 조건에서 평가하는 CLI."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from typing import Any

from ranking_evaluation import (
    DatasetValidationError,
    cohen_kappa,
    evaluate_gate,
    evaluate_ranking,
    paired_bootstrap,
    validate_dataset,
)
from retrieval_baselines import build_lexical_scores, combine_hybrid_scores


HYBRID_WEIGHTS = (0.0, 0.25, 0.5, 0.75, 1.0)
BASELINE_ORDER = ("token_overlap", "word_tfidf", "char_tfidf", "bm25", "hybrid")


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, 1):
                if not line.strip():
                    raise DatasetValidationError(f"{path}:{line_number}: blank line")
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as error:
                    raise DatasetValidationError(
                        f"{path}:{line_number}: invalid JSON: {error.msg}"
                    ) from error
                if not isinstance(row, dict):
                    raise DatasetValidationError(f"{path}:{line_number}: expected object")
                rows.append(row)
    except OSError as error:
        raise DatasetValidationError(f"cannot read {path}: {error}") from error
    if not rows:
        raise DatasetValidationError(f"{path}: file is empty")
    return rows


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _git_commit() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def _model_scores(rows: list[dict[str, Any]]) -> dict[str, dict[str, dict[str, float]]]:
    models: dict[str, dict[str, dict[str, float]]] = {}
    for row in rows:
        models.setdefault(row["model"], {}).setdefault(row["profileId"], {})[
            row["jobId"]
        ] = float(row["score"])
    return models


def _ndcg(result: dict[str, Any]) -> float:
    value = result["metrics"]["ndcgAt10"]
    return value if value is not None else float("-inf")


def _choose_hybrid_weight(
    char_scores: dict[str, dict[str, float]],
    bm25_scores: dict[str, dict[str, float]],
    labels: list[dict[str, Any]],
) -> tuple[float, dict[str, dict[str, float]]]:
    candidates = []
    for weight in HYBRID_WEIGHTS:
        scores = combine_hybrid_scores(char_scores, bm25_scores, weight)
        result = evaluate_ranking(
            scores, labels, split="valid", label_field="teacherLabel"
        )
        candidates.append((_ndcg(result), weight, scores))
    _, weight, scores = max(candidates, key=lambda candidate: (candidate[0], candidate[1]))
    return weight, scores


def _evaluate_model(
    scores: dict[str, dict[str, float]], labels: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "validTeacher": evaluate_ranking(
            scores, labels, split="valid", label_field="teacherLabel"
        ),
        "testTeacher": evaluate_ranking(
            scores, labels, split="test", label_field="teacherLabel"
        ),
        "testHuman": evaluate_ranking(
            scores, labels, split="test", label_field="humanLabel"
        ),
    }


def _profile_metric(result: dict[str, Any], metric: str) -> dict[str, float]:
    return {
        profile_id: profile[metric]
        for profile_id, profile in result["perProfile"].items()
        if profile[metric] is not None
    }


def _bootstrap_result(
    candidate: dict[str, Any], baseline: dict[str, Any], reference: str
) -> dict[str, Any] | None:
    candidate_values = _profile_metric(candidate[reference], "ndcgAt10")
    baseline_values = _profile_metric(baseline[reference], "ndcgAt10")
    common = sorted(candidate_values.keys() & baseline_values.keys())
    if not common:
        return None
    return paired_bootstrap(
        {profile_id: candidate_values[profile_id] for profile_id in common},
        {profile_id: baseline_values[profile_id] for profile_id in common},
    )


def _split_counts(
    profiles: list[dict[str, Any]],
    jobs: list[dict[str, Any]],
    labels: list[dict[str, Any]],
) -> dict[str, dict[str, int]]:
    return {
        split: {
            "profiles": sum(profile["split"] == split for profile in profiles),
            "jobs": sum(job["split"] == split for job in jobs),
            "pairs": sum(label["split"] == split for label in labels),
            "humanLabeledPairs": sum(
                label["split"] == split and label["humanLabel"] is not None
                for label in labels
            ),
        }
        for split in ("train", "valid", "test")
    }


def run_evaluation(
    *,
    profiles_path: Path,
    jobs_path: Path,
    labels_path: Path,
    candidate_scores_path: Path | None,
) -> dict[str, Any]:
    profiles = load_jsonl(profiles_path)
    jobs = load_jsonl(jobs_path)
    labels = load_jsonl(labels_path)
    candidate_rows = load_jsonl(candidate_scores_path) if candidate_scores_path else None
    validate_dataset(profiles, jobs, labels, candidate_rows)

    profile_texts = {profile["profileId"]: profile["text"] for profile in profiles}
    job_texts = {job["jobId"]: job["text"] for job in jobs}
    pairs = [(label["profileId"], label["jobId"]) for label in labels]
    baseline_scores = build_lexical_scores(profile_texts, job_texts, pairs)
    hybrid_weight, hybrid_scores = _choose_hybrid_weight(
        baseline_scores["char_tfidf"], baseline_scores["bm25"], labels
    )
    baseline_scores["hybrid"] = hybrid_scores
    baseline_results = {
        model: _evaluate_model(baseline_scores[model], labels) for model in BASELINE_ORDER
    }
    selected_baseline = max(
        BASELINE_ORDER,
        key=lambda model: (_ndcg(baseline_results[model]["validTeacher"]), -BASELINE_ORDER.index(model)),
    )

    human_test_labels = [
        label
        for label in labels
        if label["split"] == "test" and label["humanLabel"] is not None
    ]
    human_label_count = len(human_test_labels)
    human_candidates_per_profile = Counter(
        label["profileId"] for label in human_test_labels
    )
    official_candidate_sets_valid = bool(human_candidates_per_profile) and all(
        count >= 10 for count in human_candidates_per_profile.values()
    )
    kappa = cohen_kappa(
        (label["teacherLabel"], label["humanLabel"]) for label in human_test_labels
    )
    candidate_results: dict[str, Any] = {}
    for model, scores in _model_scores(candidate_rows or []).items():
        evaluations = _evaluate_model(scores, labels)
        bootstrap_reference = "testHuman" if human_label_count >= 300 else "testTeacher"
        bootstrap = _bootstrap_result(
            evaluations, baseline_results[selected_baseline], bootstrap_reference
        )
        gate = evaluate_gate(
            human_label_count=human_label_count,
            teacher_human_kappa=kappa,
            candidate_human_metrics=evaluations["testHuman"]["metrics"],
            token_human_metrics=baseline_results["token_overlap"]["testHuman"]["metrics"],
            strongest_human_metrics=baseline_results[selected_baseline]["testHuman"]["metrics"],
            bootstrap=bootstrap,
            official_candidate_sets_valid=official_candidate_sets_valid,
        )
        candidate_results[model] = {
            **evaluations,
            "bootstrap": bootstrap,
            "bootstrapReference": bootstrap_reference,
            "gate": gate,
        }

    input_paths = [profiles_path, jobs_path, labels_path]
    if candidate_scores_path:
        input_paths.append(candidate_scores_path)
    warnings = []
    test_candidates_per_profile = Counter(
        label["profileId"] for label in labels if label["split"] == "test"
    )
    small_test_profiles = sorted(
        profile_id
        for profile_id, count in test_candidates_per_profile.items()
        if count < 10
    )
    if small_test_profiles:
        warnings.append(
            f"official NDCG@10 needs at least 10 candidates: {len(small_test_profiles)} test profiles are smaller"
        )
    if human_label_count and not official_candidate_sets_valid:
        warnings.append("human-label candidate groups need at least 10 jobs per profile")
    undefined_metrics = sorted(
        {
            f"{model}.{reference}.{metric}"
            for model, evaluations in {
                **baseline_results,
                **{name: value for name, value in candidate_results.items()},
            }.items()
            for reference in ("validTeacher", "testTeacher", "testHuman")
            for metric, value in evaluations[reference]["metrics"].items()
            if value is None
        }
    )
    if undefined_metrics:
        warnings.append(
            "undefined metrics were excluded from macro averages: "
            + ", ".join(undefined_metrics)
        )
    return {
        "schemaVersion": "retrieval-evaluation-v1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "gitCommit": _git_commit(),
        "inputSha256": {str(path): _sha256(path) for path in input_paths},
        "counts": _split_counts(profiles, jobs, labels),
        "hybridCharWeight": hybrid_weight,
        "selectedStrongestBaseline": selected_baseline,
        "baselines": baseline_results,
        "humanLabels": {
            "testPairCount": human_label_count,
            "teacherHumanKappa": kappa,
            "officialCandidateSetsValid": official_candidate_sets_valid,
        },
        "candidates": candidate_results,
        "warnings": warnings,
    }


def _format_metric(value: float | None) -> str:
    return "—" if value is None else f"{value:.4f}"


def _append_metric_table(
    lines: list[str], result: dict[str, Any], reference: str
) -> None:
    lines.extend(
        (
            "| Model | NDCG@10 | MAP | Recall@10 | MRR@10 | AUC | Gate |",
            "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
        )
    )
    rows: list[tuple[str, dict[str, Any], str]] = []
    for model in BASELINE_ORDER:
        rows.append((model, result["baselines"][model][reference]["metrics"], "baseline"))
    for model, candidate in sorted(result["candidates"].items()):
        rows.append((model, candidate[reference]["metrics"], candidate["gate"]["status"]))
    for model, metrics, gate in rows:
        lines.append(
            "| "
            + " | ".join(
                (
                    model,
                    _format_metric(metrics["ndcgAt10"]),
                    _format_metric(metrics["map"]),
                    _format_metric(metrics["recallAt10"]),
                    _format_metric(metrics["mrrAt10"]),
                    _format_metric(metrics["auc"]),
                    gate,
                )
            )
            + " |"
        )


def render_summary(result: dict[str, Any]) -> str:
    lines = [
        "# 공고 추천 평가 결과",
        "",
        f"- Strongest baseline: `{result['selectedStrongestBaseline']}`",
        f"- Hybrid char TF-IDF weight: `{result['hybridCharWeight']}`",
        f"- Test human labels: `{result['humanLabels']['testPairCount']}`",
        f"- Teacher–human kappa: `{_format_metric(result['humanLabels']['teacherHumanKappa'])}`",
        "",
        "## Test teacher-label metrics",
        "",
    ]
    _append_metric_table(lines, result, "testTeacher")
    lines.extend(("", "## Test human-label metrics", ""))
    _append_metric_table(lines, result, "testHuman")
    if result["warnings"]:
        lines.extend(("", "## Warnings", ""))
        lines.extend(f"- {warning}" for warning in result["warnings"])
    return "\n".join(lines) + "\n"


def write_results(result: dict[str, Any], output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    (output / "metrics.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (output / "summary.md").write_text(render_summary(result), encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profiles", type=Path, required=True)
    parser.add_argument("--jobs", type=Path, required=True)
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--candidate-scores", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    try:
        result = run_evaluation(
            profiles_path=arguments.profiles,
            jobs_path=arguments.jobs,
            labels_path=arguments.labels,
            candidate_scores_path=arguments.candidate_scores,
        )
        write_results(result, arguments.output)
        return 0
    except DatasetValidationError as error:
        print(f"input validation failed: {error}", file=sys.stderr)
        return 2
    except Exception as error:  # pragma: no cover - CLI 경계에서 예기치 않은 오류를 코드 1로 바꿉니다.
        print(f"evaluation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
