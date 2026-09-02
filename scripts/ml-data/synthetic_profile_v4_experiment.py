"""합성 프로필 v4 Qwen 실행과 Qwen·Luna 품질 비교 도구."""

from __future__ import annotations

import argparse
import json
import re
import statistics
import time
import urllib.request
from itertools import combinations
from pathlib import Path
from typing import Any

from synthetic_profile import load_seed_categories
from synthetic_profile_v4 import assemble_profile, prepare_pilot_inputs, validate_draft


SCRIPT_DIR = Path(__file__).parent
PROMPT_PATH = SCRIPT_DIR / "prompts" / "synthetic-profile-v4.md"
SCHEMA_PATH = SCRIPT_DIR / "synthetic_profile_draft_v4.schema.json"
DEFAULT_SEEDS_PATH = Path(__file__).parents[2] / "packages" / "database" / "src" / "mongodb-migrations" / "0001" / "seeds.json"
WORD_PATTERN = re.compile(r"[가-힣A-Za-z][가-힣A-Za-z0-9+.#_-]{1,}|\d+(?:[.,]\d+)?")
NUMBER_PATTERN = re.compile(r"\d+(?:[.,]\d+)?")
STOPWORDS = {
    "그리고", "에서", "으로", "하며", "했다", "맡았다", "과정을", "업무를", "프로젝트", "기록했다",
    "정리했다", "시작해", "마쳤다", "사용했다", "담당했다", "참여했다", "결과를", "같은", "이후",
}
CLICHES = (
    "역량을",
    "기여했습니다",
    "기여했다",
    "효율성을",
    "성장할",
    "최선을",
    "자신감",
    "깨달았습니다",
    "발전시키",
    "기반을 마련",
    "신뢰성을",
    "체계적으로",
    "협업 문화를",
)


def _property_schema(property_type: str) -> dict[str, Any]:
    if property_type == "text":
        return {"type": "string", "minLength": 1}
    if property_type == "tags":
        return {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}
    if property_type == "date":
        return {"type": "string", "pattern": "^\\d{4}-(?:0[1-9]|1[0-2])$"}
    raise ValueError(f"unsupported property type: {property_type}")


def build_output_schema(input_payload: dict[str, Any]) -> dict[str, Any]:
    """입력별 사건 순서와 프로퍼티 계획을 디코딩 문법에 고정한다."""
    record_schemas = []
    for index, event in enumerate(input_payload["events"], start=1):
        category_schema = input_payload["propertySchema"][event["categoryKey"]]
        planned = event["propertyKeys"]
        record_schemas.append(
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["draftId", "eventId", "categoryKey", "title", "properties", "bodyMd"],
                "properties": {
                    "draftId": {"const": f"r{index}"},
                    "eventId": {"const": event["eventId"]},
                    "categoryKey": {"const": event["categoryKey"]},
                    "title": {"type": "string", "minLength": 1, "maxLength": 100},
                    "properties": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": planned,
                        "properties": {key: _property_schema(category_schema[key]) for key in planned},
                    },
                    "bodyMd": {"type": "string", "minLength": 40, "maxLength": 450},
                },
            }
        )
    target = input_payload["targetRecordCount"]
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["status", "profileSeed", "persona", "records"],
        "properties": {
            "status": {"const": "generated"},
            "profileSeed": {"const": input_payload["profileSeed"]},
            "persona": {"const": input_payload["persona"]},
            "records": {
                "type": "array",
                "minItems": target,
                "maxItems": target,
                "prefixItems": record_schemas,
            },
        },
    }


def _tokens(text: str) -> set[str]:
    return {token.lower() for token in WORD_PATTERN.findall(text) if token not in STOPWORDS}


def _visible_record_text(record: dict[str, Any]) -> str:
    return " ".join(
        [
            str(record.get("title", "")),
            str(record.get("bodyMd", "")),
            json.dumps(record.get("properties", {}), ensure_ascii=False),
        ]
    )


def _normalize_number(value: str) -> str:
    compact = value.replace(",", "")
    if "." in compact:
        whole, fraction = compact.split(".", 1)
        return f"{int(whole)}.{fraction.rstrip('0') or '0'}"
    return str(int(compact))


def _trigrams(text: str) -> set[str]:
    normalized = re.sub(r"\s+", "", text)
    return {normalized[index : index + 3] for index in range(max(0, len(normalized) - 2))}


def _similarity(left: str, right: str) -> float:
    left_parts = _trigrams(left)
    right_parts = _trigrams(right)
    union = left_parts | right_parts
    return len(left_parts & right_parts) / len(union) if union else 0.0


def score_draft(
    input_payload: dict[str, Any],
    draft: Any,
    *,
    elapsed_seconds: float | None = None,
    output_tokens: int | None = None,
) -> dict[str, Any]:
    validation = validate_draft(input_payload, draft)
    records = draft.get("records", []) if isinstance(draft, dict) and isinstance(draft.get("records"), list) else []
    event_by_id = {event["eventId"]: event for event in input_payload["events"]}
    coverage_values = []
    invented_numbers = []
    body_lengths = []
    cliche_count = 0
    for record in records:
        if not isinstance(record, dict):
            continue
        event = event_by_id.get(record.get("eventId"))
        if not event:
            continue
        visible = _visible_record_text(record)
        fact_text = " ".join(event.get("facts", []))
        fact_tokens = _tokens(fact_text)
        visible_tokens = _tokens(visible)
        coverage_values.append(len(fact_tokens & visible_tokens) / len(fact_tokens) if fact_tokens else 1.0)
        allowed_numbers = {_normalize_number(value) for value in NUMBER_PATTERN.findall(fact_text)}
        visible_numbers = {_normalize_number(value) for value in NUMBER_PATTERN.findall(visible)}
        added_numbers = sorted(visible_numbers - allowed_numbers)
        if added_numbers:
            invented_numbers.append({"eventId": event["eventId"], "values": added_numbers})
        body = str(record.get("bodyMd", ""))
        body_lengths.append(len(body))
        cliche_count += sum(body.count(marker) for marker in CLICHES)

    duplicate_pairs = sum(
        _similarity(str(left.get("bodyMd", "")), str(right.get("bodyMd", ""))) >= 0.65
        for left, right in combinations([record for record in records if isinstance(record, dict)], 2)
    )
    target = input_payload["targetRecordCount"]
    return {
        "profileSeed": input_payload["profileSeed"],
        "targetRecordCount": target,
        "actualRecordCount": len(records),
        "schemaValid": validation["valid"],
        "validationErrors": validation["errors"],
        "recordCompletionRate": round(len(records) / target, 4) if target else 1.0,
        "propertyCounts": validation["propertyCounts"],
        "factTokenCoverage": round(statistics.fmean(coverage_values), 4) if coverage_values else 0.0,
        "inventedNumbers": invented_numbers,
        "duplicateRecordPairs": duplicate_pairs,
        "clicheCount": cliche_count,
        "bodyLengthMean": round(statistics.fmean(body_lengths), 2) if body_lengths else 0.0,
        "bodyLengthStd": round(statistics.pstdev(body_lengths), 2) if len(body_lengths) > 1 else 0.0,
        "elapsedSeconds": elapsed_seconds,
        "outputTokens": output_tokens,
    }


def _post_json(url: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def generate_qwen(
    input_paths: list[Path],
    output_dir: Path,
    *,
    model: str,
    base_url: str,
    timeout: int,
) -> list[Path]:
    prompt = PROMPT_PATH.read_text(encoding="utf-8")
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata = []
    paths = []
    for input_path in input_paths:
        input_payload = json.loads(input_path.read_text(encoding="utf-8"))
        schema = build_output_schema(input_payload)
        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps(input_payload, ensure_ascii=False)},
        ]
        parsed = None
        response: dict[str, Any] = {}
        started = time.perf_counter()
        attempts = 0
        parse_error = None
        validation_errors: list[str] = []
        while attempts < 2:
            attempts += 1
            response = _post_json(
                f"{base_url.rstrip('/')}/api/chat",
                {
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "format": schema,
                    "think": False,
                    "keep_alive": "15m",
                    "options": {"temperature": 0, "seed": 42, "num_ctx": 32768, "num_predict": 8192},
                },
                timeout,
            )
            content = response.get("message", {}).get("content", "")
            try:
                parsed = json.loads(content)
                parse_error = None
            except (json.JSONDecodeError, TypeError) as exc:
                parsed = None
                parse_error = str(exc)
            validation = validate_draft(input_payload, parsed)
            validation_errors = validation["errors"]
            if validation["valid"]:
                break
            messages.extend(
                [
                    {"role": "assistant", "content": content},
                    {
                        "role": "user",
                        "content": "출력이 계약을 위반했다. 다음 오류만 고쳐 전체 JSON을 다시 출력하라: "
                        + json.dumps(validation_errors, ensure_ascii=False),
                    },
                ]
            )
        elapsed = time.perf_counter() - started
        if parsed is None:
            parsed = {"status": "invalid", "parseError": parse_error}
        output_path = output_dir / input_path.name
        output_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        paths.append(output_path)
        metadata.append(
            {
                "profileSeed": input_payload["profileSeed"],
                "attempts": attempts,
                "elapsedSeconds": round(elapsed, 4),
                "doneReason": response.get("done_reason"),
                "promptTokens": response.get("prompt_eval_count"),
                "outputTokens": response.get("eval_count"),
                "evalTokensPerSecond": round(
                    response.get("eval_count", 0) / (response.get("eval_duration", 1) / 1_000_000_000), 4
                ) if response.get("eval_duration") else None,
                "parseError": parse_error,
                "validationErrors": validation_errors,
            }
        )
        print(f"{input_payload['profileSeed']}: attempts={attempts} valid={not validation_errors} elapsed={elapsed:.1f}s", flush=True)
    (output_dir / "run-metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return paths


def assemble_directory(
    input_dir: Path,
    draft_dir: Path,
    output_dir: Path,
    *,
    generator_model: str,
    seeds_path: Path,
) -> list[Path]:
    categories = load_seed_categories(seeds_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for input_path in sorted(input_dir.glob("*.json")):
        draft_path = draft_dir / input_path.name
        profile = assemble_profile(
            json.loads(input_path.read_text(encoding="utf-8")),
            json.loads(draft_path.read_text(encoding="utf-8")),
            categories,
            generator_model=generator_model,
        )
        output_path = output_dir / input_path.name
        output_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        outputs.append(output_path)
    return outputs


def normalize_run_metadata(payload: Any) -> dict[str, dict[str, Any]]:
    if isinstance(payload, list):
        return {item["profileSeed"]: item for item in payload}
    if isinstance(payload, dict) and isinstance(payload.get("profiles"), dict):
        return {
            profile_seed: {"profileSeed": profile_seed, **values}
            for profile_seed, values in payload["profiles"].items()
        }
    raise ValueError("unsupported run metadata format")


def compare_directories(input_dir: Path, model_dirs: dict[str, Path]) -> dict[str, Any]:
    results: dict[str, Any] = {"models": {}}
    for model_name, draft_dir in model_dirs.items():
        metadata_path = draft_dir / "run-metadata.json"
        metadata = normalize_run_metadata(
            json.loads(metadata_path.read_text(encoding="utf-8"))
        ) if metadata_path.exists() else {}
        profile_scores = []
        for input_path in sorted(input_dir.glob("*.json")):
            payload = json.loads(input_path.read_text(encoding="utf-8"))
            draft = json.loads((draft_dir / input_path.name).read_text(encoding="utf-8"))
            run = metadata.get(payload["profileSeed"], {})
            profile_scores.append(
                score_draft(
                    payload,
                    draft,
                    elapsed_seconds=run.get("elapsedSeconds"),
                    output_tokens=run.get("outputTokens"),
                )
            )
        results["models"][model_name] = {
            "profiles": profile_scores,
            "schemaPassRate": round(sum(item["schemaValid"] for item in profile_scores) / len(profile_scores), 4),
            "recordCompletionRate": round(statistics.fmean(item["recordCompletionRate"] for item in profile_scores), 4),
            "factTokenCoverage": round(statistics.fmean(item["factTokenCoverage"] for item in profile_scores), 4),
            "inventedNumberCount": sum(len(item["inventedNumbers"]) for item in profile_scores),
            "duplicateRecordPairs": sum(item["duplicateRecordPairs"] for item in profile_scores),
            "clicheCount": sum(item["clicheCount"] for item in profile_scores),
            "bodyLengthMean": round(statistics.fmean(item["bodyLengthMean"] for item in profile_scores), 2),
            "elapsedSecondsTotal": round(sum(item["elapsedSeconds"] or 0 for item in profile_scores), 2),
        }
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("output_dir", type=Path)
    prepare_parser.add_argument("--seeds", type=Path, default=DEFAULT_SEEDS_PATH)
    qwen_parser = subparsers.add_parser("qwen")
    qwen_parser.add_argument("input_dir", type=Path)
    qwen_parser.add_argument("output_dir", type=Path)
    qwen_parser.add_argument("--model", default="qwen3:30b-a3b-instruct-2507-q4_K_M")
    qwen_parser.add_argument("--base-url", default="http://127.0.0.1:11434")
    qwen_parser.add_argument("--timeout", type=int, default=900)
    assemble_parser = subparsers.add_parser("assemble")
    assemble_parser.add_argument("input_dir", type=Path)
    assemble_parser.add_argument("draft_dir", type=Path)
    assemble_parser.add_argument("output_dir", type=Path)
    assemble_parser.add_argument("--model", required=True)
    assemble_parser.add_argument("--seeds", type=Path, default=DEFAULT_SEEDS_PATH)
    compare_parser = subparsers.add_parser("compare")
    compare_parser.add_argument("input_dir", type=Path)
    compare_parser.add_argument("output", type=Path)
    compare_parser.add_argument("--model-dir", action="append", required=True)
    args = parser.parse_args()

    if args.command == "prepare":
        for path in prepare_pilot_inputs(args.output_dir, load_seed_categories(args.seeds)):
            print(path)
    elif args.command == "qwen":
        generate_qwen(sorted(args.input_dir.glob("*.json")), args.output_dir, model=args.model, base_url=args.base_url, timeout=args.timeout)
    elif args.command == "assemble":
        assemble_directory(args.input_dir, args.draft_dir, args.output_dir, generator_model=args.model, seeds_path=args.seeds)
    elif args.command == "compare":
        model_dirs = {}
        for item in args.model_dir:
            label, separator, path = item.partition("=")
            if not separator:
                raise ValueError("--model-dir는 LABEL=PATH 형식이어야 합니다")
            model_dirs[label] = Path(path)
        result = compare_directories(args.input_dir, model_dirs)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
