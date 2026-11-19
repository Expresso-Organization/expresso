"""Expresso 백엔드·Worker가 공유하는 로컬 ONNX 추론 HTTP 서비스."""

from __future__ import annotations

import argparse
from collections import OrderedDict
import hashlib
import json
import os
import re
from pathlib import Path
import sys
from threading import Lock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/ml-data/match_release"))
from cpu import CpuRanker
from fixed_data import fixed_requirements
from inputs import interactive_scorer, rerank_or_local
from record_search import propose, verify_requirement


class CachedRanker(CpuRanker):
    """텍스트 해시로 벡터를 재사용한다. 원문 대신 벡터만 유한 캐시에 둔다."""

    def __init__(self, bundle, threads):
        super().__init__(bundle, threads)
        self.vectors = OrderedDict()

    def embed(self, texts, prefix):
        keys = {t: (prefix, hashlib.sha256(t.encode()).digest()) for t in texts}
        missing = [t for t, k in keys.items() if k not in self.vectors]
        added = super().embed(missing, prefix) if missing else {}
        result = {}
        for t, k in keys.items():
            vec = added[t] if t in added else self.vectors[k]
            self.vectors[k] = vec
            self.vectors.move_to_end(k)
            result[t] = vec
        while len(self.vectors) > 16384:
            self.vectors.popitem(last=False)
        return result


class Application:
    def __init__(self, bundle, threads, cache, policy):
        self.engine = CachedRanker(bundle, threads)
        self.lock = Lock()
        self.scorer = (
            interactive_scorer(cache) if os.getenv("OPENAI_API_KEY") and cache else None
        )
        self.threshold = None
        if self.scorer:
            settings = json.loads(policy.read_bytes())
            if settings["model"] != self.scorer.provider.model:
                raise ValueError("근거 검증 정책 모델 불일치")
            self.threshold = settings["threshold"]

    def process(self, path, payload):
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
            with self.lock:
                self.engine.prepare_jobs(jobs)
            return {"eligible": len(jobs)}
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
            result = self.engine.rank(profile, jobs, limit=limit)
            if mode == "verify" and self.scorer and result["jobs"]:
                verifier_rows = propose(self.engine, profile, jobs)
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
                        r["recordId"]
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
                            "recordIds": verified.get(
                                d["requirementId"], d["evidenceRecordIds"]
                            ),
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
            elif method == "POST" and path in {"/v1/rank", "/v1/warm"}:
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
    p.add_argument("--threads", type=int, default=4)
    p.add_argument("--decisions-cache", type=Path)
    p.add_argument("--policy", type=Path)
    a = p.parse_args()
    if a.decisions_cache and not a.policy:
        p.error("--decisions-cache에는 --policy가 필요합니다")
    serve(
        Application(a.bundle, a.threads, a.decisions_cache, a.policy),
        host="127.0.0.1",
        port=a.port,
        threads=4,
        max_request_body_size=32 * 1024 * 1024,
    )
