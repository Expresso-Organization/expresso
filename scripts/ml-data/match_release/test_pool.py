"""한국어 평가 분할의 미판정 공고를 별도 캐시에서 채점해 풀 전체를 검증한다."""

import argparse
import shutil
from pathlib import Path

from label_fixed import pilot, run


def complete(root, workers):
    data = root / "fixed"
    profiles = [p for p in pilot._read_jsonl(data / "profiles.jsonl") if p["split"] == "test"]
    jobs = [j for j in pilot._read_jsonl(data / "jobs.jsonl") if j["split"] == "test"]
    initial = [r for r in pilot._read_jsonl(data / "candidate-manifest.jsonl") if r["split"] == "test"]
    done = {(r["profileId"], r["jobId"]) for r in initial}
    missing = {
        p["profileId"]: [
            j["jobId"]
            for j in sorted(jobs, key=lambda j: j["jobId"])
            if (p["profileId"], j["jobId"]) not in done
        ]
        for p in profiles
    }
    extra = []
    for start in range(0, max(map(len, missing.values())), 7):
        shard = root / "test-pool" / f"part-{start:02d}"
        pairs = [
            {"profileId": uid, "jobId": jid, "split": "test", "candidateBucket": "remaining"}
            for uid, ids in missing.items()
            for jid in ids[start : start + 7]
        ]
        shard.mkdir(parents=True, exist_ok=True)
        # 줄 구분 문자가 원문 안에 포함될 수 있으므로 준비 단계의 JSON 이스케이프를 보존한다.
        for name in ("profiles.jsonl", "jobs.jsonl"):
            target = shard / name
            if not target.exists():
                shutil.copyfile(data / name, target)
        pilot._atomic_jsonl(shard / "candidate-manifest.jsonl", pairs)
        run(shard, shard / "labels", workers)
        extra.extend(pilot._read_jsonl(shard / "labels/labels.jsonl"))
    base = [r for r in pilot._read_jsonl(root / "fixed-labels/labels.jsonl") if r["split"] == "test"]
    labels = sorted(base + extra, key=lambda r: (r["profileId"], r["jobId"]))
    candidates = [
        {"profileId": p["profileId"], "jobId": j["jobId"], "split": "test"} for p in profiles for j in jobs
    ]
    pilot.validate_training_inputs(profiles, jobs, candidates, labels)
    pilot._atomic_jsonl(root / "test-pool/labels.jsonl", labels)
    print("full pool:", len(labels), flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", type=Path, required=True)
    p.add_argument("--workers", type=int, default=6)
    complete(**vars(p.parse_args()))
