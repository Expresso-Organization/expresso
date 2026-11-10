"""적합도 모델을 ONNX로 내보내고 CPU에서 요청 단위 지연을 잰다.

운영 서버는 GPU가 없는 aarch64 4 vCPU다. 본 학습 계획 5.1이 서비스 추론을 ONNX Runtime CPU로
돌리고, Cross-Encoder는 운영 서버에서 잰 p95가 기준을 넘지 않을 때만 유지하기로 했다.

    export-encoder  Bi-Encoder 인코더(AutoModel) → last_hidden_state. pooling은 추론 코드가 한다
    export-mlp      train-bi의 checkpoint.pt → 적합도 0–100
    export-cross    Cross-Encoder(기반 모델 + 학습한 층) → 적합도 0–100
    latency         내보낸 모델로 네 요청의 p50 · p95 · 처리량

지연은 가중치 값이 아니라 구조와 입력 길이로 정해진다. 그래서 학습 전 가중치로도 잴 수 있고,
입력은 길이만 맞춘 무작위 토큰을 쓴다. 측정에 쓴 길이 · 배치 · 스레드는 결과에 함께 남긴다.

ONNX Runtime 1.31.0은 aarch64 리눅스 휠을 cp311 이상에만 배포한다. `uv run --python 3.12`로 돌린다.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import platform
import statistics
import sys
import time
from typing import Any, Callable, Sequence


sys.path.insert(0, str(Path(__file__).parent))

# 같은 폴더의 profile.py가 표준 profile 모듈을 가린다. torch · transformers를 부르기 전에 푼다.
import llm_suitability_train  # noqa: E402,F401

OPSET = 17
# 인코더 4종 중 Qwen3-Embedding만 디코더다(match_encoders.ENCODERS).
DECODER_MODEL_TYPES = {"qwen3"}


def _write_manifest(output: Path, payload: dict[str, Any]) -> None:
    """2GB를 넘는 모델은 torch가 가중치를 model.onnx 옆의 외부 파일로 나눠 쓴다.
    그래서 파일 목록은 폴더에서 읽고, 옮길 때는 폴더 전체를 옮긴다."""
    output.mkdir(parents=True, exist_ok=True)
    payload = {**payload, "files": sorted(path.name for path in output.iterdir() if path.name != "manifest.json"), "moveWholeDirectory": True}
    (output / "manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _quantize(source: Path, target: Path) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic

    quantize_dynamic(str(source), str(target), weight_type=QuantType.QInt8)


def _export(module: Any, inputs: tuple[Any, ...], names: Sequence[str], output_name: str, dynamic: dict[str, dict[int, str]], target: Path) -> None:
    import torch

    module.eval()
    target.parent.mkdir(parents=True, exist_ok=True)
    with torch.no_grad():
        torch.onnx.export(
            module,
            inputs,
            str(target),
            input_names=list(names),
            output_names=[output_name],
            dynamic_axes=dynamic,
            opset_version=OPSET,
            dynamo=False,
        )


def _token_inputs(config: Any, batch: int, length: int) -> tuple[Any, Any]:
    import torch

    generator = torch.Generator().manual_seed(0)
    # 특수 토큰 번호를 피해 일반 토큰만 쓴다. 지연은 토큰 값이 아니라 길이로 정해진다.
    input_ids = torch.randint(5, int(config.vocab_size), (batch, length), generator=generator)
    return input_ids, torch.ones_like(input_ids)


_TOKEN_AXES = {"input_ids": {0: "batch", 1: "sequence"}, "attention_mask": {0: "batch", 1: "sequence"}}


def export_encoder(model_name: str, output: Path, *, quantize: bool) -> dict[str, Any]:
    import torch
    from transformers import AutoModel

    model = AutoModel.from_pretrained(model_name)
    if getattr(model.config, "is_decoder", False) or model.config.model_type in DECODER_MODEL_TYPES:
        raise ValueError(
            f"{model_name}: 디코더 인코더는 이 도구로 내보내지 않는다. transformers 4.55의 디코더 mask는 "
            "torch 2.6 이상에서 vmap으로 만들어져 TorchScript 추적이 따라가지 못하고, 우회하면 추적한 길이가 "
            "그래프에 고정된다(2026-11-10 시험). 지연은 별도 경로로 잰다."
        )

    class Encoder(torch.nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.model = model

        def forward(self, input_ids: Any, attention_mask: Any) -> Any:
            return self.model(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state

    target = output / "model.onnx"
    _export(Encoder(), _token_inputs(model.config, 2, 8), ("input_ids", "attention_mask"), "last_hidden_state", {**_TOKEN_AXES, "last_hidden_state": {0: "batch", 1: "sequence"}}, target)
    manifest = {"kind": "encoder", "model": model_name, "vocabSize": int(model.config.vocab_size), "hiddenSize": int(model.config.hidden_size), "opset": OPSET}
    if quantize:
        _quantize(target, output / "model.int8.onnx")
    _write_manifest(output, manifest)
    return json.loads((output / "manifest.json").read_text(encoding="utf-8"))


def export_mlp(checkpoint: Path, output: Path) -> dict[str, Any]:
    import torch
    from llm_suitability_train import _create_mlp

    payload = torch.load(checkpoint, map_location="cpu", weights_only=False)
    dimension = int(payload["embeddingDimension"])
    mlp = _create_mlp(dimension * 4, int(payload["hiddenDimension"]), 0)
    mlp.load_state_dict(payload["state"])

    class Scorer(torch.nn.Module):
        """`llm_suitability_train._mlp_scores`와 같은 출력: sigmoid × 100."""

        def __init__(self) -> None:
            super().__init__()
            self.mlp = mlp

        def forward(self, features: Any) -> Any:
            return torch.sigmoid(self.mlp(features).reshape(-1)) * 100.0

    target = output / "model.onnx"
    _export(Scorer(), (torch.zeros(2, dimension * 4),), ("features",), "match_score", {"features": {0: "pairs"}, "match_score": {0: "pairs"}}, target)
    manifest = {"kind": "mlp", "model": payload.get("model"), "embeddingDimension": dimension, "opset": OPSET}
    _write_manifest(output, manifest)
    return json.loads((output / "manifest.json").read_text(encoding="utf-8"))


def export_cross(base_model: str, output: Path, *, checkpoint: Path | None, quantize: bool) -> dict[str, Any]:
    import torch
    from transformers import AutoModelForSequenceClassification

    model = AutoModelForSequenceClassification.from_pretrained(base_model)
    trained = None
    if checkpoint is not None:
        payload = torch.load(checkpoint, map_location="cpu", weights_only=True)
        state = model.state_dict()
        state.update(payload["trainableState"])
        model.load_state_dict(state)
        trained = payload.get("model")

    class Cross(torch.nn.Module):
        """`llm_suitability_train.cross_encoder_scores`와 같은 출력: sigmoid × 100."""

        def __init__(self) -> None:
            super().__init__()
            self.model = model

        def forward(self, input_ids: Any, attention_mask: Any) -> Any:
            return torch.sigmoid(self.model(input_ids=input_ids, attention_mask=attention_mask).logits.reshape(-1)) * 100.0

    target = output / "model.onnx"
    _export(Cross(), _token_inputs(model.config, 2, 8), ("input_ids", "attention_mask"), "match_score", {**_TOKEN_AXES, "match_score": {0: "batch"}}, target)
    manifest = {"kind": "cross", "model": trained or base_model, "baseModel": base_model, "vocabSize": int(model.config.vocab_size), "opset": OPSET}
    if quantize:
        _quantize(target, output / "model.int8.onnx")
    _write_manifest(output, manifest)
    return json.loads((output / "manifest.json").read_text(encoding="utf-8"))


def _session(path: Path, threads: int | None) -> Any:
    import onnxruntime

    options = onnxruntime.SessionOptions()
    if threads:
        options.intra_op_num_threads = threads
    return onnxruntime.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])


def measure(run: Callable[[], Any], *, items: int, repeats: int, warmup: int) -> dict[str, Any]:
    for _ in range(warmup):
        run()
    seconds: list[float] = []
    for _ in range(repeats):
        started = time.perf_counter()
        run()
        seconds.append(time.perf_counter() - started)
    ordered = sorted(seconds)

    def percentile(fraction: float) -> float:
        return ordered[min(len(ordered) - 1, max(0, round((len(ordered) - 1) * fraction)))]

    return {
        "items": items,
        "repeats": repeats,
        "p50Ms": percentile(0.5) * 1000,
        "p95Ms": percentile(0.95) * 1000,
        "meanMs": statistics.fmean(seconds) * 1000,
        "itemsPerSecond": items / statistics.fmean(seconds),
    }


def _random_tokens(vocab_size: int, batch: int, length: int) -> dict[str, Any]:
    import numpy

    generator = numpy.random.default_rng(0)
    input_ids = generator.integers(5, vocab_size, size=(batch, length), dtype=numpy.int64)
    return {"input_ids": input_ids, "attention_mask": numpy.ones_like(input_ids)}


def _model_file(directory: Path, quantized: bool) -> Path:
    return directory / ("model.int8.onnx" if quantized else "model.onnx")


def latency(arguments: argparse.Namespace) -> dict[str, Any]:
    """네 요청의 지연. 각 요청이 어디서 생기는지는 본 학습 계획 5.2 엔드포인트 표를 따른다."""
    import numpy
    import onnxruntime

    report: dict[str, Any] = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "machine": {"platform": platform.platform(), "machine": platform.machine(), "cpuCount": os.cpu_count(), "python": platform.python_version(), "onnxruntime": onnxruntime.__version__},
        "threads": arguments.threads,
        "quantized": arguments.quantized,
        "requests": {},
    }
    measure_options = {"repeats": arguments.repeats, "warmup": arguments.warmup}
    if arguments.encoder:
        manifest = json.loads((arguments.encoder / "manifest.json").read_text(encoding="utf-8"))
        session = _session(_model_file(arguments.encoder, arguments.quantized), arguments.threads)
        feed = _random_tokens(manifest["vocabSize"], 1, arguments.profile_tokens)
        report["requests"]["profileEmbedding"] = {
            "model": manifest["model"],
            "sequenceLength": arguments.profile_tokens,
            **measure(lambda: session.run(None, feed), items=1, **measure_options),
        }
    if arguments.mlp:
        manifest = json.loads((arguments.mlp / "manifest.json").read_text(encoding="utf-8"))
        session = _session(arguments.mlp / "model.onnx", arguments.threads)
        features = numpy.random.default_rng(0).standard_normal((arguments.jobs, manifest["embeddingDimension"] * 4)).astype(numpy.float32)
        report["requests"]["screening"] = {
            "model": manifest["model"],
            "jobs": arguments.jobs,
            **measure(lambda: session.run(None, {"features": features}), items=arguments.jobs, **measure_options),
        }
    if arguments.cross:
        manifest = json.loads((arguments.cross / "manifest.json").read_text(encoding="utf-8"))
        session = _session(_model_file(arguments.cross, arguments.quantized), arguments.threads)
        for pairs in arguments.rerank_pairs:
            feed = _random_tokens(manifest["vocabSize"], pairs, arguments.cross_tokens)
            report["requests"][f"rerank{pairs}"] = {
                "model": manifest["model"],
                "pairs": pairs,
                "sequenceLength": arguments.cross_tokens,
                **measure(lambda feed=feed: session.run(None, feed), items=pairs, **measure_options),
            }
        record_tokens = arguments.record_tokens or arguments.cross_tokens
        feed = _random_tokens(manifest["vocabSize"], arguments.records, record_tokens)
        report["requests"]["recordScoring"] = {
            "model": manifest["model"],
            "records": arguments.records,
            "sequenceLength": record_tokens,
            **measure(lambda: session.run(None, feed), items=arguments.records, **measure_options),
        }
    if arguments.output:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    encoder = commands.add_parser("export-encoder")
    encoder.add_argument("--model", required=True)
    encoder.add_argument("--output", type=Path, required=True)
    encoder.add_argument("--quantize", action="store_true")
    mlp = commands.add_parser("export-mlp")
    mlp.add_argument("--checkpoint", type=Path, required=True)
    mlp.add_argument("--output", type=Path, required=True)
    cross = commands.add_parser("export-cross")
    cross.add_argument("--model", required=True)
    cross.add_argument("--checkpoint", type=Path)
    cross.add_argument("--output", type=Path, required=True)
    cross.add_argument("--quantize", action="store_true")
    bench = commands.add_parser("latency")
    bench.add_argument("--encoder", type=Path)
    bench.add_argument("--mlp", type=Path)
    bench.add_argument("--cross", type=Path)
    bench.add_argument("--quantized", action="store_true", help="export --quantize가 만든 INT8 모델로 잰다")
    bench.add_argument("--threads", type=int, help="ONNX Runtime intra-op 스레드. 비우면 Runtime 기본값")
    # 기본값의 출처: 512는 E5 최대 길이(설계서 4.3), 368은 본 학습 계획 3.1의 로컬 공고 수,
    # 1,536은 파일럿 Cross-Encoder 쌍 한도(설계서 4.3), 10은 화면이 보여 주는 상위 10건(NDCG@10),
    # 20은 합성 프로필 스키마의 기록 수 상한이다. 운영 서버에서 잴 때는 운영 값으로 바꾼다.
    bench.add_argument("--profile-tokens", type=int, default=512, help="프로필 1건 임베딩 길이")
    bench.add_argument("--jobs", type=int, default=368, help="스크리닝이 채점할 공고 수")
    bench.add_argument("--cross-tokens", type=int, default=1536, help="재정렬 쌍 길이")
    bench.add_argument("--rerank-pairs", type=int, nargs="+", default=[10], help="재정렬할 상위 K. 여러 값을 주면 각각 잰다")
    bench.add_argument("--records", type=int, default=20, help="모델 B가 채점할 기록 수")
    # 서비스 공고 원문 중앙값이 1,431토큰이라(본 학습 계획 3.2) 기록 1건을 붙이면 쌍 한도에 닿는다.
    bench.add_argument("--record-tokens", type=int, help="(공고, 기록 1건) 쌍 길이. 비우면 --cross-tokens")
    # 100회면 p95 위로 표본 5개가 남는다. 첫 몇 번은 메모리 할당이 섞여 빼고 잰다.
    bench.add_argument("--repeats", type=int, default=100)
    bench.add_argument("--warmup", type=int, default=3)
    bench.add_argument("--output", type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    if arguments.command == "export-encoder":
        result = export_encoder(arguments.model, arguments.output, quantize=arguments.quantize)
    elif arguments.command == "export-mlp":
        result = export_mlp(arguments.checkpoint, arguments.output)
    elif arguments.command == "export-cross":
        result = export_cross(arguments.model, arguments.output, checkpoint=arguments.checkpoint, quantize=arguments.quantize)
    else:
        result = latency(arguments)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
