"""실제 CPU 배포본으로 추천·문단 근거·SQLite 재시작 복원을 검사합니다."""

import argparse
import json
from pathlib import Path
import tempfile

from server import Application


def check(release):
    payload = json.loads((release / "example.json").read_text())
    profile, jobs = payload["profile"], payload["jobs"]
    with tempfile.TemporaryDirectory() as state:
        app = Application(release / "cpu", 1, None, None, Path(state))
        app.process("/v1/warm-profile", {"profile": profile})
        app.process("/v1/warm", {"jobs": jobs})
        rank = {"profile": profile, "jobs": jobs, "mode": "local", "limit": 10}
        before = app.process("/v1/rank", rank)
        if not before["jobs"]:
            raise ValueError("배포 예시 추천 결과가 없습니다")
        job = next(j for j in jobs if j["jobId"] == before["jobs"][0]["jobId"])
        evidence = app.process("/v1/rank", {**rank, "jobs": [job], "mode": "evidence"})
        if not any(e["passages"] for r in evidence["jobs"] for e in r["evidence"]):
            raise ValueError("문단 근거가 없습니다")
        restored = Application(release / "cpu", 1, None, None, Path(state))
        if restored.process("/v1/rank", rank) != before or restored.engine.encoded:
            raise ValueError("재시작 복원 결과 또는 새 인코딩 불일치")
        print(json.dumps({"recommendations": len(before["jobs"]), "evidenceRequirements": len(evidence["jobs"][0]["evidence"]), "restoredVectors": restored.engine.startup_loaded, "newEncodings": restored.engine.encoded}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", type=Path, required=True)
    check(parser.parse_args().release)
