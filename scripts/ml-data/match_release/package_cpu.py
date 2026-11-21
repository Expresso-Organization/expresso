"""CPU 가중치·추론 코드·정책과 최소 의존성을 담은 오프라인 실행 패키지를 만든다."""

import argparse
from pathlib import Path
import tarfile
import tempfile


def package(bundle, policy, target):
    if target.exists():
        raise FileExistsError(target)
    if not (bundle / "heads.onnx").is_file():
        raise ValueError("ONNX 채점 파일 누락")
    here = Path(__file__).resolve().parent
    code = "scripts/ml-data/"
    files = {
        path: "cpu/" + path.relative_to(bundle).as_posix() for path in sorted(bundle.rglob("*")) if path.is_file()
    }
    for name in ("cpu.py", "inputs.py", "record_search.py", "passages.py", "evidence_search.py"):
        files[here / name] = code + "match_release/" + name
    for name in (
        "llm_suitability_train.py",
        "llm_suitability_rubric.py",
        "match_api_scorer.py",
        "retrieval_baselines.py",
    ):
        files[here.parent / name] = code + name
    for name in ("requirements-cpu.txt", "README.md", "NOTICE.md", "example.json"):
        files[here / name] = name
    files[policy] = "evidence-policy.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as temp:
        path = Path(temp) / "archive"
        with tarfile.open(path, "w:gz", compresslevel=1) as archive:
            for src, rel in files.items():
                archive.add(src, arcname=rel, recursive=False)
        path.replace(target)
    print(target, target.stat().st_size)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("bundle", "policy", "target"):
        p.add_argument("--" + name, type=Path, required=True)
    package(**vars(p.parse_args()))
