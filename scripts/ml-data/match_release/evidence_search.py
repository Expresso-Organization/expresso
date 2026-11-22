"""같은 후보에 대한 학습 점수·코사인·BM25 문단 검색과 기록별 집계."""

from collections import defaultdict

import numpy as np

from inputs import KIND, usable_records, profile_text
from passages import record_passages
from retrieval_baselines import Bm25Index

SEARCH_VERSION = "hybrid-positive-bm25-v2"


def ordered(scores):
    return sorted(scores, key=lambda key: (-scores[key], key))


def reciprocal_rank_fusion(*rankings):
    scores = defaultdict(float)
    for ranking in rankings:
        for rank, key in enumerate(ranking, 1):
            scores[key] += 1 / (60 + rank)
    return dict(scores)


def retrieve(engine, profile, jobs, candidate_limit=24):
    if candidate_limit < 3:
        raise ValueError("후보 상한은 3 이상이어야 함")
    records = usable_records(profile)
    if not records:
        return []
    chunks = (
        engine.passages(records)
        if hasattr(engine, "passages")
        else record_passages(records, getattr(engine, "tokenizer", None))
    )
    if not chunks:
        return []
    engine.prepare_jobs(jobs)
    vectors = engine.embed([c["text"] for c in chunks], "query: ")
    rv = np.stack([vectors[c["text"]] for c in chunks])
    ids = [c["id"] for c in chunks]
    by_id = {c["id"]: c for c in chunks}
    lexical = Bm25Index({c["id"]: c["text"] for c in chunks})
    ptext = profile_text({**profile, "records": records})
    pv = engine.embed([ptext], "query: ")[ptext]
    rows = []
    for job in jobs:
        _, jv, qv = engine.jobs[job["jobId"]]
        feed = {
            "profile": pv,
            "job": jv,
            "records": rv,
            "requirements": qv,
            "kinds": np.array(
                [KIND[q["kind"]] for q in job["requirementsFixed"]], dtype=np.int64
            ),
        }
        head = getattr(engine, "evidence_head", None) or engine.heads
        inputs = {i.name for i in head.get_inputs()}
        logits = head.run(
            ["evidence_logits"], {k: v for k, v in feed.items() if k in inputs}
        )[0]
        cosines = qv @ rv.T
        for query, learned, cosine in zip(
            job["requirementsFixed"], logits, cosines, strict=True
        ):
            learned = dict(zip(ids, map(float, learned), strict=True))
            cosine = dict(zip(ids, map(float, cosine), strict=True))
            bm25 = lexical.score(query["criterion"], ids)
            # 일치 단어가 없는 BM25 0점은 ID 순위로 섞지 않는다.
            fused = reciprocal_rank_fusion(
                ordered(learned),
                ordered(cosine),
                ordered({k: v for k, v in bm25.items() if v > 0}),
            )
            # 점수를 더하지 않고 기록별 최댓값을 사용해 긴 기록의 조각 수 이점을 줄인다.
            per_record = defaultdict(list)
            for chunk_id in ordered(fused):
                per_record[by_id[chunk_id]["recordId"]].append(chunk_id)
            record_scores = [
                {rid: max(scores[c] for c in cs) for rid, cs in per_record.items()}
                for scores in (learned, cosine, bm25)
            ]
            rr = reciprocal_rank_fusion(
                ordered(record_scores[0]),
                ordered(record_scores[1]),
                ordered({k: v for k, v in record_scores[2].items() if v > 0}),
            )
            candidates = ordered(rr)[:candidate_limit]
            passages = {}
            for rid in candidates:
                cs = per_record[rid]
                # 두 경로 모두 같은 근거 문단을 사용한다. 학습·융합의 최고 문단을 하나씩 보존한다.
                selected = list(
                    dict.fromkeys([min(cs, key=lambda c: (-learned[c], c)), cs[0]])
                )
                passages[rid] = [by_id[c] for c in selected]
            local = sorted(candidates, key=lambda rid: (-record_scores[0][rid], rid))
            quotes = {
                rid: max(passages[rid], key=lambda c: learned[c["id"]])["quote"]
                for rid in candidates
            }
            threshold = getattr(
                engine, "evidence_threshold", engine.settings["threshold"]
            )
            rows.append(
                {
                    "searchVersion": SEARCH_VERSION,
                    "profileId": profile["profileId"],
                    "jobId": job["jobId"],
                    "requirementId": query["id"],
                    "kind": query["kind"],
                    "criterion": query["criterion"],
                    "candidates": candidates,
                    "candidatePassages": passages,
                    "hybridTop": candidates[:3],
                    "localTop": local[:3],
                    "localHasEvidence": max(record_scores[0].values()) >= threshold,
                    "localScores": record_scores[0],
                    "localQuotes": quotes,
                    "threshold": threshold,
                }
            )
    return rows


def detail(row, k=3):
    chosen = row["localTop"][:k]
    supported = [rid for rid in chosen if row["localScores"][rid] >= row["threshold"]]
    return {
        "requirementId": row["requirementId"],
        "hasEvidence": bool(supported),
        "evidenceRecordIds": supported,
        "records": [
            {
                "recordId": rid,
                "score": row["localScores"][rid],
                "quote": row["localQuotes"][rid],
            }
            for rid in chosen
        ],
    }
