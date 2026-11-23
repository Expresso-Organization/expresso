"""동결한 후보로 기록 기준선·문단 검색·hard negative 헤드·Decisions를 비교한다."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
from statistics import mean
import sys
import time

import numpy as np

sys.path.insert(
    0, str(Path(__file__).resolve().parents[3] / "services/match-inference")
)
from evaluation import cohorts
from inputs import pilot
from record_search import propose, evaluate_rows, verify_requirement, table_key
from evidence_search import retrieve
from match_api_scorer import ApiScorer, PROVIDERS


def cross(root, personas, output, checkpoint, base_model, device="cuda", batch_size=8):
    from match_experiments import load_cross_scorer

    scorer, info = load_cross_scorer(
        base_model, checkpoint, device=device, batch_size=batch_size
    )
    report = {
        "checkpointSha256": pilot._sha256(checkpoint),
        "model": info,
        "device": device,
        "taskTransfer": "요건·문단 hard negative 미세 조정" if info["task"] == "requirement-passage" else "기존 공고-프로필 Cross-Encoder를 요건-문단 쌍에 전이 적용",
        "splits": {},
    }
    threshold = None
    for split, users, jobs in cohorts(root, personas):
        rows = pilot._read_jsonl(output / f"{split}-hard_24.jsonl")
        job_map = {j["jobId"]: j for j in jobs}
        flat, mappings = [], []
        for i, row in enumerate(rows):
            for rid in row["candidates"]:
                for passage in row["candidatePassages"][rid]:
                    flat.append(
                        {
                            "jobText": (
                                ""
                                if info["task"] == "requirement-passage"
                                else "공고: "
                                + job_map[row["jobId"]]["fields"]["title"]
                                + "\n"
                            )
                            + "요건: "
                            + row["criterion"],
                            "profileText": passage["text"],
                        }
                    )
                    mappings.append((i, rid, passage["quote"]))
        start = time.perf_counter()
        scores, lengths = scorer(flat)
        elapsed = time.perf_counter() - start
        grouped = [dict() for _ in rows]
        for (i, rid, quote), score in zip(mappings, scores, strict=True):
            if rid not in grouped[i] or grouped[i][rid]["score"] < score:
                grouped[i][rid] = {"recordId": rid, "score": score, "quote": quote}
        scored = [
            {
                **r,
                "verified": sorted(
                    g.values(), key=lambda v: (-v["score"], v["recordId"])
                ),
            }
            for r, g in zip(rows, grouped, strict=True)
        ]
        gold = gold_for(root, personas, split)
        if threshold is None:
            threshold = max(
                range(0, 101, 5),
                key=lambda c: (
                    evaluate_rows(scored, gold, c, modes=("verified",))["verified"][
                        "presenceF1"
                    ],
                    c,
                ),
            )
            report["threshold"] = threshold
            report["thresholdSelection"] = "validation presence F1 only"
        report["splits"][split] = {
            **summarize(scored, gold, True, threshold),
            "scoringSeconds": elapsed,
            "passagePairs": len(flat),
            "inputLengths": lengths,
            "candidateIdsSha256": hashlib.sha256(
                json.dumps([r["candidates"] for r in rows]).encode()
            ).hexdigest(),
        }
        pilot._atomic_jsonl(output / f"{split}-cross.jsonl", scored)
        pilot._atomic_json(output / "cross-metrics.json", report)
        print(split, report["splits"][split]["hitAt3"], elapsed, flush=True)


def gold_for(root, personas, split):
    if split == "persona":
        return {
            (r["accountKey"], r["jobId"], r["requirementId"]): set(
                r["evidenceRecordIds"]
            )
            for r in pilot._read_jsonl(personas / "judgments.jsonl")
        }
    path = root / (
        "test-pool/labels.jsonl" if split == "test" else "fixed-labels/labels.jsonl"
    )
    return {
        (r["profileId"], r["jobId"], q["id"]): set(q["evidenceRecordIds"])
        for r in pilot._read_jsonl(path)
        if r["split"] == split
        for q in r["requirementAssessments"]
    }


def summarize(rows, gold, verified=False, threshold=25):
    mode = "verified" if verified else "local"
    stats = evaluate_rows(rows, gold, threshold, modes=(mode,))[mode]
    stats["candidateHitAtK"] = stats.pop("candidateHitAt12")
    linked = correct = missing = 0
    for row in rows:
        if verified:
            supported = [
                r["recordId"]
                for r in row["verified"]
                if r["score"] is not None and r["score"] >= threshold
            ][:3]
        elif "localScores" in row:
            supported = [
                rid
                for rid in row["localTop"]
                if row["localScores"][rid] >= row["threshold"]
            ]
        else:
            continue
        refs = gold[table_key(row)]
        linked += len(supported)
        correct += len(set(supported) & refs)
        missing += bool(refs and not (set(supported) & refs))
    stats["shownReferencePrecision"] = correct / linked if linked else None
    stats["shownReferenceLinks"] = correct
    stats["shownLinks"] = linked
    stats["missedSupportedRequirements"] = missing
    return stats


def local(root, personas, model, output, vector_dir=None):
    from server import Application

    output.mkdir(parents=True, exist_ok=True)
    app = Application(
        root / "cpu", 4, None, None, vector_dir or output / "vectors", model
    )
    engine = app.engine
    learned_head = engine.evidence_head
    learned_cut = engine.evidence_threshold
    from evidence_search import SEARCH_VERSION

    report = {
        "selection": "head selected on full validation MRR before held-out comparison; candidate cap 24 fixed",
        "searchVersion": SEARCH_VERSION,
        "modelSha256": pilot._sha256(model),
        "splits": {},
    }
    for split, users, jobs in cohorts(root, personas):
        gold = gold_for(root, personas, split)
        keys = sorted(
            gold,
            key=lambda k: hashlib.sha256(("record-eval-42" + str(k)).encode()).digest(),
        )
        if split != "persona":
            keys = keys[: 96 if split == "valid" else 256]
        want = set(keys)
        versions = {
            name: []
            for name in (
                "record_v1",
                "passages_v1_head",
                "hard_12",
                "hard_24",
                "hard_48",
            )
        }
        latencies = {name: [] for name in versions}
        app.process("/v1/warm", {"jobs": jobs})
        for user in users:
            uid = user["profileId"]
            if not any(k[0] == uid for k in want):
                continue
            app.process("/v1/warm-profile", {"profile": user})
            selected = [
                j
                for j in jobs
                if any(p == uid and jid == j["jobId"] for p, jid, _ in want)
            ]
            start = time.perf_counter()
            legacy = [
                r for r in propose(engine, user, selected) if table_key(r) in want
            ]
            latencies["record_v1"].append(time.perf_counter() - start)
            versions["record_v1"].extend(legacy)
            engine.evidence_head = None
            engine.evidence_threshold = engine.settings["threshold"]
            start = time.perf_counter()
            simple = [
                r for r in retrieve(engine, user, selected, 24) if table_key(r) in want
            ]
            latencies["passages_v1_head"].append(time.perf_counter() - start)
            versions["passages_v1_head"].extend(simple)
            engine.evidence_head, engine.evidence_threshold = learned_head, learned_cut
            start = time.perf_counter()
            full = [
                r for r in retrieve(engine, user, selected, 48) if table_key(r) in want
            ]
            elapsed = time.perf_counter() - start
            for cap in (12, 24, 48):
                rows = []
                for row in full:
                    candidates = row["candidates"][:cap]
                    rows.append(
                        {
                            **row,
                            "candidates": candidates,
                            "candidatePassages": {
                                rid: row["candidatePassages"][rid] for rid in candidates
                            },
                            "localTop": sorted(
                                candidates,
                                key=lambda rid: (-row["localScores"][rid], rid),
                            )[:3],
                        }
                    )
                versions[f"hard_{cap}"].extend(rows)
                latencies[f"hard_{cap}"].append(elapsed)
            print(split, uid, len(full), flush=True)
        report["splits"][split] = {}
        for name, rows in versions.items():
            pilot._atomic_jsonl(output / f"{split}-{name}.jsonl", rows)
            stats = summarize(rows, gold)
            stats["warmProfileLatencySeconds"] = {
                "p50": float(np.quantile(latencies[name], 0.5)),
                "p95": float(np.quantile(latencies[name], 0.95)),
                "requests": len(latencies[name]),
                "scope": "profile + selected jobs; shared corpus warm; cap variants share retrieval pass",
            }
            if split == "persona":
                stats["byAccount"] = {
                    u["profileId"]: summarize(
                        [r for r in rows if r["profileId"] == u["profileId"]], gold
                    )
                    for u in users
                }
            report["splits"][split][name] = stats
        pilot._atomic_json(output / "local-metrics.json", report)


def api(root, personas, output):
    provider = PROVIDERS["decisions"]
    if not os.getenv(provider.key_env):
        raise RuntimeError("OPENAI_API_KEY가 설정된 실행 환경에서 실행해야 함")
    client = ApiScorer(
        provider, output / "api-cache", api_key=os.environ[provider.key_env]
    )
    metrics = {
        "comparison": "trained evidence reranker vs Decisions on byte-identical frozen record candidates and passages",
        "threshold": 25,
        "thresholdSource": "existing v1 validation policy; not selected on test/personas",
        "splits": {},
    }
    for split, users, jobs in cohorts(root, personas):
        rows = pilot._read_jsonl(output / f"{split}-hard_24.jsonl")
        by_user = {u["profileId"]: u for u in users}
        by_job = {j["jobId"]: j for j in jobs}

        def score(row):
            return verify_requirement(
                row, by_user[row["profileId"]], by_job[row["jobId"]], client
            )

        with ThreadPoolExecutor(max_workers=4) as pool:
            scored = list(pool.map(score, rows))
        gold = gold_for(root, personas, split)
        metrics["splits"][split] = {
            "learned": summarize(rows, gold),
            "decisions": summarize(scored, gold, True),
            "candidateIdsSha256": hashlib.sha256(
                json.dumps([r["candidates"] for r in rows]).encode()
            ).hexdigest(),
        }
        pilot._atomic_jsonl(output / f"{split}-decisions.jsonl", scored)
        metrics["api"] = client.summary()
        pilot._atomic_json(output / "api-metrics.json", metrics)
        print(split, metrics["splits"][split]["decisions"]["hitAt3"], flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("mode", choices=("local", "api", "cross"))
    p.add_argument("--root", type=Path, required=True)
    p.add_argument(
        "--personas", type=Path, default=Path("docs/assets/persona-evidence-v1")
    )
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--model", type=Path)
    p.add_argument("--checkpoint", type=Path)
    p.add_argument("--base-model", default="BAAI/bge-reranker-v2-m3")
    p.add_argument("--device", default="cuda")
    p.add_argument("--batch-size", type=int, default=8)
    p.add_argument(
        "--prompt-key",
        action="store_true",
        help="사용자 터미널에서 API 키를 숨김 입력하고 메모리에만 유지한다",
    )
    p.add_argument("--vector-dir", type=Path)
    a = p.parse_args()
    if a.mode == "local":
        if not a.model:
            p.error("local에는 --model 필요")
        local(a.root, a.personas, a.model, a.output, a.vector_dir)
    elif a.mode == "api":
        if a.prompt_key and not os.getenv("OPENAI_API_KEY"):
            import getpass

            os.environ["OPENAI_API_KEY"] = getpass.getpass(
                "Decisions API key (숨김 입력): "
            )
        api(a.root, a.personas, a.output)
    else:
        if not a.checkpoint:
            p.error("cross에는 --checkpoint 필요")
        cross(
            a.root,
            a.personas,
            a.output,
            a.checkpoint,
            a.base_model,
            a.device,
            a.batch_size,
        )
