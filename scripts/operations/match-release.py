#!/usr/bin/env python3
"""체크섬으로 CPU 배포본을 준비하고 current/previous를 원자적으로 전환합니다."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]
REQUIREMENTS = ROOT / "services/match-inference/requirements.txt"
CPU_REQUIREMENTS = ROOT / "scripts/ml-data/match_release/requirements-cpu.txt"
LOCK = REQUIREMENTS.with_suffix(".lock")


def digest(path):
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(block)
    return sha.hexdigest()


def requirements_digest():
    return hashlib.sha256(REQUIREMENTS.read_bytes() + LOCK.read_bytes() + CPU_REQUIREMENTS.read_bytes()).hexdigest()


def release_path(root, name):
    if name in {"current", "previous"}:
        link = root / name
        if not link.is_symlink():
            raise ValueError(f"{name} 배포본이 없습니다")
        path = link.resolve(strict=True)
    else:
        if not re.fullmatch(r"[a-f0-9]{16}-[a-f0-9]{16}", name):
            raise ValueError("배포본 ID 형식 오류")
        path = root / "releases" / name
    if path.parent.resolve() != (root / "releases").resolve():
        raise ValueError("배포본 경로 이탈")
    return path


def verify(root, name):
    path = release_path(root, name)
    ready = json.loads((path / "ready.json").read_text())
    if path.name != ready["archiveSha256"][:16] + "-" + ready["requirementsSha256"][:16]:
        raise ValueError("배포본 ID와 명세 해시 불일치")
    if ready["requirementsSha256"] != requirements_digest():
        raise ValueError("Python 의존성이 달라 배포본을 다시 준비해야 합니다")
    for relative, sha in ready["files"].items():
        target = path / relative
        if target.resolve().is_relative_to(path.resolve()) is False or digest(target) != sha:
            raise ValueError(f"배포 파일 체크섬 불일치: {relative}")
    if not (path / "venv/bin/python").is_file():
        raise ValueError("Python 실행 환경 누락")
    return path


def prepare(root, archive, sha, python):
    if not re.fullmatch(r"[a-f0-9]{64}", sha) or digest(archive) != sha:
        raise ValueError("CPU 압축 파일 SHA-256 불일치")
    name = sha[:16] + "-" + requirements_digest()[:16]
    path = root / "releases" / name
    if path.exists():
        return verify(root, name)
    path.mkdir(parents=True, mode=0o700)
    try:
        with tarfile.open(archive) as tar:
            members = tar.getmembers()
            for member in members:
                if not member.isfile() or not (path / member.name).resolve().is_relative_to(path.resolve()):
                    raise ValueError("CPU 압축 파일에 일반 파일 외 항목 또는 경로 이탈이 있습니다")
            for member in members:
                target = path / member.name
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as source, target.open("wb") as output:
                    shutil.copyfileobj(source, output)
        for relative in ("cpu/manifest.json", "cpu/encoder/model.onnx", "cpu/encoder/tokenizer.json", "cpu/heads.onnx", "cpu/evidence.onnx", "cpu/evidence.json", "example.json"):
            if not (path / relative).is_file():
                raise ValueError(f"CPU 배포본 누락: {relative}")
        subprocess.run(["uv", "venv", "--python", python, str(path / "venv")], check=True)
        subprocess.run(["uv", "pip", "install", "--python", str(path / "venv/bin/python"), "-r", str(REQUIREMENTS)], check=True)
        subprocess.run([str(path / "venv/bin/python"), str(ROOT / "services/match-inference/check_release.py"), "--release", str(path)], check=True)
        ready = {"archiveSha256": sha, "requirementsSha256": requirements_digest(), "files": {
            str(file.relative_to(path)): digest(file)
            for file in sorted(path.rglob("*")) if file.is_file() and "venv" not in file.relative_to(path).parts
        }}
        (path / "ready.json").write_text(json.dumps(ready, indent=2) + "\n")
        return path
    except BaseException:
        # 이번 실행에서 만든 배포본만 지웁니다. current와 기존 배포본은 건드리지 않습니다.
        shutil.rmtree(path)
        raise


def link(root, name, target):
    temporary = root / ("." + name + "." + str(os.getpid()))
    try:
        temporary.symlink_to(target)
        temporary.replace(root / name)
    finally:
        temporary.unlink(missing_ok=True)


def switch(root, name):
    path = verify(root, name)
    current = root / "current"
    old = current.resolve(strict=True) if current.is_symlink() else None
    if old == path.resolve():
        return path
    if old:
        link(root, "previous", old)
    link(root, "current", path.resolve())
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT / "var/match-model")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("prepare")
    p.add_argument("--archive", type=Path, required=True)
    p.add_argument("--sha256", required=True)
    p.add_argument("--python", default="3.12")
    for command in ("verify", "switch"):
        p = sub.add_parser(command)
        p.add_argument("release", nargs="?", default="current")
    args = parser.parse_args()
    root = args.root.resolve()
    if args.command == "prepare":
        path = prepare(root, args.archive.resolve(), args.sha256, args.python)
    elif args.command == "verify":
        path = verify(root, args.release)
    else:
        path = switch(root, args.release)
    print(path)


if __name__ == "__main__":
    main()
