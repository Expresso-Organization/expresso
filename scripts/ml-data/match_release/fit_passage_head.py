"""기록 정답을 문단 집합의 max 점수로 학습한다. 모든 문단을 양성으로 간주하지 않는다."""

import argparse
import copy
import hashlib
import json
from pathlib import Path
from statistics import mean

import torch
import torch.nn.functional as F
from transformers import AutoTokenizer

from embeddings import FrozenE5Encoder, save_weights, pilot
from fit_hard_negatives import load_training, mined_indices
from passages import record_passages, CHUNK_VERSION
from runtime import EvidenceHead


def fit(root, output, device="cuda", epochs=8, cache_directory=None):
    torch.manual_seed(42)
    torch.set_num_threads(4)
    output.mkdir(parents=True, exist_ok=True)
    weights = torch.load(
        root / "bundle/model.pt", weights_only=True, map_location="cpu"
    )
    net = EvidenceHead()
    net.load_state_dict(weights["evidence"])
    train, valid, qv, original_rv = load_training(root, cache_directory)
    samples, mined_count = mined_indices(train, net, qv, original_rv)
    profiles = [
        p
        for p in pilot._read_jsonl(root / "fixed/profiles.jsonl")
        if p["split"] in ("train", "valid")
    ]
    records = {r["recordId"]: r for p in profiles for r in p["records"]}
    tokenizer = AutoTokenizer.from_pretrained(root / "bundle/encoder")
    chunks = record_passages(list(records.values()), tokenizer.backend_tokenizer)
    texts = [p["text"] for p in chunks]
    cache_key = hashlib.sha256(
        json.dumps([CHUNK_VERSION, texts], ensure_ascii=False).encode()
    ).hexdigest()
    cache = output / "passage-vectors.pt"
    if cache.exists():
        payload = torch.load(cache, weights_only=True, map_location="cpu")
        if payload["key"] != cache_key:
            raise ValueError("문단 임베딩 캐시 불일치")
        cv = payload["vectors"]
    else:
        encoder = FrozenE5Encoder.from_pretrained(
            device=device, model_name=str(root / "bundle/encoder"), batch_size=32
        )
        cv = encoder.embed_profiles(texts).cpu()
        save_weights(cache, {"key": cache_key, "vectors": cv})
        del encoder
        if device == "cuda":
            torch.cuda.empty_cache()
    print("encoded passages", len(chunks), flush=True)
    original_ids = torch.load(
        root / "pilot/records.pt", weights_only=True, map_location="cpu"
    )["ids"]
    rid_position = {rid: i for i, rid in enumerate(original_ids)}
    per_record = {}
    for i, chunk in enumerate(chunks):
        per_record.setdefault(rid_position[chunk["recordId"]], []).append(i)
    width = max(map(len, per_record.values()))
    positions = torch.full((len(original_ids), width), -1, dtype=torch.long)
    for rid, items in per_record.items():
        positions[rid, : len(items)] = torch.tensor(items)
    qv, cv, positions = qv.to(device), cv.to(device), positions.to(device)
    net.to(device)

    def score(qi, ri):
        ids = positions[ri]
        logits = net(qv[qi, None, :], cv[ids.clamp(min=0)])
        return logits.masked_fill(ids < 0, -1e4).amax(1)

    @torch.no_grad()
    def evaluate():
        rr, hits, peaks, truth = [], [], [], []
        for q, rs, positives in valid:
            scores = score(
                torch.full((len(rs),), q, dtype=torch.long, device=device),
                torch.tensor(rs, device=device),
            ).tolist()
            order = sorted(range(len(rs)), key=lambda i: (-scores[i], rs[i]))
            peaks.append(max(scores))
            truth.append(bool(positives))
            if positives:
                rank = min(i for i, k in enumerate(order, 1) if rs[k] in positives)
                rr.append(1 / rank)
                hits.append(rank <= 3)

        def f1(cut):
            tp = sum(t and p >= cut for t, p in zip(truth, peaks))
            den = sum(truth) + sum(p >= cut for p in peaks)
            return 2 * tp / den if den else 0

        cuts = sorted(peaks)[:: max(1, len(peaks) // 100)]
        threshold = max(cuts, key=lambda c: (f1(c), c))
        return {
            "mrr": mean(rr),
            "hitAt3": mean(hits),
            "threshold": threshold,
            "presenceF1": f1(threshold),
        }

    net.eval()
    baseline = evaluate()
    best_metrics, best_state, best_epoch = baseline, copy.deepcopy(net.state_dict()), 0
    qi, ri, targets, importance = [t.to(device) for t in samples]
    optimizer = torch.optim.AdamW(net.parameters(), lr=0.0002, weight_decay=0.01)
    history = []
    rng = torch.Generator().manual_seed(42)
    for epoch in range(1, epochs + 1):
        net.train()
        for batch in torch.randperm(len(targets), generator=rng).split(128):
            batch = batch.to(device)
            loss = (
                F.binary_cross_entropy_with_logits(
                    score(qi[batch], ri[batch]), targets[batch], reduction="none"
                )
                * importance[batch]
            ).mean()
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), 3)
            optimizer.step()
        net.eval()
        metric = evaluate()
        history.append({"epoch": epoch, **metric})
        print(epoch, metric, flush=True)
        if metric["mrr"] > best_metrics["mrr"]:
            best_metrics, best_state, best_epoch = (
                metric,
                copy.deepcopy(net.state_dict()),
                epoch,
            )
    best_state = {key: value.cpu() for key, value in best_state.items()}
    save_weights(output / "evidence.pt", {"state": best_state})
    pilot._atomic_json(
        output / "evidence.json",
        {
            "format": "expresso-evidence-passages-v2",
            "threshold": best_metrics["threshold"],
            "selectedEpoch": best_epoch,
            "baselineValidation": baseline,
            "selectedValidation": best_metrics,
            "history": history,
            "sourceWeightsSha256": pilot._sha256(root / "bundle/model.pt"),
            "trainingPairs": len(targets),
            "hardNegativePairs": mined_count,
            "trainingRequirements": len(train),
            "validRequirements": len(valid),
            "passageCount": len(chunks),
            "passageCacheKey": cache_key,
            "chunkVersion": CHUNK_VERSION,
            "device": device,
            "seed": 42,
            "selection": "validation MRR; record passages from train/valid only; frozen criterion cache reused; no test/persona optimization",
            "loss": "record-level max over passage logits, BCE; mined implicit negatives weight 0.5",
            "labelLimit": "교사 정답표의 미연결 기록을 약한 음성으로 사용. 사람의 대체 근거 검수 없음",
        },
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--device", default="cuda")
    p.add_argument("--epochs", type=int, default=8)
    p.add_argument("--cache-directory", type=Path)
    fit(**vars(p.parse_args()))
