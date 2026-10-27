"""장비별 Ollama 벤치마크 결과를 Data 리포트용 reviewed snapshot으로 묶는다."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from job_analysis_local_benchmark import percentile


MODEL_LABELS = {
    "qwen3.5:9b-q8_0": "Qwen3.5 9B Q8",
    "qwen3:30b-a3b-instruct-2507-q4_K_M": "Qwen3 30B-A3B Q4",
    "qwen3.8:27b-q4_K_M": "Qwen3.8 27B Q4",
}


def safe_model_name(model: str) -> str:
    return model.replace(":", "__").replace("/", "_")


def seconds(value: int | float | None) -> float:
    return round((value or 0) / 1_000_000_000, 4)


def parse_source(value: str) -> tuple[str, Path]:
    platform_name, separator, path = value.partition("=")
    if not separator or not platform_name or not path:
        raise argparse.ArgumentTypeError("--summary는 PLATFORM=PATH 형식이어야 합니다")
    return platform_name, Path(path)


def read_results(platform_name: str, summary_path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], float]:
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    comparison_rows = []
    sample_rows = []
    generated_at = float(summary["generated_at_unix"])
    for model_summary in summary["models"]:
        model = model_summary["model"]
        raw_path = summary_path.parent / f"{safe_model_name(model)}.json"
        raw = json.loads(raw_path.read_text(encoding="utf-8"))
        warm_latencies = [seconds(item.get("timing", {}).get("total_duration")) for item in raw[1:]]
        load_seconds = seconds(raw[0].get("timing", {}).get("load_duration")) if raw else 0.0
        process = model_summary.get("ollama_process") or {}
        comparison_rows.append(
            {
                "platform": platform_name,
                "model": model,
                "modelLabel": MODEL_LABELS.get(model, model),
                "samples": model_summary["samples"],
                "contractPassRate": model_summary["contract_pass_rate"],
                "serviceAcceptRate": model_summary["service_accept_rate"],
                "evidenceRetentionRate": model_summary["evidence_retention_rate"],
                "referenceSpanPrecision": model_summary["reference_span_precision"],
                "referenceSpanRecall": model_summary["reference_span_recall"],
                "referenceKindAccuracy": model_summary["reference_kind_accuracy"],
                "referenceAxisAccuracy": model_summary["reference_axis_accuracy"],
                "hallucinatedQuotes": model_summary["hallucinated_quotes_total"],
                "parseFailures": sum(item.get("parse_error") is not None for item in raw),
                "lengthStops": sum(item.get("done_reason") == "length" for item in raw),
                "acceptedCount": sum(bool(item.get("validation", {}).get("service_acceptable")) for item in raw),
                "latencyP50Seconds": model_summary["latency_p50_seconds"],
                "latencyP95Seconds": model_summary["latency_p95_seconds"],
                "warmLatencyP50Seconds": round(percentile(warm_latencies, 0.50), 4),
                "warmLatencyP95Seconds": round(percentile(warm_latencies, 0.95), 4),
                "coldLoadSeconds": load_seconds,
                "generationTokensPerSecond": model_summary["generation_tokens_per_second_mean"],
                "modelBytes": process.get("size"),
                "vramBytes": process.get("size_vram"),
                "contextTokens": summary["context_tokens"],
                "maxOutputTokens": summary["max_output_tokens"],
            }
        )
        for item in raw:
            sample_rows.append(
                {
                    "platform": platform_name,
                    "model": model,
                    "modelLabel": MODEL_LABELS.get(model, model),
                    "postingId": item["id"],
                    "title": item["title"],
                    "jobFamily": item.get("jobFamily"),
                    "sourceBoard": item.get("sourceBoard"),
                    "sourceChars": item.get("sourceChars"),
                    "contractValid": bool(item.get("validation", {}).get("contract_valid")),
                    "serviceAcceptable": bool(item.get("validation", {}).get("service_acceptable")),
                    "evidenceRetentionRate": item.get("validation", {}).get("evidence_retention_rate", 0),
                    "hallucinatedQuoteCount": item.get("validation", {}).get("hallucinated_quote_count", 0),
                    "spanPrecision": item.get("reference_score", {}).get("span_precision", 0),
                    "spanRecall": item.get("reference_score", {}).get("span_recall", 0),
                    "kindAccuracy": item.get("reference_score", {}).get("kind_accuracy", 0),
                    "axisAccuracy": item.get("reference_score", {}).get("axis_accuracy", 0),
                    "latencySeconds": seconds(item.get("timing", {}).get("total_duration")),
                    "outputTokens": item.get("timing", {}).get("eval_count"),
                    "doneReason": item.get("done_reason"),
                    "parseError": item.get("parse_error"),
                }
            )
    return comparison_rows, sample_rows, generated_at


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", action="append", type=parse_source, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    comparison_rows = []
    sample_rows = []
    generated_values = []
    source_files = []
    for platform_name, summary_path in args.summary:
        rows, samples, generated_at = read_results(platform_name, summary_path)
        comparison_rows.extend(rows)
        sample_rows.extend(samples)
        generated_values.append(generated_at)
        source_files.append(str(summary_path.resolve()))

    generated_at = datetime.fromtimestamp(max(generated_values), tz=timezone.utc).isoformat()
    common_source = {
        "label": "Observed local Ollama benchmark",
        "files": source_files,
        "filters": [
            "12 public Korean job postings; user_input excluded",
            "Prompt version 2; context 8192; temperature 0; thinking disabled; output cap 1024",
        ],
    }
    snapshot = {
        "surface": "report",
        "title": "공고 분석 로컬 모델은 30B-A3B가 가장 현실적이다",
        "generatedAt": generated_at,
        "status": "observed",
        "filters": [],
        "queries": {
            "model_comparison": {
                "rows": comparison_rows,
                "source": {
                    **common_source,
                    "metricDefinitions": [
                        {
                            "label": "서비스 수용률",
                            "definition": "JSON 계약을 통과하고 원문에서 정확히 찾은 중복 없는 인용이 3개 이상인 공고의 비율.",
                            "componentIds": ["model-quality", "recommendation", "comparison-table"],
                            "sourceLineage": [{"files": source_files}],
                        },
                        {
                            "label": "증거 보존율",
                            "definition": "모델이 낸 요구사항 중 Expresso 검증 후 남은 원문 일치 요구사항 비율의 공고별 평균. 파싱 실패는 0으로 포함.",
                            "componentIds": ["model-quality", "comparison-table"],
                            "sourceLineage": [{"files": source_files}],
                        },
                        {
                            "label": "warm p50 지연",
                            "definition": "각 장비·모델의 첫 적재 호출을 제외한 11개 공고 완료 시간의 중앙값.",
                            "componentIds": ["model-speed", "comparison-table"],
                            "sourceLineage": [{"files": source_files}],
                        },
                        {
                            "label": "생성 속도",
                            "definition": "Ollama가 보고한 eval_count를 eval_duration 초로 나눈 호출별 속도의 산술 평균.",
                            "componentIds": ["model-speed", "comparison-table"],
                            "sourceLineage": [{"files": source_files}],
                        },
                    ],
                },
            },
            "sample_results": {
                "rows": sample_rows,
                "source": {
                    **common_source,
                    "metricDefinitions": [
                        {
                            "label": "기준 스팬 재현율",
                            "definition": "공고별로 모델 출력 전에 고정한 61개 핵심 원문 스팬 중 예측 인용과 포함 관계로 대응된 비율의 공고별 평균.",
                            "componentIds": ["failure-patterns", "method"],
                            "sourceLineage": [{"files": source_files}],
                        }
                    ],
                },
            },
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(comparison_rows)} comparison rows and {len(sample_rows)} sample rows to {args.output}")


if __name__ == "__main__":
    main()
