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
import hashlib
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
    pairs: Sequence[dict[str, Any]], candidate: Sequence[float | None], baseline: Sequence[float | None], split: str = "test"
) -> dict[str, Any]:
    """평가 프로필 단위 paired bootstrap. 차이는 후보 − baseline이다."""
    def ranked(values: Sequence[float | None]) -> list[dict[str, Any]]:
        return [{**row, "prediction": RULE_NULL_RANK_SCORE if row["prediction"] is None else row["prediction"]} for row in _rows(pairs, values, split)]

    candidate_rows = ranked(candidate)
    baseline_rows = ranked(baseline)
    result = {"ndcgAt10": paired_bootstrap(profile_ndcg(candidate_rows), profile_ndcg(baseline_rows), iterations=BOOTSTRAP_ITERATIONS)}
    # MAE는 두 쪽 모두 점수가 있는 쌍끼리만 비교한다(규칙 함수 null · API 거절 제외).
    scored = {
        (row["profileId"], row["jobId"])
        for row, other in zip(_rows(pairs, baseline, split), _rows(pairs, candidate, split))
        if row["prediction"] is not None and other["prediction"] is not None
    }
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


def load_encoder(key: str, dataset: dict[str, Any], arguments: argparse.Namespace, evaluation: dict[str, Any] | None = None) -> tuple[SentenceEncoder, dict[str, Any]]:
    """인코더를 올리고 최대 길이를 데이터에서 정한다. 평가 세트가 따로 있으면 그 텍스트도 넣는다."""
    spec = ENCODERS[key]
    encoder = SentenceEncoder.load(spec, device=arguments.device, batch_size=arguments.embedding_batch_size, max_length=spec.model_limit, model_path=arguments.encoder_path)
    measured: dict[str, tuple[list[int], list[int]]] = {}
    for name, source in (("data", dataset), ("evalData", evaluation)):
        if source is None or (name == "evalData" and source is dataset):
            continue
        _, profile_texts, _, job_texts = _texts(source)
        measured[name] = (encoder.token_lengths(profile_texts, role="profile"), encoder.token_lengths(job_texts, role="job"))
    max_length = choose_max_length(spec, [length for profiles, jobs in measured.values() for length in profiles + jobs])
    encoder.set_max_length(max_length)
    lengths = {name: {"profiles": length_summary(profiles, max_length), "jobs": length_summary(jobs, max_length)} for name, (profiles, jobs) in measured.items()}
    return encoder, lengths["data"] if len(lengths) == 1 else lengths


def embed_dataset(encoder: SentenceEncoder, dataset: dict[str, Any], cache_root: Path) -> tuple[Any, Any, dict[str, int], dict[str, int]]:
    profile_ids, profile_texts, job_ids, job_texts = _texts(dataset)
    identity = encoder.spec.cache_identity(encoder.max_length)
    # 학습 세트와 평가 세트의 벡터가 같은 파일을 번갈아 덮어쓰지 않게 데이터 해시를 경로에 넣는다.
    data_tag = hashlib.sha256((dataset["hashes"]["profiles"] + dataset["hashes"]["jobs"]).encode("utf-8")).hexdigest()[:12]
    cache = cache_root / f"{encoder.spec.key}-{identity}-{data_tag}"
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


def evaluation_dataset(arguments: argparse.Namespace, dataset: dict[str, Any]) -> dict[str, Any]:
    """`--eval-data`가 있으면 그 세트로 평가한다. 학습 · 조기 종료는 언제나 `--data`로 한다."""
    if not getattr(arguments, "eval_data", None):
        return dataset
    if not arguments.eval_labels:
        raise SystemExit("--eval-data에는 --eval-labels가 함께 필요하다")
    return pilot.load_training_dataset(arguments.eval_data, arguments.eval_labels)


def calibration_split(dataset: dict[str, Any]) -> str:
    """기준선 점수를 0–100으로 보정할 분할. 평가 세트에는 학습 분할이 없으므로 검증 분할로 한다."""
    return "train" if any(pair["split"] == "train" for pair in dataset["pairs"]) else "valid"


def calibrate(pairs: Sequence[dict[str, Any]], raw: Sequence[float], split: str) -> list[float]:
    fit = [index for index, pair in enumerate(pairs) if pair["split"] == split]
    return pilot.affine_calibrate([raw[index] for index in fit], [pairs[index]["matchScore"] for index in fit], raw)


def lexical_baselines(dataset: dict[str, Any]) -> dict[str, list[float]]:
    """파일럿 `run_lexical_baselines`와 같은 점수를 `calibration_split`에서 보정한다."""
    from retrieval_baselines import build_lexical_scores

    profiles = {str(row["profileId"]): pilot.render_profile(row) for row in dataset["profiles"]}
    jobs = {str(row["jobId"]): pilot.render_job(row) for row in dataset["jobs"]}
    pairs = dataset["pairs"]
    maps = build_lexical_scores(profiles, jobs, [(row["profileId"], row["jobId"]) for row in pairs])
    split = calibration_split(dataset)
    return {name: calibrate(pairs, [maps[name][row["profileId"]][row["jobId"]] for row in pairs], split) for name in ("word_tfidf", "char_tfidf", "bm25")}


def score_pairs(dataset: dict[str, Any], model: Any, vectors: tuple[Any, Any, dict[str, int], dict[str, int]], *, device: str) -> tuple[list[float], list[float]]:
    """학습한 MLP와 동결 코사인으로 세트의 모든 쌍을 채점한다. 코사인은 `calibration_split`에서 보정한다."""
    profile_vectors, job_vectors, profile_index, job_index = vectors
    pairs = dataset["pairs"]
    pair_profiles, pair_jobs, _, _ = pilot._pair_embedding_tensors(pairs, profile_vectors, job_vectors, profile_index, job_index)
    mlp = pilot.predict_mlp(model, pilot.pair_features(pair_profiles, pair_jobs), device=device).tolist()
    cosine = calibrate(pairs, (pair_profiles * pair_jobs).sum(dim=1).tolist(), calibration_split(dataset))
    return mlp, cosine


def _dataset_summary(dataset: dict[str, Any]) -> dict[str, Any]:
    return {**dataset["counts"], "hashes": dataset["hashes"]}


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
    evaluation = evaluation_dataset(arguments, dataset)
    path = arguments.output / "encoder-comparison.json"
    report: dict[str, Any] = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"split": "valid", "rows": {}}
    report["dataset"] = _dataset_summary(dataset)
    report["evalDataset"] = _dataset_summary(evaluation)
    for key in arguments.encoders:
        started = time.perf_counter()
        encoder, lengths = load_encoder(key, dataset, arguments, evaluation)
        vectors = embed_dataset(encoder, dataset, arguments.output / "embedding-cache")
        model, learning, _, _ = fit_mlp(dataset, vectors, arguments)
        eval_vectors = vectors if evaluation is dataset else embed_dataset(encoder, evaluation, arguments.output / "embedding-cache")
        mlp, cosine = score_pairs(evaluation, model, eval_vectors, device=arguments.device)
        # 평가 분할은 열지 않는다. 검증 분할 점수만 남긴다.
        predictions: list[float | None] = [score if pair["split"] == "valid" else None for pair, score in zip(evaluation["pairs"], mlp)]
        report["rows"][key] = {
            "modelId": encoder.spec.model_id,
            "spec": asdict(encoder.spec),
            "inputLengths": lengths,
            "embedding": encoder.runs,
            "embeddingDimension": int(vectors[0].shape[1]),
            "mlp": split_metrics(evaluation["pairs"], predictions, "valid", roc_points=False),
            "frozenCosine": split_metrics(evaluation["pairs"], [value if pair["split"] == "valid" else None for pair, value in zip(evaluation["pairs"], cosine)], "valid", roc_points=False),
            "learning": {key_: value for key_, value in learning.items() if key_ != "history"},
            "seconds": round(time.perf_counter() - started, 3),
            "runtime": _runtime(arguments.device),
        }
        report["updatedAt"] = _now()
        pilot._atomic_json(path, report)
        del encoder, model, vectors, eval_vectors
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


def embedding_record(encoder: SentenceEncoder, output: Path) -> dict[str, Any]:
    """설계서 9.2가 함께 기록하라는 임베딩 시간 · 처리량 · GPU 메모리 · 벡터 용량.

    E2 다음에 E3을 돌리면 벡터를 캐시에서 읽어 이번 실행에는 측정값이 없다. 그때는 같은 인코더 ·
    같은 최대 길이로 잰 E2의 값을 출처와 함께 옮긴다.
    """
    if encoder.runs:
        return {"source": "this run", "runs": encoder.runs}
    path = output / "encoder-comparison.json"
    if path.exists():
        row = json.loads(path.read_text(encoding="utf-8")).get("rows", {}).get(encoder.spec.key)
        if row and row.get("spec") == asdict(encoder.spec) and row["inputLengths"]["profiles"]["maxLength"] == encoder.max_length:
            return {"source": "encoder-comparison.json", "runs": row["embedding"]}
    return {"source": "embedding cache without measurement", "runs": []}


def cmd_train_bi(arguments: argparse.Namespace) -> dict[str, Any]:
    import torch

    started = time.perf_counter()
    dataset = pilot.load_training_dataset(arguments.data, arguments.labels)
    evaluation = evaluation_dataset(arguments, dataset)
    labels = load_labels(arguments.labels)
    version = next_version(arguments.output, "bi", DATASET_VERSION)
    directory = arguments.output / version
    encoder, lengths = load_encoder(arguments.encoder, dataset, arguments, evaluation)
    vectors = embed_dataset(encoder, dataset, arguments.output / "embedding-cache")
    model, learning, _, _ = fit_mlp(dataset, vectors, arguments)
    eval_vectors = vectors if evaluation is dataset else embed_dataset(encoder, evaluation, arguments.output / "embedding-cache")
    pairs = evaluation["pairs"]
    mlp, cosine = score_pairs(evaluation, model, eval_vectors, device=arguments.device)
    lexical = lexical_baselines(evaluation)
    rule = rule_match_scores(evaluation, [(row["profileId"], row["jobId"]) for row in pairs], node=arguments.node)
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
        "evalDataset": _dataset_summary(evaluation),
        "screeningRecall": screening(evaluation, model, eval_vectors, device=arguments.device, node=arguments.node),
        "inputLengths": lengths,
        "embedding": embedding_record(encoder, arguments.output),
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
                "evalData": str(arguments.eval_data) if getattr(arguments, "eval_data", None) else None,
                "evalDataHashes": evaluation["hashes"],
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
    cross: Callable[[Sequence[dict[str, str]]], tuple[list[float], dict[str, Any]]] | None,
    encoder: SentenceEncoder,
    node: str,
    record_scores: dict[tuple[str, str, str], float | None] | None = None,
    model_name: str = "cross-encoder",
) -> dict[str, Any]:
    """설계서 9.2 모델 B: (공고, 기록 1건) 점수 순서를 교사의 기록 단위 판정과 비교한다.

    Cross-Encoder 입력은 학습 때와 같은 틀(`build_selected_profile_text`)에 기록 하나만 넣는다.
    학습 때는 기록 최대 8개 묶음이었으므로, 이 시험이 그 입력 단위 차이의 영향을 본다.
    외부 API(`match_api_scorer.py`)로 매긴 점수는 `record_scores`로 받는다. 점수가 없는 쌍과
    거절한 기록이 있는 쌍은 그 모델의 평가에서 빼고 수를 남긴다.
    """
    if (cross is None) == (record_scores is None):
        raise ValueError("cross scorer or record scores, exactly one")
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
    if cross is not None:
        cross_scores, cross_lengths = cross(cross_rows)
    else:
        cross_lengths = None
        cross_scores = [record_scores.get((str(selected[group_index]["profileId"]), str(selected[group_index]["jobId"]), record_id)) for group_index, record_id in owners]
    record_vectors = encoder.embed_records(record_texts)
    job_vectors = encoder.embed_jobs(job_texts)
    cross_by_group: dict[int, dict[str, float]] = defaultdict(dict)
    cosine_by_group: dict[int, dict[str, float]] = defaultdict(dict)
    unscored: set[int] = set()
    for position, ((group_index, record_id), score) in enumerate(zip(owners, cross_scores)):
        if score is None:
            unscored.add(group_index)
        else:
            cross_by_group[group_index][record_id] = float(score)
        cosine_by_group[group_index][record_id] = float((record_vectors[position] * job_vectors[group_index]).sum())
    rule_by_group: dict[int, dict[str, float]] = {}
    for row in run_rule("materials", material_requests, node=node):
        ranked = row["ranked"]
        # rankMaterials()가 정한 순서(동점 처리 포함)를 그대로 쓰도록 순위를 점수로 바꾼다.
        rule_by_group[int(row["id"])] = {item["id"]: float(len(ranked) - position) for position, item in enumerate(ranked)}

    def evaluate(scores: dict[int, dict[str, float]], *, skip: frozenset[int] | set[int] = frozenset()) -> dict[str, Any]:
        groups = [{"relevance": relevance[index], "scores": scores.get(index, {})} for index in range(len(selected)) if index not in skip]
        return {**record_ndcg(groups), "unscoredPairs": len(skip)}

    return {
        "split": split,
        "pairs": len(selected),
        "records": len(cross_rows),
        "crossInputLengths": cross_lengths,
        "models": {model_name: evaluate(cross_by_group, skip=unscored), "frozen-cosine": evaluate(cosine_by_group), RULE_MATERIALS: evaluate(rule_by_group)},
    }


def cmd_eval_cross(arguments: argparse.Namespace) -> dict[str, Any]:
    started = time.perf_counter()
    dataset = pilot.load_training_dataset(arguments.data, arguments.labels)
    labels = load_labels(arguments.labels)
    pairs = dataset["pairs"]
    version = next_version(arguments.output, "cross", DATASET_VERSION)
    directory = arguments.output / version
    scorer = None
    scorer_info: dict[str, Any] = {"model": arguments.cross_model_name}
    if arguments.cross_checkpoint:
        scorer, scorer_info = load_cross_scorer(arguments.cross_base_model, arguments.cross_checkpoint, device=arguments.device, batch_size=arguments.cross_batch_size)
    cross_input_lengths = None
    if arguments.cross_scores:
        by_pair = {
            (row["profileId"], row["jobId"]): None if row["prediction"] is None else float(row["prediction"])
            for row in pilot._read_jsonl(arguments.cross_scores)
            if row["model"] == arguments.cross_model_name
        }
    elif scorer is not None:
        # 점수 파일이 없으면 이 세트의 쌍을 학습 때와 같은 입력(공고 + E5 코사인 상위 기록)으로 직접 채점한다.
        rows = pilot.prepare_cross_encoder_inputs(
            dataset,
            output_dir=directory / "cross-inputs",
            e5_model_path=arguments.e5_model_path,
            device=arguments.device,
            embedding_batch_size=arguments.embedding_batch_size,
            top_records=int(scorer_info.get("topRecords") or 8),
        )
        scores, cross_input_lengths = scorer(rows)
        by_pair = {(row["profileId"], row["jobId"]): float(score) for row, score in zip(rows, scores)}
    else:
        raise SystemExit("--cross-scores나 --cross-checkpoint 중 하나가 필요하다")
    # 지표는 검증 · 평가 분할만 쓴다. 외부 API 점수에는 학습 분할이 없다.
    missing = [pair for pair in pairs if pair["split"] in {"valid", "test"} and (pair["profileId"], pair["jobId"]) not in by_pair]
    if missing:
        raise ValueError(f"cross scores miss {len(missing)} valid/test pairs for {arguments.cross_model_name}")
    cross = [by_pair.get((pair["profileId"], pair["jobId"])) for pair in pairs]
    lexical = lexical_baselines(dataset)
    rule = rule_match_scores(dataset, [(row["profileId"], row["jobId"]) for row in pairs], node=arguments.node)
    predictions: dict[str, Sequence[float | None]] = {arguments.cross_model_name: cross, "char_tfidf": lexical["char_tfidf"], RULE_MODEL: rule}
    record_scores = None
    if scorer is None and arguments.record_scores:
        record_scores = {
            (str(row["profileId"]), str(row["jobId"]), str(row["recordId"])): row["prediction"]
            for row in pilot._read_jsonl(arguments.record_scores)
            if row["model"] == arguments.cross_model_name
        }
        scorer_info = {"model": arguments.cross_model_name, "recordScores": str(arguments.record_scores)}
    label_source = {(str(row["profileId"]), str(row["jobId"])): str(row.get("labelSource")) for row in labels}
    encoder, _ = load_encoder(arguments.encoder, dataset, arguments)
    metrics = {
        "schemaVersion": "expresso-match-model-metrics-v1",
        "version": version,
        "createdAt": _now(),
        "modelA": {
            name: {
                "valid": split_metrics(pairs, values, "valid", roc_points=False),
                "test": split_metrics(pairs, values, "test", roc_points=True),
                # 교사가 프로필을 나눠 맡았다. 같은 계열 모델끼리 판정이 겹치면 그 교사의 라벨에서만 높게 나온다.
                "testByLabelSource": {
                    source: split_metrics(
                        [pair for pair in pairs if label_source.get((pair["profileId"], pair["jobId"])) == source],
                        [value for pair, value in zip(pairs, values) if label_source.get((pair["profileId"], pair["jobId"])) == source],
                        "test",
                        roc_points=False,
                    )
                    for source in sorted({label_source.get((pair["profileId"], pair["jobId"])) for pair in pairs if pair["split"] == "test"})
                },
            }
            for name, values in predictions.items()
        },
        "comparisons": {
            f"{arguments.cross_model_name} - {baseline}": bootstrap_against(pairs, cross, predictions[baseline]) for baseline in (RULE_MODEL, "char_tfidf")
        },
        "modelB": {
            split: model_b(dataset, labels, split, cross=scorer, record_scores=record_scores, model_name=arguments.cross_model_name, encoder=encoder, node=arguments.node)
            for split in ("valid", "test")
        }
        if scorer is not None or record_scores is not None
        else None,
        "modelBCosineEncoder": encoder.spec.model_id,
        "modelACrossInputLengths": cross_input_lengths,
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
            extra={"checkpoint": str(arguments.cross_checkpoint) if arguments.cross_checkpoint else None, "crossScores": str(arguments.cross_scores), **scorer_info, "model": arguments.cross_model_name},
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
    for command in (encoders,):
        command.add_argument("--eval-data", type=Path, help="평가 세트 data 폴더(예: 한국어 공고 세트). 학습은 --data로 한다")
        command.add_argument("--eval-labels", type=Path)
    train_bi = commands.add_parser("train-bi")
    common(train_bi)
    train_bi.add_argument("--encoder", choices=sorted(ENCODERS), required=True)
    train_bi.add_argument("--eval-data", type=Path, help="평가 세트 data 폴더(예: 한국어 공고 세트). 학습은 --data로 한다")
    train_bi.add_argument("--eval-labels", type=Path)
    eval_cross = commands.add_parser("eval-cross")
    common(eval_cross)
    eval_cross.add_argument("--encoder", choices=sorted(ENCODERS), default="e5", help="모델 B 코사인 baseline 인코더")
    eval_cross.add_argument("--cross-scores", type=Path, help="llm_suitability_train --mode cross의 cross-encoder/scores.jsonl 또는 match_api_scorer.py의 scores.jsonl. 비우면 --cross-checkpoint로 이 세트를 직접 채점한다")
    eval_cross.add_argument("--e5-model-path", type=Path, default=Path(pilot.E5_MODEL_ID), help="직접 채점할 때 기록을 고르는 E5(파일럿과 같다). 로컬 경로도 된다")
    model_b_source = eval_cross.add_mutually_exclusive_group()
    model_b_source.add_argument("--cross-checkpoint", type=Path, help="같은 실행의 cross-encoder/trainable-state.pt. 모델 B를 이 가중치로 채점한다")
    model_b_source.add_argument("--record-scores", type=Path, help="match_api_scorer.py가 쓴 record-scores.jsonl. 모델 B 점수를 이 파일에서 읽는다")
    eval_cross.add_argument("--cross-base-model", default=pilot.CROSS_ENCODER_MODEL_ID, help="--cross-checkpoint의 기반 모델")
    eval_cross.add_argument("--cross-model-name", default=pilot.CROSS_ENCODER_ID)
    eval_cross.add_argument("--cross-batch-size", type=int, default=16)
    return parser


COMMANDS = {"token-stats": cmd_token_stats, "encoders": cmd_encoders, "train-bi": cmd_train_bi, "eval-cross": cmd_eval_cross}


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    if arguments.command in {"encoders", "token-stats"} and arguments.encoder_path and len(arguments.encoders) > 1:
        raise SystemExit("--encoder-path는 인코더 하나를 고를 때만 쓴다")
    result = COMMANDS[arguments.command](arguments)
    print(json.dumps(result if arguments.command != "encoders" else {"rows": sorted(result["rows"])}, ensure_ascii=False, indent=2)[:4000])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
