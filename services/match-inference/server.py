"""Expresso 백엔드·Worker가 공유하는 로컬 ONNX 추론 HTTP 서비스."""

from __future__ import annotations

import argparse
from collections import OrderedDict
import hashlib
import json
import os
import re
from itertools import groupby
from pathlib import Path
import sys
from threading import Lock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/ml-data/match_release"))
from vector_store import VectorStore
from cpu import CpuRanker
from fixed_data import fixed_requirements
from inputs import (
    interactive_scorer,
    rerank_or_local,
    job_passages,
    profile_queries,
    usable_records,
)
from record_search import verify_requirement
from passages import CHUNK_VERSION


def warm_batches(texts):
    # 긴 공고와 짧은 요건을 함께 패딩하면 모든 요건이 공고 길이만큼 계산된다.
    for _, group in groupby(
        sorted(set(texts), key=len), key=lambda text: max(64, len(text)).bit_length()
    ):
        batch = list(group)
        for start in range(0, len(batch), 8):
            yield batch[start : start + 8]


MAX_MEMORY_VECTORS = 16384


class CachedRanker(CpuRanker):
    """텍스트 해시로 벡터를 재사용한다. 원문 대신 벡터만 유한 캐시에 둔다."""

    def __init__(self, bundle, threads, vector_dir=None, evidence_model=None, candidate_limit=24):
        super().__init__(bundle, threads, evidence_mode="hybrid", evidence_model=evidence_model, candidate_limit=candidate_limit)
        self.store = VectorStore(vector_dir, bundle)
        self.vectors = OrderedDict(self.store.restore(MAX_MEMORY_VECTORS))
        self.startup_loaded = len(self.vectors)
        self.profile_id = ""
        self.encoded = 0
        self.disk_hits = 0

    def resolve(self, texts, prefix):
        scope = self.profile_id if prefix == "query: " else ""
        salt = (prefix + scope + "\0").encode()
        keys = {text: hashlib.sha256(salt + text.encode()).digest() for text in texts}
        loaded = self.store.read([k for k in keys.values() if k not in self.vectors])
        self.disk_hits += len(loaded)
        missing = [
            t for t, k in keys.items() if k not in loaded and k not in self.vectors
        ]
        added = super().embed(missing, prefix) if missing else {}
        self.encoded += len(added)
        result = {}
        for t, k in keys.items():
            if t in added:
                self.vectors[k] = added[t]
            elif k in loaded:
                self.vectors[k] = loaded[k]
            self.vectors.move_to_end(k)
            result[t] = self.vectors[k]
        while len(self.vectors) > MAX_MEMORY_VECTORS:
            self.vectors.popitem(last=False)
        return keys, result

    def embed(self, texts, prefix):
        return self.resolve(texts, prefix)[1]


class Application:
    def __init__(self, bundle, threads, cache, policy, vector_dir=None, evidence_model=None, candidate_limit=24):
        self.engine = CachedRanker(bundle, threads, vector_dir, evidence_model, candidate_limit)
        self.lock = Lock()
        self.preparing = {}
        self.scorer = (
            interactive_scorer(cache) if os.getenv("OPENAI_API_KEY") and cache else None
        )
        self.threshold = None
        if self.scorer:
            settings = json.loads(policy.read_bytes())
            if settings["model"] != self.scorer.provider.model:
                raise ValueError("근거 검증 정책 모델 불일치")
            self.threshold = settings["threshold"]

    def prepare(self, owner, texts, prefix, members=()):
        # 같은 항목의 늦은 요청이 새 스냅샷을 덮어쓰지 않게 한다.
        ticket = object()
        with self.lock:
            self.preparing[owner] = ticket
        vectors = {}
        encoded = 0
        try:
            for batch in warm_batches(texts):
                with self.lock:
                    if self.preparing.get(owner) is not ticket:
                        raise RuntimeError("새 준비 요청이 도착했습니다")
                    if prefix == "query: ":
                        self.engine.profile_id = owner.removeprefix("user/")
                    before = self.engine.encoded
                    keys, values = self.engine.resolve(batch, prefix)
                    encoded += self.engine.encoded - before
                    vectors.update((key, values[text]) for text, key in keys.items())
            with self.lock:
                if self.preparing.get(owner) is not ticket:
                    raise RuntimeError("새 준비 요청이 도착했습니다")
                added, removed = self.engine.store.replace(owner, vectors, members)
                for key in removed:
                    self.engine.vectors.pop(key, None)
                return {"encoded": encoded, "added": added, "removed": len(removed)}
        finally:
            with self.lock:
                if self.preparing.get(owner) is ticket:
                    del self.preparing[owner]

    def process(self, path, payload):
        if path == "/v1/vector-stats":
            with self.lock:
                return {
                    "encoded": self.engine.encoded,
                    "diskHits": self.engine.disk_hits,
                    "startupLoaded": self.engine.startup_loaded,
                }
        if path == "/v1/checkpoint":
            with self.lock:
                # v1의 재개 위치를 이어받으면 기존 기록의 새 문단이 준비되지 않는다.
                return self.engine.store.checkpoint({**payload, "source": payload["source"] + "/" + CHUNK_VERSION})
        if path == "/v1/member-owners":
            with self.lock:
                return {"owners": self.engine.store.member_owners(payload["member"])}
        if path == "/v1/owners":
            with self.lock:
                return {"owners": self.engine.store.owners(payload.get("after", ""))}
        if path == "/v1/forget":
            return self.prepare(payload["owner"], [], "query: ")
        if path == "/v1/warm-profile":
            profile = payload["profile"]
            records = usable_records(profile)
            texts = profile_queries(profile, records, passages=self.engine.passages(records)) if records else []
            return self.prepare(
                "user/" + profile["profileId"],
                texts,
                "query: ",
                ["record/" + r["recordId"] for r in records],
            )
        jobs = []
        for original in payload["jobs"]:
            description = original["fields"]["description"]
            if not original["fields"]["title"].strip() or not re.search(
                "[가-힣]", description
            ):
                continue
            fixed = original["requirementsFixed"]
            structured = original.get("structuredCriteria", [])
            if fixed:
                req = fixed + [r for r in structured if r["kind"] == "responsibility"]
            else:
                req = fixed_requirements(description) or structured
            if any(r["kind"] != "preferred" for r in req):
                jobs.append({**original, "requirementsFixed": req})
        if path == "/v1/warm":
            eligible = {j["jobId"]: j for j in jobs}
            encoded = 0
            for original in payload["jobs"]:
                job = eligible.get(original["jobId"])
                texts = job_passages(job) if job else []
                encoded += self.prepare(
                    "job/" + original["jobId"],
                    texts,
                    "passage: ",
                    ["requirement/" + q["id"] for q in original["requirementsFixed"]]
                    if job
                    else [],
                )["encoded"]
            return {"eligible": len(jobs), "encoded": encoded}
        mode = payload["mode"]
        if mode not in {"local", "rerank", "evidence", "verify"}:
            raise ValueError("mode")
        profile = payload["profile"]
        limit = payload["limit"]
        if not isinstance(limit, int) or limit < 1:
            raise ValueError("limit")
        if mode in {"evidence", "verify"} and len(payload["jobs"]) != 1:
            raise ValueError("단일 공고 필요")
        verifier_rows = []
        with self.lock:
            self.engine.profile_id = profile["profileId"]
            # 전체 공고의 배치 순위 계산마다 문단 검색을 반복하지 않는다.
            # 문단 검색은 선택 공고의 근거 조회·검증과 제작 재료 선택에 적용한다.
            self.engine.evidence_mode = "hybrid" if mode in {"evidence", "verify"} else "record"
            result = self.engine.rank(profile, jobs, limit=limit, include_proposals=mode == "verify")
            if mode == "verify" and self.scorer and result["jobs"]:
                verifier_rows = result.pop("_proposals", [])
        source = "local"
        if mode == "rerank" and self.scorer:
            result = rerank_or_local(profile, jobs, result, self.scorer)
            source = (
                "decisions"
                if result.get("rankingSource") == "decisions"
                else "fallback"
            )
        elif mode in {"rerank", "verify"} and not self.scorer:
            source = "fallback"
        verified = {}
        if verifier_rows:
            try:
                for row in verifier_rows:
                    checked = verify_requirement(row, profile, jobs[0], self.scorer)
                    verified[row["requirementId"]] = [
                        r
                        for r in checked["verified"]
                        if r["score"] is not None and r["score"] >= self.threshold
                    ][:3]
                source = "decisions"
            except (OSError, RuntimeError, KeyError, ValueError, TypeError):
                source = "fallback"
                verified.clear()
        criteria = {
            j["jobId"]: {q["id"]: q["criterion"] for q in j["requirementsFixed"]}
            for j in jobs
        }
        return {
            "eligible": len(jobs),
            "source": source,
            "jobs": [
                {
                    "jobId": row["jobId"],
                    "localScore": row["localScore"],
                    "decisionScore": row.get("decisionScore"),
                    "evidence": [
                        {
                            "requirementId": d["requirementId"],
                            "label": criteria[row["jobId"]][d["requirementId"]],
                            "recordIds": [r["recordId"] for r in verified[d["requirementId"]]] if d["requirementId"] in verified else d["evidenceRecordIds"],
                            "passages": [{"recordId": r["recordId"], "quote": r["quote"]} for r in (verified[d["requirementId"]] if d["requirementId"] in verified else d["records"]) if "quote" in r and (d["requirementId"] in verified or r["recordId"] in d["evidenceRecordIds"])],
                        }
                        for d in row["evidence"]
                    ],
                }
                for row in result["jobs"]
            ],
        }

    def __call__(self, environ, start_response):
        method, path = environ["REQUEST_METHOD"], environ["PATH_INFO"]
        status = "200 OK"
        try:
            if method == "GET" and path == "/health":
                data = {"available": True, "decisions": self.scorer is not None}
            elif method == "POST" and path in {
                "/v1/rank",
                "/v1/warm",
                "/v1/warm-profile",
                "/v1/checkpoint",
                "/v1/vector-stats",
                "/v1/owners",
                "/v1/member-owners",
                "/v1/forget",
            }:
                if (
                    environ.get("HTTP_ORIGIN")
                    or environ.get("CONTENT_TYPE", "").split(";")[0]
                    != "application/json"
                ):
                    raise ValueError("서버 JSON 요청 필요")
                size = int(environ.get("CONTENT_LENGTH") or "0")
                if not 0 < size <= 32 * 1024 * 1024:
                    raise ValueError("본문 크기")
                data = self.process(path, json.loads(environ["wsgi.input"].read(size)))
            else:
                status, data = "404 Not Found", {}
        except (ValueError, TypeError, KeyError, IndexError):
            status, data = "400 Bad Request", {"error": "invalid_model_input"}
        except Exception:
            status, data = "503 Service Unavailable", {"error": "inference_unavailable"}
        body = json.dumps(data, ensure_ascii=False, allow_nan=False).encode()
        start_response(
            status,
            [
                ("Content-Type", "application/json; charset=utf-8"),
                ("Content-Length", str(len(body))),
                ("Cache-Control", "no-store"),
            ],
        )
        return [body]


if __name__ == "__main__":
    from waitress import serve

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--bundle", required=True, type=Path)
    p.add_argument("--port", type=int, default=4810)
    p.add_argument("--vector-dir", type=Path, default=Path("var/match-embeddings"))
    p.add_argument("--evidence-model", type=Path)
    p.add_argument("--candidate-limit", type=int, default=24)
    p.add_argument("--threads", type=int, default=4)
    p.add_argument("--decisions-cache", type=Path)
    p.add_argument("--policy", type=Path)
    a = p.parse_args()
    if a.decisions_cache and not a.policy:
        p.error("--decisions-cache에는 --policy가 필요합니다")
    serve(
        Application(a.bundle, a.threads, a.decisions_cache, a.policy, a.vector_dir, a.evidence_model, a.candidate_limit),
        host="127.0.0.1",
        port=a.port,
        threads=4,
        max_request_body_size=32 * 1024 * 1024,
    )
