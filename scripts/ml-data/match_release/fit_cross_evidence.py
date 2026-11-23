"""기존 Cross-Encoder의 마지막 두 층을 요건·문단 hard negative로 조정한다."""

import argparse
import hashlib
import json
from pathlib import Path
import random

import torch
import torch.nn.functional as F
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from embeddings import pilot
from fit_hard_negatives import load_training, mined_indices
from runtime import EvidenceHead
from passages import record_passages, CHUNK_VERSION
from record_search import evaluate_rows


def fit(
    root,
    checkpoint,
    base_model,
    output,
    cache_directory,
    passage_model,
    validation_rows,
    epochs=2,
    limit=12000,
):
    torch.manual_seed(42)
    torch.set_num_threads(4)
    output.mkdir(parents=True, exist_ok=True)
    train, _, qv, rv = load_training(root, cache_directory)
    weights = torch.load(
        root / "bundle/model.pt", weights_only=True, map_location="cpu"
    )
    head = EvidenceHead()
    head.load_state_dict(weights["evidence"])
    (qi, ri, targets, importance), mined_count = mined_indices(train, head, qv, rv)
    original = pilot._read_jsonl(root / "pilot/labels.jsonl")
    jobs = pilot._read_jsonl(root / "fixed/jobs.jsonl")
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
    profiles = [
        p
        for p in pilot._read_jsonl(root / "fixed/profiles.jsonl")
        if p["split"] in ("train", "valid")
    ]
    records = {r["recordId"]: r for p in profiles for r in p["records"]}
    ids = torch.load(root / "pilot/records.pt", weights_only=True, map_location="cpu")[
        "ids"
    ]
    e5tok = AutoTokenizer.from_pretrained(root / "bundle/encoder").backend_tokenizer
    chunks = record_passages(list(records.values()), e5tok)
    vectors = torch.load(
        passage_model / "passage-vectors.pt", weights_only=True, map_location="cpu"
    )["vectors"]
    key = hashlib.sha256(
        json.dumps(
            [CHUNK_VERSION, [c["text"] for c in chunks]], ensure_ascii=False
        ).encode()
    ).hexdigest()
    if (
        json.loads((passage_model / "evidence.json").read_bytes())["passageCacheKey"]
        != key
    ):
        raise ValueError("문단 캐시와 원문 불일치")
    head.load_state_dict(
        torch.load(
            passage_model / "evidence.pt", weights_only=True, map_location="cpu"
        )["state"]
    )
    by_record = {}
    for i, chunk in enumerate(chunks):
        by_record.setdefault(chunk["recordId"], []).append(i)
    positive = [i for i, y in enumerate(targets) if y == 1]
    negative = sorted(
        (i for i, y in enumerate(targets) if y == 0),
        key=lambda i: hashlib.sha256(f"42/{qi[i]}/{ri[i]}".encode()).digest(),
    )
    selected = positive + negative[: max(0, limit - len(positive))]
    train_groups, flat = [], []
    with torch.no_grad():
        for i in selected:
            q, r = int(qi[i]), int(ri[i])
            positions = by_record[ids[r]]
            scores = head(qv[q : q + 1], vectors[positions]).tolist()
            best = sorted(
                range(len(positions)), key=lambda k: (-scores[k], positions[k])
            )[:2]
            members = []
            for k in best:
                members.append(len(flat))
                flat.append(
                    {
                        "jobText": "요건: " + queries[q],
                        "profileText": chunks[positions[k]]["text"],
                    }
                )
            train_groups.append((members, float(targets[i]), float(importance[i])))
    rows = pilot._read_jsonl(validation_rows)
    valid_flat, mapping = [], []
    for i, row in enumerate(rows):
        for rid in row["candidates"]:
            for passage in row["candidatePassages"][rid]:
                valid_flat.append(
                    {
                        "jobText": "요건: " + row["criterion"],
                        "profileText": passage["text"],
                    }
                )
                mapping.append((i, rid))
    gold = {
        (r["profileId"], r["jobId"], q["id"]): set(q["evidenceRecordIds"])
        for r in pilot._read_jsonl(root / "fixed-labels/labels.jsonl")
        if r["split"] == "valid"
        for q in r["requirementAssessments"]
    }
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    model = AutoModelForSequenceClassification.from_pretrained(base_model)
    payload = torch.load(checkpoint, weights_only=True, map_location="cpu")
    state = model.state_dict()
    state.update(payload["trainableState"])
    model.load_state_dict(state)
    parameters = pilot.freeze_cross_encoder_layers(model, train_last_layers=2)
    names = {name for name, p in model.named_parameters() if p.requires_grad}
    model.to("cuda")
    encodings, lengths = pilot.tokenize_cross_encoder_inputs(
        tokenizer, flat, max_length=512
    )
    valid_encodings, _ = pilot.tokenize_cross_encoder_inputs(
        tokenizer, valid_flat, max_length=512
    )

    def evaluate():
        scores = pilot.predict_cross_encoder(
            model, tokenizer, valid_encodings, batch_size=16, device="cuda"
        )
        grouped = [dict() for _ in rows]
        for (i, rid), score in zip(mapping, scores, strict=True):
            grouped[i][rid] = max(score, grouped[i].get(rid, -1))
        scored = [
            {
                **r,
                "verified": [
                    {"recordId": rid, "score": score}
                    for rid, score in sorted(g.items(), key=lambda x: (-x[1], x[0]))
                ],
            }
            for r, g in zip(rows, grouped, strict=True)
        ]
        metric = evaluate_rows(scored, gold, 25, modes=("verified",))["verified"]
        metric["candidateHitAtK"] = metric.pop("candidateHitAt12")
        return metric

    baseline = evaluate()
    best_metric, best_epoch = baseline, 0
    best_state = {
        k: v.detach().cpu().clone() for k, v in model.state_dict().items() if k in names
    }
    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=1e-5)
    history = []
    for epoch in range(1, epochs + 1):
        model.train()
        order = list(range(len(train_groups)))
        random.Random(42 + epoch).shuffle(order)
        opt.zero_grad(set_to_none=True)
        for step, start in enumerate(range(0, len(order), 4), 1):
            group_ids = order[start : start + 4]
            flat_ids = [p for i in group_ids for p in train_groups[i][0]]
            batch = pilot._padded_cross_batch(
                tokenizer, encodings, flat_ids, device="cuda"
            )
            with torch.amp.autocast("cuda", dtype=torch.bfloat16):
                logits = model(**batch).logits.reshape(-1)
                pos, values = 0, []
                for i in group_ids:
                    n = len(train_groups[i][0])
                    values.append(logits[pos : pos + n].amax())
                    pos += n
                target = torch.tensor(
                    [train_groups[i][1] for i in group_ids], device="cuda"
                )
                weight = torch.tensor(
                    [train_groups[i][2] for i in group_ids], device="cuda"
                )
                loss = (
                    F.binary_cross_entropy_with_logits(
                        torch.stack(values).float(), target, reduction="none"
                    )
                    * weight
                ).mean()
            (loss / 4).backward()
            if step % 4 == 0 or start + 4 >= len(order):
                torch.nn.utils.clip_grad_norm_(
                    [p for p in model.parameters() if p.requires_grad], 1.0
                )
                opt.step()
                opt.zero_grad(set_to_none=True)
            if step % 250 == 0:
                print("train", epoch, start, len(order), flush=True)
        metric = evaluate()
        history.append({"epoch": epoch, **metric})
        print("valid", epoch, metric["mrrAt3"], flush=True)
        if metric["mrrAt3"] > best_metric["mrrAt3"]:
            best_metric, best_epoch = metric, epoch
            best_state = {
                k: v.detach().cpu().clone()
                for k, v in model.state_dict().items()
                if k in names
            }
        pilot._atomic_json(
            output / "training.json",
            {
                "task": "requirement-passage",
                "trainRecordPairs": len(selected),
                "trainPassagePairs": len(flat),
                "validationRequirements": len(rows),
                "hardNegativePairsInSource": mined_count,
                "trainable": parameters,
                "inputLengths": lengths,
                "selectedEpoch": best_epoch,
                "baselineValidation": baseline,
                "selectedValidation": best_metric,
                "history": history,
                "selection": "validation MRR@3 only; test and persona not used",
                "seed": 42,
                "loss": "max-passage BCE per record; mined implicit negatives weight 0.5",
                "labelLimit": "교사 미연결 기록은 약한 음성. 독립 사람 판정 없음",
            },
        )
        updated = {
            **payload,
            "trainableState": {**payload["trainableState"], **best_state},
            "maxLength": 512,
            "task": "requirement-passage",
            "model": "expresso-bge-evidence-hard-neg-v2",
        }
        torch.save(updated, output / "trainable-state.pt")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for key in (
        "root",
        "checkpoint",
        "output",
        "cache-directory",
        "passage-model",
        "validation-rows",
    ):
        p.add_argument("--" + key, type=Path, required=True)
    p.add_argument("--base-model", required=True)
    p.add_argument("--epochs", type=int, default=2)
    p.add_argument("--limit", type=int, default=12000)
    fit(**vars(p.parse_args()))
