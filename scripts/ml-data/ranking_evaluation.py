"""공고 추천 데이터 계약, 랭킹 지표와 승인 판정."""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
import math
import random
from typing import Any, Iterable


SPLITS = {"train", "valid", "test"}
PROFILE_FIELDS = {"profileId", "text", "split", "sourceAtomIds"}
JOB_FIELDS = {"jobId", "text", "split", "duplicateGroupId"}
LABEL_FIELDS = {
    "profileId",
    "jobId",
    "split",
    "teacherLabel",
    "humanLabel",
    "reasonCodes",
}
SCORE_FIELDS = {"model", "profileId", "jobId", "score"}


class DatasetValidationError(ValueError):
    pass


def _require_exact_fields(item: dict[str, Any], expected: set[str], kind: str) -> None:
    actual = set(item)
    if actual != expected:
        missing = sorted(expected - actual)
        unknown = sorted(actual - expected)
        raise DatasetValidationError(
            f"{kind} fields differ: missing={missing}, unknown={unknown}"
        )


def _require_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise DatasetValidationError(f"{field} must be a non-empty string")
    return value


def _require_label(value: Any, field: str, nullable: bool = False) -> None:
    if nullable and value is None:
        return
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 3:
        raise DatasetValidationError(f"{field} must be an integer from 0 to 3")


def _require_split(value: Any, field: str) -> str:
    if not isinstance(value, str) or value not in SPLITS:
        raise DatasetValidationError(f"{field} must be train, valid, or test")
    return value


def _validate_string_list(value: Any, field: str) -> None:
    if not isinstance(value, list) or any(
        not isinstance(item, str) or not item.strip() for item in value
    ):
        raise DatasetValidationError(f"{field} must be an array of non-empty strings")


def _reject_cross_split(
    items: Iterable[dict[str, Any]], key: str, split_key: str = "split"
) -> None:
    seen: dict[str, str] = {}
    for item in items:
        value = item[key]
        previous = seen.setdefault(value, item[split_key])
        if previous != item[split_key]:
            raise DatasetValidationError(f"{key} crosses splits: {value}")


def validate_dataset(
    profiles: list[dict[str, Any]],
    jobs: list[dict[str, Any]],
    labels: list[dict[str, Any]],
    candidate_scores: list[dict[str, Any]] | None = None,
) -> None:
    profile_by_id: dict[str, dict[str, Any]] = {}
    for profile in profiles:
        _require_exact_fields(profile, PROFILE_FIELDS, "profile")
        profile_id = _require_string(profile["profileId"], "profileId")
        _require_string(profile["text"], "profile.text")
        _require_split(profile["split"], "profile.split")
        _validate_string_list(profile["sourceAtomIds"], "sourceAtomIds")
        if profile_id in profile_by_id:
            raise DatasetValidationError(f"duplicate profileId: {profile_id}")
        profile_by_id[profile_id] = profile

    source_atoms = [
        {"sourceAtomId": atom_id, "split": profile["split"]}
        for profile in profiles
        for atom_id in profile["sourceAtomIds"]
    ]
    _reject_cross_split(source_atoms, "sourceAtomId")

    job_by_id: dict[str, dict[str, Any]] = {}
    for job in jobs:
        _require_exact_fields(job, JOB_FIELDS, "job")
        job_id = _require_string(job["jobId"], "jobId")
        _require_string(job["text"], "job.text")
        _require_split(job["split"], "job.split")
        _require_string(job["duplicateGroupId"], "duplicateGroupId")
        if job_id in job_by_id:
            raise DatasetValidationError(f"duplicate jobId: {job_id}")
        job_by_id[job_id] = job
    _reject_cross_split(jobs, "duplicateGroupId")

    pair_by_id: dict[tuple[str, str], dict[str, Any]] = {}
    candidate_count: dict[str, int] = defaultdict(int)
    for label in labels:
        _require_exact_fields(label, LABEL_FIELDS, "label")
        profile_id = _require_string(label["profileId"], "label.profileId")
        job_id = _require_string(label["jobId"], "label.jobId")
        if profile_id not in profile_by_id or job_id not in job_by_id:
            raise DatasetValidationError(f"label references unknown pair: {profile_id}/{job_id}")
        split = label["split"]
        _require_split(split, "label.split")
        if split != profile_by_id[profile_id]["split"] or split != job_by_id[job_id]["split"]:
            raise DatasetValidationError(f"label split differs for pair: {profile_id}/{job_id}")
        _require_label(label["teacherLabel"], "teacherLabel")
        _require_label(label["humanLabel"], "humanLabel", nullable=True)
        _validate_string_list(label["reasonCodes"], "reasonCodes")
        pair = (profile_id, job_id)
        if pair in pair_by_id:
            raise DatasetValidationError(f"duplicate label pair: {profile_id}/{job_id}")
        pair_by_id[pair] = label
        candidate_count[profile_id] += 1

    too_small = sorted(profile_id for profile_id, count in candidate_count.items() if count < 2)
    if too_small:
        raise DatasetValidationError(f"profiles need at least two candidates: {too_small}")
    label_splits = {label["split"] for label in labels}
    if not {"valid", "test"}.issubset(label_splits):
        raise DatasetValidationError("labels must contain both valid and test splits")

    if candidate_scores is None:
        return
    score_keys: set[tuple[str, str, str]] = set()
    pairs_by_model: dict[str, set[tuple[str, str]]] = defaultdict(set)
    for score in candidate_scores:
        _require_exact_fields(score, SCORE_FIELDS, "candidate score")
        model = _require_string(score["model"], "model")
        profile_id = _require_string(score["profileId"], "score.profileId")
        job_id = _require_string(score["jobId"], "score.jobId")
        value = score["score"]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise DatasetValidationError("score must be a finite number")
        if (profile_id, job_id) not in pair_by_id:
            raise DatasetValidationError(f"score references unknown pair: {profile_id}/{job_id}")
        key = (model, profile_id, job_id)
        if key in score_keys:
            raise DatasetValidationError(f"duplicate candidate score: {key}")
        score_keys.add(key)
        pairs_by_model[model].add((profile_id, job_id))

    expected = {
        pair for pair, label in pair_by_id.items() if label["split"] in {"valid", "test"}
    }
    for model, actual in pairs_by_model.items():
        missing = expected - actual
        if missing:
            preview = sorted(missing)[:3]
            raise DatasetValidationError(f"model {model} has missing scores: {preview}")


def _dcg(labels: list[int], k: int) -> float:
    gains = (0, 1, 3, 7)
    return sum(gains[label] / math.log2(index + 2) for index, label in enumerate(labels[:k]))


def _average(values: Iterable[float | None]) -> float | None:
    defined = [value for value in values if value is not None]
    return sum(defined) / len(defined) if defined else None


def _pairwise_higher_fraction(
    positive_scores: list[float], negative_scores: list[float], tie_credit: float
) -> float | None:
    if not positive_scores or not negative_scores:
        return None
    sorted_negatives = sorted(negative_scores)
    credit = 0.0
    for score in positive_scores:
        lower = bisect_left(sorted_negatives, score)
        equal = bisect_right(sorted_negatives, score) - lower
        credit += lower + tie_credit * equal
    return credit / (len(positive_scores) * len(negative_scores))


def _profile_metrics(ranked: list[tuple[str, float, int]]) -> dict[str, float | None]:
    labels = [label for _, _, label in ranked]
    ideal = sorted(labels, reverse=True)
    ideal_dcg = _dcg(ideal, 10)
    ndcg = _dcg(labels, 10) / ideal_dcg if ideal_dcg else None

    relevant_total = sum(label >= 2 for label in labels)
    relevant_seen = 0
    precision_sum = 0.0
    for rank, label in enumerate(labels, start=1):
        if label >= 2:
            relevant_seen += 1
            precision_sum += relevant_seen / rank
    average_precision = precision_sum / relevant_total if relevant_total else None
    recall = (
        sum(label >= 2 for label in labels[:10]) / relevant_total
        if relevant_total
        else None
    )

    has_exact = any(label == 3 for label in labels)
    first_exact = next((index for index, label in enumerate(labels[:10], 1) if label == 3), None)
    mrr = None if not has_exact else 1 / first_exact if first_exact is not None else 0.0

    positives = [score for _, score, label in ranked if label == 3]
    negatives = [score for _, score, label in ranked if label != 3]
    auc = _pairwise_higher_fraction(positives, negatives, tie_credit=0.5)

    relevant_scores = [score for _, score, label in ranked if label >= 2]
    negative_scores = [score for _, score, label in ranked if label <= 1]
    hard_accuracy = _pairwise_higher_fraction(
        relevant_scores, negative_scores, tie_credit=0.0
    )
    return {
        "ndcgAt10": ndcg,
        "map": average_precision,
        "recallAt10": recall,
        "mrrAt10": mrr,
        "auc": auc,
        "hardNegativeAccuracy": hard_accuracy,
    }


def evaluate_ranking(
    scores: dict[str, dict[str, float]],
    labels: list[dict[str, Any]],
    *,
    split: str,
    label_field: str,
) -> dict[str, Any]:
    if split not in SPLITS:
        raise ValueError(f"invalid split: {split}")
    if label_field not in {"teacherLabel", "humanLabel"}:
        raise ValueError(f"invalid label field: {label_field}")
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for label in labels:
        if label["split"] == split and label[label_field] is not None:
            grouped[label["profileId"]].append(label)

    per_profile: dict[str, dict[str, Any]] = {}
    for profile_id, profile_labels in sorted(grouped.items()):
        if profile_id not in scores:
            raise DatasetValidationError(f"scores missing profile: {profile_id}")
        missing = [label["jobId"] for label in profile_labels if label["jobId"] not in scores[profile_id]]
        if missing:
            raise DatasetValidationError(f"scores missing jobs for {profile_id}: {missing[:3]}")
        ranked = sorted(
            (
                (label["jobId"], float(scores[profile_id][label["jobId"]]), label[label_field])
                for label in profile_labels
            ),
            key=lambda row: (-row[1], row[0]),
        )
        metrics = _profile_metrics(ranked)
        per_profile[profile_id] = {
            **metrics,
            "ranking": [job_id for job_id, _, _ in ranked],
            "candidateCount": len(ranked),
        }

    metric_names = (
        "ndcgAt10",
        "map",
        "recallAt10",
        "mrrAt10",
        "auc",
        "hardNegativeAccuracy",
    )
    metrics = {
        metric: _average(profile[metric] for profile in per_profile.values())
        for metric in metric_names
    }
    return {
        "metrics": metrics,
        "perProfile": per_profile,
        "profileCount": len(per_profile),
        "pairCount": sum(profile["candidateCount"] for profile in per_profile.values()),
    }


def cohen_kappa(label_pairs: Iterable[tuple[int, int]]) -> float | None:
    pairs = list(label_pairs)
    if not pairs:
        return None
    observed = sum(first == second for first, second in pairs) / len(pairs)
    first_counts = Counter(first for first, _ in pairs)
    second_counts = Counter(second for _, second in pairs)
    expected = sum(
        (first_counts[label] / len(pairs)) * (second_counts[label] / len(pairs))
        for label in range(4)
    )
    if expected == 1.0:
        return None
    return (observed - expected) / (1 - expected)


def _percentile(sorted_values: list[float], percentile: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = percentile * (len(sorted_values) - 1)
    lower_index = math.floor(position)
    upper_index = math.ceil(position)
    if lower_index == upper_index:
        return sorted_values[lower_index]
    fraction = position - lower_index
    return sorted_values[lower_index] * (1 - fraction) + sorted_values[upper_index] * fraction


def paired_bootstrap(
    candidate_by_profile: dict[str, float],
    baseline_by_profile: dict[str, float],
    *,
    iterations: int = 2_000,
    seed: int = 42,
) -> dict[str, float | int]:
    if candidate_by_profile.keys() != baseline_by_profile.keys():
        raise ValueError("paired bootstrap profiles must match")
    if not candidate_by_profile:
        raise ValueError("paired bootstrap needs at least one profile")
    if iterations <= 0:
        raise ValueError("iterations must be positive")
    profile_ids = sorted(candidate_by_profile)
    differences = [
        candidate_by_profile[profile_id] - baseline_by_profile[profile_id]
        for profile_id in profile_ids
    ]
    generator = random.Random(seed)
    sampled_means = sorted(
        sum(generator.choice(differences) for _ in differences) / len(differences)
        for _ in range(iterations)
    )
    return {
        "meanDifference": sum(differences) / len(differences),
        "lower95": _percentile(sampled_means, 0.025),
        "upper95": _percentile(sampled_means, 0.975),
        "profileCount": len(profile_ids),
        "iterations": iterations,
        "seed": seed,
    }


def relative_improvement(candidate: float | None, baseline: float | None) -> float | None:
    if candidate is None or baseline is None or baseline == 0:
        return None
    return (candidate - baseline) / baseline


def _improvement_passes(
    candidate: float | None, baseline: float | None, threshold: float
) -> bool:
    if candidate is None or baseline is None:
        return False
    if baseline == 0:
        return candidate > baseline
    return relative_improvement(candidate, baseline) >= threshold


def evaluate_gate(
    *,
    human_label_count: int,
    teacher_human_kappa: float | None,
    candidate_human_metrics: dict[str, float | None],
    token_human_metrics: dict[str, float | None],
    strongest_human_metrics: dict[str, float | None],
    bootstrap: dict[str, float | int] | None,
    official_candidate_sets_valid: bool,
) -> dict[str, Any]:
    candidate_ndcg = candidate_human_metrics.get("ndcgAt10")
    candidate_auc = candidate_human_metrics.get("auc")
    token_ndcg = token_human_metrics.get("ndcgAt10")
    strongest_ndcg = strongest_human_metrics.get("ndcgAt10")
    research_improvement = relative_improvement(candidate_ndcg, strongest_ndcg)
    rule_improvement = relative_improvement(candidate_ndcg, token_ndcg)
    checks = {
        "humanLabelCount": human_label_count >= 300,
        "teacherKappa": teacher_human_kappa is not None and teacher_human_kappa >= 0.6,
        "strongestBaselineImprovement": _improvement_passes(
            candidate_ndcg, strongest_ndcg, 0.05
        ),
        "bootstrapLowerBound": bootstrap is not None and bootstrap.get("lower95", 0) > 0,
        "ndcgThreshold": candidate_ndcg is not None and candidate_ndcg >= 0.8,
        "aucThreshold": candidate_auc is not None and candidate_auc >= 0.85,
        "ruleBaselineImprovement": _improvement_passes(candidate_ndcg, token_ndcg, 0.2),
        "officialCandidateSets": official_candidate_sets_valid,
    }
    if not checks["humanLabelCount"]:
        status = "insufficient_human_labels"
        failed = ["humanLabelCount"]
    elif not checks["teacherKappa"]:
        status = "teacher_untrusted"
        failed = ["teacherKappa"]
    elif not checks["strongestBaselineImprovement"] or not checks["bootstrapLowerBound"]:
        status = "baseline_not_beaten"
        failed = [
            name
            for name in ("strongestBaselineImprovement", "bootstrapLowerBound")
            if not checks[name]
        ]
    elif not all(
        checks[name]
        for name in (
            "ndcgThreshold",
            "aucThreshold",
            "ruleBaselineImprovement",
            "officialCandidateSets",
        )
    ):
        status = "metric_threshold_failed"
        failed = [
            name
            for name in (
                "ndcgThreshold",
                "aucThreshold",
                "ruleBaselineImprovement",
                "officialCandidateSets",
            )
            if not checks[name]
        ]
    else:
        status = "passed"
        failed = []
    return {
        "status": status,
        "failedChecks": failed,
        "checks": checks,
        "humanLabelCount": human_label_count,
        "teacherHumanKappa": teacher_human_kappa,
        "strongestBaselineRelativeImprovement": research_improvement,
        "ruleBaselineRelativeImprovement": rule_improvement,
    }
