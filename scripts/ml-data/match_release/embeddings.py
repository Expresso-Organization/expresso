"""파일럿과 같은 E5 렌더러·접두사·512토큰 한도를 쓰는 배치 인코딩."""

from __future__ import annotations

import hashlib
from pathlib import Path
import sys
import tempfile
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import llm_suitability_train as pilot
from match_pilot_model import FrozenE5Encoder

REVISION = "d128750597153bb5987e10b1c3493a34e5a4502a"


def save_weights(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False, suffix=".pt") as stream:
        tmp = Path(stream.name)
    try:
        torch.save(data, tmp)
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def encode_unique(encoder, texts, role):
    unique = sorted(set(texts), key=lambda text: (len(text), text))
    if not unique:
        return {}
    embed = encoder.embed_profiles if role == "profile" else encoder.embed_jobs
    vec = embed(unique)
    return dict(zip(unique, vec, strict=True))


def materialize(encoder, texts, role, directory, name):
    unique = sorted(set(texts))
    key = hashlib.sha256(("\0".join([REVISION, role, *unique])).encode()).hexdigest()
    path = directory / (name + "-" + key[:16] + ".pt")
    if not path.exists():
        mapped = encode_unique(encoder, unique, role)
        save_weights(path, {"key": key, "vectors": torch.stack([mapped[t] for t in unique])})
    cached = torch.load(path, weights_only=True, map_location="cpu")
    if cached["key"] != key or len(cached["vectors"]) != len(unique):
        raise ValueError("임베딩 캐시 검증 실패")
    return unique, cached["vectors"]


def pilot_record_vectors(profiles, cache, checkpoint):
    records = [r for p in profiles for r in p["records"]]
    ids = [r["recordId"] for r in records]
    texts = [pilot.render_record(r) for r in records]
    weights = torch.load(checkpoint, weights_only=True, map_location="cpu")
    payload = torch.load(cache, weights_only=True, map_location="cpu")
    if (
        REVISION not in weights["e5ModelPath"]
        or ids != payload["ids"]
        or pilot._embedding_cache_key(ids, texts, weights["e5ModelPath"]) != payload["key"]
    ):
        raise ValueError("파일럿 기록 임베딩의 리비전 또는 원문 해시 불일치")
    return ids, payload["vectors"]


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("pilot", "fixed", "encoder", "output"):
        parser.add_argument("--" + key, type=Path, required=True)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    enc = FrozenE5Encoder.from_pretrained(device=args.device, model_name=str(args.encoder), batch_size=32)
    labels = pilot._read_jsonl(args.pilot / "labels.jsonl")
    jobs = pilot._read_jsonl(args.fixed / "jobs.jsonl")
    profiles = pilot._read_jsonl(args.fixed / "profiles.jsonl")
    reqs = [
        q["requirement"]
        for l in labels
        if l["split"] in ("train", "valid")
        for q in l["requirementAssessments"]
    ]
    reqs.extend(q["criterion"] for j in jobs for q in j["requirementsFixed"])
    materialize(enc, reqs, "job", args.output, "criteria")
    materialize(enc, [pilot.render_profile(p) for p in profiles], "profile", args.output, "profiles")
    materialize(enc, [pilot.render_job(j) for j in jobs], "job", args.output, "jobs")
    print("임베딩 검증 완료", flush=True)
