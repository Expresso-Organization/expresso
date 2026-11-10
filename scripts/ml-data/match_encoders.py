"""Bi-Encoder 비교 후보 인코더 4종과 공통 임베딩 래퍼.

설계서 4.4 2단계가 네 인코더를 같은 조건에서 비교해 정하라고 한다. pooling과 정규화는
각 저장소의 sentence-transformers 설정(`modules.json` · `1_Pooling/config.json`)이 정하므로
여기서 다시 구현하지 않는다. 이 파일이 정하는 것은 프로필 · 공고 앞에 붙일 prompt와 모델의
최대 길이뿐이다.

출처(2026-11-10 Hugging Face 저장소 조회):
- multilingual-e5-base: mean pooling, `sentence_bert_config.json` max_seq_length 512.
  모델 카드가 검색 질의에 `query: `, 문서에 `passage: `를 붙이라고 한다. 파일럿도 같다.
- KURE-v1 · bge-m3: CLS pooling, max_seq_length 8,192. `config_sentence_transformers.json`의
  `prompts`가 비어 있어 prompt를 붙이지 않는다.
- Qwen3-Embedding-0.6B: last-token pooling, 모델 카드 Context Length 32k. 설정의 `query` prompt
  형식이 `Instruct: {과제}\\nQuery:`이고 `document` prompt는 비어 있다. 모델 카드가 과제에 맞춘
  지시문을 영어로 쓰라고 권하므로 과제 문장만 바꿨다. `transformers>=4.51.0`이 필요하다.

프로필이 질의, 공고가 문서다. 스크리닝은 프로필 하나로 공고 전체를 찾는 일이기 때문이다.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import time
from typing import Any, Sequence


@dataclass(frozen=True)
class EncoderSpec:
    key: str
    model_id: str
    profile_prompt: str
    job_prompt: str
    model_limit: int

    def cache_identity(self, max_length: int) -> str:
        """임베딩 캐시 키. 인코더 · prompt · 최대 길이가 다르면 다른 벡터다."""
        payload = json.dumps({**asdict(self), "maxLength": max_length}, sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


QWEN3_PROFILE_PROMPT = (
    "Instruct: Given a job seeker's career records, retrieve job postings whose requirements these records satisfy\n"
    "Query:"
)

ENCODERS: dict[str, EncoderSpec] = {
    "e5": EncoderSpec("e5", "intfloat/multilingual-e5-base", "query: ", "passage: ", 512),
    "kure": EncoderSpec("kure", "nlpai-lab/KURE-v1", "", "", 8_192),
    "bge-m3": EncoderSpec("bge-m3", "BAAI/bge-m3", "", "", 8_192),
    "qwen3": EncoderSpec("qwen3", "Qwen/Qwen3-Embedding-0.6B", QWEN3_PROFILE_PROMPT, "", 32_768),
}


def prompt_for(spec: EncoderSpec, role: str) -> str:
    if role not in {"profile", "job"}:
        raise ValueError("role must be profile or job")
    return spec.profile_prompt if role == "profile" else spec.job_prompt


def count_tokens(tokenizer: Any, prompt: str, texts: Sequence[str]) -> list[int]:
    """sentence-transformers가 prompt를 앞에 붙여 토큰화하는 것과 같은 길이."""
    return [len(tokenizer(prompt + text, add_special_tokens=True)["input_ids"]) for text in texts]


def choose_max_length(spec: EncoderSpec, token_lengths: Sequence[int]) -> int:
    """모델 한도와 데이터의 최장 텍스트 중 작은 값. 데이터보다 길게 잡으면 메모리만 쓴다."""
    if not token_lengths:
        raise ValueError("token lengths must not be empty")
    return min(spec.model_limit, max(token_lengths))


def length_summary(token_lengths: Sequence[int], max_length: int) -> dict[str, Any]:
    ordered = sorted(token_lengths)

    def percentile(fraction: float) -> int:
        return ordered[min(len(ordered) - 1, round((len(ordered) - 1) * fraction))]

    truncated = sum(length > max_length for length in ordered)
    return {
        "texts": len(ordered),
        "p50": percentile(0.5),
        "p90": percentile(0.9),
        "p99": percentile(0.99),
        "max": ordered[-1],
        "maxLength": max_length,
        "truncated": truncated,
        "truncatedFraction": truncated / len(ordered),
    }


class SentenceEncoder:
    """동결 인코더. `_cached_embeddings`가 부르는 `embed_profiles` · `embed_jobs`를 제공한다."""

    def __init__(self, spec: EncoderSpec, model: Any, *, device: str, batch_size: int, max_length: int) -> None:
        if batch_size <= 0 or max_length <= 0:
            raise ValueError("batch size and max length must be positive")
        self.spec = spec
        self.model = model
        self.device = device
        self.batch_size = batch_size
        self.runs: list[dict[str, Any]] = []
        self.set_max_length(max_length)

    @classmethod
    def load(cls, spec: EncoderSpec, *, device: str, batch_size: int, max_length: int, model_path: str | None = None) -> "SentenceEncoder":
        from sentence_transformers import SentenceTransformer

        model = SentenceTransformer(model_path or spec.model_id, device=device)
        return cls(spec, model, device=device, batch_size=batch_size, max_length=max_length)

    def token_lengths(self, texts: Sequence[str], *, role: str) -> list[int]:
        return count_tokens(self.model.tokenizer, prompt_for(self.spec, role), texts)

    def set_max_length(self, max_length: int) -> None:
        if max_length <= 0:
            raise ValueError("max length must be positive")
        self.max_length = max_length
        self.model.max_seq_length = max_length

    def embed_profiles(self, texts: list[str]) -> Any:
        return self._embed(texts, role="profile")

    def embed_jobs(self, texts: list[str]) -> Any:
        return self._embed(texts, role="job")

    def embed_records(self, texts: list[str]) -> Any:
        """모델 B 코사인 baseline. 기록은 프로필의 일부이므로 프로필 prompt를 쓴다."""
        return self._embed(texts, role="profile")

    def _embed(self, texts: list[str], *, role: str) -> Any:
        import torch

        prompt = prompt_for(self.spec, role)
        batch_size = self.batch_size
        cuda = self.device == "cuda"
        if cuda:
            torch.cuda.reset_peak_memory_stats()
        started = time.perf_counter()
        while True:
            try:
                vectors = self.model.encode(
                    list(texts),
                    prompt=prompt or None,
                    batch_size=batch_size,
                    convert_to_tensor=True,
                    normalize_embeddings=True,
                    show_progress_bar=False,
                )
                break
            except torch.OutOfMemoryError:
                # sentence-transformers는 긴 텍스트부터 배치를 만든다. 첫 배치에서 넘치면
                # 배치를 줄여 처음부터 다시 돈다. 크기 1에서도 넘치면 장비가 감당하지 못한다.
                if batch_size == 1:
                    raise
                batch_size //= 2
                if cuda:
                    torch.cuda.empty_cache()
        seconds = time.perf_counter() - started
        vectors = vectors.float().cpu()
        self.runs.append(
            {
                "role": role,
                "texts": len(texts),
                "seconds": round(seconds, 3),
                "textsPerSecond": len(texts) / seconds if seconds > 0 else None,
                "batchSize": batch_size,
                "peakGpuMemoryBytes": int(torch.cuda.max_memory_allocated()) if cuda else None,
                "vectorBytes": int(vectors.numel() * 4),
            }
        )
        return vectors
