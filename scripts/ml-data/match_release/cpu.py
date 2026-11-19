"""PyTorch 없이 CPU ONNX 번들로 공고 순위와 요건별 기록을 반환한다."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

from inputs import (
    detail,
    pilot,
    profile_text,
    usable_records,
    validate_job,
    interactive_scorer,
    rerank_or_local,
)

KIND = {"must": 0, "responsibility": 1, "preferred": 2}


class CpuRanker:
    def __init__(self, bundle, threads=4):
        manifest = json.loads((bundle / "manifest.json").read_bytes())
        if manifest["format"] != "expresso-match-cpu-v1":
            raise ValueError("CPU 번들 버전 불일치")
        self.settings = manifest["settings"]
        opt = ort.SessionOptions()
        opt.intra_op_num_threads = threads
        self.enc = ort.InferenceSession(
            str(bundle / "encoder/model.onnx"), sess_options=opt, providers=["CPUExecutionProvider"]
        )
        self.heads = ort.InferenceSession(
            str(bundle / "heads.onnx"), sess_options=opt, providers=["CPUExecutionProvider"]
        )
        self.inputs = {x.name for x in self.heads.get_inputs()}
        self.tokenizer = Tokenizer.from_file(str(bundle / "encoder/tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=512)
        self.tokenizer.enable_padding(pad_id=self.tokenizer.token_to_id("<pad>"), pad_token="<pad>")
        self.jobs = {}

    def embed(self, texts, prefix):
        unique = sorted(set(texts), key=lambda text: (len(text), text))
        result = {}
        for start in range(0, len(unique), 8):
            chunk = unique[start : start + 8]
            tokens = self.tokenizer.encode_batch([prefix + t for t in chunk])
            ids = np.array([s.ids for s in tokens], dtype=np.int64)
            mask = np.array([s.attention_mask for s in tokens], dtype=np.int64)
            hidden = self.enc.run(None, {"input_ids": ids, "attention_mask": mask})[0]
            active = mask[..., None].astype(np.float32)
            mean = (hidden * active).sum(1) / active.sum(1).clip(min=1)
            vec = mean / np.linalg.norm(mean, axis=1, keepdims=True).clip(min=1e-12)
            result.update(zip(chunk, vec, strict=True))
        return result

    def prepare_jobs(self, jobs):
        if len({j["jobId"] for j in jobs}) != len(jobs):
            raise ValueError("공고 ID 중복")
        # 현재 풀에 없는 공고를 방출해 긴 수명 인스턴스에서 이전 원문이 누적되지 않게 한다.
        active = {j["jobId"] for j in jobs}
        self.jobs = {k: v for k, v in self.jobs.items() if k in active}
        missing = []
        for j in jobs:
            validate_job(j)
            sig = hashlib.sha256(
                json.dumps([j["fields"], j["requirementsFixed"]], sort_keys=True, ensure_ascii=False).encode()
            ).hexdigest()
            if j["jobId"] not in self.jobs or self.jobs[j["jobId"]][0] != sig:
                missing.append((j, sig))
        if missing:
            texts = [
                t
                for j, _ in missing
                for t in [pilot.render_job(j), *[q["criterion"] for q in j["requirementsFixed"]]]
            ]
            vec = self.embed(texts, "passage: ")
            for j, sig in missing:
                self.jobs[j["jobId"]] = (
                    sig,
                    vec[pilot.render_job(j)],
                    np.stack([vec[q["criterion"]] for q in j["requirementsFixed"]]),
                )

    def rank(self, profile, jobs, *, limit=10, evidence_k=3):
        if limit < 1 or evidence_k < 1:
            raise ValueError("반환 개수는 양수여야 함")
        records = usable_records(profile)
        if not records:
            return {"status": "insufficient_evidence", "jobs": []}
        if not jobs:
            return {"status": "ok", "jobs": []}
        self.prepare_jobs(jobs)
        text = profile_text({**profile, "records": records})
        texts = [pilot.render_record(r) for r in records]
        vectors = self.embed([text, *texts], "query: ")
        rv = np.stack([vectors[t] for t in texts])
        out = []
        for j in jobs:
            _, jv, qv = self.jobs[j["jobId"]]
            qs = j["requirementsFixed"]
            feed = {
                "profile": vectors[text],
                "job": jv,
                "records": rv,
                "requirements": qv,
                "kinds": np.array([KIND[q["kind"]] for q in qs], dtype=np.int64),
            }
            score, base, logits = self.heads.run(None, {k: v for k, v in feed.items() if k in self.inputs})
            out.append(
                {
                    "jobId": j["jobId"],
                    "localScore": float(score),
                    "pilotScore": float(base),
                    "evidence": [
                        detail(q, row, records, evidence_k, self.settings["threshold"])
                        for q, row in zip(qs, logits, strict=True)
                    ],
                }
            )
        return {"status": "ok", "jobs": sorted(out, key=lambda r: (-r["localScore"], r["jobId"]))[:limit]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for opt in ("bundle", "input", "output"):
        parser.add_argument("--" + opt, type=Path, required=True)
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument(
        "--decisions-cache",
        type=Path,
        help="상위 후보를 Decisions로 재정렬한다. 실패 시 로컬 순위를 표시한다.",
    )
    a = parser.parse_args()
    request = json.loads(a.input.read_bytes())
    engine = CpuRanker(a.bundle, a.threads)
    result = engine.rank(request["profile"], request["jobs"], limit=a.top_k)
    if a.decisions_cache:
        result = rerank_or_local(
            request["profile"], request["jobs"], result, interactive_scorer(a.decisions_cache)
        )
    pilot._atomic_json(a.output, result)
