"""영속 벡터를 복원한 단일 CPU 추론의 기록 기준선·문단 후보 수별 지연을 측정한다."""

import argparse
import json
from pathlib import Path
import platform
from statistics import median
import sys
import time

import numpy as np

sys.path.insert(
    0, str(Path(__file__).resolve().parents[3] / "services/match-inference")
)
from server import Application


def run(bundle, vectors, inputs, output, repeats=3):
    data = json.loads(inputs.read_bytes())
    data["jobs"] = data["jobs"][:1]
    app = Application(bundle, 1, None, None, vectors)
    report = {
        "platform": platform.platform(),
        "threads": 1,
        "scope": "direct rank call, no network/auth API; one fixed job and six synthetic accounts; warm vectors",
        "profiles": [
            {"id": p["profileId"], "records": len(p["records"])}
            for p in data["profiles"]
        ],
        "jobs": len(data["jobs"]),
        "startupLoaded": app.engine.startup_loaded,
        "modes": {},
    }
    for name, mode, cap in (
        ("record_v1", "record", 12),
        ("passages_12", "hybrid", 12),
        ("passages_24", "hybrid", 24),
        ("passages_48", "hybrid", 48),
    ):
        app.engine.evidence_mode, app.engine.candidate_limit = mode, cap
        before = app.engine.encoded
        times = []
        for _ in range(repeats):
            for profile in data["profiles"]:
                start = time.perf_counter()
                app.engine.profile_id = profile["profileId"]
                result = app.engine.rank(profile, data["jobs"], limit=1)
                times.append(time.perf_counter() - start)
                if len(result["jobs"]) != 1:
                    raise ValueError("추천 결과 누락")
        report["modes"][name] = {
            "requests": len(times),
            "p50": median(times),
            "p95": float(np.quantile(times, 0.95)),
            "first": times[0],
            "newEncodings": app.engine.encoded - before,
            "seconds": times,
        }
        print(name, report["modes"][name]["p95"], flush=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("bundle", "vectors", "inputs", "output"):
        p.add_argument("--" + name, type=Path, required=True)
    p.add_argument("--repeats", type=int, default=3)
    run(**vars(p.parse_args()))
