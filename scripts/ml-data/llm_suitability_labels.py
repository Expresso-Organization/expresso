"""Claude Code Sonnet으로 적합도 라벨을 생성하고 중단 지점부터 재개한다."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from typing import Any, Callable, Sequence

from llm_suitability_rubric import RUBRIC_VERSION, build_prompt, output_schema, validate_labels


TeacherInvoker = Callable[[str, dict[str, Any], str, str, int], dict[str, Any]]


DEFAULT_NATIVE_CLAUDE = Path.home() / ".local" / "bin" / "claude.exe"


class SessionLimitError(RuntimeError):
    """Claude 구독 세션 한도가 재설정될 때까지 호출을 멈춰야 함을 나타낸다."""


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as target:
            json.dump(payload, target, ensure_ascii=False, indent=2, sort_keys=True)
            target.write("\n")
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def _atomic_jsonl(path: Path, rows: Sequence[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as target:
            for row in rows:
                target.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
                target.write("\n")
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def _default_command_prefix() -> list[str]:
    found = shutil.which("claude")
    if found:
        return [found]
    if DEFAULT_NATIVE_CLAUDE.exists():
        return [str(DEFAULT_NATIVE_CLAUDE)]
    raise FileNotFoundError("Claude Code executable not found in PATH or ~/.local/bin/claude.exe")


def _parse_envelope(stdout: str) -> dict[str, Any]:
    envelope = json.loads(stdout)
    if not isinstance(envelope, dict) or not isinstance(envelope.get("structured_output"), dict):
        raise ValueError("Claude response is missing structured_output")
    return envelope


def _session_limit_message(*texts: str) -> str | None:
    for text in texts:
        stripped = text.strip()
        if not stripped:
            continue
        candidates = [stripped, *reversed(stripped.splitlines())]
        for candidate in candidates:
            try:
                payload = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict) and payload.get("api_error_status") == 429:
                message = str(payload.get("result") or "Claude session limit reached")
                if "session limit" in message.casefold():
                    return message
    return None


def _invoke_claude(
    command_prefix: Sequence[str],
    prompt: str,
    schema: dict[str, Any],
    model: str,
    effort: str,
    timeout_seconds: int,
) -> dict[str, Any]:
    command = [
        *command_prefix,
        "-p",
        "--model",
        model,
        "--effort",
        effort,
        "--system-prompt",
        "You are a deterministic bilingual evidence grader. Follow the user rubric and JSON Schema exactly. Do not use tools.",
        "--safe-mode",
        "--tools",
        "",
        "--disable-slash-commands",
        "--no-session-persistence",
        "--output-format",
        "json",
        "--json-schema",
        json.dumps(schema, ensure_ascii=False, separators=(",", ":")),
    ]
    result = subprocess.run(
        command,
        input=prompt,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout_seconds,
        check=False,
    )
    if result.returncode != 0:
        session_limit = _session_limit_message(result.stdout, result.stderr)
        if session_limit:
            raise SessionLimitError(session_limit)
        detail = (result.stderr or result.stdout).strip()[-1000:]
        raise RuntimeError(f"Claude Code exited {result.returncode}: {detail}")
    return _parse_envelope(result.stdout)


def _request_hash(prompt: str, schema: dict[str, Any], model: str, effort: str) -> str:
    material = json.dumps(
        {"prompt": prompt, "schema": schema, "model": model, "effort": effort},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _semantic_hash(
    profile: dict[str, Any], jobs: Sequence[dict[str, Any]], model: str, effort: str
) -> str:
    material = json.dumps(
        {
            "profile": profile,
            "jobs": list(jobs),
            "rubricVersion": RUBRIC_VERSION,
            "model": model,
            "effort": effort,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _select_profiles(
    profiles: Sequence[dict[str, Any]], profile_limit_per_split: int | None
) -> list[dict[str, Any]]:
    if profile_limit_per_split is None:
        return list(profiles)
    counts: Counter[str] = Counter()
    selected = []
    for profile in profiles:
        split = str(profile["split"])
        if counts[split] < profile_limit_per_split:
            selected.append(profile)
            counts[split] += 1
    return selected


def _load_valid_raw(
    path: Path,
    profile: dict[str, Any],
    jobs: Sequence[dict[str, Any]],
    request_hash: str,
    semantic_hash: str,
    label_source: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]] | None:
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if raw.get("semanticSha256") not in (None, semantic_hash):
            return None
        envelope = raw["response"]
        labels = validate_labels(
            profile,
            jobs,
            envelope["structured_output"],
            label_source=label_source,
        )
        if raw.get("semanticSha256") is None:
            raw["semanticSha256"] = semantic_hash
            if raw.get("requestSha256") != request_hash:
                raw["migratedFromRequestSha256"] = raw.get("requestSha256")
            _atomic_json(path, raw)
        elif raw.get("requestSha256") != request_hash:
            raw["protocolCompatibleRequestSha256"] = request_hash
            _atomic_json(path, raw)
        return raw, labels
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def _generate_one(
    profile: dict[str, Any],
    jobs: Sequence[dict[str, Any]],
    raw_path: Path,
    command_prefix: Sequence[str],
    model: str,
    effort: str,
    max_attempts: int,
    timeout_seconds: int,
    invoke: TeacherInvoker,
    label_source: str,
    jobs_per_call: int | None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    prompt = build_prompt(profile, jobs)
    schema = output_schema(str(profile["profileId"]), [str(job["jobId"]) for job in jobs])
    request_hash = _request_hash(prompt, schema, model, effort)
    semantic_hash = _semantic_hash(profile, jobs, model, effort)
    errors: list[str] = []
    started = time.perf_counter()
    chunk_size = jobs_per_call or len(jobs)
    chunks = [list(jobs[index : index + chunk_size]) for index in range(0, len(jobs), chunk_size)]
    responses: list[dict[str, Any]] = []
    compact_labels: list[dict[str, Any]] = []
    retry_attempts = 0
    for chunk in chunks:
        chunk_prompt = build_prompt(profile, chunk)
        chunk_schema = output_schema(str(profile["profileId"]), [str(job["jobId"]) for job in chunk])
        for attempt in range(1, max_attempts + 1):
            try:
                envelope = invoke(chunk_prompt, chunk_schema, model, effort, timeout_seconds)
                validate_labels(
                    profile,
                    chunk,
                    envelope["structured_output"],
                    label_source=label_source,
                )
                responses.append(envelope)
                compact_labels.extend(envelope["structured_output"]["labels"])
                retry_attempts += attempt - 1
                break
            except SessionLimitError:
                raise
            except (OSError, subprocess.SubprocessError, RuntimeError, ValueError, json.JSONDecodeError) as error:
                errors.append(f"{type(error).__name__}: {error}")
                if attempt < max_attempts:
                    time.sleep(min(2 ** (attempt - 1), 4))
        else:
            raise RuntimeError(
                f"profile {profile['profileId']} failed after {max_attempts} attempts: {errors[-1]}"
            )
    envelope = {
        "structured_output": {"labels": compact_labels},
        "duration_ms": sum(int(item.get("duration_ms") or 0) for item in responses),
        "usage": {
            "input_tokens": sum(_token_value(item, "input_tokens", "inputTokens") for item in responses),
            "output_tokens": sum(_token_value(item, "output_tokens", "outputTokens") for item in responses),
        },
        "modelUsage": {
            name: {}
            for item in responses
            for name in (item.get("modelUsage", {}) if isinstance(item.get("modelUsage"), dict) else {})
        },
        "providerResponses": responses,
    }
    labels = validate_labels(profile, jobs, envelope["structured_output"], label_source=label_source)
    raw = {
        "profileId": profile["profileId"],
        "requestSha256": request_hash,
        "semanticSha256": semantic_hash,
        "attempts": len(chunks) + retry_attempts,
        "retryAttempts": retry_attempts,
        "elapsedSeconds": round(time.perf_counter() - started, 3),
        "errorsBeforeSuccess": errors,
        "response": envelope,
    }
    _atomic_json(raw_path, raw)
    return raw, labels


def _token_value(envelope: dict[str, Any], snake: str, camel: str) -> int:
    usage = envelope.get("usage", {})
    if not isinstance(usage, dict):
        return 0
    return int(usage.get(snake) or usage.get(camel) or 0)


def run_labels(
    dataset_dir: Path,
    output_dir: Path,
    *,
    command_prefix: Sequence[str] | None = None,
    model: str = "sonnet",
    effort: str = "low",
    max_attempts: int = 3,
    timeout_seconds: int = 600,
    concurrency: int = 1,
    profile_limit_per_split: int | None = None,
    progress: Callable[[int, int, str], None] | None = None,
    invoke: TeacherInvoker | None = None,
    label_source: str = "claude-code-sonnet-5",
    profile_ids: set[str] | None = None,
    jobs_per_call: int | None = None,
) -> dict[str, Any]:
    """프로필별 10개 공고를 한 호출로 라벨링하고 완료 raw를 재사용한다."""
    dataset_dir = Path(dataset_dir)
    output_dir = Path(output_dir)
    profiles = _read_jsonl(dataset_dir / "profiles.jsonl")
    jobs_by_id = {row["jobId"]: row for row in _read_jsonl(dataset_dir / "jobs.jsonl")}
    pairs = _read_jsonl(dataset_dir / "candidate-manifest.jsonl")
    pairs_by_profile: dict[str, list[dict[str, Any]]] = defaultdict(list)
    pair_lookup: dict[tuple[str, str], dict[str, Any]] = {}
    for pair in pairs:
        pairs_by_profile[str(pair["profileId"])].append(pair)
        pair_lookup[(str(pair["profileId"]), str(pair["jobId"]))] = pair
    profiles = _select_profiles(profiles, profile_limit_per_split)
    if profile_ids is not None:
        profiles = [profile for profile in profiles if str(profile["profileId"]) in profile_ids]
    if not profiles:
        raise ValueError("no profiles selected")
    command_prefix = list(command_prefix or _default_command_prefix()) if invoke is None else list(command_prefix or [])
    teacher_invoke = invoke or (
        lambda prompt, schema, requested_model, requested_effort, timeout: _invoke_claude(
            command_prefix,
            prompt,
            schema,
            requested_model,
            requested_effort,
            timeout,
        )
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    raw_dir = output_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    collected: dict[str, tuple[dict[str, Any], list[dict[str, Any]]]] = {}
    pending: list[tuple[dict[str, Any], list[dict[str, Any]], Path]] = []
    resumed = 0
    for profile in profiles:
        profile_id = str(profile["profileId"])
        profile_pairs = pairs_by_profile.get(profile_id, [])
        jobs = [jobs_by_id[str(pair["jobId"])] for pair in profile_pairs]
        if len(jobs) != len({job["jobId"] for job in jobs}) or not jobs:
            raise ValueError(f"invalid candidates for profile: {profile_id}")
        raw_path = raw_dir / f"{profile_id}.json"
        prompt = build_prompt(profile, jobs)
        schema = output_schema(profile_id, [str(job["jobId"]) for job in jobs])
        cached = _load_valid_raw(
            raw_path,
            profile,
            jobs,
            _request_hash(prompt, schema, model, effort),
            _semantic_hash(profile, jobs, model, effort),
            label_source,
        )
        if cached:
            collected[profile_id] = cached
            resumed += 1
        else:
            pending.append((profile, jobs, raw_path))

    def generate(item: tuple[dict[str, Any], list[dict[str, Any]], Path]):
        profile, jobs, raw_path = item
        return str(profile["profileId"]), _generate_one(
            profile,
            jobs,
            raw_path,
            command_prefix,
            model,
            effort,
            max_attempts,
            timeout_seconds,
            teacher_invoke,
            label_source,
            jobs_per_call,
        )

    failures: list[dict[str, str]] = []
    session_limit: str | None = None
    if concurrency <= 1:
        for item in pending:
            profile_id = str(item[0]["profileId"])
            try:
                _, result = generate(item)
                collected[profile_id] = result
            except SessionLimitError as error:
                session_limit = str(error)
                break
            except RuntimeError as error:
                failures.append({"profileId": profile_id, "error": str(error)})
            if progress and profile_id in collected:
                progress(len(collected), len(profiles), profile_id)
    else:
        batch_size = concurrency
        for offset in range(0, len(pending), batch_size):
            batch = pending[offset : offset + batch_size]
            with ThreadPoolExecutor(max_workers=concurrency) as executor:
                futures = {executor.submit(generate, item): str(item[0]["profileId"]) for item in batch}
                for future in as_completed(futures):
                    profile_id = futures[future]
                    try:
                        _, result = future.result()
                        collected[profile_id] = result
                    except SessionLimitError as error:
                        session_limit = str(error)
                    except RuntimeError as error:
                        failures.append({"profileId": profile_id, "error": str(error)})
                    if progress and profile_id in collected:
                        progress(len(collected), len(profiles), profile_id)
            if session_limit:
                break

    final_labels: list[dict[str, Any]] = []
    canonical_models: set[str] = set()
    total_cost = 0.0
    duration_ms = 0
    input_tokens = 0
    output_tokens = 0
    retry_attempts = 0
    for profile_id in sorted(collected):
        raw, labels = collected[profile_id]
        envelope = raw["response"]
        if "retryAttempts" in raw:
            retry_attempts += int(raw["retryAttempts"])
        else:
            provider_responses = envelope.get("providerResponses", [])
            base_calls = len(provider_responses) if isinstance(provider_responses, list) and provider_responses else 1
            retry_attempts += max(0, int(raw.get("attempts", 1)) - base_calls)
        total_cost += float(envelope.get("total_cost_usd") or 0)
        duration_ms += int(envelope.get("duration_ms") or 0)
        input_tokens += _token_value(envelope, "input_tokens", "inputTokens")
        output_tokens += _token_value(envelope, "output_tokens", "outputTokens")
        model_usage = envelope.get("modelUsage", {})
        if isinstance(model_usage, dict):
            canonical_models.update(str(name) for name in model_usage)
        for label in labels:
            pair = pair_lookup[(profile_id, str(label["jobId"]))]
            final_labels.append({**label, "split": pair["split"], "candidateBucket": pair["candidateBucket"]})
    final_labels.sort(key=lambda row: (row["profileId"], row["jobId"]))
    _atomic_jsonl(output_dir / "suitability-labels.jsonl", final_labels)
    _atomic_json(output_dir / "failed-profiles.json", failures)
    score_bands = Counter(
        "00-19" if row["matchScore"] < 20 else
        "20-39" if row["matchScore"] < 40 else
        "40-59" if row["matchScore"] < 60 else
        "60-79" if row["matchScore"] < 80 else
        "80-94" if row["matchScore"] < 95 else "95-100"
        for row in final_labels
    )
    manifest = {
        "schemaVersion": 1,
        "rubricVersion": "job-profile-fit-v1",
        "teacherProtocol": "compact-evidence-v2",
        "labelSource": label_source,
        "requestedModel": model,
        "effort": effort,
        "selectedProfiles": len(profiles),
        "completedProfiles": len(collected),
        "pendingProfiles": len(profiles) - len(collected),
        "failedProfiles": len(failures),
        "sessionLimit": session_limit,
        "resumedProfiles": resumed,
        "labels": len(final_labels),
        "retryAttempts": retry_attempts,
        "canonicalModels": sorted(canonical_models),
        "totalCostUsdReported": round(total_cost, 6),
        "durationMsReported": duration_ms,
        "inputTokensReported": input_tokens,
        "outputTokensReported": output_tokens,
        "scoreBands": dict(sorted(score_bands.items())),
        "candidateBuckets": dict(sorted(Counter(row["candidateBucket"] for row in final_labels).items())),
        "splits": dict(sorted(Counter(row["split"] for row in final_labels).items())),
    }
    _atomic_json(output_dir / "label-manifest.json", manifest)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--claude", type=Path)
    parser.add_argument("--model", default="sonnet")
    parser.add_argument("--effort", default="low")
    parser.add_argument("--max-attempts", type=int, default=3)
    parser.add_argument("--timeout-seconds", type=int, default=600)
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--profile-limit-per-split", type=int)
    args = parser.parse_args()

    def report(completed: int, total: int, profile_id: str) -> None:
        print(json.dumps({"completed": completed, "total": total, "profileId": profile_id}), flush=True)

    manifest = run_labels(
        args.dataset,
        args.output,
        command_prefix=[str(args.claude)] if args.claude else None,
        model=args.model,
        effort=args.effort,
        max_attempts=args.max_attempts,
        timeout_seconds=args.timeout_seconds,
        concurrency=args.concurrency,
        profile_limit_per_split=args.profile_limit_per_split,
        progress=report,
    )
    print(json.dumps(manifest, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
