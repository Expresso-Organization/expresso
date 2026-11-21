"""OpenAI Decisions API · TypeSafe Jev로 적합도를 채점해 Cross-Encoder와 같은 형식의 점수 파일을 쓴다.

Bi-Encoder+MLP 선별 뒤의 재정렬(모델 A)과 기록 채점(모델 B)을 외부 API가 맡을 수 있는지 보는
실험이다. 쓴 점수 파일을 `match_experiments.py eval-cross --cross-scores --record-scores`에 넘기면
Cross-Encoder와 같은 지표 · 같은 규칙 baseline 비교가 나온다.

요청 모양은 서비스가 부를 모양과 같다.
    모델 A  입력 = 프로필 1건,  질문 = 후보 공고마다 score 1개   (프로필 하나 · 상위 K 공고)
    모델 B  입력 = 공고 1건,    질문 = 기록마다 score 1개         (공고 하나 · 기록 여러 건)

출처(2026-11-10 조회):
- Decisions API: `POST https://api.openai.com/v1/decisions`, 모델은 `gpt-6-luna` 하나, `input` +
  `questions`(1–400개). score 질문은 `levels` 2–10개(`label` · `description`)이고 응답 `score`는
  등급 번호(0부터)의 확률 가중 평균이다. 거절한 질문은 `type: "refusal"`로 온다. 입력 100만
  토큰당 $0.10, 출력 무료. https://developers.openai.com/api/docs/guides/decisions
- Jev: `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer`, `state` + 이름 붙인
  `questions` 맵. score 질문은 `criteria`(낮은 등급부터, 2–10개)이고 응답 `score`도 확률 가중
  평균이다. 요청당 64k · 질문당 32k 토큰. 429 · 529는 지수 대기 후 다시 보낸다. 입력 100만 토큰당
  $0.042, 출력 무료. `jev-1.14.0`은 2026-10-14 출시판이다. https://docs.typesafe.ai/models.md

두 문서 모두 한국어 지원을 언급하지 않는다. `fit-v1` 공고는 영어(JTH)라서 이 실험은 한국어
공고에서의 성능을 답하지 못한다.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import sys
import threading
import time
from typing import Any, Callable, Mapping, Sequence
import urllib.error
import urllib.request


sys.path.insert(0, str(Path(__file__).parent))

import llm_suitability_train as pilot  # noqa: E402
from llm_suitability_rubric import COVERAGE_POINTS  # noqa: E402


@dataclass(frozen=True)
class Provider:
    key: str
    model: str
    url: str
    key_env: str
    usd_per_million_input: float
    # 점수 파일의 model 칸. eval-cross --cross-model-name에 이 값을 넘긴다.
    label: str


PROVIDERS = {
    "decisions": Provider("decisions", "gpt-6-luna", "https://api.openai.com/v1/decisions", "OPENAI_API_KEY", 0.10, "decisions-gpt-6-luna"),
    # 버전을 고정한다. `jev-latest`는 새 출시판으로 옮겨 가 재현이 안 된다.
    "jev": Provider("jev", "jev-1.14.0", "https://api.typesafe.ai/v1/systemone", "TYPESAFE_API_KEY", 0.042, "jev-1.14.0"),
}

# 등급은 교사 루브릭(`job-profile-fit-v1`)의 근거 판정 5단계를 낮은 것부터 그대로 쓴다. 설명 문장도
# 교사 프롬프트(`llm_suitability_rubric.build_prompt`)의 [근거 판정]과 같다. 등급 번호 × 25가 루브릭의
# 충족 점수(0 · 25 · 50 · 75 · 100)이므로 API 점수를 교사 점수와 같은 눈금으로 읽을 수 있다.
LEVELS: tuple[tuple[str, str], ...] = (
    ("not_evidenced", "현재 프로필에서 확인할 수 없거나 명시적으로 부족함"),
    ("transferable", "인접 경험은 있으나 해당 요구의 직접 경험은 아님"),
    ("partial", "일부만 충족하거나 깊이·범위가 부족한 직접 근거"),
    ("adequate", "해당 요구를 수행했다고 볼 수 있는 직접 근거"),
    ("strong", "구체적인 행동, 범위, 결과가 있는 강한 직접 근거"),
)
assert [COVERAGE_POINTS[key] for key, _ in LEVELS] == sorted(COVERAGE_POINTS.values())

JOB_INSTRUCTIONS = (
    "아래 채용 공고가 요구하는 내용 전반에 대해, 입력된 프로필에 기록된 경력 근거가 얼마나 부합하는지 평가하라. "
    "합격 가능성이 아니라 기록된 근거의 부합도다. 프로필에 적힌 제목, 속성, 본문, 경력 연차만 근거로 쓴다. "
    "근무지, 고용형태, 원격 여부, 급여는 평가하지 않는다.\n\n[채용 공고]\n"
)
RECORD_INSTRUCTIONS = (
    "입력된 채용 공고의 요구사항 가운데 이 기록이 가장 잘 뒷받침하는 하나를 기준으로, 아래 경력 기록 1건이 "
    "그 요구사항의 근거로서 얼마나 직접적인지 평가하라. 기록에 적힌 내용만 근거로 쓴다.\n\n[경력 기록]\n"
)

# Jev 문서: 429 · 529는 짧게 기다린 뒤 지수적으로 늘려 다시 보낸다. 5xx도 같은 일시 장애로 본다.
RETRY_STATUSES = {429, 500, 502, 503, 504, 529}
RETRY_ATTEMPTS = 8
RETRY_FIRST_SECONDS = 1.0

Transport = Callable[[str, Mapping[str, str], bytes, float], tuple[int, Mapping[str, str], bytes]]


def urllib_transport(url: str, headers: Mapping[str, str], body: bytes, timeout: float) -> tuple[int, Mapping[str, str], bytes]:
    request = urllib.request.Request(url, data=body, headers=dict(headers), method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers or {}), error.read()


def to_match_score(score: float) -> float:
    """등급 번호(0–4)의 기댓값을 루브릭 충족 점수(0–100)로 옮긴다."""
    return float(score) * 100.0 / (len(LEVELS) - 1)


def build_body(provider: Provider, state: str, questions: Sequence[tuple[str, str]]) -> dict[str, Any]:
    """questions는 (이름, 지시문). 이름은 응답에서 답을 찾는 열쇠이고 모델에 보내지 않는다(Jev)."""
    if provider.key == "decisions":
        return {
            "model": provider.model,
            "input": state,
            "questions": [
                {"type": "score", "name": name, "instructions": text, "levels": [{"label": label, "description": description} for label, description in LEVELS]}
                for name, text in questions
            ],
        }
    return {
        "model": provider.model,
        "state": state,
        "questions": {name: {"type": "score", "instructions": text, "criteria": [description for _, description in LEVELS]} for name, text in questions},
    }


def parse_answers(provider: Provider, payload: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    """이름 → {score(0–100) | None, confidence}. 거절한 질문은 None이다."""
    result: dict[str, dict[str, Any]] = {}
    if provider.key == "decisions":
        for answer in payload["answers"]:
            if answer.get("type") == "score":
                result[str(answer["name"])] = {"score": to_match_score(answer["score"]), "confidence": answer.get("confidence")}
            else:
                result[str(answer.get("name"))] = {"score": None, "confidence": None, "refusal": answer.get("type")}
        return result
    for name, answer in payload["answers"].items():
        result[str(name)] = {"score": to_match_score(answer["score"]), "confidence": answer.get("confidence")}
    return result


class ApiScorer:
    """요청 본문 해시로 응답을 캐시한다. 같은 요청은 다시 보내지 않으므로 끊긴 실행을 이어서 돈다."""

    def __init__(self, provider: Provider, cache_dir: Path, *, api_key: str | None, transport: Transport = urllib_transport, timeout: float = 120.0, sleep: Callable[[float], None] = time.sleep) -> None:
        self.provider = provider
        self.cache_dir = cache_dir
        self.api_key = api_key
        self.transport = transport
        self.timeout = timeout
        self.sleep = sleep
        self.lock = threading.Lock()
        self.stats: dict[str, Any] = {"requests": 0, "cached": 0, "retries": 0, "inputTokens": 0, "cachedInputTokens": 0, "latencies": []}

    def _cache_path(self, body: Mapping[str, Any]) -> Path:
        digest = hashlib.sha256(json.dumps({"url": self.provider.url, "body": body}, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
        return self.cache_dir / digest[:2] / f"{digest}.json"

    def call(self, body: Mapping[str, Any]) -> dict[str, Any]:
        path = self._cache_path(body)
        if path.exists():
            with self.lock:
                self.stats["cached"] += 1
            return json.loads(path.read_text(encoding="utf-8"))["response"]
        if not self.api_key:
            raise RuntimeError(f"{self.provider.key_env}가 비어 있다")
        encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        delay = RETRY_FIRST_SECONDS
        for attempt in range(1, RETRY_ATTEMPTS + 1):
            started = time.perf_counter()
            status, response_headers, raw = self.transport(self.provider.url, headers, encoded, self.timeout)
            seconds = time.perf_counter() - started
            if status == 200:
                payload = json.loads(raw.decode("utf-8"))
                usage = payload.get("usage") or {}
                with self.lock:
                    self.stats["requests"] += 1
                    self.stats["latencies"].append(seconds)
                    self.stats["inputTokens"] += int(usage.get("input_tokens") or 0)
                    self.stats["cachedInputTokens"] += int((usage.get("input_tokens_details") or {}).get("cached_tokens") or 0)
                path.parent.mkdir(parents=True, exist_ok=True)
                # 같은 요청을 두 스레드가 동시에 보낼 수 있다. 임시 파일 이름을 나눠 덮어쓰기 충돌을 막는다.
                temporary = path.with_name(f"{path.stem}.{threading.get_ident()}.tmp")
                temporary.write_text(json.dumps({"response": payload, "seconds": seconds, "attempt": attempt}, ensure_ascii=False), encoding="utf-8")
                temporary.replace(path)
                return payload
            if status not in RETRY_STATUSES or attempt == RETRY_ATTEMPTS:
                # 400 · 401 · 413 · 422는 본문이나 키가 틀린 것이다. 그대로 다시 보내지 않는다(Jev 오류 표).
                raise RuntimeError(f"{self.provider.label} HTTP {status}: {raw[:500].decode('utf-8', 'replace')}")
            retry_after = {key.lower(): value for key, value in response_headers.items()}.get("retry-after")
            with self.lock:
                self.stats["retries"] += 1
            self.sleep(float(retry_after) if retry_after and retry_after.replace(".", "", 1).isdigit() else delay)
            delay *= 2
        raise AssertionError("unreachable")

    def summary(self) -> dict[str, Any]:
        latencies = sorted(self.stats["latencies"])

        def percentile(fraction: float) -> float | None:
            return latencies[min(len(latencies) - 1, round((len(latencies) - 1) * fraction))] * 1000 if latencies else None

        return {
            "provider": self.provider.key,
            "model": self.provider.model,
            "requests": self.stats["requests"],
            "cachedResponses": self.stats["cached"],
            "retries": self.stats["retries"],
            "inputTokens": self.stats["inputTokens"],
            "cachedInputTokens": self.stats["cachedInputTokens"],
            # 캐시 할인 · 지역 할증은 빼고 표준 단가로만 어림한다.
            "estimatedUsd": self.stats["inputTokens"] * self.provider.usd_per_million_input / 1_000_000,
            "latencyP50Ms": percentile(0.5),
            "latencyP95Ms": percentile(0.95),
        }


def model_a_requests(dataset: dict[str, Any], splits: Sequence[str]) -> list[dict[str, Any]]:
    """평가할 분할의 프로필마다 요청 하나. 질문은 그 프로필의 후보 공고들이다."""
    profiles = {str(row["profileId"]): row for row in dataset["profiles"]}
    jobs = {str(row["jobId"]): row for row in dataset["jobs"]}
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for pair in dataset["pairs"]:
        if pair["split"] in splits:
            grouped[pair["profileId"]].append(pair)
    requests = []
    for profile_id in sorted(grouped):
        members = sorted(grouped[profile_id], key=lambda pair: pair["jobId"])
        requests.append(
            {
                "state": pilot.render_profile(profiles[profile_id]),
                "questions": [(f"job_{index}", JOB_INSTRUCTIONS + pilot.render_job(jobs[pair["jobId"]])) for index, pair in enumerate(members)],
                "pairs": members,
            }
        )
    return requests


def model_b_requests(dataset: dict[str, Any], labels: Sequence[dict[str, Any]], splits: Sequence[str]) -> list[dict[str, Any]]:
    """평가할 분할의 (공고, 프로필) 쌍마다 요청 하나. 질문은 그 프로필의 기록들이다."""
    profiles = {str(row["profileId"]): row for row in dataset["profiles"]}
    jobs = {str(row["jobId"]): row for row in dataset["jobs"]}
    requests = []
    for label in sorted((row for row in labels if row.get("split") in splits), key=lambda row: (str(row["profileId"]), str(row["jobId"]))):
        profile = profiles[str(label["profileId"])]
        records = profile.get("records", [])
        if not records:
            continue
        requests.append(
            {
                "state": "[채용 공고]\n" + pilot.render_job(jobs[str(label["jobId"])]),
                "questions": [(f"record_{index}", RECORD_INSTRUCTIONS + pilot.render_record(record)) for index, record in enumerate(records)],
                "profileId": str(label["profileId"]),
                "jobId": str(label["jobId"]),
                "split": str(label["split"]),
                "recordIds": [str(record["recordId"]) for record in records],
            }
        )
    return requests


def run(arguments: argparse.Namespace, *, transport: Transport = urllib_transport, sleep: Callable[[float], None] = time.sleep) -> dict[str, Any]:
    provider = PROVIDERS[arguments.provider]
    dataset = pilot.load_training_dataset(arguments.data, arguments.labels)
    labels = pilot._read_jsonl(arguments.labels / "suitability-labels.jsonl")
    directory = arguments.output / f"api-{provider.key}"
    a_requests = model_a_requests(dataset, arguments.splits)[: arguments.limit] if "a" in arguments.models else []
    b_requests = model_b_requests(dataset, labels, arguments.splits)[: arguments.limit] if "b" in arguments.models else []
    plan = {
        "provider": provider.label,
        "modelARequests": len(a_requests),
        "modelAQuestions": sum(len(item["questions"]) for item in a_requests),
        "modelBRequests": len(b_requests),
        "modelBQuestions": sum(len(item["questions"]) for item in b_requests),
        "characters": sum(len(item["state"]) + sum(len(text) for _, text in item["questions"]) for item in a_requests + b_requests),
    }
    if arguments.dry_run:
        return {"dryRun": True, **plan}
    scorer = ApiScorer(provider, directory / "cache", api_key=os.environ.get(provider.key_env), transport=transport, sleep=sleep)
    started = time.perf_counter()

    def ask(item: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return parse_answers(provider, scorer.call(build_body(provider, item["state"], item["questions"])))

    with ThreadPoolExecutor(max_workers=arguments.workers) as pool:
        a_answers = list(pool.map(ask, a_requests))
        b_answers = list(pool.map(ask, b_requests))
    refusals = 0
    pair_rows = []
    for item, answers in zip(a_requests, a_answers):
        for (name, _), pair in zip(item["questions"], item["pairs"]):
            answer = answers.get(name, {"score": None, "confidence": None})
            refusals += answer["score"] is None
            pair_rows.append(
                {
                    "model": provider.label,
                    "profileId": pair["profileId"],
                    "jobId": pair["jobId"],
                    "split": pair["split"],
                    "candidateBucket": pair["candidateBucket"],
                    "target": pair["matchScore"],
                    "prediction": answer["score"],
                    "confidence": answer["confidence"],
                }
            )
    record_rows = []
    for item, answers in zip(b_requests, b_answers):
        for (name, _), record_id in zip(item["questions"], item["recordIds"]):
            answer = answers.get(name, {"score": None, "confidence": None})
            refusals += answer["score"] is None
            record_rows.append(
                {"model": provider.label, "profileId": item["profileId"], "jobId": item["jobId"], "recordId": record_id, "split": item["split"], "prediction": answer["score"], "confidence": answer["confidence"]}
            )
    if a_requests:
        pilot._atomic_jsonl(directory / "scores.jsonl", pair_rows)
    if b_requests:
        pilot._atomic_jsonl(directory / "record-scores.jsonl", record_rows)
    summary = {**plan, **scorer.summary(), "refusals": refusals, "seconds": round(time.perf_counter() - started, 3), "splits": list(arguments.splits)}
    pilot._atomic_json(directory / "summary.json", summary)
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--provider", choices=sorted(PROVIDERS), required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    # eval-cross가 검증 · 평가 분할을 모두 읽으므로 둘 다 채점한다. 학습 분할은 API에 필요 없다.
    parser.add_argument("--splits", nargs="+", choices=("valid", "test"), default=["valid", "test"])
    parser.add_argument("--models", nargs="+", choices=("a", "b"), default=["a", "b"])
    parser.add_argument("--limit", type=int, help="모델마다 앞의 N개 요청만 보낸다. 키 · 형식 확인용")
    parser.add_argument("--workers", type=int, default=4, help="동시 요청 수. 429가 이어지면 줄인다")
    parser.add_argument("--dry-run", action="store_true", help="보내지 않고 요청 수와 글자 수만 센다")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    print(json.dumps(run(build_parser().parse_args(argv)), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
