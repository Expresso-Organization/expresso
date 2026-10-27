"""Luna와 로컬 Qwen 적합도 교사 라벨을 분리 생성하고 병합한다."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time
from typing import Any, Sequence
import urllib.request

from llm_suitability_labels import run_labels


LUNA_SOURCE = "gpt-5.6-luna"
QWEN_MODEL = "qwen3:30b-a3b-instruct-2507-q4_K_M"
QWEN_SOURCE = f"ollama:{QWEN_MODEL}:conservative-strict-v3"


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def partition_remaining_profiles(
    profiles: Sequence[dict[str, Any]],
    *,
    completed_profile_ids: set[str],
    qwen_share: float,
) -> dict[str, list[str]]:
    if not 0 <= qwen_share <= 1:
        raise ValueError("qwen_share must be between 0 and 1")
    remaining = sorted(
        (str(profile["profileId"]) for profile in profiles if str(profile["profileId"]) not in completed_profile_ids),
        key=lambda value: hashlib.sha256(value.encode("utf-8")).hexdigest(),
    )
    qwen_count = round(len(remaining) * qwen_share)
    if remaining and qwen_share > 0:
        qwen_count = max(1, qwen_count)
    return {"qwen": remaining[:qwen_count], "luna": remaining[qwen_count:]}


def parse_codex_jsonl(stream: str) -> dict[str, Any]:
    messages: list[str] = []
    for line in stream.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        item = event.get("item", {}) if isinstance(event, dict) else {}
        if event.get("type") == "item.completed" and item.get("type") == "agent_message":
            messages.append(str(item.get("text", "")))
    if not messages:
        raise ValueError("Codex output did not contain an agent_message")
    payload = json.loads(messages[-1])
    if not isinstance(payload, dict):
        raise ValueError("Codex final message must be a JSON object")
    return {"structured_output": payload}


def merge_label_sources(source_paths: Sequence[Path], output_path: Path) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for source_path in source_paths:
        for row in _read_jsonl(Path(source_path)):
            pair = (str(row.get("profileId")), str(row.get("jobId")))
            if pair in seen:
                raise ValueError(f"duplicate label pair: {pair[0]} / {pair[1]}")
            seen.add(pair)
            rows.append(row)
    rows.sort(key=lambda row: (str(row["profileId"]), str(row["jobId"])))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for row in rows),
        encoding="utf-8",
    )
    return {
        "labels": len(rows),
        "profiles": len({str(row["profileId"]) for row in rows}),
        "labelSources": dict(sorted(Counter(str(row.get("labelSource")) for row in rows).items())),
    }


def resolve_assignment_ids(
    plan_payload: dict[str, Any],
    provider: str,
    *,
    assignment_key: str | None = None,
) -> list[str]:
    key = assignment_key or provider
    return [str(profile_id) for profile_id in plan_payload["assignments"][key]]


def _luna_invoker(codex_path: Path, profile: str):
    def invoke(prompt: str, schema: dict[str, Any], model: str, effort: str, timeout_seconds: int) -> dict[str, Any]:
        with tempfile.TemporaryDirectory() as temporary:
            schema_path = Path(temporary) / "schema.json"
            schema_path.write_text(json.dumps(schema, ensure_ascii=False), encoding="utf-8")
            started = time.perf_counter()
            process = subprocess.run(
                [
                    str(codex_path), "-p", profile, "--strict-config", "exec", "--ephemeral",
                    "--skip-git-repo-check", "--output-schema", str(schema_path), "--json", "-",
                ],
                input=prompt,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_seconds,
                check=False,
            )
        if process.returncode != 0:
            detail = "\n".join(
                part for part in (process.stdout.strip(), process.stderr.strip()) if part
            )[-4000:]
            raise RuntimeError(f"Codex Luna exited {process.returncode}: {detail}")
        envelope = parse_codex_jsonl(process.stdout)
        envelope["duration_ms"] = round((time.perf_counter() - started) * 1000)
        envelope["modelUsage"] = {LUNA_SOURCE: {}}
        return envelope
    return invoke


def _post_json(url: str, payload: dict[str, Any], timeout_seconds: int) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def build_qwen_request(
    prompt: str,
    schema: dict[str, Any],
    model: str,
    *,
    num_ctx: int,
    num_predict: int,
    strict_schema: bool = False,
) -> dict[str, Any]:
    schema_text = json.dumps(schema, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    final_checks = """[출력 전 필수 재검사]
- q(requirement)는 현재 공고 fields의 내용만 짧게 바꿔 쓴다. 프로필의 문장을 공고 요구사항으로 바꾸지 마라.
- 기술, 언어, 자격, 학위는 연결한 기록에 정확한 기술명 또는 명시적 동의어가 있을 때만 partial 이상이다.
  없으면 반드시 c=n, e=[]로 출력한다. 직무명이 비슷하다는 이유로 충족시키지 마라.
- preferred는 공고 field 이름이나 값이 preferred, plus, bonus, 우대를 명시할 때만 사용한다.
- 모든 항목을 adequate로 채우는 기본값 행동을 금지한다. 각 요구마다 실제 근거를 다시 확인한다."""
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": "증거 기반 채용 적합도 평가자다. 도구 없이 JSON 객체만 출력한다."},
            {"role": "user", "content": f"{prompt}\n\n{final_checks}\n\n[출력 JSON Schema]\n{schema_text}\n\n{final_checks}"},
        ],
        "stream": False,
        "format": schema if strict_schema else "json",
        "think": False,
        "keep_alive": "15m",
        "options": {
            "temperature": 0,
            "seed": int(hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:8], 16),
            "num_ctx": num_ctx,
            "num_predict": num_predict,
        },
    }


def _qwen_invoker(base_url: str, *, num_ctx: int, num_predict: int):
    def invoke(prompt: str, schema: dict[str, Any], model: str, effort: str, timeout_seconds: int) -> dict[str, Any]:
        response = _post_json(
            f"{base_url.rstrip('/')}/api/chat",
            build_qwen_request(
                prompt,
                schema,
                model,
                num_ctx=num_ctx,
                num_predict=num_predict,
                strict_schema=True,
            ),
            timeout_seconds,
        )
        content = response.get("message", {}).get("content", "")
        payload = json.loads(content)
        return {
            "structured_output": payload,
            "duration_ms": round(int(response.get("total_duration") or 0) / 1_000_000),
            "usage": {
                "input_tokens": int(response.get("prompt_eval_count") or 0),
                "output_tokens": int(response.get("eval_count") or 0),
            },
            "modelUsage": {model: {}},
            "ollama": {key: response.get(key) for key in ("done_reason", "load_duration", "eval_duration")},
        }
    return invoke


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan = subparsers.add_parser("plan")
    plan.add_argument("--dataset", type=Path, required=True)
    plan.add_argument("--existing-labels", type=Path, required=True)
    plan.add_argument("--output", type=Path, required=True)
    plan.add_argument("--qwen-share", type=float, default=0.2)

    run = subparsers.add_parser("run")
    run.add_argument("--provider", choices=("luna", "qwen"), required=True)
    run.add_argument("--assignment-key", choices=("luna", "qwen"))
    run.add_argument("--dataset", type=Path, required=True)
    run.add_argument("--output", type=Path, required=True)
    run.add_argument("--plan", type=Path, required=True)
    run.add_argument("--profile-limit", type=int)
    run.add_argument("--codex", type=Path)
    run.add_argument("--codex-profile", default="suitability-label-generator")
    run.add_argument("--model")
    run.add_argument("--base-url", default="http://127.0.0.1:11434")
    run.add_argument("--timeout-seconds", type=int, default=900)
    run.add_argument("--max-attempts", type=int, default=2)
    run.add_argument("--concurrency", type=int)
    run.add_argument("--num-ctx", type=int, default=16384)
    run.add_argument("--num-predict", type=int, default=4096)

    merge = subparsers.add_parser("merge")
    merge.add_argument("--source", type=Path, action="append", required=True)
    merge.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.command == "plan":
        profiles = _read_jsonl(args.dataset / "profiles.jsonl")
        completed = {str(row["profileId"]) for row in _read_jsonl(args.existing_labels)}
        allocation = partition_remaining_profiles(
            profiles,
            completed_profile_ids=completed,
            qwen_share=args.qwen_share,
        )
        payload = {
            "schemaVersion": 1,
            "qwenShare": args.qwen_share,
            "completedProfiles": len(completed),
            "assignments": allocation,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({key: len(value) for key, value in allocation.items()}, ensure_ascii=False))
        return
    if args.command == "merge":
        print(json.dumps(merge_label_sources(args.source, args.output), ensure_ascii=False))
        return

    plan_payload = json.loads(args.plan.read_text(encoding="utf-8"))
    profile_ids = resolve_assignment_ids(
        plan_payload,
        args.provider,
        assignment_key=args.assignment_key,
    )
    if args.profile_limit is not None:
        profile_ids = profile_ids[: args.profile_limit]
    if args.provider == "luna":
        codex_path = args.codex or Path("codex")
        invoke = _luna_invoker(codex_path, args.codex_profile)
        model, source, jobs_per_call = args.model or LUNA_SOURCE, LUNA_SOURCE, None
        concurrency = args.concurrency or 4
    else:
        model, source, jobs_per_call = args.model or QWEN_MODEL, QWEN_SOURCE, 1
        invoke = _qwen_invoker(args.base_url, num_ctx=args.num_ctx, num_predict=args.num_predict)
        concurrency = 1

    def progress(completed: int, total: int, profile_id: str) -> None:
        print(json.dumps({"provider": args.provider, "completed": completed, "total": total, "profileId": profile_id}), flush=True)

    manifest = run_labels(
        args.dataset,
        args.output,
        model=model,
        effort="low",
        max_attempts=args.max_attempts,
        timeout_seconds=args.timeout_seconds,
        concurrency=concurrency,
        progress=progress,
        invoke=invoke,
        label_source=source,
        profile_ids=set(profile_ids),
        jobs_per_call=jobs_per_call,
    )
    print(json.dumps(manifest, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
