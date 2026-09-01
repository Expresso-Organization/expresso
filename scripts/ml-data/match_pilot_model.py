"""동결 multilingual-E5와 작은 MLP로 채용 추천 파일럿 점수를 생성한다."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib
import json
import os
from pathlib import Path
import platform
import random
import sys
from typing import Any, Iterable


MODEL_NAME = "intfloat/multilingual-e5-base"
MODEL_REVISION = "d128750597153bb5987e10b1c3493a34e5a4502a"
FROZEN_E5_COSINE_ID = "frozen-e5-cosine-v1"
MODEL_ID = "match-pilot-mlp-v1"
DEFAULT_OUTPUT = Path("var/ml-data/experiments/match-pilot-v0")
DEFAULT_SEED = 42


def _load_stdlib_profile() -> None:
    """동일 디렉터리의 profile.py가 PyTorch의 표준 라이브러리 import를 가리지 않게 한다."""
    module = sys.modules.get("profile")
    if module is not None and getattr(module, "__file__", "") != str(Path(__file__).with_name("profile.py")):
        return
    script_directory = str(Path(__file__).parent)
    original_path = list(sys.path)
    try:
        sys.modules.pop("profile", None)
        sys.path = [entry for entry in sys.path if Path(entry or ".").resolve() != Path(script_directory).resolve()]
        sys.modules["profile"] = importlib.import_module("profile")
    finally:
        sys.path = original_path


_load_stdlib_profile()


def _torch():
    try:
        import torch
    except ImportError as error:
        raise RuntimeError("torch is required; use uv run --with torch") from error
    return torch


def _transformers():
    try:
        from transformers import AutoModel, AutoTokenizer
    except ImportError as error:
        raise RuntimeError(
            "transformers is required; use uv run --with transformers"
        ) from error
    return AutoModel, AutoTokenizer


def require_device(torch: Any, *, require_cuda: bool, cuda_available: bool | None = None) -> str:
    available = torch.cuda.is_available() if cuda_available is None else cuda_available
    if require_cuda and not available:
        raise RuntimeError("CUDA is required but is not available")
    return "cuda" if available else "cpu"


def set_seed(torch: Any, seed: int) -> None:
    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    if hasattr(torch.backends, "cudnn"):
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
    if hasattr(torch.backends, "cuda"):
        torch.backends.cuda.matmul.allow_tf32 = False


def _mean_pool_normalize(torch: Any, hidden: Any, attention_mask: Any) -> Any:
    weights = attention_mask.unsqueeze(-1).to(dtype=hidden.dtype)
    pooled = (hidden * weights).sum(dim=1) / weights.sum(dim=1).clamp(min=1e-9)
    return torch.nn.functional.normalize(pooled, p=2, dim=1)


class FrozenE5Encoder:
    """E5 접두사와 attention-aware 평균 풀링을 고정한다."""

    def __init__(
        self,
        *,
        tokenizer: Any,
        model: Any,
        device: str,
        model_revision: str | None = None,
        batch_size: int = 32,
    ) -> None:
        self.tokenizer = tokenizer
        self.model = model
        self.device = device
        self.model_revision = model_revision or getattr(getattr(model, "config", None), "_commit_hash", None)
        self.batch_size = batch_size
        self.model.to(device)
        self.model.eval()
        for parameter in self.model.parameters():
            parameter.requires_grad_(False)

    @classmethod
    def from_pretrained(
        cls,
        *,
        device: str,
        model_name: str = MODEL_NAME,
        model_revision: str | None = None,
        batch_size: int = 32,
    ) -> "FrozenE5Encoder":
        auto_model, auto_tokenizer = _transformers()
        options = {"revision": model_revision} if model_revision else {}
        return cls(
            tokenizer=auto_tokenizer.from_pretrained(model_name, **options),
            model=auto_model.from_pretrained(model_name, **options),
            device=device,
            model_revision=model_revision,
            batch_size=batch_size,
        )

    def embed_profiles(self, texts: list[str]) -> Any:
        return self._embed(texts, prefix="query: ")

    def embed_jobs(self, texts: list[str]) -> Any:
        return self._embed(texts, prefix="passage: ")

    def _embed(self, texts: list[str], *, prefix: str) -> Any:
        torch = _torch()
        if not texts:
            raise ValueError("cannot embed an empty text list")
        vectors: list[Any] = []
        with torch.no_grad():
            for start in range(0, len(texts), self.batch_size):
                batch = [prefix + text for text in texts[start : start + self.batch_size]]
                encoded = self.tokenizer(
                    batch,
                    padding=True,
                    truncation=True,
                    max_length=512,
                    return_tensors="pt",
                )
                encoded = {key: value.to(self.device) for key, value in encoded.items()}
                output = self.model(**encoded)
                vectors.append(
                    _mean_pool_normalize(torch, output.last_hidden_state, encoded["attention_mask"])
                    .cpu()
                )
        return torch.cat(vectors, dim=0)


def pair_features(profile_embeddings: Any, job_embeddings: Any) -> Any:
    if profile_embeddings.shape != job_embeddings.shape:
        raise ValueError("profile and job embeddings must have the same shape")
    torch = _torch()
    return torch.cat(
        (
            profile_embeddings,
            job_embeddings,
            torch.abs(profile_embeddings - job_embeddings),
            profile_embeddings * job_embeddings,
        ),
        dim=1,
    )


def create_ranker(*, embedding_dimension: int, hidden_dimension: int = 256, seed: int = DEFAULT_SEED) -> Any:
    torch = _torch()
    set_seed(torch, seed)
    return torch.nn.Sequential(
        torch.nn.Linear(embedding_dimension * 4, hidden_dimension),
        torch.nn.ReLU(),
        torch.nn.Linear(hidden_dimension, 1),
    )


def train_ranker(
    ranker: Any,
    profile_embeddings: Any,
    job_embeddings: Any,
    labels: Any,
    *,
    epochs: int,
    learning_rate: float,
    batch_size: int = 64,
) -> list[float]:
    if epochs <= 0 or batch_size <= 0 or learning_rate <= 0:
        raise ValueError("epochs, learning_rate, and batch_size must be positive")
    torch = _torch()
    if len(labels) != len(profile_embeddings):
        raise ValueError("labels and embeddings must contain the same number of pairs")
    ranker.train()
    optimizer = torch.optim.AdamW(ranker.parameters(), lr=learning_rate)
    loss_function = torch.nn.MSELoss()
    features = pair_features(profile_embeddings, job_embeddings).to(next(ranker.parameters()).device)
    targets = labels.to(dtype=torch.float32, device=features.device).reshape(-1, 1)
    losses: list[float] = []
    for _ in range(epochs):
        total = 0.0
        count = 0
        for start in range(0, len(targets), batch_size):
            end = start + batch_size
            optimizer.zero_grad()
            loss = loss_function(ranker(features[start:end]), targets[start:end])
            loss.backward()
            optimizer.step()
            size = end - start if end <= len(targets) else len(targets) - start
            total += loss.item() * size
            count += size
        losses.append(total / count)
    return losses


def score_candidates(ranker: Any, profile_embeddings: Any, job_embeddings: Any) -> Any:
    torch = _torch()
    ranker.eval()
    with torch.no_grad():
        features = pair_features(profile_embeddings, job_embeddings).to(next(ranker.parameters()).device)
        return ranker(features).reshape(-1).cpu()


def frozen_e5_cosine_scores(profile_embeddings: Any, job_embeddings: Any) -> Any:
    if profile_embeddings.shape != job_embeddings.shape:
        raise ValueError("profile and job embeddings must have the same shape")
    return (profile_embeddings * job_embeddings).sum(dim=1)


def load_checkpoint(path: Path, *, embedding_dimension: int, hidden_dimension: int = 256) -> Any:
    torch = _torch()
    payload = torch.load(path, map_location="cpu", weights_only=True)
    if payload.get("embeddingDimension") != embedding_dimension:
        raise ValueError("checkpoint embedding dimension does not match encoder")
    ranker = create_ranker(
        embedding_dimension=embedding_dimension,
        hidden_dimension=payload.get("hiddenDimension", hidden_dimension),
    )
    ranker.load_state_dict(payload["state"])
    return ranker


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                raise ValueError(f"{path}:{line_number}: blank line")
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_number}: expected object")
            rows.append(row)
    if not rows:
        raise ValueError(f"{path}: empty file")
    return rows


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _cache_embeddings(
    encoder: FrozenE5Encoder,
    records: list[dict[str, Any]],
    *,
    id_field: str,
    text_field: str,
    profile: bool,
    cache_path: Path,
) -> dict[str, Any]:
    torch = _torch()
    identities = [(row[id_field], row[text_field]) for row in records]
    cache_key = hashlib.sha256(
        json.dumps(
            {"identities": identities, "revision": encoder.model_revision, "profile": profile},
            ensure_ascii=False,
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    if cache_path.exists():
        payload = torch.load(cache_path, map_location="cpu", weights_only=False)
        if payload.get("key") == cache_key:
            return payload["embeddings"]
    texts = [text for _, text in identities]
    vectors = encoder.embed_profiles(texts) if profile else encoder.embed_jobs(texts)
    embeddings = {identifier: vector for (identifier, _), vector in zip(identities, vectors)}
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"key": cache_key, "embeddings": embeddings}, cache_path)
    return embeddings


def _pair_tensors(
    pairs: Iterable[dict[str, Any]],
    profile_embeddings: dict[str, Any],
    job_embeddings: dict[str, Any],
    *,
    label_field: str,
) -> tuple[Any, Any, Any]:
    torch = _torch()
    profile_vectors: list[Any] = []
    job_vectors: list[Any] = []
    labels: list[float] = []
    for pair in pairs:
        profile_id = pair["profileId"]
        job_id = pair["jobId"]
        if profile_id not in profile_embeddings or job_id not in job_embeddings:
            raise ValueError(f"pair references unknown embedding: {profile_id}/{job_id}")
        profile_vectors.append(profile_embeddings[profile_id])
        job_vectors.append(job_embeddings[job_id])
        label = pair[label_field]
        if isinstance(label, bool) or not isinstance(label, (int, float)) or not 0 <= label <= 3:
            raise ValueError(f"pair {profile_id}/{job_id} has invalid {label_field}")
        labels.append(float(label))
    if not labels:
        raise ValueError("training pairs are empty")
    return torch.stack(profile_vectors), torch.stack(job_vectors), torch.tensor(labels)


def write_candidate_scores(
    path: Path,
    *,
    model: str,
    pairs: Iterable[tuple[str, str]],
    scores: Any,
    append: bool = False,
) -> None:
    pair_rows = list(pairs)
    if len(pair_rows) != len(scores):
        raise ValueError("candidate score count differs from pair count")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a" if append else "w", encoding="utf-8", newline="\n") as handle:
        for (profile_id, job_id), score in zip(pair_rows, scores):
            handle.write(
                json.dumps(
                    {
                        "model": model,
                        "profileId": profile_id,
                        "jobId": job_id,
                        "score": float(score),
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )


def _jth_rows(path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    rows = _load_jsonl(path)
    profiles: dict[str, dict[str, Any]] = {}
    jobs: dict[str, dict[str, Any]] = {}
    pairs: list[dict[str, Any]] = []
    for row in rows:
        required = {"profileId", "profileText", "jobId", "jobText", "label", "split"}
        if set(row) != required:
            raise ValueError(f"JTH pair fields differ: expected {sorted(required)}")
        if row["split"] != "train":
            continue
        profiles.setdefault(row["profileId"], {"profileId": row["profileId"], "text": row["profileText"]})
        jobs.setdefault(row["jobId"], {"jobId": row["jobId"], "text": row["jobText"]})
        pairs.append({"profileId": row["profileId"], "jobId": row["jobId"], "label": row["label"]})
    return list(profiles.values()), list(jobs.values()), pairs


def validate_training_dataset(
    profiles: list[dict[str, Any]],
    jobs: list[dict[str, Any]],
    labels: list[dict[str, Any]],
) -> None:
    """학습 split을 선택하기 전에 공통 평가 계약과 누수 규칙을 검증한다."""
    from ranking_evaluation import validate_dataset

    validate_dataset(profiles, jobs, labels)


def validate_candidate_manifest(
    candidates: list[dict[str, Any]], labels: list[dict[str, Any]]
) -> None:
    expected_fields = {"profileId", "jobId", "split"}
    if any(set(row) != expected_fields for row in candidates):
        raise ValueError("candidate manifest fields must be profileId, jobId, split")
    candidate_pairs = {
        (row["profileId"], row["jobId"], row["split"]) for row in candidates
    }
    label_pairs = {(row["profileId"], row["jobId"], row["split"]) for row in labels}
    if len(candidate_pairs) != len(candidates) or candidate_pairs != label_pairs:
        raise ValueError("candidate manifest pairs differ from labels")


def _manifest(
    *,
    torch: Any,
    device: str,
    model_revision: str | None,
    inputs: list[Path],
    counts: dict[str, int],
    split_counts: dict[str, dict[str, int]],
    arguments: argparse.Namespace,
) -> dict[str, Any]:
    return {
        "schemaVersion": "match-pilot-run-manifest-v1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "seed": arguments.seed,
        "model": {"name": MODEL_NAME, "revision": model_revision, "frozen": True},
        "device": device,
        "runtime": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda": torch.version.cuda,
            "cudaAvailable": torch.cuda.is_available(),
        },
        "inputSha256": {str(path): _sha256(path) for path in inputs},
        "counts": counts,
        "splitCounts": split_counts,
        "hyperparameters": {
            "embeddingDimension": 768,
            "hiddenDimension": arguments.hidden_dimension,
            "batchSize": arguments.batch_size,
            "pretrainEpochs": arguments.pretrain_epochs,
            "fineTuneEpochs": arguments.fine_tune_epochs,
            "learningRate": arguments.learning_rate,
        },
    }


def run(arguments: argparse.Namespace) -> dict[str, Any]:
    torch = _torch()
    device = require_device(torch, require_cuda=arguments.require_cuda)
    set_seed(torch, arguments.seed)
    profiles = _load_jsonl(arguments.profiles)
    jobs = _load_jsonl(arguments.jobs)
    labels = _load_jsonl(arguments.labels)
    validate_training_dataset(profiles, jobs, labels)
    input_paths = [arguments.jth_pairs, arguments.profiles, arguments.jobs, arguments.labels]
    if arguments.candidate_manifest is not None:
        validate_candidate_manifest(_load_jsonl(arguments.candidate_manifest), labels)
        input_paths.append(arguments.candidate_manifest)
    train_labels = [row for row in labels if row["split"] == "train"]
    jth_profiles, jth_jobs, jth_pairs = _jth_rows(arguments.jth_pairs)
    encoder = FrozenE5Encoder.from_pretrained(
        device=device,
        model_revision=arguments.model_revision,
        batch_size=arguments.batch_size,
    )
    output = arguments.output
    profile_vectors = _cache_embeddings(
        encoder, profiles, id_field="profileId", text_field="text", profile=True,
        cache_path=output / "embedding-cache" / "expresso-profiles.pt",
    )
    job_vectors = _cache_embeddings(
        encoder, jobs, id_field="jobId", text_field="text", profile=False,
        cache_path=output / "embedding-cache" / "expresso-jobs.pt",
    )
    jth_profile_vectors = _cache_embeddings(
        encoder, jth_profiles, id_field="profileId", text_field="text", profile=True,
        cache_path=output / "embedding-cache" / "jth-profiles.pt",
    )
    jth_job_vectors = _cache_embeddings(
        encoder, jth_jobs, id_field="jobId", text_field="text", profile=False,
        cache_path=output / "embedding-cache" / "jth-jobs.pt",
    )
    jth_profile_tensor, jth_job_tensor, jth_labels = _pair_tensors(
        jth_pairs, jth_profile_vectors, jth_job_vectors, label_field="label"
    )
    profile_tensor, job_tensor, fine_tune_labels = _pair_tensors(
        train_labels, profile_vectors, job_vectors, label_field="teacherLabel"
    )
    ranker = create_ranker(
        embedding_dimension=jth_profile_tensor.shape[1],
        hidden_dimension=arguments.hidden_dimension,
        seed=arguments.seed,
    ).to(device)
    pretrain_losses = train_ranker(
        ranker, jth_profile_tensor, jth_job_tensor, jth_labels,
        epochs=arguments.pretrain_epochs, learning_rate=arguments.learning_rate,
        batch_size=arguments.batch_size,
    )
    fine_tune_losses = train_ranker(
        ranker, profile_tensor, job_tensor, fine_tune_labels,
        epochs=arguments.fine_tune_epochs, learning_rate=arguments.learning_rate,
        batch_size=arguments.batch_size,
    )
    checkpoint = output / "checkpoint" / "ranker.pt"
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model": MODEL_ID,
            "state": ranker.cpu().state_dict(),
            "embeddingDimension": jth_profile_tensor.shape[1],
            "hiddenDimension": arguments.hidden_dimension,
        },
        checkpoint,
    )
    pair_rows = [(row["profileId"], row["jobId"]) for row in labels]
    all_profile_vectors, all_job_vectors, _ = _pair_tensors(
        [{**row, "scoreLabel": row["teacherLabel"]} for row in labels],
        profile_vectors, job_vectors, label_field="scoreLabel",
    )
    cosine_scores = frozen_e5_cosine_scores(all_profile_vectors, all_job_vectors)
    scores = score_candidates(ranker, all_profile_vectors, all_job_vectors)
    scores_path = output / "candidate-scores" / "candidate-scores.jsonl"
    write_candidate_scores(
        scores_path,
        model=FROZEN_E5_COSINE_ID,
        pairs=pair_rows,
        scores=cosine_scores,
    )
    write_candidate_scores(
        scores_path,
        model=MODEL_ID,
        pairs=pair_rows,
        scores=scores,
        append=True,
    )
    manifest = _manifest(
        torch=torch,
        device=device,
        model_revision=encoder.model_revision,
        inputs=input_paths,
        counts={"jthPretrainPairs": len(jth_pairs), "expressoFineTunePairs": len(train_labels), "candidateScores": len(pair_rows) * 2},
        split_counts={
            "profiles": {
                split: sum(row["split"] == split for row in profiles)
                for split in ("train", "valid", "test")
            },
            "jobs": {
                split: sum(row["split"] == split for row in jobs)
                for split in ("train", "valid", "test")
            },
            "pairs": {
                split: sum(row["split"] == split for row in labels)
                for split in ("train", "valid", "test")
            },
        },
        arguments=arguments,
    )
    output.mkdir(parents=True, exist_ok=True)
    (output / "run-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return {"checkpoint": checkpoint, "candidateScores": scores_path, "manifest": output / "run-manifest.json"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jth-pairs", type=Path, required=True)
    parser.add_argument("--profiles", type=Path, required=True)
    parser.add_argument("--jobs", type=Path, required=True)
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--candidate-manifest", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--model-revision", default=MODEL_REVISION)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--hidden-dimension", type=int, default=256)
    parser.add_argument("--pretrain-epochs", type=int, default=3)
    parser.add_argument("--fine-tune-epochs", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--require-cuda", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    try:
        result = run(arguments)
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"match pilot failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps({name: str(path) for name, path in result.items()}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
