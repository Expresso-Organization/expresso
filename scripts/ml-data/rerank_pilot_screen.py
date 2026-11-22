"""라벨 후보 10건 및 MLP 상위 10건을 동일한 Decisions 모델로 각각 재정렬한다."""

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import getpass
import math
import os
import re
from pathlib import Path
from threading import Event

import llm_suitability_train as pilot
from match_api_scorer import ApiScorer, PROVIDERS, build_body, model_a_requests, parse_answers, urllib_transport


def score(data: Path, mlp: Path, output: Path, workers: int, cached_only: bool = False) -> None:
    provider = PROVIDERS["decisions"]
    groups = defaultdict(list)
    for row in pilot._read_jsonl(mlp):
        groups[row["profileId"]].append(row)
    screened = []
    for rows in groups.values():
        screened.extend(sorted(rows, key=lambda r: (-r["prediction"], r["jobId"]))[:10])
    dataset = {"profiles": pilot._read_jsonl(data / "profiles.jsonl"), "jobs": pilot._read_jsonl(data / "jobs.jsonl")}
    key = None if cached_only else os.environ.get(provider.key_env) or getpass.getpass("Decisions API key: ")

    stopped = Event()

    def transport(*args):
        status, headers, raw = urllib_transport(*args)
        wait = next((v for k, v in headers.items() if k.lower() == "retry-after"), "0")
        if status == 429 and wait.isdigit() and int(wait) > 3600:
            stopped.set()
            raise RuntimeError(f"Decisions HTTP 429, 재시도까지 {wait}초. 응답 캐시에서 이어갈 수 있다.")
        return status, headers, raw

    api = ApiScorer(provider, output / "cache", api_key=key, transport=transport)
    for name, pairs in [("judged", pilot._read_jsonl(data / "candidate-manifest.jsonl")), ("screened", screened)]:
        requests = model_a_requests({**dataset, "pairs": pairs}, ("valid", "test"))

        def send(request):
            if stopped.is_set():
                return []
            body = build_body(provider, request["state"], request["questions"])
            if cached_only and not api._cache_path(body).is_file():
                return []
            response = api.call(body)
            if response.get("model") != provider.model:
                raise ValueError("응답 모델이 요청과 다르다")
            answers = parse_answers(provider, response)
            rows = []
            for (qid, _), pair in zip(request["questions"], request["pairs"], strict=True):
                value = answers[qid]["score"]
                if value is not None and not (math.isfinite(value) and 0 <= value <= 100):
                    raise ValueError("Decisions 응답 점수 범위 오류")
                rows.append({"profileId": pair["profileId"], "jobId": pair["jobId"], "split": pair["split"], "prediction": value})
            return rows

        try:
            first = send(requests[0])
            with ThreadPoolExecutor(max_workers=workers) as pool:
                scored = first + [row for batch in pool.map(send, requests[1:]) for row in batch]
        except RuntimeError as error:
            # 공급자 오류에 포함될 수 있는 인증 정보는 출력하지 않는다.
            message = re.sub(r"sk-[A-Za-z0-9_.*-]+", "[redacted]", str(error))
            raise SystemExit(message.replace(key, "[redacted]") if key else message) from None
        suffix = "-cached" if cached_only else ""
        pilot._atomic_jsonl(output / (name + suffix + ".jsonl"), scored)
        pilot._atomic_json(output / ("summary" + suffix + ".json"), api.summary())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("data", "mlp", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--cached-only", action="store_true", help="네트워크 호출 없이 완료한 요청만 내보낸다")
    score(**vars(parser.parse_args()))
