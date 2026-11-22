"""한국어 train 분할의 어려운 음성 예시로 기존 근거 헤드를 미세 조정한다."""

import argparse
import copy
import hashlib
import json
import random
from pathlib import Path

import torch
import torch.nn.functional as F

from embeddings import REVISION, save_weights, pilot
from runtime import EvidenceHead, rank_scores
from train import grouped_rows, evidence_metrics


def mined_indices(groups, net, qv, rv, hard_count=3, random_count=3, seed=42):
    """누락된 대체 근거가 음성에 섞이는 위험을 줄이기 위해 mined loss 비중을 낮춘다."""
    rng = random.Random(seed)
    qi, ri, labels, weights = [], [], [], []
    hard_pairs = set()
    for q, records, positives in groups:
        negatives = sorted(set(records) - set(positives))
        with torch.no_grad():
            scores = (
                rank_scores(net, "learned", qv[q : q + 1], rv[records])
                .flatten()
                .tolist()
            )
        scores = dict(zip(records, scores, strict=True))
        # 임베딩이 정답과 동일한 중복 기록은 음성으로 채굴하지 않는다.
        negatives = [
            r
            for r in negatives
            if not any(torch.allclose(rv[r], rv[p], atol=1e-7) for p in positives)
        ]
        hard = sorted(negatives, key=lambda r: (-scores[r], r))[:hard_count]
        remaining = sorted(set(negatives) - set(hard))
        sampled = rng.sample(remaining, min(len(remaining), random_count))
        for r in positives + hard + sampled:
            qi.append(q)
            ri.append(r)
            labels.append(float(r in positives))
            weights.append(0.5 if r in hard else 1.0)
        hard_pairs.update((q, r) for r in hard)
    return tuple(
        torch.tensor(x, dtype=dtype)
        for x, dtype in (
            (qi, torch.long),
            (ri, torch.long),
            (labels, torch.float32),
            (weights, torch.float32),
        )
    ), len(hard_pairs)


def load_training(root, cache_directory=None):
    profiles = pilot._read_jsonl(root / "pilot/profiles.jsonl")
    original = pilot._read_jsonl(root / "pilot/labels.jsonl")
    jobs = pilot._read_jsonl(root / "fixed/jobs.jsonl")
    users = pilot._read_jsonl(root / "fixed/profiles.jsonl")
    labels = pilot._read_jsonl(root / "fixed-labels/labels.jsonl")
    # 같은 캐시 키를 원문으로 재계산한다. test 라벨은 학습·선택에 사용하지 않는다.
    queries = sorted(
        {
            *[
                q["requirement"]
                for l in original
                if l["split"] in ("train", "valid")
                for q in l["requirementAssessments"]
            ],
            *[q["criterion"] for j in jobs for q in j["requirementsFixed"]],
        }
    )
    key = hashlib.sha256("\0".join([REVISION, "job", *queries]).encode()).hexdigest()
    cached = torch.load(
        (cache_directory or root / "cache") / ("criteria-" + key[:16] + ".pt"),
        weights_only=True,
        map_location="cpu",
    )
    if cached["key"] != key or len(cached["vectors"]) != len(queries):
        raise ValueError("요건 캐시와 원문 불일치")
    record_cache = torch.load(
        root / "pilot/records.pt", weights_only=True, map_location="cpu"
    )
    ids = [r["recordId"] for p in profiles for r in p["records"]]
    if record_cache["ids"] != ids:
        raise ValueError("기록 캐시 ID 불일치")
    pos = {rid: i for i, rid in enumerate(ids)}
    by_user = {
        p["profileId"]: {r["recordId"]: pos[r["recordId"]] for r in p["records"]}
        for p in profiles
    }
    train_users = {p["profileId"] for p in users if p["split"] == "train"}
    valid_users = {p["profileId"] for p in users if p["split"] == "valid"}
    test_users = {p["profileId"] for p in users if p["split"] == "test"}
    train_jobs = {j["jobId"] for j in jobs if j["split"] == "train"}
    valid_jobs = {j["jobId"] for j in jobs if j["split"] == "valid"}
    if (
        train_users & valid_users
        or train_users & test_users
        or valid_users & test_users
        or train_jobs & valid_jobs
    ):
        raise ValueError("학습·검증·평가 분할 중복")
    for l in labels:
        expected_users = (
            train_users
            if l["split"] == "train"
            else valid_users
            if l["split"] == "valid"
            else test_users
        )
        if l["profileId"] not in expected_users:
            raise ValueError("프로필 분할 불일치")
        if l["split"] in ("train", "valid") and l["jobId"] not in (
            train_jobs if l["split"] == "train" else valid_jobs
        ):
            raise ValueError("공고 분할 불일치")
    qp = {q: i for i, q in enumerate(queries)}
    return (
        grouped_rows(labels, "train", by_user, qp),
        grouped_rows(labels, "valid", by_user, qp),
        cached["vectors"],
        record_cache["vectors"],
    )


class PairHead(torch.nn.Module):
    def __init__(self, head):
        super().__init__()
        self.head = head

    def forward(self, requirements, records):
        return self.head(requirements[:, None, :], records[None, :, :])


def train(root, output, epochs=8):
    torch.set_num_threads(4)
    torch.manual_seed(42)
    output.mkdir(parents=True, exist_ok=False)
    weights = torch.load(
        root / "bundle/model.pt", weights_only=True, map_location="cpu"
    )
    net = EvidenceHead()
    net.load_state_dict(weights["evidence"])
    groups, valid, qv, rv = load_training(root)
    baseline = evidence_metrics(net, "learned", valid, qv, rv)
    (qi, ri, targets, importance), hard_count = mined_indices(groups, net, qv, rv)
    best = copy.deepcopy(net.state_dict())
    best_mrr, best_epoch = baseline["mrr"], 0
    optimizer = torch.optim.AdamW(net.parameters(), lr=0.0002, weight_decay=0.01)
    rng = torch.Generator().manual_seed(42)
    history = []
    for epoch in range(1, epochs + 1):
        net.train()
        for batch in torch.randperm(len(targets), generator=rng).split(512):
            logits = net(qv[qi[batch]], rv[ri[batch]])
            loss = (
                F.binary_cross_entropy_with_logits(
                    logits, targets[batch], reduction="none"
                )
                * importance[batch]
            ).mean()
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), 3)
            optimizer.step()
        net.eval()
        metrics = evidence_metrics(net, "learned", valid, qv, rv)
        history.append({"epoch": epoch, **metrics})
        print(epoch, metrics["mrr"], flush=True)
        if metrics["mrr"] > best_mrr:
            best_mrr, best_epoch, best = (
                metrics["mrr"],
                epoch,
                copy.deepcopy(net.state_dict()),
            )
    net.load_state_dict(best)
    net.eval()
    metrics = evidence_metrics(net, "learned", valid, qv, rv)
    save_weights(output / "evidence.pt", {"state": best})
    torch.onnx.export(
        PairHead(net),
        (torch.randn(2, 768), torch.randn(3, 768)),
        str(output / "evidence.onnx"),
        dynamo=False,
        opset_version=17,
        input_names=["requirements", "records"],
        output_names=["evidence_logits"],
        dynamic_axes={
            "requirements": {0: "requirements"},
            "records": {0: "records"},
            "evidence_logits": {0: "requirements", 1: "records"},
        },
    )
    report = {
        "format": "expresso-evidence-v2",
        "threshold": metrics["threshold"],
        "sourceWeightsSha256": pilot._sha256(root / "bundle/model.pt"),
        "trainRequirements": len(groups),
        "validRequirements": len(valid),
        "trainingPairs": len(targets),
        "hardNegativePairs": hard_count,
        "mining": "frozen v1 top-3 non-reference records + 3 random; identical positive vectors excluded; weak negatives weight 0.5",
        "labelLimit": "교사 정답표의 미연결 기록을 약한 음성으로 사용. 대체 근거의 사람 검수 없음",
        "seed": 42,
        "selection": "Korean validation MRR only; test and personas excluded",
        "selectedEpoch": best_epoch,
        "baselineValidation": baseline,
        "selectedValidation": metrics,
        "history": history,
    }
    pilot._atomic_json(output / "evidence.json", report)
    pilot._atomic_json(
        output / "mining.json",
        {
            "trainPairsSha256": hashlib.sha256(
                qi.numpy().tobytes() + ri.numpy().tobytes() + targets.numpy().tobytes()
            ).hexdigest(),
            "trainProfileIds": sorted(
                {
                    l["profileId"]
                    for l in pilot._read_jsonl(root / "fixed-labels/labels.jsonl")
                    if l["split"] == "train"
                }
            ),
        },
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--epochs", type=int, default=8)
    train(**vars(p.parse_args()))
