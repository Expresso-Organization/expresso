"""LLM 적합도 라벨로 E5+MLP와 cross-encoder를 학습하고 평가한다."""

from __future__ import annotations

import argparse
from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import importlib
import json
import math
from pathlib import Path
import platform
import random
import sys
import time
from typing import Any, Iterable, Sequence


JOB_FIELD_LABELS = (
    ("job_category", "직무"),
    ("expertise_area", "전문 영역"),
    ("years_experience", "경력 조건"),
    ("skills", "기술"),
    ("llm_job_category", "분해된 직무"),
    ("llm_expertise_area", "분해된 전문 영역"),
    ("llm_hard_skills", "필수 기술"),
    ("llm_tools_technologies", "도구 및 기술"),
    ("llm_soft_skills", "소프트 스킬"),
    ("llm_required_years_of_work_experience", "필요 경력 연수"),
    ("llm_required_lowest_diploma", "최소 학력"),
    ("llm_required_languages_spoken", "필요 언어"),
    ("llm_seniority_level", "직급 수준"),
)

E5_MODEL_ID = "intfloat/multilingual-e5-base"
CROSS_ENCODER_MODEL_ID = "BAAI/bge-reranker-v2-m3"
MLP_MODEL_ID = "expresso-e5-mlp-llm-v1"
CROSS_ENCODER_ID = "expresso-bge-cross-encoder-llm-v1"


def _load_stdlib_profile() -> None:
    """동일 디렉터리의 profile.py가 PyTorch의 표준 모듈 import를 가리지 않게 한다."""
    local_profile = str(Path(__file__).with_name("profile.py"))
    module = sys.modules.get("profile")
    if module is not None and getattr(module, "__file__", "") != local_profile:
        return
    script_directory = Path(__file__).parent.resolve()
    original_path = list(sys.path)
    try:
        sys.modules.pop("profile", None)
        sys.path = [
            entry
            for entry in sys.path
            if Path(entry or ".").resolve() != script_directory
        ]
        sys.modules["profile"] = importlib.import_module("profile")
    finally:
        sys.path = original_path


_load_stdlib_profile()


def _non_empty(value: Any) -> bool:
    return value is not None and (not isinstance(value, str) or bool(value.strip()))


def render_profile(profile: dict[str, Any]) -> str:
    """내부 ID와 생성 메타데이터 없이 사용자에게 보이는 기록만 직렬화한다."""
    sections = [f"경력 연차: {profile.get('experienceYears', 0)}년"]
    for index, record in enumerate(profile.get("records", []), 1):
        lines = [f"[기록 {index}]", f"제목: {str(record.get('title', '')).strip()}"]
        properties = record.get("properties") or {}
        for key in sorted(properties):
            value = properties[key]
            if _non_empty(value):
                lines.append(f"{key}: {value}")
        body = str(record.get("bodyMd", "")).strip()
        lines.extend(("본문:", body))
        sections.append("\n".join(lines))
    return "\n\n".join(sections)


def render_record(record: dict[str, Any]) -> str:
    """기록 선택용 텍스트를 만든다."""
    lines = [f"제목: {str(record.get('title', '')).strip()}"]
    for key, value in sorted((record.get("properties") or {}).items()):
        if _non_empty(value):
            lines.append(f"{key}: {value}")
    lines.append(str(record.get("bodyMd", "")).strip())
    return "\n".join(lines)


def build_selected_profile_text(profile: dict[str, Any], record_indices: Sequence[int]) -> str:
    """공고와 가까운 기록만 주어진 순서대로 cross-encoder 입력에 넣는다."""
    records = profile.get("records", [])
    sections = [f"경력 연차: {profile.get('experienceYears', 0)}년"]
    for output_index, record_index in enumerate(record_indices, 1):
        if not 0 <= record_index < len(records):
            raise ValueError(f"record index is out of range: {record_index}")
        sections.append(f"[선택 기록 {output_index}]\n{render_record(records[record_index])}")
    return "\n\n".join(sections)


def render_job(job: dict[str, Any]) -> str:
    """공고 원문 대신 보존된 구조화 필드를 사람이 읽을 수 있는 입력으로 만든다."""
    fields = job.get("fields") or {}
    lines: list[str] = []
    known = {key for key, _ in JOB_FIELD_LABELS}
    for key, label in JOB_FIELD_LABELS:
        value = fields.get(key)
        if _non_empty(value):
            lines.append(f"{label}: {value}")
    for key in sorted(set(fields) - known):
        value = fields[key]
        if _non_empty(value):
            lines.append(f"{key}: {value}")
    return "\n".join(lines)


def _unique_by_id(rows: Sequence[dict[str, Any]], field: str, kind: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        value = str(row.get(field, ""))
        if not value or value in result:
            raise ValueError(f"invalid or duplicate {kind} id: {value}")
        result[value] = row
    return result


def validate_training_inputs(
    profiles: Sequence[dict[str, Any]],
    jobs: Sequence[dict[str, Any]],
    candidates: Sequence[dict[str, Any]],
    labels: Sequence[dict[str, Any]],
) -> dict[str, int]:
    """후보와 라벨이 같은 split의 동일한 pair를 정확히 한 번씩 덮는지 검사한다."""
    profile_by_id = _unique_by_id(profiles, "profileId", "profile")
    job_by_id = _unique_by_id(jobs, "jobId", "job")

    def pair_set(rows: Sequence[dict[str, Any]], kind: str) -> set[tuple[str, str]]:
        pairs: set[tuple[str, str]] = set()
        for row in rows:
            pair = (str(row.get("profileId", "")), str(row.get("jobId", "")))
            if pair in pairs:
                raise ValueError(f"duplicate {kind} pair: {pair[0]}/{pair[1]}")
            if pair[0] not in profile_by_id or pair[1] not in job_by_id:
                raise ValueError(f"unknown {kind} pair: {pair[0]}/{pair[1]}")
            split = row.get("split")
            if split != profile_by_id[pair[0]].get("split") or split != job_by_id[pair[1]].get("split"):
                raise ValueError(f"split differs for {kind} pair: {pair[0]}/{pair[1]}")
            pairs.add(pair)
        return pairs

    candidate_pairs = pair_set(candidates, "candidate")
    label_pairs = pair_set(labels, "label")
    if candidate_pairs != label_pairs:
        raise ValueError("candidate and label pairs differ")
    for row in labels:
        score = row.get("matchScore")
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= score <= 100:
            raise ValueError("matchScore must be a number from 0 to 100")
    return {"profiles": len(profiles), "jobs": len(jobs), "pairs": len(labels)}


def _dcg(relevances: Sequence[float], k: int = 10) -> float:
    return sum(value / math.log2(index + 2) for index, value in enumerate(relevances[:k]))


def _mean(values: Iterable[float]) -> float:
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def ranking_metrics(
    rows: Sequence[dict[str, Any]], *, relevance_threshold: float = 60.0
) -> dict[str, Any]:
    """연속 점수 회귀와 사용자별 후보 순위를 함께 평가한다."""
    if not rows:
        raise ValueError("evaluation rows must not be empty")
    targets = [float(row["target"]) for row in rows]
    predictions = [float(row["prediction"]) for row in rows]
    if any(not math.isfinite(value) for value in targets + predictions):
        raise ValueError("targets and predictions must be finite")

    absolute = [abs(target - prediction) for target, prediction in zip(targets, predictions)]
    squared = [(target - prediction) ** 2 for target, prediction in zip(targets, predictions)]
    try:
        from scipy.stats import spearmanr

        statistic = float(spearmanr(targets, predictions).statistic)
        spearman = statistic if math.isfinite(statistic) else 0.0
    except ImportError:
        spearman = 0.0

    grouped: dict[str, list[tuple[float, float, int]]] = defaultdict(list)
    for index, row in enumerate(rows):
        grouped[str(row["profileId"])].append((float(row["target"]), float(row["prediction"]), index))

    ndcgs: list[float] = []
    pairwise_credit = 0.0
    pairwise_total = 0
    aps: list[float] = []
    reciprocal_ranks: list[float] = []
    recalls: list[float] = []
    for values in grouped.values():
        ranked = sorted(values, key=lambda item: (-item[1], item[2]))
        actual = [item[0] for item in ranked]
        ideal = sorted((item[0] for item in values), reverse=True)
        ideal_dcg = _dcg(ideal)
        ndcgs.append(_dcg(actual) / ideal_dcg if ideal_dcg else 1.0)

        for left in range(len(values)):
            for right in range(left + 1, len(values)):
                target_delta = values[left][0] - values[right][0]
                if target_delta == 0:
                    continue
                prediction_delta = values[left][1] - values[right][1]
                pairwise_total += 1
                pairwise_credit += 1.0 if target_delta * prediction_delta > 0 else 0.5 if prediction_delta == 0 else 0.0

        relevant_total = sum(item[0] >= relevance_threshold for item in values)
        if relevant_total:
            hits = 0
            precision_sum = 0.0
            first_rank = 0
            for rank, item in enumerate(ranked[:10], 1):
                if item[0] >= relevance_threshold:
                    hits += 1
                    precision_sum += hits / rank
                    first_rank = first_rank or rank
            aps.append(precision_sum / relevant_total)
            reciprocal_ranks.append(1.0 / first_rank if first_rank else 0.0)
            recalls.append(hits / relevant_total)

    return {
        "pairs": len(rows),
        "profiles": len(grouped),
        "profilesWithRelevant": len(aps),
        "mae": _mean(absolute),
        "rmse": math.sqrt(_mean(squared)),
        "spearman": spearman,
        "ndcgAt10": _mean(ndcgs),
        "mapAt10": _mean(aps),
        "mrrAt10": _mean(reciprocal_ranks),
        "recallAt10": _mean(recalls),
        "pairwiseAccuracy": pairwise_credit / pairwise_total if pairwise_total else 0.0,
        "pairwiseComparisons": pairwise_total,
    }


def select_top_record_indices(record_embeddings: Any, job_embedding: Any, *, limit: int = 8) -> list[int]:
    """cosine 유사도가 높은 기록을 동점일 때 원래 순서대로 고른다."""
    if limit <= 0:
        return []
    import torch

    records = torch.nn.functional.normalize(record_embeddings.float(), p=2, dim=1)
    job = torch.nn.functional.normalize(job_embedding.float().reshape(1, -1), p=2, dim=1)[0]
    scores = torch.mv(records, job).detach().cpu().tolist()
    return sorted(range(len(scores)), key=lambda index: (-scores[index], index))[:limit]


def pair_features(profile_embeddings: Any, job_embeddings: Any) -> Any:
    """프로필, 공고, 절대 차이, 원소별 곱을 MLP 입력으로 결합한다."""
    if profile_embeddings.shape != job_embeddings.shape:
        raise ValueError("profile and job embeddings must have the same shape")
    import torch

    return torch.cat(
        (
            profile_embeddings,
            job_embeddings,
            torch.abs(profile_embeddings - job_embeddings),
            profile_embeddings * job_embeddings,
        ),
        dim=1,
    )


def affine_calibrate(
    train_scores: Sequence[float],
    train_targets: Sequence[float],
    evaluation_scores: Sequence[float],
) -> list[float]:
    """train split에서 최소제곱 보정을 학습해 평가 점수를 0~100으로 제한한다."""
    if len(train_scores) != len(train_targets) or not train_scores:
        raise ValueError("calibration training scores and targets must have equal non-zero length")
    x_mean = _mean(float(value) for value in train_scores)
    y_mean = _mean(float(value) for value in train_targets)
    variance = sum((float(value) - x_mean) ** 2 for value in train_scores)
    if variance == 0:
        slope = 0.0
    else:
        slope = sum(
            (float(score) - x_mean) * (float(target) - y_mean)
            for score, target in zip(train_scores, train_targets)
        ) / variance
    intercept = y_mean - slope * x_mean
    return [min(100.0, max(0.0, slope * float(value) + intercept)) for value in evaluation_scores]


def group_pairwise_loss(
    predictions: Any,
    targets: Any,
    group_ids: Any,
    *,
    min_delta: float = 5.0,
) -> Any:
    """동일 프로필 안에서 교사 점수 차이가 있는 후보의 상대 순서를 학습한다."""
    import torch

    losses = []
    members: dict[int, list[int]] = defaultdict(list)
    for index, group_id in enumerate(group_ids.detach().cpu().tolist()):
        members[int(group_id)].append(index)
    for indices in members.values():
        for offset, left in enumerate(indices):
            for right in indices[offset + 1 :]:
                delta = targets[left] - targets[right]
                if abs(float(delta)) < min_delta:
                    continue
                direction = torch.sign(delta)
                losses.append(
                    torch.nn.functional.softplus(
                        -direction * (predictions[left] - predictions[right])
                    )
                )
    if not losses:
        return predictions.sum() * 0.0
    return torch.stack(losses).mean()


def _create_mlp(input_dimension: int, hidden_dimension: int, seed: int) -> Any:
    import torch

    torch.manual_seed(seed)
    return torch.nn.Sequential(
        torch.nn.Linear(input_dimension, hidden_dimension),
        torch.nn.GELU(),
        torch.nn.Linear(hidden_dimension, 1),
    )


def _mlp_scores(model: Any, features: Any) -> Any:
    import torch

    return torch.sigmoid(model(features).reshape(-1)) * 100.0


def predict_mlp(model: Any, features: Any, *, device: str) -> Any:
    """MLP logits를 외부 계약인 0~100 점수로 변환한다."""
    model = model.to(device)
    model.eval()
    with __import__("torch").no_grad():
        return _mlp_scores(model, features.to(device)).cpu()


def cross_encoder_scores(logits: Any) -> Any:
    """Cross-Encoder logits를 외부 계약인 0~100 점수로 변환한다."""
    import torch

    return torch.sigmoid(logits.reshape(-1)) * 100.0


def freeze_cross_encoder_layers(model: Any, *, train_last_layers: int) -> dict[str, int]:
    """BGE backbone의 마지막 N개 층과 classifier만 학습 가능하게 한다."""
    if train_last_layers <= 0:
        raise ValueError("train_last_layers must be positive")
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    layers = model.roberta.encoder.layer
    if train_last_layers > len(layers):
        raise ValueError("train_last_layers exceeds encoder layer count")
    for layer in layers[-train_last_layers:]:
        for parameter in layer.parameters():
            parameter.requires_grad_(True)
    for parameter in model.classifier.parameters():
        parameter.requires_grad_(True)
    total = sum(parameter.numel() for parameter in model.parameters())
    trainable = sum(
        parameter.numel() for parameter in model.parameters() if parameter.requires_grad
    )
    return {"totalParameters": total, "trainableParameters": trainable}


def train_mlp(
    train_features: Any,
    train_targets: Any,
    train_group_ids: Any,
    valid_features: Any,
    valid_targets: Any,
    *,
    hidden_dimension: int = 256,
    epochs: int = 60,
    learning_rate: float = 5e-4,
    profile_batch_size: int = 32,
    patience: int = 8,
    pairwise_weight: float = 0.1,
    seed: int = 42,
    device: str = "cuda",
) -> tuple[Any, dict[str, Any]]:
    """프로필 묶음을 유지하며 회귀와 pairwise 순위를 함께 학습한다."""
    import torch

    if not 0 < len(train_features) == len(train_targets) == len(train_group_ids):
        raise ValueError("train tensors must have equal non-zero length")
    if not 0 < len(valid_features) == len(valid_targets):
        raise ValueError("valid tensors must have equal non-zero length")
    if epochs <= 0 or learning_rate <= 0 or profile_batch_size <= 0 or patience <= 0:
        raise ValueError("training hyperparameters must be positive")

    torch.manual_seed(seed)
    if device == "cuda":
        torch.cuda.manual_seed_all(seed)
    model = _create_mlp(train_features.shape[1], hidden_dimension, seed).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
    group_members: dict[int, list[int]] = defaultdict(list)
    for index, value in enumerate(train_group_ids.tolist()):
        group_members[int(value)].append(index)
    unique_groups = sorted(group_members)
    history: list[dict[str, float | int]] = []
    best_state = deepcopy(model.state_dict())
    best_valid = math.inf
    best_epoch = 0
    stale = 0

    for epoch in range(1, epochs + 1):
        order = unique_groups[:]
        random.Random(seed + epoch).shuffle(order)
        model.train()
        train_total = 0.0
        train_count = 0
        for start in range(0, len(order), profile_batch_size):
            indices = [
                index
                for group in order[start : start + profile_batch_size]
                for index in group_members[group]
            ]
            batch_features = train_features[indices].to(device)
            batch_targets = train_targets[indices].float().to(device)
            batch_groups = train_group_ids[indices].to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(batch_features).reshape(-1)
            normalized_predictions = torch.sigmoid(logits)
            regression = torch.nn.functional.mse_loss(
                normalized_predictions, batch_targets / 100.0
            )
            pairwise = group_pairwise_loss(logits, batch_targets, batch_groups)
            loss = regression + pairwise_weight * pairwise
            loss.backward()
            optimizer.step()
            train_total += float(regression.detach()) * len(indices)
            train_count += len(indices)

        model.eval()
        with torch.no_grad():
            valid_predictions = _mlp_scores(model, valid_features.to(device))
            valid_mae = float(
                torch.mean(torch.abs(valid_predictions - valid_targets.float().to(device)))
            )
        history.append(
            {
                "epoch": epoch,
                "trainMseNormalized": train_total / train_count,
                "validMae": valid_mae,
            }
        )
        if valid_mae < best_valid - 1e-6:
            best_valid = valid_mae
            best_epoch = epoch
            best_state = deepcopy(model.state_dict())
            stale = 0
        else:
            stale += 1
            if stale >= patience:
                break
    model.load_state_dict(best_state)
    model.cpu()
    return model, {
        "bestEpoch": best_epoch,
        "bestValidMae": best_valid,
        "epochsRun": len(history),
        "history": history,
    }


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _atomic_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            target.write(
                json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                + "\n"
            )
    temporary.replace(path)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_training_dataset(data_dir: Path, labels_dir: Path) -> dict[str, Any]:
    profiles = _read_jsonl(data_dir / "profiles.jsonl")
    jobs = _read_jsonl(data_dir / "jobs.jsonl")
    candidates = _read_jsonl(data_dir / "candidate-manifest.jsonl")
    labels = _read_jsonl(labels_dir / "suitability-labels.jsonl")
    counts = validate_training_inputs(profiles, jobs, candidates, labels)
    labels_by_pair = {
        (str(row["profileId"]), str(row["jobId"])): row for row in labels
    }
    pairs = []
    for candidate in candidates:
        pair = (str(candidate["profileId"]), str(candidate["jobId"]))
        label = labels_by_pair[pair]
        pairs.append(
            {
                "profileId": pair[0],
                "jobId": pair[1],
                "split": str(candidate["split"]),
                "candidateBucket": str(candidate["candidateBucket"]),
                "matchScore": float(label["matchScore"]),
            }
        )
    return {
        "profiles": profiles,
        "jobs": jobs,
        "pairs": pairs,
        "counts": counts,
        "hashes": {
            "profiles": _sha256(data_dir / "profiles.jsonl"),
            "jobs": _sha256(data_dir / "jobs.jsonl"),
            "candidates": _sha256(data_dir / "candidate-manifest.jsonl"),
            "labels": _sha256(labels_dir / "suitability-labels.jsonl"),
        },
    }


def _metrics_for_predictions(
    pairs: Sequence[dict[str, Any]], predictions: Sequence[float]
) -> dict[str, Any]:
    if len(pairs) != len(predictions):
        raise ValueError("pairs and predictions must have equal length")
    result: dict[str, Any] = {}
    for split in ("valid", "test"):
        rows = [
            {
                "profileId": pair["profileId"],
                "target": pair["matchScore"],
                "prediction": float(prediction),
            }
            for pair, prediction in zip(pairs, predictions)
            if pair["split"] == split
        ]
        result[split] = ranking_metrics(rows)
    return result


def _calibrate_model_scores(
    pairs: Sequence[dict[str, Any]], raw_scores: Sequence[float]
) -> list[float]:
    train_indices = [index for index, pair in enumerate(pairs) if pair["split"] == "train"]
    return affine_calibrate(
        [raw_scores[index] for index in train_indices],
        [pairs[index]["matchScore"] for index in train_indices],
        raw_scores,
    )


def run_lexical_baselines(dataset: dict[str, Any]) -> tuple[dict[str, list[float]], dict[str, Any]]:
    from retrieval_baselines import build_lexical_scores

    profiles = {str(row["profileId"]): render_profile(row) for row in dataset["profiles"]}
    jobs = {str(row["jobId"]): render_job(row) for row in dataset["jobs"]}
    pairs = dataset["pairs"]
    score_maps = build_lexical_scores(
        profiles,
        jobs,
        [(row["profileId"], row["jobId"]) for row in pairs],
    )
    predictions: dict[str, list[float]] = {}
    metrics: dict[str, Any] = {}
    for model in ("word_tfidf", "char_tfidf", "bm25"):
        raw = [score_maps[model][row["profileId"]][row["jobId"]] for row in pairs]
        calibrated = _calibrate_model_scores(pairs, raw)
        predictions[model] = calibrated
        metrics[model] = _metrics_for_predictions(pairs, calibrated)
    return predictions, metrics


def _embedding_cache_key(ids: Sequence[str], texts: Sequence[str], model_path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(str(model_path).encode("utf-8"))
    for identity, text in zip(ids, texts):
        digest.update(identity.encode("utf-8"))
        digest.update(b"\0")
        digest.update(text.encode("utf-8"))
        digest.update(b"\0")
    return digest.hexdigest()


def _cached_embeddings(
    encoder: Any,
    ids: Sequence[str],
    texts: Sequence[str],
    path: Path,
    *,
    profile: bool,
    model_path: Path,
) -> Any:
    import torch

    key = _embedding_cache_key(ids, texts, model_path)
    if path.exists():
        payload = torch.load(path, map_location="cpu", weights_only=True)
        if payload.get("key") == key and payload.get("ids") == list(ids):
            return payload["vectors"]
    vectors = (
        encoder.embed_profiles(list(texts))
        if profile
        else encoder.embed_jobs(list(texts))
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"key": key, "ids": list(ids), "vectors": vectors}, path)
    return vectors


def _pair_embedding_tensors(
    pairs: Sequence[dict[str, Any]],
    profile_vectors: Any,
    job_vectors: Any,
    profile_index: dict[str, int],
    job_index: dict[str, int],
) -> tuple[Any, Any, Any, Any]:
    import torch

    profiles = torch.stack(
        [profile_vectors[profile_index[row["profileId"]]] for row in pairs]
    )
    jobs = torch.stack([job_vectors[job_index[row["jobId"]]] for row in pairs])
    targets = torch.tensor([row["matchScore"] for row in pairs], dtype=torch.float32)
    group_lookup = {
        profile_id: index
        for index, profile_id in enumerate(sorted({row["profileId"] for row in pairs}))
    }
    groups = torch.tensor(
        [group_lookup[row["profileId"]] for row in pairs], dtype=torch.long
    )
    return profiles, jobs, targets, groups


def run_e5_mlp(
    dataset: dict[str, Any],
    *,
    output_dir: Path,
    e5_model_path: Path,
    device: str,
    embedding_batch_size: int,
    hidden_dimension: int,
    epochs: int,
    learning_rate: float,
    patience: int,
    seed: int,
) -> tuple[dict[str, list[float]], dict[str, Any], dict[str, Any]]:
    import torch
    from match_pilot_model import FrozenE5Encoder

    started = time.perf_counter()
    profiles = dataset["profiles"]
    jobs = dataset["jobs"]
    pairs = dataset["pairs"]
    profile_ids = [str(row["profileId"]) for row in profiles]
    job_ids = [str(row["jobId"]) for row in jobs]
    profile_texts = [render_profile(row) for row in profiles]
    job_texts = [render_job(row) for row in jobs]
    encoder = FrozenE5Encoder.from_pretrained(
        device=device,
        model_name=str(e5_model_path),
        batch_size=embedding_batch_size,
    )
    cache = output_dir / "embedding-cache"
    profile_vectors = _cached_embeddings(
        encoder,
        profile_ids,
        profile_texts,
        cache / "profiles.pt",
        profile=True,
        model_path=e5_model_path,
    )
    job_vectors = _cached_embeddings(
        encoder,
        job_ids,
        job_texts,
        cache / "jobs.pt",
        profile=False,
        model_path=e5_model_path,
    )
    profile_index = {identity: index for index, identity in enumerate(profile_ids)}
    job_index = {identity: index for index, identity in enumerate(job_ids)}
    pair_profiles, pair_jobs, targets, groups = _pair_embedding_tensors(
        pairs, profile_vectors, job_vectors, profile_index, job_index
    )
    raw_cosine = (pair_profiles * pair_jobs).sum(dim=1).tolist()
    cosine_predictions = _calibrate_model_scores(pairs, raw_cosine)

    train_indices = [index for index, row in enumerate(pairs) if row["split"] == "train"]
    valid_indices = [index for index, row in enumerate(pairs) if row["split"] == "valid"]
    features = pair_features(pair_profiles, pair_jobs)
    model, learning = train_mlp(
        features[train_indices],
        targets[train_indices],
        groups[train_indices],
        features[valid_indices],
        targets[valid_indices],
        hidden_dimension=hidden_dimension,
        epochs=epochs,
        learning_rate=learning_rate,
        patience=patience,
        seed=seed,
        device=device,
    )
    mlp_predictions = predict_mlp(model, features, device=device).tolist()
    checkpoint = output_dir / "e5-mlp" / "checkpoint.pt"
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model": MLP_MODEL_ID,
            "state": model.state_dict(),
            "embeddingDimension": int(profile_vectors.shape[1]),
            "hiddenDimension": hidden_dimension,
            "e5Model": E5_MODEL_ID,
            "e5ModelPath": str(e5_model_path),
            "output": "matchScore 0-100; not a hiring probability",
        },
        checkpoint,
    )
    metrics = {
        "frozen-e5-cosine": _metrics_for_predictions(pairs, cosine_predictions),
        MLP_MODEL_ID: _metrics_for_predictions(pairs, mlp_predictions),
    }
    runtime = {
        "seconds": round(time.perf_counter() - started, 3),
        "device": device,
        "learning": learning,
        "checkpoint": str(checkpoint),
    }
    predictions = {
        "frozen-e5-cosine": cosine_predictions,
        MLP_MODEL_ID: mlp_predictions,
    }
    return predictions, metrics, {
        "runtime": runtime,
        "profileVectors": profile_vectors,
        "jobVectors": job_vectors,
        "profileIndex": profile_index,
        "jobIndex": job_index,
        "encoder": encoder,
    }


def _write_prediction_rows(
    path: Path,
    pairs: Sequence[dict[str, Any]],
    predictions: dict[str, Sequence[float]],
) -> None:
    rows = []
    for model, values in predictions.items():
        if len(values) != len(pairs):
            raise ValueError(f"prediction count differs for {model}")
        for pair, value in zip(pairs, values):
            rows.append(
                {
                    "model": model,
                    "profileId": pair["profileId"],
                    "jobId": pair["jobId"],
                    "split": pair["split"],
                    "candidateBucket": pair["candidateBucket"],
                    "target": pair["matchScore"],
                    "prediction": round(float(value), 6),
                }
            )
    _atomic_jsonl(path, rows)


def run_e5_experiment(arguments: argparse.Namespace) -> dict[str, Any]:
    import torch

    dataset = load_training_dataset(arguments.data, arguments.labels)
    output = arguments.output
    started = time.perf_counter()
    lexical_predictions, lexical_metrics = run_lexical_baselines(dataset)
    e5_predictions, e5_metrics, state = run_e5_mlp(
        dataset,
        output_dir=output,
        e5_model_path=arguments.e5_model_path,
        device=arguments.device,
        embedding_batch_size=arguments.embedding_batch_size,
        hidden_dimension=arguments.hidden_dimension,
        epochs=arguments.mlp_epochs,
        learning_rate=arguments.mlp_learning_rate,
        patience=arguments.mlp_patience,
        seed=arguments.seed,
    )
    predictions = {**lexical_predictions, **e5_predictions}
    metrics_by_model = {**lexical_metrics, **e5_metrics}
    scores_path = output / "e5-mlp" / "scores.jsonl"
    _write_prediction_rows(scores_path, dataset["pairs"], predictions)
    report = {
        "schemaVersion": "expresso-match-model-evaluation-v1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            **dataset["counts"],
            "splitPairs": dict(
                sorted(
                    {
                        split: sum(row["split"] == split for row in dataset["pairs"])
                        for split in ("train", "valid", "test")
                    }.items()
                )
            ),
            "hashes": dataset["hashes"],
        },
        "models": metrics_by_model,
        "runtime": {
            "seconds": round(time.perf_counter() - started, 3),
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda": torch.version.cuda,
            "device": arguments.device,
            "gpu": torch.cuda.get_device_name(0) if arguments.device == "cuda" else None,
            "e5": state["runtime"],
        },
        "hyperparameters": {
            "seed": arguments.seed,
            "embeddingBatchSize": arguments.embedding_batch_size,
            "hiddenDimension": arguments.hidden_dimension,
            "mlpEpochs": arguments.mlp_epochs,
            "mlpLearningRate": arguments.mlp_learning_rate,
            "mlpPatience": arguments.mlp_patience,
        },
        "artifacts": {
            "scores": str(scores_path),
            "checkpoint": state["runtime"]["checkpoint"],
        },
    }
    metrics_path = output / "e5-mlp" / "metrics.json"
    _atomic_json(metrics_path, report)
    del state["encoder"]
    if arguments.device == "cuda":
        torch.cuda.empty_cache()
    return {"metrics": str(metrics_path), **report}


def prepare_cross_encoder_inputs(
    dataset: dict[str, Any],
    *,
    output_dir: Path,
    e5_model_path: Path,
    device: str,
    embedding_batch_size: int,
    top_records: int,
) -> list[dict[str, Any]]:
    """공고별 E5 cosine 상위 기록을 골라 cross-encoder 입력을 만든다."""
    import torch
    from match_pilot_model import FrozenE5Encoder

    profiles = dataset["profiles"]
    jobs = dataset["jobs"]
    pairs = dataset["pairs"]
    job_ids = [str(row["jobId"]) for row in jobs]
    job_texts = [render_job(row) for row in jobs]
    encoder = FrozenE5Encoder.from_pretrained(
        device=device,
        model_name=str(e5_model_path),
        batch_size=embedding_batch_size,
    )
    cache = output_dir / "embedding-cache"
    job_vectors = _cached_embeddings(
        encoder,
        job_ids,
        job_texts,
        cache / "jobs.pt",
        profile=False,
        model_path=e5_model_path,
    )
    record_ids: list[str] = []
    record_texts: list[str] = []
    record_positions: dict[str, list[int]] = {}
    profile_by_id = {str(profile["profileId"]): profile for profile in profiles}
    for profile in profiles:
        profile_id = str(profile["profileId"])
        positions = []
        for record in profile.get("records", []):
            positions.append(len(record_ids))
            record_ids.append(str(record["recordId"]))
            record_texts.append(render_record(record))
        if not positions:
            raise ValueError(f"profile has no records: {profile_id}")
        record_positions[profile_id] = positions
    record_vectors = _cached_embeddings(
        encoder,
        record_ids,
        record_texts,
        cache / "records.pt",
        profile=True,
        model_path=e5_model_path,
    )
    job_index = {identity: index for index, identity in enumerate(job_ids)}
    rows: list[dict[str, Any]] = []
    selection_rows: list[dict[str, Any]] = []
    for pair in pairs:
        positions = record_positions[pair["profileId"]]
        local_indices = select_top_record_indices(
            record_vectors[positions],
            job_vectors[job_index[pair["jobId"]]],
            limit=top_records,
        )
        selected_record_indices = [positions[index] for index in local_indices]
        profile = profile_by_id[pair["profileId"]]
        rows.append(
            {
                **pair,
                "jobText": job_texts[job_index[pair["jobId"]]],
                "profileText": build_selected_profile_text(profile, local_indices),
            }
        )
        selection_rows.append(
            {
                "profileId": pair["profileId"],
                "jobId": pair["jobId"],
                "selectedRecordIds": [record_ids[index] for index in selected_record_indices],
            }
        )
    _atomic_jsonl(
        output_dir / "cross-encoder" / "selected-records.jsonl", selection_rows
    )
    del encoder
    if device == "cuda":
        torch.cuda.empty_cache()
    return rows


def tokenize_cross_encoder_inputs(
    tokenizer: Any,
    rows: Sequence[dict[str, Any]],
    *,
    max_length: int,
    batch_size: int = 64,
) -> tuple[list[dict[str, list[int]]], dict[str, Any]]:
    """동적 padding에 사용할 pair token과 잘림 통계를 만든다."""
    encodings: list[dict[str, list[int]]] = []
    original_lengths: list[int] = []
    truncated_lengths: list[int] = []
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        jobs = [row["jobText"] for row in batch]
        profiles = [row["profileText"] for row in batch]
        full = tokenizer(jobs, profiles, truncation=False, padding=False)
        encoded = tokenizer(
            jobs,
            profiles,
            truncation="longest_first",
            max_length=max_length,
            padding=False,
        )
        for index in range(len(batch)):
            item = {
                key: encoded[key][index]
                for key in encoded
                if key in {"input_ids", "attention_mask", "token_type_ids"}
            }
            encodings.append(item)
            original_lengths.append(len(full["input_ids"][index]))
            truncated_lengths.append(len(item["input_ids"]))
    ordered = sorted(original_lengths)

    def percentile(fraction: float) -> int:
        return ordered[min(len(ordered) - 1, round((len(ordered) - 1) * fraction))]

    return encodings, {
        "maxLength": max_length,
        "medianOriginalTokens": percentile(0.5),
        "p95OriginalTokens": percentile(0.95),
        "maxOriginalTokens": max(original_lengths),
        "truncatedPairs": sum(length > max_length for length in original_lengths),
        "truncatedFraction": sum(length > max_length for length in original_lengths)
        / len(original_lengths),
        "meanEncodedTokens": sum(truncated_lengths) / len(truncated_lengths),
    }


def _padded_cross_batch(
    tokenizer: Any,
    encodings: Sequence[dict[str, list[int]]],
    indices: Sequence[int],
    *,
    device: str,
) -> dict[str, Any]:
    padded = tokenizer.pad(
        [encodings[index] for index in indices],
        padding=True,
        return_tensors="pt",
    )
    return {key: value.to(device) for key, value in padded.items()}


def predict_cross_encoder(
    model: Any,
    tokenizer: Any,
    encodings: Sequence[dict[str, list[int]]],
    *,
    batch_size: int,
    device: str,
) -> list[float]:
    import torch

    model.eval()
    result: list[float] = []
    enabled = device == "cuda"
    with torch.no_grad():
        for start in range(0, len(encodings), batch_size):
            indices = list(range(start, min(len(encodings), start + batch_size)))
            batch = _padded_cross_batch(
                tokenizer, encodings, indices, device=device
            )
            with torch.amp.autocast(
                device_type="cuda", dtype=torch.bfloat16, enabled=enabled
            ):
                logits = model(**batch).logits.reshape(-1)
            result.extend(cross_encoder_scores(logits).float().cpu().tolist())
    return result


def train_cross_encoder(
    model: Any,
    tokenizer: Any,
    encodings: Sequence[dict[str, list[int]]],
    pairs: Sequence[dict[str, Any]],
    *,
    batch_size: int,
    gradient_accumulation: int,
    epochs: int,
    learning_rate: float,
    patience: int,
    seed: int,
    device: str,
) -> tuple[Any, dict[str, Any]]:
    """0~100 LLM 점수를 sigmoid 회귀로 학습하고 valid MAE로 조기 종료한다."""
    import torch

    train_indices = [index for index, pair in enumerate(pairs) if pair["split"] == "train"]
    valid_indices = [index for index, pair in enumerate(pairs) if pair["split"] == "valid"]
    if not train_indices or not valid_indices:
        raise ValueError("cross-encoder needs train and valid pairs")
    trainable = [parameter for parameter in model.parameters() if parameter.requires_grad]
    if not trainable:
        raise ValueError("cross-encoder has no trainable parameters")
    optimizer = torch.optim.AdamW(trainable, lr=learning_rate)
    model.to(device)
    enabled = device == "cuda"
    best_state = {
        name: value.detach().cpu().clone()
        for name, value in model.state_dict().items()
        if name in {key for key, parameter in model.named_parameters() if parameter.requires_grad}
    }
    best_valid = math.inf
    best_epoch = 0
    stale = 0
    history: list[dict[str, Any]] = []
    optimizer_steps = 0
    for epoch in range(1, epochs + 1):
        order = train_indices[:]
        random.Random(seed + epoch).shuffle(order)
        model.train()
        optimizer.zero_grad(set_to_none=True)
        total = 0.0
        count = 0
        for batch_number, start in enumerate(range(0, len(order), batch_size), 1):
            indices = order[start : start + batch_size]
            batch = _padded_cross_batch(
                tokenizer, encodings, indices, device=device
            )
            targets = torch.tensor(
                [pairs[index]["matchScore"] / 100.0 for index in indices],
                dtype=torch.float32,
                device=device,
            )
            with torch.amp.autocast(
                device_type="cuda", dtype=torch.bfloat16, enabled=enabled
            ):
                logits = model(**batch).logits.reshape(-1)
                loss = torch.nn.functional.mse_loss(
                    torch.sigmoid(logits).float(), targets
                )
            (loss / gradient_accumulation).backward()
            total += float(loss.detach()) * len(indices)
            count += len(indices)
            if batch_number % gradient_accumulation == 0 or start + batch_size >= len(order):
                torch.nn.utils.clip_grad_norm_(trainable, 1.0)
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)
                optimizer_steps += 1
        valid_encodings = [encodings[index] for index in valid_indices]
        valid_predictions = predict_cross_encoder(
            model,
            tokenizer,
            valid_encodings,
            batch_size=batch_size,
            device=device,
        )
        valid_mae = _mean(
            abs(prediction - pairs[index]["matchScore"])
            for prediction, index in zip(valid_predictions, valid_indices)
        )
        history.append(
            {
                "epoch": epoch,
                "trainMseNormalized": total / count,
                "validMae": valid_mae,
                "optimizerSteps": optimizer_steps,
            }
        )
        if valid_mae < best_valid - 1e-6:
            best_valid = valid_mae
            best_epoch = epoch
            trainable_names = {
                name for name, parameter in model.named_parameters() if parameter.requires_grad
            }
            best_state = {
                name: value.detach().cpu().clone()
                for name, value in model.state_dict().items()
                if name in trainable_names
            }
            stale = 0
        else:
            stale += 1
            if stale >= patience:
                break
    current = model.state_dict()
    current.update({name: value.to(current[name].device) for name, value in best_state.items()})
    model.load_state_dict(current)
    return model, {
        "bestEpoch": best_epoch,
        "bestValidMae": best_valid,
        "epochsRun": len(history),
        "optimizerSteps": optimizer_steps,
        "history": history,
    }


def run_cross_encoder_experiment(arguments: argparse.Namespace) -> dict[str, Any]:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    started = time.perf_counter()
    dataset = load_training_dataset(arguments.data, arguments.labels)
    rows = prepare_cross_encoder_inputs(
        dataset,
        output_dir=arguments.output,
        e5_model_path=arguments.e5_model_path,
        device=arguments.device,
        embedding_batch_size=arguments.embedding_batch_size,
        top_records=arguments.top_records,
    )
    tokenizer = AutoTokenizer.from_pretrained(
        str(arguments.cross_model_path), local_files_only=True
    )
    encodings, length_stats = tokenize_cross_encoder_inputs(
        tokenizer, rows, max_length=arguments.max_length
    )
    model = AutoModelForSequenceClassification.from_pretrained(
        str(arguments.cross_model_path), local_files_only=True
    )
    model.to(arguments.device)
    zero_shot_raw = predict_cross_encoder(
        model,
        tokenizer,
        encodings,
        batch_size=arguments.cross_batch_size,
        device=arguments.device,
    )
    zero_shot_predictions = _calibrate_model_scores(
        dataset["pairs"], zero_shot_raw
    )
    parameter_counts = freeze_cross_encoder_layers(
        model, train_last_layers=arguments.train_last_layers
    )
    model, learning = train_cross_encoder(
        model,
        tokenizer,
        encodings,
        dataset["pairs"],
        batch_size=arguments.cross_batch_size,
        gradient_accumulation=arguments.gradient_accumulation,
        epochs=arguments.cross_epochs,
        learning_rate=arguments.cross_learning_rate,
        patience=arguments.cross_patience,
        seed=arguments.seed,
        device=arguments.device,
    )
    predictions = predict_cross_encoder(
        model,
        tokenizer,
        encodings,
        batch_size=arguments.cross_batch_size,
        device=arguments.device,
    )
    model_dir = arguments.output / "cross-encoder"
    checkpoint = model_dir / "trainable-state.pt"
    trainable_names = {
        name for name, parameter in model.named_parameters() if parameter.requires_grad
    }
    torch.save(
        {
            "model": CROSS_ENCODER_ID,
            "baseModel": CROSS_ENCODER_MODEL_ID,
            "baseModelPath": str(arguments.cross_model_path),
            "trainableState": {
                name: value.detach().cpu()
                for name, value in model.state_dict().items()
                if name in trainable_names
            },
            "trainLastLayers": arguments.train_last_layers,
            "maxLength": arguments.max_length,
            "topRecords": arguments.top_records,
            "output": "matchScore 0-100; not a hiring probability",
        },
        checkpoint,
    )
    prediction_maps = {
        "bge-reranker-v2-m3-zero-shot": zero_shot_predictions,
        CROSS_ENCODER_ID: predictions,
    }
    scores_path = model_dir / "scores.jsonl"
    _write_prediction_rows(scores_path, dataset["pairs"], prediction_maps)
    metrics_by_model = {
        model_id: _metrics_for_predictions(dataset["pairs"], values)
        for model_id, values in prediction_maps.items()
    }
    report = {
        "schemaVersion": "expresso-cross-encoder-evaluation-v1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "dataset": {**dataset["counts"], "hashes": dataset["hashes"]},
        "models": metrics_by_model,
        "inputLengths": length_stats,
        "parameters": parameter_counts,
        "learning": learning,
        "runtime": {
            "seconds": round(time.perf_counter() - started, 3),
            "device": arguments.device,
            "gpu": torch.cuda.get_device_name(0) if arguments.device == "cuda" else None,
            "torch": torch.__version__,
            "cuda": torch.version.cuda,
        },
        "hyperparameters": {
            "seed": arguments.seed,
            "topRecords": arguments.top_records,
            "maxLength": arguments.max_length,
            "batchSize": arguments.cross_batch_size,
            "gradientAccumulation": arguments.gradient_accumulation,
            "epochs": arguments.cross_epochs,
            "learningRate": arguments.cross_learning_rate,
            "patience": arguments.cross_patience,
            "trainLastLayers": arguments.train_last_layers,
        },
        "artifacts": {"scores": str(scores_path), "checkpoint": str(checkpoint)},
    }
    metrics_path = model_dir / "metrics.json"
    _atomic_json(metrics_path, report)
    return {"metrics": str(metrics_path), **report}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--mode", choices=("e5", "cross", "all"), default="all")
    parser.add_argument(
        "--e5-model-path",
        type=Path,
        default=Path(
            r"C:\Users\parkm\.cache\huggingface\hub\models--intfloat--multilingual-e5-base\snapshots\d128750597153bb5987e10b1c3493a34e5a4502a"
        ),
    )
    parser.add_argument(
        "--cross-model-path",
        type=Path,
        default=Path(
            r"C:\Users\parkm\.cache\huggingface\hub\models--BAAI--bge-reranker-v2-m3\snapshots\953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e"
        ),
    )
    parser.add_argument("--device", choices=("cuda", "cpu"), default="cuda")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--embedding-batch-size", type=int, default=32)
    parser.add_argument("--hidden-dimension", type=int, default=256)
    parser.add_argument("--mlp-epochs", type=int, default=60)
    parser.add_argument("--mlp-learning-rate", type=float, default=5e-4)
    parser.add_argument("--mlp-patience", type=int, default=8)
    parser.add_argument("--top-records", type=int, default=8)
    parser.add_argument("--max-length", type=int, default=1536)
    parser.add_argument("--cross-batch-size", type=int, default=2)
    parser.add_argument("--gradient-accumulation", type=int, default=4)
    parser.add_argument("--cross-epochs", type=int, default=3)
    parser.add_argument("--cross-learning-rate", type=float, default=2e-5)
    parser.add_argument("--cross-patience", type=int, default=2)
    parser.add_argument("--train-last-layers", type=int, default=4)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    if arguments.device == "cuda":
        import torch

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested but is not available")
    if arguments.mode == "e5":
        result = run_e5_experiment(arguments)
    elif arguments.mode == "cross":
        result = run_cross_encoder_experiment(arguments)
    else:
        e5_result = run_e5_experiment(arguments)
        cross_result = run_cross_encoder_experiment(arguments)
        result = {"metrics": [e5_result["metrics"], cross_result["metrics"]]}
    print(json.dumps({"metrics": result["metrics"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
