"""고정 평가셋, CPU 번들 일치도 및 기록 수별 근거 회수율을 검증한다."""

from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import platform
from statistics import mean, median
from time import perf_counter

import torch

from cpu import CpuRanker
from evaluation import cohorts
from runtime import MatchEngine, pilot
from label_fixed import weighted_score
from fixed_data import normalized


def check_bundle(bundle):
    m = json.loads((bundle / "manifest.json").read_bytes())
    for f, d in m["files"].items():
        if pilot._sha256(bundle / f) != d:
            raise ValueError("번들 파일 해시 불일치: " + f)


def audit_data(root, personas, old_jobs):
    jobs = pilot._read_jsonl(root / "fixed/jobs.jsonl")
    users = pilot._read_jsonl(root / "fixed/profiles.jsonl")
    old = pilot._read_jsonl(old_jobs)
    rows = pilot._read_jsonl(root / "fixed-labels/labels.jsonl")
    pairs = pilot._read_jsonl(root / "fixed/candidate-manifest.jsonl")
    init = pilot.validate_training_inputs(users, jobs, pairs, rows)
    partitions = {}
    for kind, group, cols in (
        ("profile", users, ["profileId"]),
        ("job", jobs, ["jobId", "sourceUrl", "title", "description"]),
    ):
        for col in cols:

            def value(row):
                return normalized(row["fields"][col]) if col in ("title", "description") else row[col]

            ss = {s: {value(r) for r in group if r["split"] == s} for s in ("train", "valid", "test")}
            if ss["train"] & (ss["test"] | ss["valid"]) or ss["valid"] & ss["test"]:
                raise ValueError(col + " 분할 누출")
            partitions[kind + "." + col] = {s: len(v) for s, v in ss.items()}
    if {j["jobId"] for j in old} & {j["jobId"] for j in jobs}:
        raise ValueError("기존 공고 ID 중복")
    if {normalized(j["fields"]["description"]) for j in old} & {
        normalized(j["fields"]["description"]) for j in jobs
    }:
        raise ValueError("기존 공고 원문 중복")
    training_profiles = {
        p["profileId"] for p in pilot._read_jsonl(root / "pilot/profiles.jsonl") if p["split"] == "train"
    }
    training_records = {
        r["recordId"]
        for p in pilot._read_jsonl(root / "pilot/profiles.jsonl")
        if p["split"] == "train"
        for r in p["records"]
    }
    persona = pilot._read_jsonl(personas / "records.jsonl")
    if training_records & {r["recordId"] for r in persona}:
        raise ValueError("더미 기록 중복")
    if training_profiles & {p["profileId"] for p in users if p["split"] != "train"}:
        raise ValueError("평가 프로필 학습 중복")
    source = {str(j["_id"]): j for j in map(json.loads, (root / "postings.jsonl").read_bytes().splitlines())}
    byjob = {j["jobId"]: j for j in jobs}
    ids = {p["profileId"]: {r["recordId"] for r in p["records"]} for p in users}
    for j in jobs:
        if (
            hashlib.sha256(source[j["jobId"]]["descriptionRaw"].encode()).hexdigest()
            != j["descriptionSha256"]
        ):
            raise ValueError("공고 원문 불일치")
        for q in j["requirementsFixed"]:
            line = source[j["jobId"]]["descriptionRaw"].splitlines()[q["sourceLine"] - 1]
            if normalized(q["criterion"]) not in normalized(line):
                raise ValueError("요건 원문 불일치")
    full = pilot._read_jsonl(root / "test-pool/labels.jsonl")
    testusers = [p for p in users if p["split"] == "test"]
    testjobs = [j for j in jobs if j["split"] == "test"]
    pilot.validate_training_inputs(
        testusers,
        testjobs,
        [
            {"profileId": p["profileId"], "jobId": j["jobId"], "split": "test"}
            for p in testusers
            for j in testjobs
        ],
        full,
    )
    for row in rows + full:
        j = byjob[row["jobId"]]
        ass = row["requirementAssessments"]
        if [(q["id"], q["kind"], q["criterion"]) for q in ass] != [
            (q["id"], q["kind"], q["criterion"]) for q in j["requirementsFixed"]
        ]:
            raise ValueError("고정 요건 변경")
        if row["labelSource"] != "codex-gpt-6.1-terra" or row["matchScore"] != weighted_score(ass):
            raise ValueError("점수 또는 모델 출처 불일치")
        for q in ass:
            if (not q["evidenceRecordIds"]) != (q["coverage"] == "not_evidenced") or not set(
                q["evidenceRecordIds"]
            ) <= ids[row["profileId"]]:
                raise ValueError("근거 ID 불일치")
    return {
        "initial": init,
        "distinctBySplit": partitions,
        "fullTestPairs": len(full),
        "testProfiles": len(testusers),
        "testJobs": len(testjobs),
        "exactPriorPostingOverlap": 0,
        "trainPersonaRecordIdOverlap": 0,
        "pilotTrainToFixedEvalProfileIdOverlap": 0,
        "sourceRequirements": sum(len(j["requirementsFixed"]) for j in jobs),
    }


def parity(root, personas):
    check_bundle(root / "bundle")
    check_bundle(root / "cpu")
    torch.set_num_threads(4)
    started = perf_counter()
    cpu = CpuRanker(root / "cpu", 4)
    load_time = perf_counter() - started
    _, users, jobs = next(c for c in cohorts(root, personas) if c[0] == "persona")
    reference = defaultdict(list)
    for row in pilot._read_jsonl(root / "predictions/persona.jsonl"):
        reference[row["profileId"]].append(row)
    max_a = max_b = 0.0
    top_matches = 0
    durations = []
    for p in users:
        started = perf_counter()
        out = cpu.rank(p, jobs, limit=len(jobs))
        durations.append(perf_counter() - started)
        actual = out["jobs"]
        exp = reference[p["profileId"]]
        if [j["jobId"] for j in actual] != [j["jobId"] for j in exp]:
            raise ValueError("ONNX 순위 차이")
        for a, b in zip(actual, exp, strict=True):
            max_a = max(max_a, abs(a["localScore"] - b["localScore"]))
            for x, y in zip(a["evidence"], b["evidence"], strict=True):
                if x["hasEvidence"] != y["hasEvidence"] or [r["recordId"] for r in x["records"]] != [
                    r["recordId"] for r in y["records"]
                ]:
                    raise ValueError("ONNX 근거 불일치")
                top_matches += 1
                max_b = max(
                    max_b,
                    *(abs(i["score"] - j["score"]) for i, j in zip(x["records"], y["records"], strict=True)),
                )
    if max_a > 0.01 or max_b > 0.01:
        raise ValueError("ONNX 수치 허용차 초과")
    if cpu.rank({"records": []}, jobs)["status"] != "insufficient_evidence":
        raise ValueError("빈 프로필 확인 필요")
    sample = next(p for p in users if p["profileId"] == "dummy-data-analyst")
    pilot._atomic_json(root / "example-input.json", {"profile": sample, "jobs": jobs})
    return {
        "device": platform.machine(),
        "threads": 4,
        "cpuLoadSeconds": load_time,
        "realRequestSeconds": durations,
        "coldJobCacheFirstRequestSeconds": durations[0],
        "warmJobCacheMedianSeconds": median(durations[1:]),
        "comparedJobRankings": len(users),
        "comparedRequirements": top_matches,
        "maxLocalScoreDifference": max_a,
        "maxEvidenceLogitDifference": max_b,
        "emptyProfileAbstains": True,
    }


def evidence_diagnostic(root, personas, device):
    torch.set_num_threads(4)
    engine = MatchEngine.load(root / "bundle", device)
    _, users, jobs = next(c for c in cohorts(root, personas) if c[0] == "persona")
    gold = {
        (r["accountKey"], r["jobId"], r["requirementId"]): set(r["evidenceRecordIds"])
        for r in pilot._read_jsonl(personas / "judgments.jsonl")
    }
    out = {}
    for p in users:
        uid = p["profileId"]
        ordered = sorted(
            p["records"], key=lambda r: hashlib.sha256(("ablation42" + r["recordId"]).encode()).hexdigest()
        )
        experiments = []
        for n in sorted({1, 3, 10, 25, 50, len(ordered)}):
            if n > len(ordered):
                continue
            subgroup = ordered[:n] if n < len(ordered) else p["records"]
            allowed = {r["recordId"] for r in subgroup}
            row = {"records": n}
            for method in ["learned", "cosine"] if n == len(ordered) else ["learned"]:
                engine.settings["evidenceMethod"] = method
                match = engine.rank({**p, "records": subgroup}, jobs, limit=len(jobs))
                h = []
                rr = []
                for j in match["jobs"]:
                    for q in j["evidence"]:
                        known = gold[uid, j["jobId"], q["requirementId"]] & allowed
                        if known:
                            ids = [r["recordId"] for r in q["records"]]
                            h.append(bool(known & set(ids)))
                            rr.append(len(known & set(ids)) / len(known))
                row[method] = {
                    "remainingWithEvidence": len(h),
                    "hitAt3": mean(h) if h else None,
                    "referenceRecallAt3": mean(rr) if rr else None,
                }
                if method == "learned":
                    row["topJob"] = match["jobs"][0]["jobId"]
            experiments.append(row)
        out[uid] = experiments
    return out


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", type=Path, required=True)
    p.add_argument("--personas", type=Path, required=True)
    p.add_argument("--old-jobs", type=Path, required=True)
    p.add_argument("--device", default="cpu")
    a = p.parse_args()
    audit = audit_data(a.root, a.personas, a.old_jobs)
    print("데이터 검증 통과", flush=True)
    measures = parity(a.root, a.personas)
    print("ONNX 실입력 일치", flush=True)
    tests = evidence_diagnostic(a.root, a.personas, a.device)
    pilot._atomic_json(
        a.root / "verification.json", {"data": audit, "cpu": measures, "recordCountAblation": tests}
    )
