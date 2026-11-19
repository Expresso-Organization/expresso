"""선택한 공고의 요건별 근거 검색. 외부 검증은 같은 후보 집합에서만 수행한다."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import getpass
import hashlib
import json
import math
import os
from pathlib import Path
from statistics import mean

import numpy as np

from cpu import CpuRanker, KIND
from inputs import pilot, profile_text, usable_records, interactive_scorer
from retrieval_baselines import Bm25Index
from match_api_scorer import ApiScorer, PROVIDERS, build_body, parse_answers


def candidates(learned, cosine, lexical, cap=12):
    # 순위는 세 검색기에서 차례대로 한 건씩 뽑는다. 같은 기록은 한 번만 API로 전달한다.
    rankings = [sorted(scores, key=lambda k: (-scores[k], k)) for scores in (learned, cosine, lexical)]
    selected = []
    for row in zip(*rankings, strict=True):
        for rid in row:
            if rid not in selected:
                selected.append(rid)
            if len(selected) == cap:
                return selected
    return selected


def propose(engine, profile, jobs):
    records = usable_records(profile)
    if not records:
        return []
    engine.prepare_jobs(jobs)
    texts = {r["recordId"]: pilot.render_record(r) for r in records}
    lexical = Bm25Index(texts)
    ptext = profile_text({**profile, "records": records})
    vectors = engine.embed([ptext, *texts.values()], "query: ")
    rv = np.stack([vectors[t] for t in texts.values()])
    ids = list(texts)
    rows = []
    for job in jobs:
        _, jv, qv = engine.jobs[job["jobId"]]
        qs = job["requirementsFixed"]
        feed = {
            "profile": vectors[ptext],
            "job": jv,
            "records": rv,
            "requirements": qv,
            "kinds": np.asarray([KIND[q["kind"]] for q in qs], dtype=np.int64),
        }
        logits = engine.heads.run(["evidence_logits"], {k: v for k, v in feed.items() if k in engine.inputs})[
            0
        ]
        cos = qv @ rv.T
        for q, s, c in zip(qs, logits, cos, strict=True):
            local = {k: float(v) for k, v in zip(ids, s, strict=True)}
            lexical_scores = lexical.score(q["criterion"], ids)
            chosen = candidates(local, dict(zip(ids, c, strict=True)), lexical_scores)
            rows.append(
                {
                    "profileId": profile["profileId"],
                    "jobId": job["jobId"],
                    "requirementId": q["id"],
                    "kind": q["kind"],
                    "criterion": q["criterion"],
                    "localTop": sorted(ids, key=lambda k: (-local[k], k))[:3],
                    "localHasEvidence": max(local.values()) >= engine.settings["threshold"],
                    "candidates": chosen,
                }
            )
    return rows


def verify_requirement(row, profile, job, client):
    records = {r["recordId"]: r for r in profile["records"]}
    state = (
        "채용 공고의 고정 요건 하나에 대해 각 경력 기록이 제공하는 근거를 독립적으로 평가한다. "
        "기술 이름만 같은 경우 수행 범위까지 확인한다. 연차 조건은 이 직무의 실제 근무 기간을 확인한다. "
        "해당 기록 하나에서 확인할 수 없는 역량은 not_evidenced로 평가한다.\n공고: "
        + job["fields"]["title"]
        + "\n요건: "
        + row["criterion"]
    )
    qs = [
        (f"r{i}", "이 기록이 위 요건을 얼마나 직접적으로 입증하는가?\n" + pilot.render_record(records[rid]))
        for i, rid in enumerate(row["candidates"])
    ]
    raw = client.call(build_body(client.provider, state, qs))
    if raw.get("model") != client.provider.model:
        raise ValueError("응답 모델 불일치")
    answers = parse_answers(client.provider, raw)
    scored = [
        {"recordId": rid, "score": answers[q]["score"]}
        for rid, (q, _) in zip(row["candidates"], qs, strict=True)
    ]
    if any(
        v["score"] is not None and not (math.isfinite(v["score"]) and 0 <= v["score"] <= 100) for v in scored
    ):
        raise ValueError("응답 범위 오류")
    scored.sort(key=lambda x: -(x["score"] if x["score"] is not None else -1))
    return {**row, "verified": scored}


def evaluate_rows(rows, golds, threshold):
    stats = {}
    for name in ("local", "verified"):
        h = []
        rr = []
        rc = []
        tp = fp = fn = tn = 0
        recoverable = []
        for r in rows:
            gold = golds[r["profileId"], r["jobId"], r["requirementId"]]
            if name == "local":
                ids = r["localTop"]
                said = r["localHasEvidence"]
            else:
                ok = [v for v in r["verified"] if v["score"] is not None]
                ids = [v["recordId"] for v in ok[:3]]
                said = bool(ok and ok[0]["score"] >= threshold)
            if gold:
                ranks = [i for i, v in enumerate(ids, 1) if v in gold]
                h.append(bool(ranks))
                rr.append(1 / min(ranks) if ranks else 0)
                rc.append(len(set(ids) & gold) / len(gold))
                recoverable.append(bool(set(r["candidates"]) & gold))
            if said and gold:
                tp += 1
            elif said:
                fp += 1
            elif gold:
                fn += 1
            else:
                tn += 1
        stats[name] = {
            "requirements": len(rows),
            "withReference": len(h),
            "hitAt3": mean(h) if h else None,
            "mrrAt3": mean(rr) if rr else None,
            "referenceRecallAt3": mean(rc) if rc else None,
            "candidateHitAt12": mean(recoverable) if recoverable else None,
            "presenceF1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "tn": tn,
        }
    return stats


def table_key(r):
    return r["profileId"], r["jobId"], r["requirementId"]


def run_eval(root, personas, output):
    from evaluation import cohorts

    engine = CpuRanker(root / "cpu")
    provider = PROVIDERS["decisions"]
    key = os.environ.get(provider.key_env) or getpass.getpass("Decisions API key: ")
    client = ApiScorer(provider, output / "cache", api_key=key)
    p_labels = pilot._read_jsonl(personas / "judgments.jsonl")
    metrics = {}
    threshold = None
    for split, users, jobs in cohorts(root, personas):
        if split == "persona":
            gold = {
                (r["accountKey"], r["jobId"], r["requirementId"]): set(r["evidenceRecordIds"])
                for r in p_labels
            }
        else:
            path = root / ("test-pool/labels.jsonl" if split == "test" else "fixed-labels/labels.jsonl")
            gold = {
                (r["profileId"], r["jobId"], q["id"]): set(q["evidenceRecordIds"])
                for r in pilot._read_jsonl(path)
                if r["split"] == split
                for q in r["requirementAssessments"]
            }
        user = {p["profileId"]: p for p in users}
        job = {j["jobId"]: j for j in jobs}
        sample = sorted(gold, key=lambda k: hashlib.sha256(("record-eval-42" + str(k)).encode()).digest())
        if split != "persona":
            sample = sample[: 96 if split == "valid" else 256]
        want = set(sample)
        props = []
        for uid in sorted({k[0] for k in want}):
            jids = sorted({j for p, j, q in want if p == uid})
            props.extend(
                r for r in propose(engine, user[uid], [job[j] for j in jids]) if table_key(r) in want
            )
        if {table_key(r) for r in props} != want or len(props) != len(want):
            raise ValueError("표본 조인 오류")

        def one(row):
            try:
                return verify_requirement(row, user[row["profileId"]], job[row["jobId"]], client)
            except RuntimeError as exc:
                import re

                raise RuntimeError(
                    re.sub(r"sk-[A-Za-z0-9_.*-]+", "[redacted]", str(exc).replace(key, "[redacted]"))
                ) from None

        with ThreadPoolExecutor(max_workers=4) as pool:
            scored = list(pool.map(one, props))
        if split == "valid":
            threshold = max(
                range(0, 101, 5),
                key=lambda cut: (evaluate_rows(scored, gold, cut)["verified"]["presenceF1"], cut),
            )
        metrics[split] = evaluate_rows(scored, gold, threshold)
        if split == "persona":
            metrics[split]["byAccount"] = {
                uid: evaluate_rows([r for r in scored if r["profileId"] == uid], gold, threshold)
                for uid in user
            }
        pilot._atomic_jsonl(output / (split + ".jsonl"), scored)
        print(split, len(scored), metrics[split]["verified"]["hitAt3"], flush=True)
    pilot._atomic_json(
        output / "metrics.json",
        {
            "model": provider.model,
            "verifiedThreshold": threshold,
            "selection": "validation F1 grid 0..100 step 5",
            "splits": metrics,
            "api": client.summary(),
        },
    )
    pilot._atomic_json(
        output / "policy.json", {"model": provider.model, "threshold": threshold, "candidateLimit": 12}
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    subs = p.add_subparsers(dest="command", required=True)
    e = subs.add_parser("evaluate")
    for k in ("root", "personas", "output"):
        e.add_argument("--" + k, type=Path, required=True)
    q = subs.add_parser("query")
    for k in ("bundle", "input", "output"):
        q.add_argument("--" + k, type=Path, required=True)
    q.add_argument("--job-id", required=True)
    q.add_argument("--decisions-cache", type=Path)
    q.add_argument("--policy", type=Path)
    a = p.parse_args()
    if a.command == "evaluate":
        run_eval(a.root, a.personas, a.output)
    else:
        request = json.loads(a.input.read_bytes())
        profile = request["profile"]
        jobs = [j for j in request["jobs"] if j["jobId"] == a.job_id]
        if len(jobs) != 1:
            raise ValueError("고유한 공고 ID를 지정해야 한다")
        engine = CpuRanker(a.bundle)
        rows = propose(engine, profile, jobs)
        if a.decisions_cache:
            policy = json.loads(a.policy.read_bytes()) if a.policy else None
            provider = PROVIDERS["decisions"]
            if not policy or policy["model"] != provider.model:
                raise ValueError("검증된 Decisions 정책 파일이 필요함")
            client = interactive_scorer(a.decisions_cache)
            for i, r in enumerate(rows):
                try:
                    resolved = verify_requirement(r, profile, jobs[0], client)
                except (OSError, RuntimeError, ValueError, KeyError, TypeError):
                    for item in rows[i:]:
                        item["verificationStatus"] = "unavailable"
                    break
                resolved["verificationStatus"] = "verified"
                resolved["verifiedEvidenceIds"] = [
                    v["recordId"]
                    for v in resolved["verified"]
                    if v["score"] is not None and v["score"] >= policy["threshold"]
                ][:3]
                rows[i] = resolved
        pilot._atomic_json(
            a.output, {"status": "ok" if rows else "insufficient_evidence", "requirements": rows}
        )
