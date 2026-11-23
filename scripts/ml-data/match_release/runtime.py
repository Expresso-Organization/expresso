"""저장된 한국어 스크리닝 모델과 요건별 근거 모델을 사용한다."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import torch
from torch import nn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from embeddings import FrozenE5Encoder, REVISION, encode_unique, pilot
from inputs import detail, profile_text, interactive_scorer, rerank_or_local, usable_records, validate_job


class EvidenceHead(nn.Module):
    """요건과 기록을 낮은 차원에 사상하고 기존 코사인 점수를 보정한다."""

    def __init__(self, dimension=768, rank=32):
        super().__init__()
        self.query = nn.Linear(dimension, rank)
        self.record = nn.Linear(dimension, rank)
        self.query_bias = nn.Linear(dimension, 1)
        self.record_bias = nn.Linear(dimension, 1)
        self.register_buffer("query_mean", torch.zeros(dimension))
        self.register_buffer("record_mean", torch.zeros(dimension))
        self.offset = nn.Parameter(torch.tensor(-2.0))

    def forward(self, q, r):
        scale = math.sqrt(q.shape[-1])
        qc, rc = (q - self.query_mean) * scale, (r - self.record_mean) * scale
        interaction = (self.query(qc) * self.record(rc)).sum(-1) / math.sqrt(self.query.out_features)
        return (
            (q * r).sum(-1) * 15
            - 12
            + interaction
            + self.query_bias(qc).squeeze(-1)
            + self.record_bias(rc).squeeze(-1)
            + self.offset
        )


FEATURES = [
    "pilot",
    "profileJobCosine",
    "meanEvidence",
    "minEvidence",
    "mustEvidence",
    "responsibilityEvidence",
    "preferredEvidence",
    "meanCosine",
    "minCosine",
    "logRecordCount",
]


def fusion_head():
    return nn.Sequential(nn.Linear(len(FEATURES), 24), nn.GELU(), nn.Linear(24, 1))


def rank_scores(net, method, q, r):
    if method == "cosine":
        return (q @ r.T - 0.80) * 30
    return net(q[:, None, :], r[None, :, :])


def fusion_features(base, cosine, logits, raw_cos, kinds, count):
    best = logits.max(1).values.sigmoid()
    means = []
    for kind in ("must", "responsibility", "preferred"):
        ix = [i for i, v in enumerate(kinds) if v == kind]
        means.append(best[ix].mean().item() if ix else best.mean().item())
    sim = raw_cos.max(1).values
    return torch.tensor(
        [
            base / 100,
            cosine,
            best.mean().item(),
            best.min().item(),
            *means,
            sim.mean().item(),
            sim.min().item(),
            math.log1p(count) / 5,
        ],
        dtype=torch.float32,
    )


class MatchEngine:
    def __init__(self, weights, encoder):
        self.encoder = encoder
        self.settings = weights["settings"]
        if (
            self.settings["format"] != "expresso-match-v1"
            or self.settings["encoderRevision"] != REVISION
            or self.settings["features"] != FEATURES
        ):
            raise ValueError("호환되지 않는 모델 번들")
        self.screen = pilot._create_mlp(768 * 4, weights["pilotHidden"], 42)
        self.screen.load_state_dict(weights["pilot"])
        self.evidence = EvidenceHead()
        self.evidence.load_state_dict(weights["evidence"])
        self.fusion = fusion_head()
        self.fusion.load_state_dict(weights["fusion"])
        for model in (self.screen, self.evidence, self.fusion):
            model.eval()
        self.job_cache = {}

    @classmethod
    def load(cls, bundle, device="cpu"):
        weights = torch.load(bundle / "model.pt", map_location="cpu", weights_only=True)
        enc = FrozenE5Encoder.from_pretrained(
            device=device, model_name=str(bundle / "encoder"), batch_size=16
        )
        return cls(weights, enc)

    def prepare_jobs(self, jobs):
        if len({j["jobId"] for j in jobs}) != len(jobs):
            raise ValueError("공고 ID 중복")
        active = {j["jobId"] for j in jobs}
        self.job_cache = {k: v for k, v in self.job_cache.items() if k in active}
        missing = []
        for job in jobs:
            validate_job(job)
            signature = hashlib.sha256(
                json.dumps(
                    [job["fields"], job["requirementsFixed"]], ensure_ascii=False, sort_keys=True
                ).encode()
            ).hexdigest()
            old = self.job_cache.get(job["jobId"])
            if old is None or old[0] != signature:
                missing.append((job, signature))
        if missing:
            vectors = encode_unique(
                self.encoder,
                [
                    t
                    for j, _ in missing
                    for t in [pilot.render_job(j), *[q["criterion"] for q in j["requirementsFixed"]]]
                ],
                "job",
            )
            for j, sig in missing:
                self.job_cache[j["jobId"]] = (
                    sig,
                    vectors[pilot.render_job(j)],
                    torch.stack([vectors[q["criterion"]] for q in j["requirementsFixed"]]),
                )

    @torch.inference_mode()
    def rank(self, profile, jobs, *, limit=10, evidence_k=3):
        if limit < 1 or evidence_k < 1:
            raise ValueError("반환 개수는 양수여야 함")
        records = usable_records(profile)
        if not records:
            return {"status": "insufficient_evidence", "jobs": []}
        if not jobs:
            return {"status": "ok", "jobs": []}
        self.prepare_jobs(jobs)
        profile = {**profile, "records": records}
        ptext = profile_text(profile)
        rtexts = [pilot.render_record(r) for r in records]
        vec = encode_unique(self.encoder, [ptext, *rtexts], "profile")
        rv = torch.stack([vec[t] for t in rtexts])
        pv = vec[ptext]
        jobs_v = torch.stack([self.job_cache[j["jobId"]][1] for j in jobs])
        base = pilot.predict_mlp(self.screen, pilot.pair_features(pv.expand_as(jobs_v), jobs_v), device="cpu")
        # 파일럿이 선정된 경우 스크리닝은 MLP만 사용하고 상세 근거는 상위 공고에서 계산한다.
        shortlist = range(len(jobs))
        if self.settings["screenMethod"] == "pilot":
            shortlist = sorted(shortlist, key=lambda i: (-float(base[i]), jobs[i]["jobId"]))[:limit]
        result = []
        for i in shortlist:
            job = jobs[i]
            qs = job["requirementsFixed"]
            qv = self.job_cache[job["jobId"]][2]
            logits = rank_scores(self.evidence, self.settings["evidenceMethod"], qv, rv)
            features = fusion_features(
                float(base[i]),
                float(pv @ jobs_v[i]),
                logits,
                qv @ rv.T,
                [q["kind"] for q in qs],
                len(records),
            )
            value = (
                float(self.fusion(features).sigmoid().item() * 100)
                if self.settings["screenMethod"] == "fusion"
                else float(base[i])
            )
            details = [
                detail(q, row, records, evidence_k, self.settings["threshold"])
                for q, row in zip(qs, logits, strict=True)
            ]
            result.append(
                {
                    "jobId": job["jobId"],
                    "localScore": value,
                    "pilotScore": float(base[i]),
                    "evidence": details,
                }
            )
        return {"status": "ok", "jobs": sorted(result, key=lambda x: (-x["localScore"], x["jobId"]))[:limit]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for opt in ("bundle", "input", "output"):
        parser.add_argument("--" + opt, type=Path, required=True)
    parser.add_argument("--device", choices=("cpu", "cuda", "mps"), default="cpu")
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--decisions-cache", type=Path, help="지정 시 API로 로컬 후보를 재정렬")
    a = parser.parse_args()
    request = json.loads(a.input.read_bytes())
    engine = MatchEngine.load(a.bundle, a.device)
    result = engine.rank(request["profile"], request["jobs"], limit=a.top_k)
    if a.decisions_cache:
        result = rerank_or_local(
            request["profile"], request["jobs"], result, interactive_scorer(a.decisions_cache)
        )
    pilot._atomic_json(a.output, result)
