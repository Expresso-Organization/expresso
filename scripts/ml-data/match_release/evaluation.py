"""새 공고 전체 풀 및 6개 회귀 계정에서 스크리닝·근거·재정렬을 검증한다."""

from __future__ import annotations

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import getpass
import json
import math
import os
from pathlib import Path
from statistics import mean
import torch

from runtime import MatchEngine
from inputs import pilot, rerank, PROVIDERS, ApiScorer
from label_fixed import weighted_score
from match_evaluation import profile_ndcg, screening_recall_curve
from ranking_evaluation import paired_bootstrap


def cohorts(root, personas):
    data = root / "fixed"
    users = pilot._read_jsonl(data / "profiles.jsonl")
    jobs = pilot._read_jsonl(data / "jobs.jsonl")
    for split in ("valid", "test"):
        yield split, [p for p in users if p["split"] == split], [j for j in jobs if j["split"] == split]
    records = defaultdict(list)
    for row in pilot._read_jsonl(personas / "records.jsonl"):
        records[row["accountKey"]].append({k: row[k] for k in ("recordId", "title", "bodyMd")})
    # 로컬 더미 DB의 profile.experienceYears. dev01에는 이 필드가 없다.
    years = {
        "dummy-data-analyst": 4,
        "dummy-ml-research": 6,
        "dummy-newgrad": 0,
        "dummy-career-switch": 6,
        "dev01": None,
        "dummy-staff-platform": 12,
    }
    profiles = [{"profileId": k, "experienceYears": years[k], "records": v} for k, v in records.items()]
    original = {j["jobId"]: j for j in pilot._read_jsonl(root / "persona-postings.jsonl")}
    fixed = json.loads((personas / "requirements.json").read_bytes())["postings"]
    from fixed_data import digest

    for j in fixed:
        assert digest(original[j["jobId"]]["fields"]["description"]) == j["descriptionSha256"]
    yield (
        "persona",
        profiles,
        [{**original[j["jobId"]], "requirementsFixed": j["requirements"]} for j in fixed],
    )


def predict(root, bundle, personas, device):
    torch.set_num_threads(4)
    engine = MatchEngine.load(bundle, device)
    for split, users, jobs in cohorts(root, personas):
        rows = []
        for p in users:
            scored = engine.rank(p, jobs, limit=len(jobs))
            for job in scored["jobs"]:
                rows.append({"profileId": p["profileId"], **job})
        pilot._atomic_jsonl(root / "predictions" / (split + ".jsonl"), rows)
        print(split, len(rows), flush=True)


def api_scores(root, personas):
    provider = PROVIDERS["decisions"]
    key = os.getenv(provider.key_env) or getpass.getpass("Decisions API key: ")
    api = ApiScorer(provider, root / "decisions/cache", api_key=key)
    for split, users, jobs in cohorts(root, personas):
        scores = defaultdict(list)
        for row in pilot._read_jsonl(root / "predictions" / (split + ".jsonl")):
            scores[row["profileId"]].append(row)

        def per_profile(p):
            uid = p["profileId"]
            k = 3 if split == "persona" else 10
            local = sorted(scores[uid], key=lambda r: (-r["localScore"], r["jobId"]))[:k]
            try:
                result = rerank(p, jobs, {"status": "ok", "jobs": local}, api)
            except Exception as exc:
                # API의 원문 오류가 인증 정보를 포함할 수 있어 사용자 입력을 기록하지 않는다.
                import re

                safe = re.sub(r"sk-[A-Za-z0-9_.*-]+", "[redacted]", str(exc).replace(key, "[redacted]"))
                raise RuntimeError(safe) from None
            return [
                {"profileId": uid, "jobId": r["jobId"], "decisionScore": r["decisionScore"]}
                for r in result["jobs"]
            ]

        with ThreadPoolExecutor(max_workers=2) as pool:
            rows = [r for result in pool.map(per_profile, users) for r in result]
        pilot._atomic_jsonl(root / "decisions" / (split + ".jsonl"), rows)
        pilot._atomic_json(root / "decisions/summary.json", api.summary())
        print(split, len(rows), flush=True)


def b_metrics(judgments):
    rr = []
    recall = []
    hits = []
    tp = fp = fn = tn = 0
    for j, row in judgments:
        gold = set(j["evidenceRecordIds"])
        ids = [r["recordId"] for r in row["records"]]
        if not ids:
            raise ValueError("평가 기록 누락")
        if row["hasEvidence"] and gold:
            tp += 1
        elif row["hasEvidence"]:
            fp += 1
        elif gold:
            fn += 1
        else:
            tn += 1
        if gold:
            ranks = [i for i, v in enumerate(ids, 1) if v in gold]
            rr.append(1 / min(ranks) if ranks else 0)
            hits.append(bool(ranks))
            recall.append(len(ranks) / len(gold))
    return {
        "requirements": len(judgments),
        "withReference": len(rr),
        "hitAt3": mean(hits) if hits else None,
        "referenceRecallAt3": mean(recall) if recall else None,
        "mrrAt3": mean(rr) if rr else None,
        "presenceConfusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
        "presenceF1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
    }


def summarize(root, personas):
    fixed = pilot._read_jsonl(root / "fixed-labels/labels.jsonl")
    full_test = pilot._read_jsonl(root / "test-pool/labels.jsonl")
    pj = pilot._read_jsonl(personas / "judgments.jsonl")
    doc = json.loads((personas / "requirements.json").read_bytes())
    requirements = {q["id"]: q for j in doc["postings"] for q in j["requirements"]}
    grouped = defaultdict(list)
    for j in pj:
        q = requirements[j["requirementId"]]
        grouped[j["accountKey"], j["jobId"]].append(
            {**q, "coverage": j["coverage"], "evidenceRecordIds": j["evidenceRecordIds"]}
        )
    persona = [
        {"profileId": p, "jobId": j, "matchScore": weighted_score(a), "requirementAssessments": a}
        for (p, j), a in grouped.items()
    ]
    result = {}
    for split, users, jobs in cohorts(root, personas):
        gold = (
            persona
            if split == "persona"
            else full_test
            if split == "test"
            else [l for l in fixed if l["split"] == split]
        )
        truth = {(l["profileId"], l["jobId"]): l for l in gold}
        pool = defaultdict(list)
        for r in pilot._read_jsonl(root / "predictions" / (split + ".jsonl")):
            pool[r["profileId"]].append(r)
        expected = {(p["profileId"], j["jobId"]) for p in users for j in jobs}
        predicted = {(p, j["jobId"]) for p, rs in pool.items() for j in rs}
        if (
            expected != predicted
            or sum(map(len, pool.values())) != len(expected)
            or len(truth) != len(gold)
            or (split != "valid" and truth.keys() != expected)
        ):
            raise ValueError("공고 풀·정답의 고유성 또는 범위 불일치")
        decisions = pilot._read_jsonl(root / "decisions" / (split + ".jsonl"))
        api = {(r["profileId"], r["jobId"]): r["decisionScore"] for r in decisions}
        complete = truth.keys() == expected
        k = 3 if split == "persona" else 10
        allrows = defaultdict(list)
        bjud = []
        by_account = {}
        relevant = defaultdict(set)
        scores = defaultdict(list)
        known = 0
        expect_api = set()
        for uid, rows in pool.items():
            rows.sort(key=lambda r: (-r["localScore"], r["jobId"]))
            shortlist = rows[:k]
            expect_api.update((uid, r["jobId"]) for r in shortlist)
            apiorder = sorted(
                shortlist, key=lambda r: -(api[uid, r["jobId"]] if api[uid, r["jobId"]] is not None else -1)
            )

            def evidence_score(r):
                return mean(1 / (1 + math.exp(-q["records"][0]["score"])) for q in r["evidence"])

            eorder = sorted(shortlist, key=evidence_score, reverse=True)
            ranks_api = {r["jobId"]: -i for i, r in enumerate(apiorder + rows[k:])}
            ranks_e = {r["jobId"]: -i for i, r in enumerate(eorder + rows[k:])}
            buser = []
            for row in sorted(rows, key=lambda v: v["jobId"]):
                jid = row["jobId"]
                scores[uid].append((jid, row["localScore"]))
                label = truth.get((uid, jid))
                if label is None:
                    continue
                if label["matchScore"] >= 60:
                    relevant[uid].add(jid)
                if (uid, jid) in api:
                    known += 1
                for model, pred in (
                    ("pilot", row["pilotScore"]),
                    ("local", row["localScore"]),
                    ("evidence", ranks_e[jid]),
                    ("decisions", ranks_api[jid]),
                ):
                    allrows[model].append(
                        {"profileId": uid, "jobId": jid, "target": label["matchScore"], "prediction": pred}
                    )
                qs = {q["id"]: q for q in label["requirementAssessments"]}
                ds = {q["requirementId"]: q for q in row["evidence"]}
                if qs.keys() != ds.keys():
                    raise ValueError("고정 요건 조인 오류")
                buser.extend((q, ds[i]) for i, q in qs.items())
            bjud.extend(buser)
            if split == "persona":
                by_account[uid] = {
                    "evidence": b_metrics(buser),
                    "topLocal": rows[0]["jobId"],
                    "topDecisions": apiorder[0]["jobId"],
                }
        if api.keys() != expect_api or len(api) != len(decisions):
            raise ValueError("재정렬 범위 또는 중복 응답 오류")
        ranks = {model: profile_ndcg(rs, k=k) for model, rs in allrows.items()}
        for uid, a in by_account.items():
            a["ndcg"] = {m: v[uid] for m, v in ranks.items()}
        recall = screening_recall_curve(scores, relevant)
        result[split] = {
            "profiles": len(users),
            "jobPool": len(jobs),
            "judgedPairs": len(truth),
            "allPairsJudged": complete,
            "topK": k,
            "positivePairs": sum(map(len, relevant.values())),
            "profilesWithPositive": recall["profilesWithRelevant"],
            "recallAtK": recall["recallAtK"][k - 1] if recall["profilesWithRelevant"] else None,
            "ndcg": {m: mean(v.values()) for m, v in ranks.items()},
            "delta95": {
                m: paired_bootstrap(ranks[m], ranks["local"], iterations=20000, seed=42)
                for m in ["pilot", "evidence", "decisions"]
            },
            "judgedShortlistSlots": known,
            "refusedApi": sum(v is None for v in api.values()),
            "evidence": b_metrics(bjud),
            "perAccount": by_account,
        }
    pilot._atomic_json(root / "eval.json", result)
    return result


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("mode", choices=("predict", "api", "report"))
    p.add_argument("--root", type=Path, required=True)
    p.add_argument("--personas", type=Path, required=True)
    p.add_argument("--device", default="cpu")
    a = p.parse_args()
    if a.mode == "predict":
        predict(a.root, a.root / "bundle", a.personas, a.device)
    elif a.mode == "api":
        api_scores(a.root, a.personas)
    else:
        summarize(a.root, a.personas)
