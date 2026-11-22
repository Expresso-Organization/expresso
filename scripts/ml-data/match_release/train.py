"""파일럿 근거 링크로 B를 학습하고 새 한국어 분할로 A의 보정 MLP를 학습한다."""

from __future__ import annotations

import argparse
from collections import defaultdict
import json
import random
import re
import shutil
import os
from statistics import mean
from pathlib import Path
import torch
import torch.nn.functional as F

from embeddings import REVISION, FrozenE5Encoder, materialize, pilot_record_vectors, save_weights, pilot
from runtime import EvidenceHead, FEATURES, fusion_head, rank_scores, fusion_features
from match_evaluation import profile_ndcg


def query_text(q):
    return q["criterion"] if "criterion" in q else q["requirement"]


def grouped_rows(labels, split, record_positions, query_positions):
    groups = []
    for l in labels:
        if l["split"] != split:
            continue
        records = record_positions[l["profileId"]]
        for q in l["requirementAssessments"]:
            evidence = set(q["evidenceRecordIds"])
            if not evidence <= records.keys():
                raise ValueError("라벨이 다른 프로필의 기록을 가리킴")
            groups.append(
                (
                    query_positions[query_text(q)],
                    list(records.values()),
                    [i for rid, i in records.items() if rid in evidence],
                )
            )
    return groups


def training_indices(groups):
    rng = random.Random(42)
    qi, ri, y = [], [], []
    for q, rs, pos in groups:
        neg = [i for i in rs if i not in pos]
        chosen = pos + rng.sample(neg, min(len(neg), max(2, len(pos) * 3)))
        qi.extend([q] * len(chosen))
        ri.extend(chosen)
        y.extend(float(i in pos) for i in chosen)
    return torch.tensor(qi), torch.tensor(ri), torch.tensor(y)


@torch.inference_mode()
def evidence_metrics(net, method, groups, queries, records, threshold=None):
    rr = []
    hit = []
    rec = []
    peaks = []
    truth = []
    for q, rows, pos in groups:
        scores = rank_scores(net, method, queries[q : q + 1], records[rows]).flatten().tolist()
        order = sorted(range(len(rows)), key=lambda i: (-scores[i], rows[i]))
        peaks.append(scores[order[0]])
        truth.append(bool(pos))
        if pos:
            ranks = [k for k, i in enumerate(order, 1) if rows[i] in pos]
            rr.append(1 / min(ranks))
            hit.append(min(ranks) <= 3)
            rec.append(sum(k <= 3 for k in ranks) / len(ranks))

    def f1(cut):
        tp = sum(t and p >= cut for t, p in zip(truth, peaks))
        guessed = sum(p >= cut for p in peaks)
        return 2 * tp / (guessed + sum(truth)) if guessed + sum(truth) else 0

    if threshold is None:
        ordered = sorted(peaks)
        cuts = [ordered[min(len(ordered) - 1, i * len(ordered) // 100)] for i in range(101)]
        threshold = max(cuts, key=lambda c: (f1(c), c))
    return {
        "requirements": len(groups),
        "withEvidence": sum(truth),
        "mrr": mean(rr) if rr else None,
        "hitAt3": mean(hit) if hit else None,
        "recallAt3": mean(rec) if rec else None,
        "linkPresenceF1": f1(threshold),
        "threshold": threshold,
    }


def fit_evidence(groups, dev, qv, rv):
    torch.manual_seed(42)
    net = EvidenceHead()
    qi, ri, targets = training_indices(groups)
    net.query_mean.copy_(qv[qi.unique()].mean(0))
    net.record_mean.copy_(rv[ri.unique()].mean(0))
    optimizer = torch.optim.AdamW(net.parameters(), lr=0.001, weight_decay=0.01)
    best_state = None
    best_mrr = -1
    history = []
    rng = torch.Generator().manual_seed(42)
    for epoch in range(1, 13):
        net.train()
        for ids in torch.randperm(len(targets), generator=rng).split(512):
            logits = net(qv[qi[ids]], rv[ri[ids]])
            loss = F.binary_cross_entropy_with_logits(logits, targets[ids])
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), 3)
            optimizer.step()
        net.eval()
        metrics = evidence_metrics(net, "learned", dev, qv, rv)
        history.append({"epoch": epoch, **metrics})
        if metrics["mrr"] > best_mrr:
            best_mrr = metrics["mrr"]
            best_epoch = epoch
            best_state = {k: v.clone() for k, v in net.state_dict().items()}
        elif epoch - best_epoch >= 3:
            break
    net.load_state_dict(best_state)
    compare = {m: evidence_metrics(net, m, dev, qv, rv) for m in ("cosine", "learned")}
    method = max(compare, key=lambda m: compare[m]["mrr"])
    return (
        net,
        method,
        compare[method]["threshold"],
        {
            "trainingPairs": len(targets),
            "linkedPairs": int(targets.sum()),
            "trainingRequirements": len(groups),
            "history": history,
            "bestLearnedEpoch": best_epoch,
            "valid": compare,
        },
    )


@torch.inference_mode()
def features_for_pairs(rows, by_user, by_job, pp, pv, jp, jv, rp, rv, qp, qv, screen, evidence, method):
    indices = [pp[pilot.render_profile(by_user[l["profileId"]])] for l in rows]
    ji = [jp[pilot.render_job(by_job[l["jobId"]])] for l in rows]
    profiles = pv[indices]
    jobs = jv[ji]
    base = pilot.predict_mlp(screen, pilot.pair_features(profiles, jobs), device="cpu")
    features = []
    for i, l in enumerate(rows):
        job = by_job[l["jobId"]]
        req = job["requirementsFixed"]
        q = qv[[qp[a["criterion"]] for a in req]]
        r = rv[list(rp[l["profileId"]].values())]
        features.append(
            fusion_features(
                float(base[i]),
                float(profiles[i] @ jobs[i]),
                rank_scores(evidence, method, q, r),
                q @ r.T,
                [a["kind"] for a in req],
                len(r),
            )
        )
    return torch.stack(features), base


def ndcg(rows, scores):
    return mean(
        profile_ndcg(
            [
                {"profileId": row["profileId"], "target": row["matchScore"], "prediction": float(score)}
                for row, score in zip(rows, scores, strict=True)
            ]
        ).values()
    )


def fit_fusion(x, y, valid_x, valid_labels):
    torch.manual_seed(42)
    net = fusion_head()
    opt = torch.optim.AdamW(net.parameters(), lr=0.008, weight_decay=0.01)
    rng = torch.Generator().manual_seed(42)
    groups = defaultdict(list)
    for i, row in enumerate(y):
        groups[row["profileId"]].append(i)
    keys = list(groups)
    target = torch.tensor([r["matchScore"] / 100 for r in y])
    best = -1
    history = []
    for epoch in range(1, 81):
        for batch in torch.randperm(len(keys), generator=rng).split(24):
            ids = [i for idx in batch for i in groups[keys[int(idx)]]]
            groupids = torch.tensor([int(idx) for idx in batch for _ in groups[keys[int(idx)]]])
            logits = net(x[ids]).view(-1)
            loss = F.mse_loss(logits.sigmoid(), target[ids]) + 0.07 * pilot.group_pairwise_loss(
                logits, target[ids] * 100, groupids
            )
            opt.zero_grad()
            loss.backward()
            opt.step()
        with torch.no_grad():
            metric = ndcg(valid_labels, net(valid_x).view(-1).sigmoid())
        history.append(metric)
        if metric > best:
            best = metric
            best_epoch = epoch
            state = {k: v.clone() for k, v in net.state_dict().items()}
        elif epoch - best_epoch >= 10:
            break
    net.load_state_dict(state)
    return net, {"bestEpoch": best_epoch, "validNdcgByEpoch": history}


def train(root, pilot_checkpoint, encoder, bundle, device):
    torch.set_num_threads(4)
    pp = pilot._read_jsonl(root / "pilot/profiles.jsonl")
    pl = pilot._read_jsonl(root / "pilot/labels.jsonl")
    jobs = pilot._read_jsonl(root / "fixed/jobs.jsonl")
    users = pilot._read_jsonl(root / "fixed/profiles.jsonl")
    labels = pilot._read_jsonl(root / "fixed-labels/labels.jsonl")
    candidates = pilot._read_jsonl(root / "fixed/candidate-manifest.jsonl")
    pilot.validate_training_inputs(users, jobs, candidates, labels)
    # 이전 학습·검증 자료는 기존 분할 그대로다. 한국어 평가 라벨은 선택 및 학습에서 제외한다.
    # 개행에서 잘린 기술 설명과 쉼표로 끝난 회사 소개 목록을 포함한 공고는 적합도 학습에서 제외한다.
    excluded = {
        j["jobId"]
        for j in jobs
        if j["split"] == "train"
        and any(
            re.search(r"(?:기반의|위한|및|또는|그리고|,|:)\s*$", q["criterion"])
            for q in j["requirementsFixed"]
        )
    }
    label_fit = [l for l in labels if l["split"] != "test" and l["jobId"] not in excluded]
    enc = FrozenE5Encoder.from_pretrained(device=device, model_name=str(encoder), batch_size=32)
    reqs = [
        a["requirement"] for l in pl if l["split"] in ("train", "valid") for a in l["requirementAssessments"]
    ]
    reqs.extend(q["criterion"] for j in jobs for q in j["requirementsFixed"])
    texts, qv = materialize(enc, reqs, "job", root / "cache", "criteria")
    qp = {s: i for i, s in enumerate(texts)}
    pt, pv = materialize(enc, [pilot.render_profile(p) for p in users], "profile", root / "cache", "profiles")
    jt, jv = materialize(enc, [pilot.render_job(j) for j in jobs], "job", root / "cache", "jobs")
    rids, rv = pilot_record_vectors(pp, root / "pilot/records.pt", pilot_checkpoint)
    idx = {rid: i for i, rid in enumerate(rids)}
    rp = {p["profileId"]: {r["recordId"]: idx[r["recordId"]] for r in p["records"]} for p in pp}
    btrain = grouped_rows(pl, "train", rp, qp)
    bvalid = grouped_rows(label_fit, "valid", rp, qp)
    enet, method, threshold, b_metrics = fit_evidence(btrain, bvalid, qv, rv)
    cp = torch.load(pilot_checkpoint, weights_only=True, map_location="cpu")
    screen = pilot._create_mlp(768 * 4, cp["hiddenDimension"], 42)
    screen.load_state_dict(cp["state"])
    screen.eval()
    features, base = features_for_pairs(
        label_fit,
        {p["profileId"]: p for p in users},
        {j["jobId"]: j for j in jobs},
        {s: i for i, s in enumerate(pt)},
        pv,
        {s: i for i, s in enumerate(jt)},
        jv,
        rp,
        rv,
        qp,
        qv,
        screen,
        enet,
        method,
    )
    tr = [i for i, l in enumerate(label_fit) if l["split"] == "train"]
    va = [i for i, l in enumerate(label_fit) if l["split"] == "valid"]
    valid = [label_fit[i] for i in va]
    fusion, history = fit_fusion(features[tr], [label_fit[i] for i in tr], features[va], valid)
    with torch.no_grad():
        a_valid = {
            "pilot": ndcg(valid, base[va]),
            "fusion": ndcg(valid, fusion(features[va]).view(-1).sigmoid()),
        }
    selected = max(a_valid, key=a_valid.get)
    settings = {
        "format": "expresso-match-v1",
        "encoderRevision": REVISION,
        "features": FEATURES,
        "screenMethod": selected,
        "evidenceMethod": method,
        "threshold": threshold,
    }
    if bundle.exists():
        raise FileExistsError(bundle)
    bundle.parent.mkdir(parents=True, exist_ok=True)
    import tempfile

    with tempfile.TemporaryDirectory(dir=bundle.parent) as scratch:
        out = Path(scratch) / "bundle"
        out.mkdir()
        save_weights(
            out / "model.pt",
            {
                "settings": settings,
                "pilotHidden": cp["hiddenDimension"],
                "pilot": cp["state"],
                "fusion": fusion.state_dict(),
                "evidence": enet.state_dict(),
            },
        )
        (out / "encoder").mkdir()
        for file in sorted(encoder.iterdir()):
            if file.name in {
                "config.json",
                "model.safetensors",
                "tokenizer.json",
                "tokenizer_config.json",
                "special_tokens_map.json",
            }:
                # 원본 경로가 이동해도 번들을 단독으로 읽을 수 있도록 일반 파일로 만든다.
                shutil.copyfile(file, out / "encoder" / file.name)
        pilot._atomic_json(
            out / "manifest.json",
            {
                "settings": settings,
                "files": {str(f.relative_to(out)): pilot._sha256(f) for f in out.rglob("*") if f.is_file()},
            },
        )
        os.rename(out, bundle)
    stats = {
        "selection": "validation only: B MRR then A profile macro NDCG@10; train seed 42",
        "settings": settings,
        "evidence": b_metrics,
        "screen": {
            "excludedTrainingJobs": sorted(excluded),
            "trainPairs": len(tr),
            "validPairs": len(va),
            "validNdcg": a_valid,
            **history,
        },
    }
    pilot._atomic_json(root / "training.json", stats)
    print(
        json.dumps({"settings": settings, "A": a_valid, "B": b_metrics["valid"]}, ensure_ascii=False),
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for opt in ("root", "pilot-checkpoint", "encoder", "bundle"):
        parser.add_argument("--" + opt, required=True, type=Path)
    parser.add_argument("--device", choices=("mps", "cpu", "cuda"), default="cpu")
    train(**vars(parser.parse_args()))
