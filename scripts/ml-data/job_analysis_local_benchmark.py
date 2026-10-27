"""Ollama 기반 채용 공고 요건 추출 품질·속도 벤치마크.

외부 패키지 없이 실행되며, Expresso의 JobAnalysisAiOutputSchema와
ai-extractor 프롬프트 v2를 그대로 재현한다.
"""

from __future__ import annotations

import argparse
import json
import platform
import statistics
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterable


KINDS = {"must", "nice", "tone"}
AXES = {"technology", "impact", "role", "conditions", "other"}
NORMALIZED_KEYS = {"technologies", "impacts", "roles", "conditions"}

SYSTEM_PROMPT = "\n".join(
    [
        "너는 채용 공고에서 지원자가 충족해야 할 요건을 뽑아내는 추출기다.",
        "",
        "규칙:",
        "1. 공고에 적힌 것만 뽑는다. 업계 상식으로 보충하거나 추측하지 않는다.",
        "2. quote는 공고 원문에서 **한 글자도 바꾸지 않고** 그대로 잘라 온다.",
        "   줄바꿈·공백·문장부호를 손대면 그 항목은 버려진다.",
        "3. label은 그 요건을 짧게 정리한 말이다. 원문 그대로여도 되고 줄여도 된다.",
        "4. kind — must는 자격 요건, nice는 우대 사항, tone은 일하는 방식·문화.",
        "5. axis — 그 요건이 무엇을 묻는지로 하나 고른다.",
        "   technology: 기술·도구·언어",
        "   impact: 규모·지표·성과",
        "   role: 역할·직무·연차",
        "   conditions: 근무지·고용 형태·근무 형태",
        "   other: 위 넷 중 어디에도 확실히 안 붙을 때. **애매하면 other를 쓴다.**",
        "6. normalized는 일치도 계산에 쓰는 짧은 키워드 목록이다.",
        "   공고가 명시한 것만 넣는다. 없으면 빈 배열로 둔다.",
        "",
        "요건은 중요한 것부터 3–8개. 같은 내용을 두 번 넣지 않는다.",
        "",
        "label을 쓸 때(§8.3 품질 기준):",
        '- 그 공고에만 해당하는 말로 쓴다. "관련 경험", "커뮤니케이션 능력" 같은',
        "  어느 공고에나 붙는 말로 뭉개지 않는다.",
        '- 숫자와 고유명사를 살린다. 원문에 "일 3,000만 건", "Airflow"가 있으면',
        "  label에도 남긴다 — 줄이다 지워버리면 뒤에서 아무것도 대조할 수 없다.",
    ]
)

OUTPUT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["requirements", "normalized"],
    "properties": {
        "requirements": {
            "type": "array",
            "minItems": 3,
            "maxItems": 8,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["label", "kind", "axis", "quote"],
                "properties": {
                    "label": {"type": "string", "minLength": 1, "maxLength": 300},
                    "kind": {"type": "string", "enum": sorted(KINDS)},
                    "axis": {"type": "string", "enum": sorted(AXES)},
                    "quote": {"type": "string", "minLength": 1, "maxLength": 5000},
                },
            },
        },
        "normalized": {
            "type": "object",
            "additionalProperties": False,
            "required": sorted(NORMALIZED_KEYS),
            "properties": {
                "technologies": {"type": "array", "items": {"type": "string", "minLength": 1, "maxLength": 100}},
                "impacts": {"type": "array", "items": {"type": "string", "minLength": 1, "maxLength": 200}},
                "roles": {"type": "array", "items": {"type": "string", "minLength": 1, "maxLength": 200}},
                "conditions": {"type": "array", "items": {"type": "string", "minLength": 1, "maxLength": 200}},
            },
        },
    },
}


def _valid_string(value: Any, maximum: int) -> bool:
    return isinstance(value, str) and 1 <= len(value.strip()) <= maximum


def validate_model_output(output: Any, source: str) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(output, dict):
        return {
            "contract_valid": False,
            "errors": ["output_not_object"],
            "requirements_emitted": 0,
            "surviving_requirements": 0,
            "evidence_retention_rate": 0.0,
            "hallucinated_quote_count": 0,
            "duplicate_count": 0,
            "service_acceptable": False,
        }

    if set(output) != {"requirements", "normalized"}:
        errors.append("root_keys")

    requirements = output.get("requirements")
    if not isinstance(requirements, list) or not 3 <= len(requirements) <= 8:
        errors.append("requirements_length")
        requirements = requirements if isinstance(requirements, list) else []

    normalized = output.get("normalized")
    if not isinstance(normalized, dict) or set(normalized) != NORMALIZED_KEYS:
        errors.append("normalized_keys")
    else:
        maximums = {"technologies": 100, "impacts": 200, "roles": 200, "conditions": 200}
        for key, maximum in maximums.items():
            values = normalized[key]
            if not isinstance(values, list) or not all(_valid_string(value, maximum) for value in values):
                errors.append(f"normalized_{key}")

    hallucinated = 0
    duplicates = 0
    surviving = 0
    seen: set[tuple[str, int, int]] = set()
    for index, item in enumerate(requirements):
        if not isinstance(item, dict) or set(item) != {"label", "kind", "axis", "quote"}:
            errors.append(f"requirement_{index}_keys")
            continue
        if not _valid_string(item.get("label"), 300):
            errors.append(f"requirement_{index}_label")
        if item.get("kind") not in KINDS:
            errors.append(f"requirement_{index}_kind")
        if item.get("axis") not in AXES:
            errors.append(f"requirement_{index}_axis")
        quote = item.get("quote")
        if not _valid_string(quote, 5000):
            errors.append(f"requirement_{index}_quote")
            continue
        start = source.find(quote)
        if start < 0:
            hallucinated += 1
            continue
        key = (str(item.get("kind")), start, start + len(quote))
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
        if surviving < 6:
            surviving += 1

    emitted = len(requirements)
    return {
        "contract_valid": not errors,
        "errors": errors,
        "requirements_emitted": emitted,
        "surviving_requirements": surviving,
        "evidence_retention_rate": surviving / emitted if emitted else 0.0,
        "hallucinated_quote_count": hallucinated,
        "duplicate_count": duplicates,
        "service_acceptable": not errors and surviving >= 3,
    }


def score_reference(predicted: Iterable[dict[str, Any]], reference: Iterable[dict[str, Any]]) -> dict[str, float]:
    predicted_list = list(predicted)
    reference_list = list(reference)
    matches: list[tuple[dict[str, Any], dict[str, Any]]] = []
    unmatched_predicted = set(range(len(predicted_list)))
    for reference_item in reference_list:
        reference_quote = str(reference_item.get("quote", "")).strip()
        match_index = next(
            (
                index
                for index in unmatched_predicted
                if reference_quote
                and (
                    reference_quote in str(predicted_list[index].get("quote", ""))
                    or str(predicted_list[index].get("quote", "")).strip() in reference_quote
                )
            ),
            None,
        )
        if match_index is not None:
            unmatched_predicted.remove(match_index)
            matches.append((predicted_list[match_index], reference_item))

    precision = len(matches) / len(predicted_list) if predicted_list else 0.0
    recall = len(matches) / len(reference_list) if reference_list else 0.0
    kind_accuracy = (
        sum(predicted_item.get("kind") == reference_item.get("kind") for predicted_item, reference_item in matches)
        / len(matches)
        if matches
        else 0.0
    )
    axis_accuracy = (
        sum(predicted_item.get("axis") == reference_item.get("axis") for predicted_item, reference_item in matches)
        / len(matches)
        if matches
        else 0.0
    )
    return {
        "span_precision": precision,
        "span_recall": recall,
        "kind_accuracy": kind_accuracy,
        "axis_accuracy": axis_accuracy,
    }


def percentile(values: Iterable[float], quantile: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * quantile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def summarize_runs(runs: Iterable[dict[str, Any]]) -> dict[str, float]:
    runs_list = list(runs)
    latencies = [run["total_duration"] / 1_000_000_000 for run in runs_list if run.get("total_duration")]
    generation_rates = [
        run["eval_count"] / (run["eval_duration"] / 1_000_000_000)
        for run in runs_list
        if run.get("eval_count") and run.get("eval_duration")
    ]
    return {
        "latency_p50_seconds": round(percentile(latencies, 0.50), 4),
        "latency_p95_seconds": round(percentile(latencies, 0.95), 4),
        "generation_tokens_per_second_mean": round(statistics.fmean(generation_rates), 4) if generation_rates else 0.0,
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


def _get_json(url: str, timeout: int = 10) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def run_one(base_url: str, model: str, item: dict[str, Any], timeout: int) -> dict[str, Any]:
    source = item["descriptionRaw"]
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"다음 채용 공고에서 요건을 뽑아라.\n\n---\n{source}\n---"},
        ],
        "stream": False,
        "format": OUTPUT_SCHEMA,
        "think": False,
        "keep_alive": "15m",
        "options": {"temperature": 0, "seed": 42, "num_ctx": 8192, "num_predict": 1024},
    }
    started = time.perf_counter()
    response = _post_json(f"{base_url.rstrip('/')}/api/chat", payload, timeout)
    wall_seconds = time.perf_counter() - started
    content = response.get("message", {}).get("content", "")
    parsed: Any = None
    parse_error = None
    try:
        parsed = json.loads(content)
    except (json.JSONDecodeError, TypeError) as exc:
        parse_error = str(exc)
    validation = validate_model_output(parsed, source)
    reference = item.get("referenceRequirements", [])
    reference_score = score_reference(parsed.get("requirements", []) if isinstance(parsed, dict) else [], reference)
    return {
        "id": item["_id"],
        "title": item["title"],
        "jobFamily": item.get("jobFamily"),
        "sourceBoard": item.get("sourceBoard"),
        "sourceChars": len(source),
        "model": model,
        "wall_seconds": wall_seconds,
        "parse_error": parse_error,
        "raw_content": content,
        "done_reason": response.get("done_reason"),
        "output": parsed,
        "validation": validation,
        "reference_score": reference_score,
        "timing": {
            key: response.get(key)
            for key in (
                "total_duration",
                "load_duration",
                "prompt_eval_count",
                "prompt_eval_duration",
                "eval_count",
                "eval_duration",
            )
        },
    }


def _mean_metric(results: list[dict[str, Any]], group: str, key: str) -> float:
    values = [result[group][key] for result in results if key in result.get(group, {})]
    return round(statistics.fmean(values), 4) if values else 0.0


def aggregate_model(model: str, results: list[dict[str, Any]], process: dict[str, Any] | None) -> dict[str, Any]:
    timings = [result["timing"] for result in results]
    return {
        "model": model,
        "samples": len(results),
        "json_parse_success_rate": round(sum(result["parse_error"] is None for result in results) / len(results), 4),
        "contract_pass_rate": _mean_metric(results, "validation", "contract_valid"),
        "service_accept_rate": _mean_metric(results, "validation", "service_acceptable"),
        "evidence_retention_rate": _mean_metric(results, "validation", "evidence_retention_rate"),
        "hallucinated_quotes_total": sum(result["validation"]["hallucinated_quote_count"] for result in results),
        "duplicates_total": sum(result["validation"]["duplicate_count"] for result in results),
        "reference_span_precision": _mean_metric(results, "reference_score", "span_precision"),
        "reference_span_recall": _mean_metric(results, "reference_score", "span_recall"),
        "reference_kind_accuracy": _mean_metric(results, "reference_score", "kind_accuracy"),
        "reference_axis_accuracy": _mean_metric(results, "reference_score", "axis_accuracy"),
        **summarize_runs(timings),
        "ollama_process": process,
    }


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--models", nargs="+", required=True)
    parser.add_argument("--base-url", default="http://127.0.0.1:11434")
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()

    dataset = load_jsonl(args.dataset)
    args.output.mkdir(parents=True, exist_ok=True)
    all_summaries = []
    for model in args.models:
        model_results = []
        for index, item in enumerate(dataset, start=1):
            print(f"[{model}] {index}/{len(dataset)} {item['title']}", flush=True)
            try:
                result = run_one(args.base_url, model, item, args.timeout)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                result = {
                    "id": item["_id"],
                    "title": item["title"],
                    "model": model,
                    "error": repr(exc),
                    "parse_error": repr(exc),
                    "validation": {
                        "contract_valid": False,
                        "service_acceptable": False,
                        "evidence_retention_rate": 0.0,
                        "hallucinated_quote_count": 0,
                        "duplicate_count": 0,
                    },
                    "reference_score": {key: 0.0 for key in ("span_precision", "span_recall", "kind_accuracy", "axis_accuracy")},
                    "timing": {},
                }
            model_results.append(result)

        safe_name = model.replace(":", "__").replace("/", "_")
        raw_path = args.output / f"{safe_name}.json"
        raw_path.write_text(json.dumps(model_results, ensure_ascii=False, indent=2), encoding="utf-8")
        process = None
        try:
            process_response = _get_json(f"{args.base_url.rstrip('/')}/api/ps")
            process = next((entry for entry in process_response.get("models", []) if entry.get("name") == model), None)
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
        all_summaries.append(aggregate_model(model, model_results, process))

    summary = {
        "generated_at_unix": time.time(),
        "host": platform.node(),
        "platform": platform.platform(),
        "prompt_version": 2,
        "context_tokens": 8192,
        "temperature": 0,
        "thinking": False,
        "max_output_tokens": 1024,
        "dataset": str(args.dataset),
        "models": all_summaries,
    }
    (args.output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
