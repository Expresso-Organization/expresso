"""코드로 만든 작은 무작위 XLM-R로 ONNX 내보내기 · 출력 일치 · 지연 측정을 시험한다. 다운로드하지 않는다."""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest


sys.path.insert(0, str(Path(__file__).parent))

import match_onnx  # noqa: E402
import numpy  # noqa: E402
import onnxruntime  # noqa: E402
import torch  # noqa: E402
from llm_suitability_train import _create_mlp, _mlp_scores, cross_encoder_scores  # noqa: E402
from transformers import Qwen3Config, Qwen3Model, XLMRobertaConfig, XLMRobertaForSequenceClassification, XLMRobertaModel  # noqa: E402


def tiny_config(**extra):
    return XLMRobertaConfig(vocab_size=120, hidden_size=32, num_hidden_layers=2, num_attention_heads=2, intermediate_size=64, max_position_embeddings=80, **extra)


class OnnxExportTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        torch.manual_seed(0)

    def tearDown(self) -> None:
        self.directory.cleanup()

    def test_encoder_matches_torch_and_quantizes(self) -> None:
        model = XLMRobertaModel(tiny_config())
        model.save_pretrained(self.root / "encoder-src")
        output = self.root / "encoder"
        manifest = match_onnx.export_encoder(str(self.root / "encoder-src"), output, quantize=True)
        self.assertEqual(manifest["files"], ["model.int8.onnx", "model.onnx"])
        feed = match_onnx._random_tokens(manifest["vocabSize"], 3, 17)
        actual = onnxruntime.InferenceSession(str(output / "model.onnx")).run(None, feed)[0]
        with torch.no_grad():
            expected = model.eval()(input_ids=torch.from_numpy(feed["input_ids"]), attention_mask=torch.from_numpy(feed["attention_mask"])).last_hidden_state.numpy()
        numpy.testing.assert_allclose(actual, expected, atol=1e-4)
        self.assertEqual(onnxruntime.InferenceSession(str(output / "model.int8.onnx")).run(None, feed)[0].shape, expected.shape)

    def test_decoder_encoder_is_refused_with_reason(self) -> None:
        # Qwen3-Embedding은 디코더다. 길이가 고정된 그래프를 조용히 내보내지 않고 이유와 함께 멈춘다.
        config = Qwen3Config(vocab_size=120, hidden_size=32, intermediate_size=64, num_hidden_layers=2, num_attention_heads=4, num_key_value_heads=2, head_dim=8, max_position_embeddings=128)
        Qwen3Model(config).save_pretrained(self.root / "qwen-src")
        with self.assertRaisesRegex(ValueError, "디코더"):
            match_onnx.export_encoder(str(self.root / "qwen-src"), self.root / "qwen", quantize=False)

    def test_cli_runs_from_script_directory(self) -> None:
        # 같은 폴더의 profile.py가 표준 profile을 가리면 transformers import가 실패한다.
        # 시험 모듈은 llm_suitability_train을 먼저 불러 가림이 풀려 있으므로 새 프로세스로 확인한다.
        import subprocess

        XLMRobertaModel(tiny_config()).save_pretrained(self.root / "encoder-src")
        result = subprocess.run(
            [sys.executable, "match_onnx.py", "export-encoder", "--model", str(self.root / "encoder-src"), "--output", str(self.root / "cli")],
            cwd=Path(__file__).parent,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr[-2000:])
        self.assertTrue((self.root / "cli" / "model.onnx").exists())

    def test_cross_loads_trained_layers_and_matches_score_contract(self) -> None:
        base = XLMRobertaForSequenceClassification(tiny_config(num_labels=1))
        base.save_pretrained(self.root / "cross-src")
        trained = XLMRobertaForSequenceClassification(tiny_config(num_labels=1))
        names = [name for name in trained.state_dict() if name.startswith("classifier.")]
        checkpoint = self.root / "trainable-state.pt"
        torch.save({"model": "tiny-cross", "trainableState": {name: trained.state_dict()[name] for name in names}}, checkpoint)
        output = self.root / "cross"
        manifest = match_onnx.export_cross(str(self.root / "cross-src"), output, checkpoint=checkpoint, quantize=False)
        self.assertEqual(manifest["model"], "tiny-cross")
        feed = match_onnx._random_tokens(manifest["vocabSize"], 4, 21)
        actual = onnxruntime.InferenceSession(str(output / "model.onnx")).run(None, feed)[0]
        state = base.state_dict()
        state.update({name: trained.state_dict()[name] for name in names})
        base.load_state_dict(state)
        with torch.no_grad():
            logits = base.eval()(input_ids=torch.from_numpy(feed["input_ids"]), attention_mask=torch.from_numpy(feed["attention_mask"])).logits
        numpy.testing.assert_allclose(actual, cross_encoder_scores(logits).numpy(), atol=1e-3)

    def test_mlp_matches_training_scores(self) -> None:
        mlp = _create_mlp(8 * 4, 4, 0)
        checkpoint = self.root / "checkpoint.pt"
        torch.save({"model": "tiny-mlp", "state": mlp.state_dict(), "embeddingDimension": 8, "hiddenDimension": 4}, checkpoint)
        output = self.root / "mlp"
        match_onnx.export_mlp(checkpoint, output)
        features = torch.randn(5, 32)
        actual = onnxruntime.InferenceSession(str(output / "model.onnx")).run(None, {"features": features.numpy()})[0]
        with torch.no_grad():
            numpy.testing.assert_allclose(actual, _mlp_scores(mlp.eval(), features).numpy(), atol=1e-4)

    def test_latency_reports_percentiles_for_each_request(self) -> None:
        XLMRobertaModel(tiny_config()).save_pretrained(self.root / "encoder-src")
        XLMRobertaForSequenceClassification(tiny_config(num_labels=1)).save_pretrained(self.root / "cross-src")
        torch.save({"model": "tiny-mlp", "state": _create_mlp(32 * 4, 4, 0).state_dict(), "embeddingDimension": 32, "hiddenDimension": 4}, self.root / "checkpoint.pt")
        match_onnx.main(["export-encoder", "--model", str(self.root / "encoder-src"), "--output", str(self.root / "encoder")])
        match_onnx.main(["export-mlp", "--checkpoint", str(self.root / "checkpoint.pt"), "--output", str(self.root / "mlp")])
        match_onnx.main(["export-cross", "--model", str(self.root / "cross-src"), "--output", str(self.root / "cross")])
        report = match_onnx.latency(
            match_onnx.build_parser().parse_args(
                [
                    "latency",
                    "--encoder", str(self.root / "encoder"),
                    "--mlp", str(self.root / "mlp"),
                    "--cross", str(self.root / "cross"),
                    "--profile-tokens", "40", "--cross-tokens", "60", "--rerank-pairs", "2", "5",
                    "--jobs", "50", "--records", "3", "--repeats", "5", "--warmup", "1", "--threads", "1",
                ]
            )
        )
        self.assertEqual(set(report["requests"]), {"profileEmbedding", "screening", "rerank2", "rerank5", "recordScoring"})
        for request in report["requests"].values():
            self.assertLessEqual(request["p50Ms"], request["p95Ms"])
            self.assertGreater(request["itemsPerSecond"], 0)
        self.assertEqual(report["requests"]["recordScoring"]["sequenceLength"], 60)


if __name__ == "__main__":
    unittest.main()
