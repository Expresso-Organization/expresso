"""Terra 평가 세트에서 기존 MLP의 스크리닝과 Decisions 재정렬을 비교한다."""

import argparse
from collections import defaultdict
import math
from pathlib import Path
from statistics import mean

import llm_suitability_train as pilot
from match_evaluation import pairwise_accuracy, profile_ndcg, screening_recall_curve
from ranking_evaluation import paired_bootstrap


def indexed(rows):
    result = {(row["profileId"], row["jobId"]): row for row in rows}
    if len(result) != len(rows):
        raise ValueError("중복된 프로필·공고 쌍")
    return result


def dcg(scores):
    return sum(value / math.log2(rank + 2) for rank, value in enumerate(scores[:10]))


def ranking_summary(pairs, truth, scores):
    rows = [{"profileId": p, "jobId": j, "target": truth[p, j]["matchScore"],
             "prediction": scores[p, j]["prediction"]} for p, j in sorted(pairs)]
    scored = [r for r in rows if r["prediction"] is not None]
    ranked = [{**r, "prediction": -1 if r["prediction"] is None else r["prediction"]} for r in rows]
    ndcg = profile_ndcg(ranked)
    return {"profiles": len(ndcg), "pairs": len(rows), "ndcgAt10": mean(ndcg.values()),
            "mae": mean(abs(r["target"] - r["prediction"]) for r in scored) if scored else None,
            "pairwiseMinGap5": pairwise_accuracy(ranked), "refused": len(rows) - len(scored)}, ndcg


def compare(data: Path, labels: Path, mlp: Path, decisions: Path, output: Path, cached_only: bool = False) -> None:
    dataset = pilot.load_training_dataset(data, labels)
    truth = indexed(pilot._read_jsonl(labels / "suitability-labels.jsonl"))
    if {row["labelSource"] for row in truth.values()} != {"codex-gpt-6.1-terra"}:
        raise ValueError("Terra 라벨 출처 확인 필요")
    predictions = indexed(pilot._read_jsonl(mlp))
    suffix = "-cached" if cached_only else ""
    judged = indexed(pilot._read_jsonl(decisions / f"judged{suffix}.jsonl"))
    screened = indexed(pilot._read_jsonl(decisions / f"screened{suffix}.jsonl"))
    if not judged.keys() <= truth.keys() or (not cached_only and truth.keys() != judged.keys()):
        raise ValueError("라벨 후보와 API 채점 대상 불일치")
    full = {(p["profileId"], j["jobId"]) for p in dataset["profiles"] for j in dataset["jobs"] if p["split"] == j["split"]}
    if predictions.keys() != full:
        raise ValueError("MLP의 전체 공고 풀 누락")
    report = {}
    pair_report = []
    for split in ("valid", "test"):
        pairs = sorted(key for key, row in truth.items() if row["split"] == split)
        baseline, _ = ranking_summary(pairs, truth, predictions)
        comparison = None
        paired = [key for key in pairs if key in judged]
        if paired:
            participating = {p for p, _ in paired}
            if any(p in participating and (p, j) not in judged for p, j in pairs):
                raise ValueError("동일 프로필의 일부 라벨 후보가 누락됨")
            mlp_stats, mlp_ndcg = ranking_summary(paired, truth, predictions)
            api_stats, api_ndcg = ranking_summary(paired, truth, judged)
            comparison = {"mlp": mlp_stats, "decisions": api_stats,
                          "delta95": paired_bootstrap(api_ndcg, mlp_ndcg, iterations=20000)}
        pool = defaultdict(list)
        known = defaultdict(dict)
        for (p, j), row in predictions.items():
            if row["split"] == split:
                pool[p].append((j, row["prediction"]))
        for p, j in pairs:
            known[p][j] = truth[p, j]["matchScore"]
        relevant = {p: {j for j, y in ys.items() if y >= 60} for p, ys in known.items()}
        recall = screening_recall_curve(pool, relevant)
        if not recall["profilesWithRelevant"]:
            recall["recallAtK"] = [None] * recall["poolSize"]
        before, after, judged_counts = {}, {}, []
        best_hits = []
        pool_judged = 0
        pool_ndcg = []
        expected = set()
        for p, values in pool.items():
            ordered = sorted(values, key=lambda item: (-item[1], item[0]))
            top = [j for j, _ in ordered[:10]]
            for rank, (j, score) in enumerate(ordered, 1):
                if j in known[p]:
                    key = (p, j)
                    pair_report.append({"split": split, "profileId": p, "jobId": j, "terraScore": known[p][j],
                                        "mlpScore": score, "mlpRankInSplitPool": rank,
                                        "decisionsJudgedSetResponseAvailable": key in judged,
                                        "decisionsJudgedSetScore": judged[key]["prediction"] if key in judged else None,
                                        "decisionsMlpTop10ResponseAvailable": key in screened,
                                        "decisionsMlpTop10Score": screened[key]["prediction"] if key in screened else None})
            observed = known[p]
            best = max(observed.values())
            if best > 0:
                best_hits.append(any(observed.get(j) == best for j in top))
            pool_judged += sum(j in observed for j in top)
            ideal = dcg(sorted(observed.values(), reverse=True))
            gain = dcg([observed.get(j, 0) for j in top]) / ideal if ideal else 1.0
            pool_ndcg.append(gain)
            keys = {(p, j) for j in top}
            if cached_only and keys.isdisjoint(screened):
                continue
            if not keys <= screened.keys():
                raise ValueError("MLP 후보 일부의 API 응답이 누락됨")
            expected.update(keys)
            # API 점수가 같으면 스크리닝 순서를 보존한다.
            def api_order(j):
                value = screened[p, j]["prediction"]
                return -1 if value is None else value
            reranked = sorted(top, key=api_order, reverse=True)
            before[p] = gain
            after[p] = dcg([known[p].get(j, 0) for j in reranked]) / ideal if ideal else 1.0
            judged_counts.append(sum(j in known[p] for j in top))
        if expected != {key for key, row in screened.items() if row["split"] == split}:
            raise ValueError("MLP 상위 10건과 재정렬 입력 불일치")
        report[split] = {
            "profiles": len(pool), "labeledPairs": len(pairs), "screening": recall,
            "mlpFullPoolTop10": {"knownBestHits": sum(best_hits), "profilesWithNonzeroBest": len(best_hits),
                                 "judgedInShortlist": pool_judged, "shortlistPairs": 10 * len(pool),
                                 "observedNdcg": mean(pool_ndcg)},
            "mlpJudgedAll": baseline, "pairedJudgedCandidates": comparison,
            "top10Pipeline": {"evaluatedProfiles": len(before), "poolSize": recall["poolSize"],
                              "judgedInShortlist": sum(judged_counts), "shortlistPairs": len(expected),
                              "refused": sum(screened[k]["prediction"] is None for k in expected),
                              "mlpObservedNdcg": mean(before.values()) if before else None,
                              "rerankedObservedNdcg": mean(after.values()) if after else None,
                              "observedNdcgDelta95": paired_bootstrap(after, before, iterations=20000) if before else None},
        }
    pilot._atomic_jsonl(output.with_suffix(".pairs.jsonl"), pair_report)
    pilot._atomic_json(output, report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("data", "labels", "mlp", "decisions", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--cached-only", action="store_true", help="API 응답이 있는 프로필만 짝지어 비교한다")
    compare(**vars(parser.parse_args()))
