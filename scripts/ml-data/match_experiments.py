"""적합도 모델 본 실험: 인코더 비교 · Bi-Encoder+MLP 학습 · Cross-Encoder와 모델 B 평가.

설계서 4.4의 모델 생성 단계와 9.2의 지표를 `fit-v1` 데이터로 실행한다. 파일럿
`llm_suitability_train.py`의 렌더러 · MLP 학습 · Cross-Encoder 추론 함수를 그대로 쓴다.

    token-stats  인코더별 토큰 길이와 정할 최대 길이 (GPU 불필요)
    encoders     인코더 4종 × 같은 MLP. 검증 분할만 비교한다
    train-bi     정한 인코더로 학습하고 평가 분할을 한 번 평가한다 → bi-v1-NNN/
    eval-cross   파일럿 방식으로 학습한 Cross-Encoder의 모델 A 지표와 모델 B 평가 → cross-v1-NNN/

평가 분할은 `train-bi`와 `eval-cross`에서만 연다. 검증 분할을 보고 인코더와 설정을 정한 뒤
평가 분할을 보는 순서를 지켜야 평가가 검증이 되지 않는다(설계서 4.4 5단계).
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import asdict
from datetime import datetime, timezone
import json
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import time
from typing import Any, Callable, Sequence


sys.path.insert(0, str(Path(__file__).parent))

import llm_suitability_train as pilot  # noqa: E402  표준 profile 모듈 가림을 먼저 푼다
from match_encoders import ENCODERS, EncoderSpec, SentenceEncoder, choose_max_length, count_tokens, length_summary, prompt_for  # noqa: E402
from match_evaluation import (  # noqa: E402
    RELEVANCE_THRESHOLD,
    build_metadata,
    next_version,
    pairwise_accuracy,
    profile_mae,
    profile_ndcg,
    record_ndcg,
    record_relevance,
    roc_curve,
    rule_requirement_labels,
    rule_requirements,
    screening_recall_curve,
)
from ranking_evaluation import paired_bootstrap  # noqa: E402


DATASET_VERSION = "v1"
RULE_SCRIPT = Path(__file__).with_name("rule_baselines.mjs")
# 파일럿 리포트와 설계서 9.2 표가 쓴 반복 수다. 같은 값이어야 구간을 나란히 읽을 수 있다.
BOOTSTRAP_ITERATIONS = 20_000
RULE_MODEL = "rule-calculateExplainableMatch"
RULE_MATERIALS = "rule-rankMaterials"
# 규칙 함수가 요건을 하나도 읽지 못한 공고(null)는 서비스에서 점수가 없다. 순위에서는 맨 뒤다.
RULE_NULL_RANK_SCORE = -1.0


# ---------------------------------------------------------------- 공용


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _git_commit() -> str | None:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], check=True, capture_output=True, text=True, cwd=Path(__file__).parent).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def _runtime(device: str) -> dict[str, Any]:
    import torch

    return {
        "python": platform.python_version(),
        "torch": torch.__version__,
        "cuda": torch.version.cuda,
        "device": device,
        "gpu": torch.cuda.get_device_name(0) if device == "cuda" else None,
    }


def load_labels(labels_dir: Path) -> list[dict[str, Any]]:
    return pilot._read_jsonl(labels_dir / "suitability-labels.jsonl")


def _texts(dataset: dict[str, Any]) -> tuple[list[str], list[str], list[str], list[str]]:
    profile_ids = [str(row["profileId"]) for row in dataset["profiles"]]
    job_ids = [str(row["jobId"]) for row in dataset["jobs"]]
    return (
        profile_ids,
        [pilot.render_profile(row) for row in dataset["profiles"]],
        job_ids,
        [pilot.render_job(row) for row in dataset["jobs"]],
    )


def _rows(pairs: Sequence[dict[str, Any]], predictions: Sequence[float | None], split: str) -> list[dict[str, Any]]:
    return [
        {"profileId": pair["profileId"], "jobId": pair["jobId"], "target": pair["matchScore"], "prediction": prediction, "candidateBucket": pair["candidateBucket"]}
        for pair, prediction in zip(pairs, predictions)
        if pair["split"] == split
    ]


def split_metrics(pairs: Sequence[dict[str, Any]], predictions: Sequence[float | None], split: str, *, roc_points: bool) -> dict[str, Any]:
    """설계서 9.2 지표. null 예측(규칙 함수)은 순위에서 맨 뒤에 두고 MAE에서는 뺀다."""
    rows = _rows(pairs, predictions, split)
    nulls = [row for row in rows if row["prediction"] is None]
    ranked = [{**row, "prediction": RULE_NULL_RANK_SCORE if row["prediction"] is None else float(row["prediction"])} for row in rows]
    metrics = pilot.ranking_metrics(ranked, relevance_threshold=RELEVANCE_THRESHOLD)
    scored = [row for row in rows if row["prediction"] is not None]
    if nulls:
        errors = [abs(float(row["target"]) - float(row["prediction"])) for row in scored]
        metrics["mae"] = sum(errors) / len(errors) if errors else None
        metrics["rmse"] = (sum(error * error for error in errors) / len(errors)) ** 0.5 if errors else None
    metrics["nullPredictions"] = len(nulls)
    metrics["pairwiseMinGap5"] = pairwise_accuracy(ranked)
    roc = roc_curve([row["target"] for row in ranked], [row["prediction"] for row in ranked])
    metrics["roc"] = roc if roc_points else {key: value for key, value in roc.items() if key != "points"}
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in scored:
        buckets[row["candidateBucket"]].append(abs(float(row["target"]) - float(row["prediction"])))
    metrics["maeByBucket"] = {bucket: sum(values) / len(values) for bucket, values in sorted(buckets.items())}
    return metrics


def bootstrap_against(
    pairs: Sequence[dict[str, Any]], candidate: Sequence[float], baseline: Sequence[float | None], split: str = "test"
) -> dict[str, Any]:
    """평가 프로필 단위 paired bootstrap. 차이는 후보 − baseline이다."""
    candidate_rows = _rows(pairs, candidate, split)
    baseline_rows = [{**row, "prediction": RULE_NULL_RANK_SCORE if row["prediction"] is None else row["prediction"]} for row in _rows(pairs, baseline, split)]
    result = {"ndcgAt10": paired_bootstrap(profile_ndcg(candidate_rows), profile_ndcg(baseline_rows), iterations=BOOTSTRAP_ITERATIONS)}
    # MAE는 baseline 점수가 있는 쌍끼리만 비교한다.
    scored = {(row["profileId"], row["jobId"]) for row in _rows(pairs, baseline, split) if row["prediction"] is not None}
    candidate_mae = profile_mae([row for row in candidate_rows if (row["profileId"], row["jobId"]) in scored])
    baseline_mae = profile_mae([row for row in baseline_rows if (row["profileId"], row["jobId"]) in scored])
    if candidate_mae:
        result["mae"] = paired_bootstrap(candidate_mae, baseline_mae, iterations=BOOTSTRAP_ITERATIONS)
    return result


def run_rule(mode: str, requests: Sequence[dict[str, Any]], *, node: str = "node") -> list[dict[str, Any]]:
    """서비스 규칙 함수(TS)를 Node로 부른다. @expresso/contracts dist가 있어야 한다."""
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "requests.jsonl"
        target = Path(directory) / "results.jsonl"
        pilot._atomic_jsonl(source, requests)
        subprocess.run([node, str(RULE_SCRIPT), mode, str(source), str(target)], check=True, capture_output=True, text=True)
        return pilot._read_jsonl(target)


def rule_match_scores(dataset: dict[str, Any], pairs: Sequence[tuple[str, str]], *, node: str) -> list[float | None]:
    profiles = {str(row["profileId"]): row for row in dataset["profiles"]}
    jobs = {str(row["jobId"]): row for row in dataset["jobs"]}
    requests = [
        {
            "id": index,
            "requirements": rule_requirements(jobs[job_id]),
            "recordText": pilot.render_profile(profiles[profile_id]),
            "careerYears": float(profiles[profile_id].get("experienceYears") or 0),
        }
        for index, (profile_id, job_id) in enumerate(pairs)
    ]
    results = {row["id"]: row["score"] for row in run_rule("match", requests, node=node)}
    return [results[index] for index in range(len(requests))]


# ---------------------------------------------------------------- 인코더


def load_encoder(key: str, dataset: dict[str, Any], arguments: argparse.Namespace) -> tuple[SentenceEncoder, dict[str, Any]]:
    """인코더를 올리고 최대 길이를 데이터에서 정한다."""
    spec = ENCODERS[key]
    encoder = SentenceEncoder.load(spec, device=arguments.device, batch_size=arguments.embedding_batch_size, max_length=spec.model_limit, model_path=arguments.encoder_path)
    _, profile_texts, _, job_texts = _texts(dataset)
    profile_lengths = encoder.token_lengths(profile_texts, role="profile")
    job_lengths = encoder.token_lengths(job_texts, role="job")
    max_length = choose_max_length(spec, profile_lengths + job_lengths)
    encoder.set_max_length(max_length)
    return encoder, {"profiles": length_summary(profile_lengths, max_length), "jobs": length_summary(job_lengths, max_length)}


def embed_dataset(encoder: SentenceEncoder, dataset: dict[str, Any], cache_root: Path) -> tuple[Any, Any, dict[str, int], dict[str, int]]:
    profile_ids, profile_texts, job_ids, job_texts = _texts(dataset)
    identity = encoder.spec.cache_identity(encoder.max_length)
    cache = cache_root / f"{encoder.spec.key}-{identity}"
    # 캐시 키에 인코더 · prompt · 최대 길이를 넣는다. 빠지면 다른 인코더가 E5 벡터를 읽는다.
    profile_vectors = pilot._cached_embeddings(encoder, profile_ids, profile_texts, cache / "profiles.pt", profile=True, model_path=Path(identity))
    job_vectors = pilot._cached_embeddings(encoder, job_ids, job_texts, cache / "jobs.pt", profile=False, model_path=Path(identity))
    return (
        profile_vectors,
        job_vectors,
        {identity_: index for index, identity_ in enumerate(profile_ids)},
        {identity_: index for index, identity_ in enumerate(job_ids)},
    )


def fit_mlp(dataset: dict[str, Any], vectors: tuple[Any, Any, dict[str, int], dict[str, int]], arguments: argparse.Namespace) -> tuple[Any, dict[str, Any], Any, list[float]]:
    """파일럿과 같은 MLP · 손실 · 조기 종료(설계서 4.3)로 학습한다."""
    profile_vectors, job_vectors, profile_index, job_index = vectors
    pairs = dataset["pairs"]
    pair_profiles, pair_jobs, targets, groups = pilot._pair_embedding_tensors(pairs, profile_vectors, job_vectors, profile_index, job_index)
    features = pilot.pair_features(pair_profiles, pair_jobs)
    train = [index for index, row in enumerate(pairs) if row["split"] == "train"]
    valid = [index for index, row in enumerate(pairs) if row["split"] == "valid"]
    model, learning = pilot.train_mlp(
        features[train],
        targets[train],
        groups[train],
        features[valid],
        targets[valid],
        hidden_dimension=arguments.hidden_dimension,
        epochs=arguments.mlp_epochs,
        learning_rate=arguments.mlp_learning_rate,
        patience=arguments.mlp_patience,
        seed=arguments.seed,
        device=arguments.device,
    )
    cosine = pilot._calibrate_model_scores(pairs, (pair_profiles * pair_jobs).sum(dim=1).tolist())
    return model, learning, features, cosine


def _free(device: str) -> None:
    import gc

    gc.collect()
    if device == "cuda":
        import torch

        torch.cuda.empty_cache()


# ---------------------------------------------------------------- 명령


def cmd_token_stats(arguments: argparse.Namespace) -> dict[str, Any]:
    from transformers import AutoTokenizer

    dataset = pilot.load_training_dataset(arguments.data, arguments.labels)
    _, profile_texts, _, job_texts = _texts(dataset)
    report: dict[str, Any] = {"createdAt": _now(), "encoders": {}}
    for key in arguments.encoders:
        spec = ENCODERS[key]
        tokenizer = AutoTokenizer.from_pretrained(arguments.encoder_path or spec.model_id)
        profile_lengths = count_tokens(tokenizer, prompt_for(spec, "profile"), profile_texts)
        job_lengths = count_tokens(tokenizer, prompt_for(spec, "job"), job_texts)
        max_length = choose_max_length(spec, profile_lengths + job_lengths)
        report["encoders"][key] = {
            "modelId": spec.model_id,
            "modelLimit": spec.model_limit,
            "profiles": length_summary(profile_lengths, max_length),
            "jobs": length_summary(job_lengths, max_length),
        }
    pilot._atomic_json(arguments.output / "token-stats.json", report)
    return report


def cmd_encoders(arguments: argparse.Namespace) -> dict[str, Any]:
    """인코더 4종 비교. 검증 분할만 연다. 인코더 하나가 끝날 때마다 파일을 쓴다."""
    dataset = pilot.load_training_dataset(arguments.data, arguments.labels)
    path = arguments.output / "encoder-comparison.json"
    report: dict[str, Any] = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"split": "valid", "rows": {}}
    report["dataset"] = {**dataset["counts"], "hashes": dataset["hashes"]}
    for key in arguments.encoders:
        started = time.perf_counter()
        encoder, lengths = load_encoder(key, dataset, arguments)
        vectors = embed_dataset(encoder, dataset, arguments.output / "embedding-cache")
        model, learning, features, cosine = fit_mlp(dataset, vectors, arguments)
        valid = [index for index, row in enumerate(dataset["pairs"]) if row["split"] == "valid"]
        scores = pilot.predict_mlp(model, features[valid], device=arguments.device).tolist()
        predictions: list[float | None] = [None] * len(dataset["pairs"])
        for index, score in zip(valid, scores):
            predictions[index] = score
        report["rows"][key] = {
            "modelId": encoder.spec.model_id,
            "spec": asdict(encoder.spec),
            "inputLengths": lengths,
            "embedding": encoder.runs,
            "embeddingDimension": int(vectors[0].shape[1]),
            "mlp": split_metrics(dataset["pairs"], predictions, "valid", roc_points=False),
            "frozenCosine": split_metrics(dataset["pairs"], cosine, "valid", roc_points=False),
            "learning": {key_: value for key_, value in learning.items() if key_ != "history"},
            "seconds": round(time.perf_counter() - started, 3),
            "runtime": _runtime(arguments.device),
        }
        report["updatedAt"] = _now()
        pilot._atomic_json(path, report)
        del encoder, model, features, vectors
        _free(arguments.device)
    return report


def screening(dataset: dict[str, Any], model: Any, vectors: tuple[Any, Any, dict[str, int], dict[str, int]], *, device: str, node: str) -> dict[str, Any]:
    """평가 프로필마다 평가 분할 공고 전체를 채점한다(설계서 9.2 Recall@K 평가 조건)."""
    profile_vectors, job_vectors, profile_index, job_index = vectors
    profiles = sorted(str(row["profileId"]) for row in dataset["profiles"] if row["split"] == "test")
    jobs = sorted(str(row["jobId"]) for row in dataset["jobs"] if row["split"] == "test")
    pool = job_vectors[[job_index[job_id] for job_id in jobs]]
    relevant: dict[str, set[str]] = defaultdict(set)
    for pair in dataset["pairs"]:
        if pair["split"] == "test" and pair["matchScore"] >= RELEVANCE_THRESHOLD:
            relevant[pair["profileId"]].add(pair["jobId"])
    mlp: dict[str, list[tuple[str, float]]] = {}
    cosine: dict[str, list[tuple[str, float]]] = {}
    for profile_id in profiles:
        vector = profile_vectors[profile_index[profile_id]].reshape(1, -1).expand(len(jobs), -1)
        features = pilot.pair_features(vector, pool)
        mlp[profile_id] = list(zip(jobs, pilot.predict_mlp(model, features, device=device).tolist()))
        cosine[profile_id] = list(zip(jobs, (vector * pool).sum(dim=1).tolist()))
    pairs = [(profile_id, job_id) for profile_id in profiles for job_id in jobs]
    rule_scores = rule_match_scores(dataset, pairs, node=node)
    rule: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for (profile_id, job_id), score in zip(pairs, rule_scores):
        rule[profile_id].append((job_id, RULE_NULL_RANK_SCORE if score is None else float(score)))
    return {
        "pool": {"profiles": len(profiles), "jobs": len(jobs)},
        "mlp": screening_recall_curve(mlp, relevant),
        "frozenCosine": screening_recall_curve(cosine, relevant),
        RULE_MODEL: {**screening_recall_curve(rule, relevant), "nullScores": sum(score is None for score in rule_scores)},
    }


def cmd_train_bi(arguments: argparse.Namespace) -> dict[str, Any]:
    import torch

    started = time.perf_counter()
    dataset = pilot.load_training_dataset(arguments.data, arguments.labels)
    labels = load_labels(arguments.labels)
    version = next_version(arguments.output, "bi", DATASET_VERSION)
    directory = arguments.output / version
    encoder, lengths = load_encoder(arguments.encoder, dataset, arguments)
    vectors = embed_dataset(encoder, dataset, arguments.output / "embedding-cache")
    model, learning, features, cosine = fit_mlp(dataset, vectors, arguments)
    pairs = dataset["pairs"]
    mlp = pilot.predict_mlp(model, features, device=arguments.device).tolist()
    lexical, _ = pilot.run_lexical_baselines(dataset)
    rule = rule_match_scores(dataset, [(row["profileId"], row["jobId"]) for row in pairs], node=arguments.node)
    model_id = f"expresso-{arguments.encoder}-mlp-{DATASET_VERSION}"
    predictions: dict[str, Sequence[float | None]] = {model_id: mlp, "frozen-cosine": cosine, **lexical, RULE_MODEL: rule}
    checkpoint = directory / "checkpoint.pt"
    directory.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model": model_id,
            "state": model.state_dict(),
            "embeddingDimension": int(vectors[0].shape[1]),
            "hiddenDimension": arguments.hidden_dimension,
            "encoder": asdict(encoder.spec),
            "maxLength": encoder.max_length,
            "output": "matchScore 0-100; not a hiring probability",
        },
        checkpoint,
    )
    pilot._write_prediction_rows(directory / "scores.jsonl", pairs, {name: [RULE_NULL_RANK_SCORE if value is None else value for value in values] for name, values in predictions.items()})
    metrics = {
        "schemaVersion": "expresso-match-model-metrics-v1",
        "version": version,
        "createdAt": _now(),
        "models": {
            name: {
                "valid": split_metrics(pairs, values, "valid", roc_points=False),
                "test": split_metrics(pairs, values, "test", roc_points=True),
            }
            for name, values in predictions.items()
        },
        "comparisons": {
            f"{model_id} - {baseline}": bootstrap_against(pairs, mlp, predictions[baseline])
            for baseline in (RULE_MODEL, "char_tfidf", "frozen-cosine")
        },
        "screeningRecall": screening(dataset, model, vectors, device=arguments.device, node=arguments.node),
        "inputLengths": lengths,
        "embedding": encoder.runs,
        "learning": learning,
        "runtime": {**_runtime(arguments.device), "seconds": round(time.perf_counter() - started, 3)},
    }
    pilot._atomic_json(directory / "metrics.json", metrics)
    pilot._atomic_json(
        directory / "metadata.json",
        build_metadata(
            version=version,
            dataset_version=f"fit-{DATASET_VERSION}",
            encoder=encoder.spec.model_id,
            labels=labels,
            hashes=dataset["hashes"],
            trained_at=_now(),
            code_commit=_git_commit(),
            extra={
                "model": model_id,
                "maxLength": encoder.max_length,
                "hyperparameters": {
                    "seed": arguments.seed,
                    "hiddenDimension": arguments.hidden_dimension,
                    "mlpEpochs": arguments.mlp_epochs,
                    "mlpLearningRate": arguments.mlp_learning_rate,
                    "mlpPatience": arguments.mlp_patience,
                    "embeddingBatchSize": arguments.embedding_batch_size,
                },
            },
        ),
    )
    return {"version": version, "directory": str(directory)}


def load_cross_scorer(base_model: str, checkpoint: Path, *, device: str, batch_size: int) -> tuple[Callable[[Sequence[dict[str, str]]], tuple[list[float], dict[str, Any]]], dict[str, Any]]:
    """파일럿 Cross-Encoder: 기반 모델에 학습한 층 가중치만 덮어쓴다."""
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    payload = torch.load(checkpoint, map_location="cpu", weights_only=True)
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    model = AutoModelForSequenceClassification.from_pretrained(base_model)
    state = model.state_dict()
    unknown = set(payload["trainableState"]) - set(state)
    if unknown:
        raise ValueError(f"checkpoint has unknown parameters: {sorted(unknown)[:3]}")
    state.update(payload["trainableState"])
    model.load_state_dict(state)
    model.to(device)
    max_length = int(payload["maxLength"])

    def score(rows: Sequence[dict[str, str]]) -> tuple[list[float], dict[str, Any]]:
        encodings, stats = pilot.tokenize_cross_encoder_inputs(tokenizer, list(rows), max_length=max_length)
        return pilot.predict_cross_encoder(model, tokenizer, encodings, batch_size=batch_size, device=device), stats

    return score, {"model": payload.get("model"), "baseModel": base_model, "maxLength": max_length, "topRecords": payload.get("topRecords")}


def model_b(
    dataset: dict[str, Any],
    labels: Sequence[dict[str, Any]],
    split: str,
    *,
    cross: Callable[[Sequence[dict[str, str]]], tuple[list[float], dict[str, Any]]],
    encoder: SentenceEncoder,
    node: str,
) -> dict[str, Any]:
    """설계서 9.2 모델 B: (공고, 기록 1건) 점수 순서를 교사의 기록 단위 판정과 비교한다.

    Cross-Encoder 입력은 학습 때와 같은 틀(`build_selected_profile_text`)에 기록 하나만 넣는다.
    학습 때는 기록 최대 8개 묶음이었으므로, 이 시험이 그 입력 단위 차이의 영향을 본다.
    """
    profiles = {str(row["profileId"]): row for row in dataset["profiles"]}
    jobs = {str(row["jobId"]): row for row in dataset["jobs"]}
    selected = [label for label in labels if label.get("split") == split]
    relevance: list[dict[str, float]] = []
    cross_rows: list[dict[str, str]] = []
    owners: list[tuple[int, str]] = []
    material_requests: list[dict[str, Any]] = []
    record_texts: list[str] = []
    job_texts: list[str] = []
    for group_index, label in enumerate(selected):
        profile = profiles[str(label["profileId"])]
        job = jobs[str(label["jobId"])]
        records = profile.get("records", [])
        record_ids = [str(record["recordId"]) for record in records]
        relevance.append(record_relevance(label, record_ids))
        job_text = pilot.render_job(job)
        job_texts.append(job_text)
        for record_index, record_id in enumerate(record_ids):
            cross_rows.append({"jobText": job_text, "profileText": pilot.build_selected_profile_text(profile, [record_index])})
            owners.append((group_index, record_id))
            record_texts.append(pilot.render_record(records[record_index]))
        material_requests.append(
            {
                "id": group_index,
                "requirementLabels": rule_requirement_labels(job),
                "records": [
                    {"id": record_id, "title": str(record.get("title", "")), "status": "organized", "text": pilot.render_record(record)}
                    for record_id, record in zip(record_ids, records)
                ],
            }
        )
    cross_scores, cross_lengths = cross(cross_rows)
    record_vectors = encoder.embed_records(record_texts)
    job_vectors = encoder.embed_jobs(job_texts)
    cross_by_group: dict[int, dict[str, float]] = defaultdict(dict)
    cosine_by_group: dict[int, dict[str, float]] = defaultdict(dict)
    for position, ((group_index, record_id), score) in enumerate(zip(owners, cross_scores)):
        cross_by_group[group_index][record_id] = float(score)
        cosine_by_group[group_index][record_id] = float((record_vectors[position] * job_vectors[group_index]).sum())
    rule_by_group: dict[int, dict[str, float]] = {}
    for row in run_rule("materials", material_requests, node=node):
        ranked = row["ranked"]
        # rankMaterials()가 정한 순서(동점 처리 포함)를 그대로 쓰도록 순위를 점수로 바꾼다.
        rule_by_group[int(row["id"])] = {item["id"]: float(len(ranked) - position) for position, item in enumerate(ranked)}

    def evaluate(scores: dict[int, dict[str, float]]) -> dict[str, Any]:
        return record_ndcg([{"relevance": relevance[index], "scores": scores.get(index, {})} for index in range(len(selected))])

    return {
        "split": split,
        "pairs": len(selected),
        "records": len(cross_rows),
        "crossInputLengths": cross_lengths,
        "models": {"cross-encoder": evaluate(cross_by_group), "frozen-cosine": evaluate(cosine_by_group), RULE_MATERIALS: evaluate(rule_by_group)},
    }


def cmd_eval_cross(arguments: argparse.Namespace) -> dict[str, Any]:
    started = time.perf_counter()
    dataset = pilot.load_training_dataset(arguments.data, arguments.labels)
    labels = load_labels(arguments.labels)
    pairs = dataset["pairs"]
    version = next_version(arguments.output, "cross", DATASET_VERSION)
    directory = arguments.output / version
    by_pair = {
        (row["profileId"], row["jobId"]): float(row["prediction"])
        for row in pilot._read_jsonl(arguments.cross_scores)
        if row["model"] == arguments.cross_model_name
    }
    missing = [pair for pair in pairs if (pair["profileId"], pair["jobId"]) not in by_pair]
    if missing:
        raise ValueError(f"cross scores miss {len(missing)} pairs")
    cross = [by_pair[(pair["profileId"], pair["jobId"])] for pair in pairs]
    lexical, _ = pilot.run_lexical_baselines(dataset)
    rule = rule_match_scores(dataset, [(row["profileId"], row["jobId"]) for row in pairs], node=arguments.node)
    predictions: dict[str, Sequence[float | None]] = {arguments.cross_model_name: cross, "char_tfidf": lexical["char_tfidf"], RULE_MODEL: rule}
    scorer, scorer_info = load_cross_scorer(arguments.cross_base_model, arguments.cross_checkpoint, device=arguments.device, batch_size=arguments.cross_batch_size)
    encoder, _ = load_encoder(arguments.encoder, dataset, arguments)
    metrics = {
        "schemaVersion": "expresso-match-model-metrics-v1",
        "version": version,
        "createdAt": _now(),
        "modelA": {
            name: {"valid": split_metrics(pairs, values, "valid", roc_points=False), "test": split_metrics(pairs, values, "test", roc_points=True)}
            for name, values in predictions.items()
        },
        "comparisons": {
            f"{arguments.cross_model_name} - {baseline}": bootstrap_against(pairs, cross, predictions[baseline]) for baseline in (RULE_MODEL, "char_tfidf")
        },
        "modelB": {
            split: model_b(dataset, labels, split, cross=scorer, encoder=encoder, node=arguments.node) for split in ("valid", "test")
        },
        "modelBCosineEncoder": encoder.spec.model_id,
        "crossEncoder": scorer_info,
        "runtime": {**_runtime(arguments.device), "seconds": round(time.perf_counter() - started, 3)},
    }
    directory.mkdir(parents=True, exist_ok=True)
    pilot._atomic_json(directory / "metrics.json", metrics)
    pilot._atomic_json(
        directory / "metadata.json",
        build_metadata(
            version=version,
            dataset_version=f"fit-{DATASET_VERSION}",
            encoder=arguments.cross_base_model,
            labels=labels,
            hashes=dataset["hashes"],
            trained_at=_now(),
            code_commit=_git_commit(),
            extra={"model": arguments.cross_model_name, "checkpoint": str(arguments.cross_checkpoint), "crossScores": str(arguments.cross_scores), **scorer_info},
        ),
    )
    return {"version": version, "directory": str(directory)}


# ---------------------------------------------------------------- 진입점


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    def common(command: argparse.ArgumentParser) -> None:
        command.add_argument("--data", type=Path, required=True)
        command.add_argument("--labels", type=Path, required=True)
        command.add_argument("--output", type=Path, required=True)
        command.add_argument("--device", choices=("cuda", "cpu"), default="cuda")
        command.add_argument("--seed", type=int, default=42)
        # 파일럿 기본값(설계서 4.3). 배치는 넘치면 절반으로 줄인다.
        command.add_argument("--embedding-batch-size", type=int, default=32)
        command.add_argument("--hidden-dimension", type=int, default=256)
        command.add_argument("--mlp-epochs", type=int, default=60)
        command.add_argument("--mlp-learning-rate", type=float, default=5e-4)
        command.add_argument("--mlp-patience", type=int, default=8)
        command.add_argument("--encoder-path", help="인코더를 로컬 경로에서 읽을 때. 인코더 하나를 고를 때만 쓴다")
        command.add_argument("--node", default="node")

    token_stats = commands.add_parser("token-stats")
    common(token_stats)
    token_stats.add_argument("--encoders", nargs="+", choices=sorted(ENCODERS), default=sorted(ENCODERS))
    encoders = commands.add_parser("encoders")
    common(encoders)
    encoders.add_argument("--encoders", nargs="+", choices=sorted(ENCODERS), default=["e5", "kure", "bge-m3", "qwen3"])
    train_bi = commands.add_parser("train-bi")
    common(train_bi)
    train_bi.add_argument("--encoder", choices=sorted(ENCODERS), required=True)
    eval_cross = commands.add_parser("eval-cross")
    common(eval_cross)
    eval_cross.add_argument("--encoder", choices=sorted(ENCODERS), default="e5", help="모델 B 코사인 baseline 인코더")
    eval_cross.add_argument("--cross-scores", type=Path, required=True, help="llm_suitability_train --mode cross가 쓴 cross-encoder/scores.jsonl")
    eval_cross.add_argument("--cross-checkpoint", type=Path, required=True, help="같은 실행의 cross-encoder/trainable-state.pt")
    eval_cross.add_argument("--cross-base-model", default=pilot.CROSS_ENCODER_MODEL_ID)
    eval_cross.add_argument("--cross-model-name", default=pilot.CROSS_ENCODER_ID)
    eval_cross.add_argument("--cross-batch-size", type=int, default=16)
    return parser


COMMANDS = {"token-stats": cmd_token_stats, "encoders": cmd_encoders, "train-bi": cmd_train_bi, "eval-cross": cmd_eval_cross}


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    if arguments.command == "encoders" and arguments.encoder_path and len(arguments.encoders) > 1:
        raise SystemExit("--encoder-path는 인코더 하나를 고를 때만 쓴다")
    result = COMMANDS[arguments.command](arguments)
    print(json.dumps(result if arguments.command != "encoders" else {"rows": sorted(result["rows"])}, ensure_ascii=False, indent=2)[:4000])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
