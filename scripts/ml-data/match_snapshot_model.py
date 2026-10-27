"""구조 기반 0–100 약한 라벨로 MLP를 미세학습하고 독립 파일럿에서 평가한다."""

from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
from typing import Any

from match_snapshot_data import LABEL_SOURCE, profile_source_atoms, score_suitability
from match_pilot_model import (
    FROZEN_E5_COSINE_ID,
    FrozenE5Encoder,
    _cache_embeddings,
    _load_jsonl,
    _torch,
    frozen_e5_cosine_scores,
    create_ranker,
    load_checkpoint,
    pair_features,
    score_candidates,
    set_seed,
)
from ranking_evaluation import evaluate_ranking, paired_bootstrap, validate_dataset
from retrieval_baselines import build_lexical_scores


MODEL_ID = "match-snapshot-mlp-v2"
RULE_BASELINE_ID = "structured-role-rule-v1"
OUTPUT_CONTRACT = {
    "field": "suitabilityScore",
    "minimum": 0,
    "maximum": 100,
    "meaning": "프로필에 기록된 경력 근거와 공고 요구사항의 부합도",
    "notMeaning": "합격 확률",
}


def raw_scores_to_suitability(scores: Any) -> Any:
    return scores.clamp(0.0, 3.0) * (100.0 / 3.0)


def create_suitability_ranker(raw_ranker: Any) -> Any:
    """체크포인트 자체의 forward가 단일 0–100 점수만 반환하게 감싼다."""
    torch = _torch()

    class SuitabilityRanker(torch.nn.Module):
        def __init__(self, ranker: Any) -> None:
            super().__init__()
            self.raw_ranker = ranker

        def forward(self, features: Any) -> Any:
            return raw_scores_to_suitability(self.raw_ranker(features))

    return SuitabilityRanker(raw_ranker)


def score_suitability_candidates(
    ranker: Any, profile_embeddings: Any, job_embeddings: Any
) -> Any:
    torch = _torch()
    ranker.eval()
    with torch.no_grad():
        features = pair_features(profile_embeddings, job_embeddings).to(
            next(ranker.parameters()).device
        )
        return ranker(features).reshape(-1).cpu()


def load_suitability_checkpoint(path: Path) -> Any:
    torch = _torch()
    payload = torch.load(path, map_location="cpu", weights_only=True)
    if payload.get("model") != MODEL_ID or payload.get("outputContract") != OUTPUT_CONTRACT:
        raise ValueError("unexpected suitability checkpoint contract")
    raw_ranker = create_ranker(
        embedding_dimension=payload["embeddingDimension"],
        hidden_dimension=payload["hiddenDimension"],
    )
    wrapper = create_suitability_ranker(raw_ranker)
    wrapper.load_state_dict(payload["state"])
    return wrapper


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _pair_tensors(
    rows: list[dict[str, Any]],
    profile_vectors: dict[str, Any],
    job_vectors: dict[str, Any],
    *,
    score_field: str,
) -> tuple[Any, Any, Any]:
    torch = _torch()
    profiles, jobs, targets = [], [], []
    for row in rows:
        profiles.append(profile_vectors[row["profileId"]])
        jobs.append(job_vectors[row["jobId"]])
        value = row[score_field]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 100:
            raise ValueError(f"invalid {score_field}: {value!r}")
        targets.append(float(value) * 3.0 / 100.0)
    if not targets:
        raise ValueError("pair split is empty")
    return torch.stack(profiles), torch.stack(jobs), torch.tensor(targets)


def validate_snapshot_dataset(
    profiles: list[dict[str, Any]],
    jobs: list[dict[str, Any]],
    labels: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
) -> None:
    expected_label_fields = {
        "profileId", "jobId", "split", "suitabilityScore", "labelSource", "reasonCodes"
    }
    if any(set(row) != expected_label_fields for row in labels):
        raise ValueError("snapshot label fields differ")
    converted = []
    for row in labels:
        score = row["suitabilityScore"]
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= score <= 100:
            raise ValueError("suitabilityScore must be from 0 to 100")
        if row["labelSource"] != LABEL_SOURCE:
            raise ValueError("snapshot label source differs")
        converted.append({
            "profileId": row["profileId"],
            "jobId": row["jobId"],
            "split": row["split"],
            "teacherLabel": min(3, max(0, round(float(score) * 3 / 100))),
            "humanLabel": None,
            "reasonCodes": row["reasonCodes"],
        })
    validation_profiles = []
    for profile in profiles:
        family_atoms = [
            atom for atom in profile["sourceAtomIds"] if atom.startswith("profile-family:")
        ]
        if not family_atoms:
            raise ValueError(f"profile has no family lineage: {profile['profileId']}")
        validation_profiles.append({**profile, "sourceAtomIds": family_atoms})
    validate_dataset(validation_profiles, jobs, converted)
    if any(set(row) != {"profileId", "jobId", "split"} for row in candidates):
        raise ValueError("candidate manifest fields differ")
    candidate_pairs = [(row["profileId"], row["jobId"], row["split"]) for row in candidates]
    label_pairs = [(row["profileId"], row["jobId"], row["split"]) for row in labels]
    if len(set(candidate_pairs)) != len(candidate_pairs) or set(candidate_pairs) != set(label_pairs):
        raise ValueError("candidate manifest pairs differ from labels")


def validate_data_manifest(
    manifest: dict[str, Any],
    data_dir: Path,
    profiles: list[dict[str, Any]],
) -> None:
    if (
        manifest.get("schemaVersion") != "match-snapshot-data-v2"
        or manifest.get("lineageContract") != "individual-source-atoms-v1"
    ):
        raise ValueError("training data does not preserve individual source lineage")
    source_atoms = {atom for row in profiles for atom in row["sourceAtomIds"]}
    non_family_count = sum(
        not atom.startswith("profile-family:") for atom in source_atoms
    )
    if (
        manifest.get("sourceAtomCount") != len(source_atoms)
        or manifest.get("nonFamilySourceAtomCount") != non_family_count
        or non_family_count <= 0
    ):
        raise ValueError("training data lineage counts differ from manifest")
    expected_hashes = manifest.get("outputSha256")
    expected_names = {
        "profiles.jsonl",
        "jobs.jsonl",
        "candidate-manifest.jsonl",
        "suitability-labels.jsonl",
    }
    if not isinstance(expected_hashes, dict) or set(expected_hashes) != expected_names:
        raise ValueError("training data output hashes are missing")
    for name, expected in expected_hashes.items():
        if _sha256(data_dir / name) != expected:
            raise ValueError(f"training data output hash differs: {name}")


def _validate_no_pilot_leakage(
    training_profiles: list[dict[str, Any]],
    training_jobs: list[dict[str, Any]],
    weak_labels: list[dict[str, Any]],
    pilot_profiles: list[dict[str, Any]],
    pilot_jobs: list[dict[str, Any]],
    pilot_labels: list[dict[str, Any]],
    pilot_source_profiles: dict[str, dict[str, Any]],
) -> None:
    train_profile_ids = {row["profileId"] for row in weak_labels if row["split"] == "train"}
    pilot_eval_profile_ids = {
        row["profileId"] for row in pilot_labels if row["split"] in {"valid", "test"}
    }
    if train_profile_ids & pilot_eval_profile_ids:
        raise ValueError("training profiles overlap pilot evaluation profiles")
    train_job_ids = {row["jobId"] for row in weak_labels if row["split"] == "train"}
    pilot_eval_job_ids = {
        row["jobId"] for row in pilot_labels if row["split"] in {"valid", "test"}
    }
    if train_job_ids & pilot_eval_job_ids:
        raise ValueError("training jobs overlap pilot evaluation jobs")
    training_profile_text = {
        row["text"] for row in training_profiles if row["profileId"] in train_profile_ids
    }
    pilot_profile_text = {
        row["text"] for row in pilot_profiles if row["profileId"] in pilot_eval_profile_ids
    }
    if training_profile_text & pilot_profile_text:
        raise ValueError("training profile text overlaps pilot evaluation profile text")
    training_job_text = {
        row["text"] for row in training_jobs if row["jobId"] in train_job_ids
    }
    pilot_job_text = {
        row["text"] for row in pilot_jobs if row["jobId"] in pilot_eval_job_ids
    }
    if training_job_text & pilot_job_text:
        raise ValueError("training job text overlaps pilot evaluation job text")
    training_atoms = {
        atom
        for row in training_profiles
        if row["profileId"] in train_profile_ids
        for atom in row["sourceAtomIds"]
    }
    pilot_atoms = {
        atom
        for profile_id in pilot_eval_profile_ids
        for atom in profile_source_atoms(pilot_source_profiles[profile_id])
    }
    overlap = sorted(training_atoms & pilot_atoms)
    if overlap:
        raise ValueError(f"training source lineage overlaps pilot evaluation: {overlap[:3]}")


def select_lineage_clean_weak_rows(
    profiles: list[dict[str, Any]],
    labels: list[dict[str, Any]],
    pilot_source_profiles: dict[str, dict[str, Any]],
    pilot_labels: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    """pilot 평가와 train 사이, train과 weak-valid 사이의 원천 atom 공유를 제거한다."""
    profiles_by_id = {row["profileId"]: row for row in profiles}
    pilot_eval_ids = {
        row["profileId"] for row in pilot_labels if row["split"] in {"valid", "test"}
    }
    pilot_atoms = {
        atom
        for profile_id in pilot_eval_ids
        for atom in profile_source_atoms(pilot_source_profiles[profile_id])
    }
    blocked_by_pilot = {
        profile_id
        for profile_id, profile in profiles_by_id.items()
        if set(profile["sourceAtomIds"]) & pilot_atoms
    }
    train_ids = {
        row["profileId"]
        for row in labels
        if row["split"] == "train" and row["profileId"] not in blocked_by_pilot
    }
    train_atoms = {
        atom
        for profile_id in train_ids
        for atom in profiles_by_id[profile_id]["sourceAtomIds"]
    }
    blocked_valid_by_train = {
        profile_id
        for profile_id, profile in profiles_by_id.items()
        if profile["split"] == "valid"
        and profile_id not in blocked_by_pilot
        and set(profile["sourceAtomIds"]) & train_atoms
    }
    valid_ids = {
        row["profileId"]
        for row in labels
        if row["split"] == "valid"
        and row["profileId"] not in blocked_by_pilot
        and row["profileId"] not in blocked_valid_by_train
    }
    train_rows = [row for row in labels if row["profileId"] in train_ids]
    valid_rows = [row for row in labels if row["profileId"] in valid_ids]
    if not train_rows or not valid_rows:
        raise ValueError("lineage-clean train or valid split is empty")
    return train_rows, valid_rows, {
        "pilotEvaluationSourceAtomCount": len(pilot_atoms),
        "excludedByPilotProfileIds": sorted(blocked_by_pilot),
        "excludedValidByTrainProfileIds": sorted(blocked_valid_by_train),
        "trainProfilesBefore": len({
            row["profileId"] for row in labels if row["split"] == "train"
        }),
        "trainProfilesAfter": len(train_ids),
        "validProfilesBefore": len({
            row["profileId"] for row in labels if row["split"] == "valid"
        }),
        "validProfilesAfter": len(valid_ids),
    }


def _load_source_profiles(path: Path, expected_ids: set[str]) -> dict[str, dict[str, Any]]:
    profiles: dict[str, dict[str, Any]] = {}
    for source in sorted(path.glob("*.json")):
        profile = json.loads(source.read_text(encoding="utf-8"))
        profile_id = str(profile.get("syntheticProfileId") or "")
        if profile_id in expected_ids:
            if profile_id in profiles:
                raise ValueError(f"duplicate pilot source profile: {profile_id}")
            profiles[profile_id] = profile
    if set(profiles) != expected_ids:
        raise ValueError("pilot source profiles differ from pilot dataset")
    return profiles


def _structured_job(text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in text.splitlines():
        key, separator, value = line.partition(": ")
        if separator and key:
            fields[key] = value
    return fields


def _rule_score_map(
    pairs: list[dict[str, Any]],
    source_profiles: dict[str, dict[str, Any]],
    jobs: dict[str, dict[str, Any]],
) -> dict[str, dict[str, float]]:
    result: dict[str, dict[str, float]] = {}
    for row in pairs:
        score = score_suitability(
            source_profiles[row["profileId"]], _structured_job(jobs[row["jobId"]]["text"])
        )["suitabilityScore"]
        result.setdefault(row["profileId"], {})[row["jobId"]] = float(score)
    return result


def _mse(ranker: Any, profiles: Any, jobs: Any, labels: Any) -> float:
    torch = _torch()
    scores = score_candidates(ranker, profiles, jobs)
    return float(torch.nn.functional.mse_loss(scores, labels).item())


def validate_hidden_dimension(ranker: Any, expected: int) -> int:
    torch = _torch()
    actual = next(
        module.out_features
        for module in ranker.modules()
        if isinstance(module, torch.nn.Linear)
    )
    if actual != expected:
        raise ValueError(
            f"base checkpoint hidden dimension is {actual}, not {expected}"
        )
    return actual


def fine_tune_with_validation(
    ranker: Any,
    train_tensors: tuple[Any, Any, Any],
    valid_tensors: tuple[Any, Any, Any],
    *,
    epochs: int,
    learning_rate: float,
    batch_size: int,
    patience: int = 3,
) -> dict[str, Any]:
    torch = _torch()
    device = next(ranker.parameters()).device
    train_features = pair_features(train_tensors[0], train_tensors[1]).to(device)
    train_targets = train_tensors[2].to(device).reshape(-1, 1)
    optimizer = torch.optim.AdamW(ranker.parameters(), lr=learning_rate)
    loss_function = torch.nn.MSELoss()
    best_state = deepcopy(ranker.state_dict())
    best_loss = float("inf")
    history = []
    stale = 0
    for epoch in range(1, epochs + 1):
        ranker.train()
        order = torch.randperm(len(train_targets), device=device)
        total_loss = 0.0
        for start in range(0, len(order), batch_size):
            indices = order[start : start + batch_size]
            optimizer.zero_grad()
            loss = loss_function(ranker(train_features[indices]), train_targets[indices])
            loss.backward()
            optimizer.step()
            total_loss += float(loss.item()) * len(indices)
        train_loss = total_loss / len(train_targets)
        valid_loss = _mse(ranker, *valid_tensors)
        history.append({"epoch": epoch, "trainMse": train_loss, "validMse": valid_loss})
        if valid_loss < best_loss:
            best_loss = valid_loss
            best_state = deepcopy(ranker.state_dict())
            stale = 0
        else:
            stale += 1
            if stale >= patience:
                break
    ranker.load_state_dict(best_state)
    return {"bestValidMse": best_loss, "epochsRun": len(history), "history": history}


def _raw_score_map(
    ranker: Any,
    pairs: list[dict[str, Any]],
    profile_vectors: dict[str, Any],
    job_vectors: dict[str, Any],
) -> dict[str, dict[str, float]]:
    torch = _torch()
    p = torch.stack([profile_vectors[row["profileId"]] for row in pairs])
    j = torch.stack([job_vectors[row["jobId"]] for row in pairs])
    scores = raw_scores_to_suitability(score_candidates(ranker, p, j))
    result: dict[str, dict[str, float]] = {}
    for row, score in zip(pairs, scores):
        result.setdefault(row["profileId"], {})[row["jobId"]] = float(score)
    return result


def _suitability_score_map(
    ranker: Any,
    pairs: list[dict[str, Any]],
    profile_vectors: dict[str, Any],
    job_vectors: dict[str, Any],
) -> dict[str, dict[str, float]]:
    torch = _torch()
    profiles = torch.stack([profile_vectors[row["profileId"]] for row in pairs])
    jobs = torch.stack([job_vectors[row["jobId"]] for row in pairs])
    scores = score_suitability_candidates(ranker, profiles, jobs)
    result: dict[str, dict[str, float]] = {}
    for row, score in zip(pairs, scores):
        result.setdefault(row["profileId"], {})[row["jobId"]] = float(score)
    return result


def _cosine_score_map(
    pairs: list[dict[str, Any]],
    profile_vectors: dict[str, Any],
    job_vectors: dict[str, Any],
) -> dict[str, dict[str, float]]:
    torch = _torch()
    p = torch.stack([profile_vectors[row["profileId"]] for row in pairs])
    j = torch.stack([job_vectors[row["jobId"]] for row in pairs])
    scores = frozen_e5_cosine_scores(p, j)
    result: dict[str, dict[str, float]] = {}
    for row, score in zip(pairs, scores):
        result.setdefault(row["profileId"], {})[row["jobId"]] = float(score)
    return result


def run(arguments: argparse.Namespace) -> dict[str, str]:
    torch = _torch()
    if arguments.require_cuda and not torch.cuda.is_available():
        raise RuntimeError("CUDA is required but unavailable")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    set_seed(torch, arguments.seed)
    data_manifest = json.loads(
        (arguments.train_data / "data-manifest.json").read_text(encoding="utf-8")
    )
    train_profiles = _load_jsonl(arguments.train_data / "profiles.jsonl")
    train_jobs = _load_jsonl(arguments.train_data / "jobs.jsonl")
    weak_labels = _load_jsonl(arguments.train_data / "suitability-labels.jsonl")
    candidates = _load_jsonl(arguments.train_data / "candidate-manifest.jsonl")
    pilot_profiles = _load_jsonl(arguments.pilot_data / "profiles.jsonl")
    pilot_jobs = _load_jsonl(arguments.pilot_data / "jobs.jsonl")
    pilot_labels = _load_jsonl(arguments.pilot_data / "labels.jsonl")
    validate_data_manifest(data_manifest, arguments.train_data, train_profiles)
    validate_snapshot_dataset(train_profiles, train_jobs, weak_labels, candidates)
    validate_dataset(pilot_profiles, pilot_jobs, pilot_labels)
    pilot_source_profiles = _load_source_profiles(
        arguments.pilot_profile_json, {row["profileId"] for row in pilot_profiles}
    )
    train_rows, valid_rows, lineage_audit = select_lineage_clean_weak_rows(
        train_profiles, weak_labels, pilot_source_profiles, pilot_labels
    )
    _validate_no_pilot_leakage(
        train_profiles,
        train_jobs,
        train_rows,
        pilot_profiles,
        pilot_jobs,
        pilot_labels,
        pilot_source_profiles,
    )
    encoder = FrozenE5Encoder.from_pretrained(
        device=device,
        model_revision=arguments.model_revision,
        batch_size=arguments.embedding_batch_size,
    )
    cache = arguments.output / "embedding-cache"
    train_profile_vectors = _cache_embeddings(
        encoder, train_profiles, id_field="profileId", text_field="text", profile=True,
        cache_path=cache / "train-profiles.pt",
    )
    train_job_vectors = _cache_embeddings(
        encoder, train_jobs, id_field="jobId", text_field="text", profile=False,
        cache_path=cache / "train-jobs.pt",
    )
    pilot_profile_vectors = _cache_embeddings(
        encoder, pilot_profiles, id_field="profileId", text_field="text", profile=True,
        cache_path=cache / "pilot-profiles.pt",
    )
    pilot_job_vectors = _cache_embeddings(
        encoder, pilot_jobs, id_field="jobId", text_field="text", profile=False,
        cache_path=cache / "pilot-jobs.pt",
    )
    train_tensors = _pair_tensors(
        train_rows, train_profile_vectors, train_job_vectors, score_field="suitabilityScore"
    )
    valid_tensors = _pair_tensors(
        valid_rows, train_profile_vectors, train_job_vectors, score_field="suitabilityScore"
    )
    base_ranker = load_checkpoint(
        arguments.base_checkpoint,
        embedding_dimension=train_tensors[0].shape[1],
        hidden_dimension=arguments.hidden_dimension,
    ).to(device)
    actual_hidden_dimension = validate_hidden_dimension(
        base_ranker, arguments.hidden_dimension
    )
    ranker = deepcopy(base_ranker)
    learning = fine_tune_with_validation(
        ranker, train_tensors, valid_tensors, epochs=arguments.epochs,
        learning_rate=arguments.learning_rate, batch_size=arguments.batch_size,
        patience=arguments.patience,
    )
    evaluation_pairs = [row for row in pilot_labels if row["split"] in {"valid", "test"}]
    profiles_by_id = {row["profileId"]: row["text"] for row in pilot_profiles}
    jobs_by_id = {row["jobId"]: row["text"] for row in pilot_jobs}
    pair_ids = [(row["profileId"], row["jobId"]) for row in evaluation_pairs]
    score_maps = build_lexical_scores(profiles_by_id, jobs_by_id, pair_ids)
    pilot_jobs_by_id = {row["jobId"]: row for row in pilot_jobs}
    score_maps[RULE_BASELINE_ID] = _rule_score_map(
        evaluation_pairs, pilot_source_profiles, pilot_jobs_by_id
    )
    score_maps[FROZEN_E5_COSINE_ID] = _cosine_score_map(
        evaluation_pairs, pilot_profile_vectors, pilot_job_vectors
    )
    score_maps["match-pilot-mlp-v1"] = _raw_score_map(
        base_ranker, evaluation_pairs, pilot_profile_vectors, pilot_job_vectors
    )
    suitability_ranker = create_suitability_ranker(ranker)
    score_maps[MODEL_ID] = _suitability_score_map(
        suitability_ranker, evaluation_pairs, pilot_profile_vectors, pilot_job_vectors
    )
    evaluation = {
        model: {
            split: evaluate_ranking(scores, pilot_labels, split=split, label_field="teacherLabel")
            for split in ("valid", "test")
        }
        for model, scores in score_maps.items()
    }
    bootstraps: dict[str, Any] = {}
    for baseline in ("char_tfidf", RULE_BASELINE_ID, "match-pilot-mlp-v1"):
        bootstraps[baseline] = {}
        for split in ("valid", "test"):
            bootstraps[baseline][split] = {}
            for metric in ("ndcgAt10", "map"):
                candidate_values = {
                    profile_id: values[metric]
                    for profile_id, values in evaluation[MODEL_ID][split]["perProfile"].items()
                    if values[metric] is not None
                    and evaluation[baseline][split]["perProfile"][profile_id][metric] is not None
                }
                baseline_values = {
                    profile_id: evaluation[baseline][split]["perProfile"][profile_id][metric]
                    for profile_id in candidate_values
                }
                bootstraps[baseline][split][metric] = paired_bootstrap(
                    candidate_values, baseline_values, seed=arguments.seed
                )
    checkpoint = arguments.output / "checkpoint" / "ranker.pt"
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "model": MODEL_ID,
        "state": suitability_ranker.cpu().state_dict(),
        "embeddingDimension": train_tensors[0].shape[1],
        "hiddenDimension": actual_hidden_dimension,
        "outputContract": OUTPUT_CONTRACT,
        "trainingTarget": {
            "source": "structured-weak-label-v1",
            "internalScale": "suitabilityScore * 3 / 100",
        },
    }, checkpoint)
    scores_path = arguments.output / "evaluation" / "retrieval-scores.jsonl"
    scores_path.parent.mkdir(parents=True, exist_ok=True)
    with scores_path.open("w", encoding="utf-8", newline="\n") as target:
        for model, scores in score_maps.items():
            for profile_id in sorted(scores):
                for job_id, score in sorted(scores[profile_id].items()):
                    target.write(json.dumps({
                        "model": model,
                        "profileId": profile_id,
                        "jobId": job_id,
                        "score": score,
                    }, ensure_ascii=False) + "\n")
    suitability_path = arguments.output / "evaluation" / "suitability-scores.jsonl"
    with suitability_path.open("w", encoding="utf-8", newline="\n") as target:
        for profile_id in sorted(score_maps[MODEL_ID]):
            for job_id, score in sorted(score_maps[MODEL_ID][profile_id].items()):
                target.write(json.dumps({
                    "profileId": profile_id,
                    "jobId": job_id,
                    "suitabilityScore": score,
                }, ensure_ascii=False) + "\n")
    input_paths = [
        arguments.train_data / "data-manifest.json",
        arguments.train_data / "profiles.jsonl",
        arguments.train_data / "jobs.jsonl",
        arguments.train_data / "suitability-labels.jsonl",
        arguments.train_data / "candidate-manifest.jsonl",
        arguments.pilot_data / "profiles.jsonl",
        arguments.pilot_data / "jobs.jsonl",
        arguments.pilot_data / "labels.jsonl",
        arguments.base_checkpoint,
    ]
    source_hashes = {
        str(path): _sha256(path)
        for path in sorted(arguments.pilot_profile_json.glob("*.json"))
    }
    report = {
        "schemaVersion": "match-snapshot-evaluation-v1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "model": MODEL_ID,
        "outputContract": OUTPUT_CONTRACT,
        "device": device,
        "runtime": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda": torch.version.cuda,
        },
        "encoder": {
            "name": "intfloat/multilingual-e5-base",
            "revision": encoder.model_revision,
            "frozen": True,
        },
        "seed": arguments.seed,
        "hyperparameters": {
            "embeddingBatchSize": arguments.embedding_batch_size,
            "batchSize": arguments.batch_size,
            "hiddenDimension": actual_hidden_dimension,
            "epochs": arguments.epochs,
            "learningRate": arguments.learning_rate,
            "patience": arguments.patience,
        },
        "training": {
            "totalProfiles": len(train_profiles),
            "profiles": len({row["profileId"] for row in train_rows}),
            "trainPairs": len(train_rows),
            "validPairs": len(valid_rows),
            "lineageAudit": lineage_audit,
            **learning,
        },
        "evaluation": evaluation,
        "pairedBootstrap": bootstraps,
        "evaluationContract": {
            "validProfiles": evaluation[MODEL_ID]["valid"]["profileCount"],
            "testProfiles": evaluation[MODEL_ID]["test"]["profileCount"],
            "teacherClass3Count": sum(row["teacherLabel"] == 3 for row in evaluation_pairs),
            "interpretation": "탐색적 파일럿 비교이며 제품 승인 근거가 아니다.",
        },
        "inputs": {**{str(path): _sha256(path) for path in input_paths}, **source_hashes},
    }
    metrics = arguments.output / "evaluation" / "metrics.json"
    metrics.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = arguments.output / "evaluation" / "summary.md"
    lines = [
        "# 519개 합성 프로필 1차 모델 평가",
        "",
        "출력은 합격 확률이 아닌 프로필 근거와 공고 요구사항의 단일 0–100 적합도입니다.",
        f"학습에는 {len({row['profileId'] for row in train_rows})}개 프로필, {len(train_rows)}쌍을 사용했습니다.",
        "평가는 학습과 겹치지 않는 valid 5개·test 5개 프로필의 Luna teacher 순위입니다.",
        "",
        "| 모델 | Valid NDCG@10 | Valid MAP | Test NDCG@10 | Test MAP |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for model, result in evaluation.items():
        valid = result["valid"]["metrics"]
        test = result["test"]["metrics"]
        lines.append(
            f"| {model} | {valid['ndcgAt10']:.4f} | {valid['map']:.4f} | "
            f"{test['ndcgAt10']:.4f} | {test['map']:.4f} |"
        )
    test_bootstrap = bootstraps["char_tfidf"]["test"]["ndcgAt10"]
    rule_bootstrap = bootstraps[RULE_BASELINE_ID]["test"]["ndcgAt10"]
    previous_bootstrap = bootstraps["match-pilot-mlp-v1"]["test"]["ndcgAt10"]
    lines.extend([
        "",
        "## 핵심 비교",
        "",
        (
            f"Test NDCG@10의 문자 TF-IDF 대비 평균 차이는 "
            f"{test_bootstrap['meanDifference']:+.4f}이며, profile bootstrap 95% 구간은 "
            f"[{test_bootstrap['lower95']:+.4f}, {test_bootstrap['upper95']:+.4f}]입니다."
        ),
        (
            f"구조 규칙 대비 차이는 {rule_bootstrap['meanDifference']:+.4f} "
            f"[{rule_bootstrap['lower95']:+.4f}, {rule_bootstrap['upper95']:+.4f}], "
            f"기존 MLP 대비 차이는 {previous_bootstrap['meanDifference']:+.4f} "
            f"[{previous_bootstrap['lower95']:+.4f}, {previous_bootstrap['upper95']:+.4f}]입니다."
        ),
        "teacher label에 3점 사례가 없어 MRR/AUC는 이 파일럿에서 정의하지 않습니다.",
    ])
    summary.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {
        "checkpoint": str(checkpoint),
        "metrics": str(metrics),
        "summary": str(summary),
        "suitabilityScores": str(suitability_path),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-data", type=Path, required=True)
    parser.add_argument("--pilot-data", type=Path, required=True)
    parser.add_argument("--pilot-profile-json", type=Path, required=True)
    parser.add_argument("--base-checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model-revision", default="d128750597153bb5987e10b1c3493a34e5a4502a")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--embedding-batch-size", type=int, default=32)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--hidden-dimension", type=int, default=256)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--learning-rate", type=float, default=5e-4)
    parser.add_argument("--patience", type=int, default=5)
    parser.add_argument("--require-cuda", action="store_true")
    return parser


def main() -> int:
    arguments = build_parser().parse_args()
    try:
        result = run(arguments)
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"match snapshot failed: {error}")
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
