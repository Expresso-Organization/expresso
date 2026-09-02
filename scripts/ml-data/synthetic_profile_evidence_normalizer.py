"""AI Hub 면접 답변을 재사용 가능한 짧은 경력 사실 골격으로 정규화한다."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from synthetic_profile_v4 import CATEGORY_KEYS, INTERVIEW_STYLE_MARKERS
from synthetic_profile_v4_batch import (
    ACTION_MARKERS,
    HYPOTHETICAL_MARKERS,
    PROTECTED_PATTERNS,
    scan_aihub_atoms,
)
from synthetic_profile_v4_experiment import EVIDENCE_ANCHOR_GROUPS


PROMPT_VERSION = "synthetic-profile-evidence-normalizer-v1"
PROMPT_PATH = Path(__file__).parent / "prompts" / f"{PROMPT_VERSION}.md"
DEFAULT_MODEL = "qwen3:30b-a3b-instruct-2507-q4_K_M"
NUMBER_PATTERN = re.compile(r"\d+(?:[.,]\d+)?")
PAST_MARKERS = ACTION_MARKERS + (
    "했다", "였다", "있었다", "되었다", "맡았다", "담당했다", "마쳤다", "끝냈다", "해냈다",
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def _stable_int(*parts: Any) -> int:
    digest = hashlib.sha256(":|:".join(map(str, parts)).encode()).digest()
    return int.from_bytes(digest[:8], "big")


def required_anchors(source_text: str) -> dict[str, list[str]]:
    return {
        label: list(variants)
        for label, variants in EVIDENCE_ANCHOR_GROUPS.items()
        if any(variant in source_text for variant in variants)
    }


def validate_result(atom: dict[str, Any], result: Any) -> list[str]:
    if not isinstance(result, dict) or set(result) != {
        "status", "categoryKey", "factSpine", "rejectionReason"
    }:
        return ["result_contract"]
    status = result.get("status")
    if status not in {"accepted", "rejected"}:
        return ["status"]
    if result.get("categoryKey") not in CATEGORY_KEYS:
        return ["category_key"]
    fact = result.get("factSpine")
    reason = result.get("rejectionReason")
    if not isinstance(fact, str) or not isinstance(reason, str):
        return ["text_fields"]
    if status == "rejected":
        return [] if not fact.strip() and reason.strip() else ["rejection_contract"]

    source = atom["summary"]
    errors = []
    if not 20 <= len(fact.strip()) <= 140 or not re.search(r"[.!?]$", fact.strip()):
        errors.append("fact_spine_length_or_sentence")
    if not any(marker in fact for marker in PAST_MARKERS):
        errors.append("past_event")
    if any(marker in fact for marker in INTERVIEW_STYLE_MARKERS + HYPOTHETICAL_MARKERS):
        errors.append("interview_style")
    if any(pattern.search(fact) for pattern in PROTECTED_PATTERNS):
        errors.append("protected_text")
    source_numbers = set(NUMBER_PATTERN.findall(source))
    invented_numbers = set(NUMBER_PATTERN.findall(fact)) - source_numbers
    if invented_numbers:
        errors.append("invented_numbers")
    anchors = required_anchors(source)
    if any(not any(variant in fact for variant in variants) for variants in anchors.values()):
        errors.append("missing_anchor")
    if len(source) >= 40 and source.rstrip(".") in fact:
        errors.append("verbatim_copy")
    return list(dict.fromkeys(errors))


def _post_json(url: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def normalize_atom(
    atom: dict[str, Any], *, model: str, base_url: str, timeout: int, max_attempts: int = 3
) -> tuple[dict[str, Any], dict[str, Any]]:
    prompt = PROMPT_PATH.read_text(encoding="utf-8")
    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["status", "categoryKey", "factSpine", "rejectionReason"],
        "properties": {
            "status": {"enum": ["accepted", "rejected"]},
            "categoryKey": {"enum": list(CATEGORY_KEYS)},
            "factSpine": {"type": "string", "maxLength": 140},
            "rejectionReason": {"type": "string", "maxLength": 100},
        },
    }
    errors: list[str] = []
    calls = 0
    output_tokens = 0
    eval_duration = 0
    started = time.perf_counter()
    for attempt in range(max_attempts):
        calls += 1
        user_input = {
            "atomId": atom["atomId"],
            "domain": atom["occupation"],
            "question": atom.get("question", ""),
            "sourceText": atom["summary"],
            "requiredAnchors": required_anchors(atom["summary"]),
            "previousErrors": errors,
        }
        try:
            response = _post_json(
                f"{base_url.rstrip('/')}/api/chat",
                {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": json.dumps(user_input, ensure_ascii=False)},
                    ],
                    "stream": False,
                    "format": schema,
                    "think": False,
                    "keep_alive": "15m",
                    "options": {
                        "temperature": 0,
                        "seed": 811 + attempt,
                        "num_ctx": 4096,
                        "num_predict": 256,
                    },
                },
                timeout,
            )
        except (urllib.error.URLError, TimeoutError):
            errors = ["transport"]
            continue
        output_tokens += response.get("eval_count", 0) or 0
        eval_duration += response.get("eval_duration", 0) or 0
        try:
            result = json.loads(response.get("message", {}).get("content", ""))
        except (json.JSONDecodeError, TypeError):
            errors = ["parse"]
            continue
        errors = validate_result(atom, result)
        if not errors:
            return result, {
                "calls": calls,
                "elapsedSeconds": round(time.perf_counter() - started, 4),
                "outputTokens": output_tokens,
                "evalDuration": eval_duration,
            }
    raise ValueError("normalization failed: " + ",".join(errors))


def build_shards(atom_ids: list[str], *, shard_size: int, windows_weight: float) -> list[dict[str, Any]]:
    shards = []
    previous_mac = 0
    for index, start in enumerate(range(0, len(atom_ids), shard_size), start=1):
        mac_target = round(index * (1 - windows_weight))
        device = "mac" if mac_target > previous_mac else "windows"
        previous_mac = mac_target
        shards.append(
            {
                "shardId": f"evidence-{index:04d}",
                "device": device,
                "atomIds": atom_ids[start : start + shard_size],
            }
        )
    return shards


def prepare(args: argparse.Namespace) -> None:
    root = args.output_root.resolve()
    atoms = scan_aihub_atoms(args.aihub_root)
    flat = sorted(
        [atom for values in atoms.values() for atom in values],
        key=lambda atom: (_stable_int(args.seed, atom["atomId"]), atom["atomId"]),
    )
    for atom in flat:
        _atomic_write_json(root / "inputs" / f"{atom['atomId']}.json", atom)
    shards = build_shards(
        [atom["atomId"] for atom in flat],
        shard_size=args.shard_size,
        windows_weight=args.windows_weight,
    )
    _atomic_write_json(
        root / "manifest.json",
        {
            "schemaVersion": 1,
            "createdAt": _utc_now(),
            "promptVersion": PROMPT_VERSION,
            "model": args.model,
            "atomCount": len(flat),
            "shards": shards,
        },
    )
    print(json.dumps({"atoms": len(flat), "shards": len(shards), "root": str(root)}, ensure_ascii=False))


def run(args: argparse.Namespace) -> None:
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    root = (args.output_root or args.manifest.parent).resolve()
    counts = Counter()
    for shard in manifest["shards"]:
        if shard["device"] != args.device or (args.shard_id and shard["shardId"] != args.shard_id):
            continue
        for atom_id in shard["atomIds"]:
            accepted = root / "accepted" / f"{atom_id}.json"
            rejected = root / "rejected" / f"{atom_id}.json"
            if accepted.exists() or rejected.exists():
                counts["skipped"] += 1
                continue
            atom = json.loads((args.manifest.parent / "inputs" / f"{atom_id}.json").read_text(encoding="utf-8"))
            try:
                result, metrics = normalize_atom(
                    atom,
                    model=args.model,
                    base_url=args.base_url,
                    timeout=args.timeout,
                    max_attempts=args.max_attempts,
                )
                payload = {
                    "schemaVersion": 1,
                    "atomId": atom_id,
                    "sourceFamilyId": atom["sourceFamilyId"],
                    "occupation": atom["occupation"],
                    "experienceLevel": atom["experienceLevel"],
                    "sourceZip": atom["sourceZip"],
                    "sourceEntry": atom["sourceEntry"],
                    "result": result,
                    "metrics": metrics,
                    "model": args.model,
                    "promptVersion": PROMPT_VERSION,
                    "normalizedAt": _utc_now(),
                }
                destination = accepted if result["status"] == "accepted" else rejected
                _atomic_write_json(destination, payload)
                counts[result["status"]] += 1
                print(f"{shard['shardId']} {atom_id}: {result['status']}", flush=True)
            except Exception as error:  # noqa: BLE001 - 오류를 atom 단위로 격리한다.
                counts["failed"] += 1
                _atomic_write_json(
                    root / "errors" / f"{atom_id}.json",
                    {"atomId": atom_id, "errorType": type(error).__name__, "message": str(error), "failedAt": _utc_now()},
                )
                print(f"{shard['shardId']} {atom_id}: failed", flush=True)
        _atomic_write_json(root / "states" / f"{shard['shardId']}.json", dict(counts))
    print(json.dumps(dict(counts), ensure_ascii=False))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    prepare_parser = sub.add_parser("prepare")
    prepare_parser.add_argument("output_root", type=Path)
    prepare_parser.add_argument("--aihub-root", type=Path, required=True)
    prepare_parser.add_argument("--shard-size", type=int, default=25)
    prepare_parser.add_argument("--windows-weight", type=float, default=0.5736)
    prepare_parser.add_argument("--seed", type=int, default=20260903)
    prepare_parser.add_argument("--model", default=DEFAULT_MODEL)
    run_parser = sub.add_parser("run")
    run_parser.add_argument("manifest", type=Path)
    run_parser.add_argument("--device", choices=("windows", "mac"), required=True)
    run_parser.add_argument("--shard-id")
    run_parser.add_argument("--output-root", type=Path)
    run_parser.add_argument("--model", default=DEFAULT_MODEL)
    run_parser.add_argument("--base-url", default="http://127.0.0.1:11434")
    run_parser.add_argument("--timeout", type=int, default=300)
    run_parser.add_argument("--max-attempts", type=int, default=3)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    prepare(args) if args.command == "prepare" else run(args)


if __name__ == "__main__":
    main()
