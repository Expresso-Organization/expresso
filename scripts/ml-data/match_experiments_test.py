"""가짜 인코더 · 가짜 Cross-Encoder · 작은 데이터로 실험 명령을 끝까지 돌린다.

규칙 baseline은 실제 서비스 TS 함수를 Node로 부른다. 먼저 `pnpm --filter "@expresso/contracts..." build`.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).parent))

import match_experiments  # noqa: E402  (llm_suitability_train이 표준 profile 가림을 먼저 푼다)
import torch  # noqa: E402
from llm_suitability_train import CROSS_ENCODER_ID  # noqa: E402
from match_encoders import ENCODERS, EncoderSpec, SentenceEncoder, choose_max_length  # noqa: E402
from match_fixture import SKILLS, SPLITS, write_dataset  # noqa: E402


DIMENSION = 1024  # 1,024차원 인코더(KURE · bge-m3 · Qwen3)와 같은 크기로 파일럿 함수를 시험한다.
FAKE = EncoderSpec("fake", "fake/model", "q: ", "", 64)


class FakeTokenizer:
    def __call__(self, text: str, add_special_tokens: bool = True) -> dict[str, list[int]]:
        return {"input_ids": [0] * (len(text.split()) + 2)}


class FakeSentenceTransformer:
    def __init__(self, *, fail_above: int | None = None) -> None:
        self.tokenizer = FakeTokenizer()
        self.max_seq_length = 0
        self.fail_above = fail_above
        self.calls: list[tuple[str | None, int]] = []

    def encode(self, texts, prompt=None, batch_size=32, convert_to_tensor=True, normalize_embeddings=True, show_progress_bar=False):
        self.calls.append((prompt, batch_size))
        if self.fail_above is not None and batch_size > self.fail_above:
            raise torch.OutOfMemoryError("fake")
        rows = []
        for text in texts:
            seed = int(hashlib.sha256(((prompt or "") + text).encode("utf-8")).hexdigest()[:8], 16)
            rows.append(torch.randn(DIMENSION, generator=torch.Generator().manual_seed(seed)))
        return torch.nn.functional.normalize(torch.stack(rows), dim=1)


def fake_load(spec, *, device, batch_size, max_length, model_path=None):
    return SentenceEncoder(spec, FakeSentenceTransformer(), device=device, batch_size=batch_size, max_length=max_length)


def fake_cross(*_args, **_kwargs):
    def score(rows):
        return [float(len(row["profileText"]) % 13) for row in rows], {"maxLength": 0}

    return score, {"model": CROSS_ENCODER_ID, "maxLength": 0}


class SentenceEncoderTest(unittest.TestCase):
    def test_prompts_follow_spec_and_lengths_come_from_data(self) -> None:
        model = FakeSentenceTransformer()
        encoder = SentenceEncoder(FAKE, model, device="cpu", batch_size=4, max_length=64)
        encoder.embed_profiles(["a b"])
        encoder.embed_jobs(["c"])
        self.assertEqual([call[0] for call in model.calls], ["q: ", None])
        self.assertEqual(choose_max_length(FAKE, [10, 30]), 30)
        self.assertEqual(choose_max_length(FAKE, [10, 300]), 64)

    def test_out_of_memory_halves_batch(self) -> None:
        model = FakeSentenceTransformer(fail_above=8)
        encoder = SentenceEncoder(FAKE, model, device="cpu", batch_size=32, max_length=64)
        vectors = encoder.embed_jobs(["a", "b"])
        self.assertEqual(tuple(vectors.shape), (2, DIMENSION))
        self.assertEqual([call[1] for call in model.calls], [32, 16, 8])
        self.assertEqual(encoder.runs[-1]["batchSize"], 8)
        self.assertEqual(encoder.runs[-1]["vectorBytes"], 2 * DIMENSION * 4)

    def test_cache_identity_changes_with_max_length(self) -> None:
        self.assertNotEqual(FAKE.cache_identity(32), FAKE.cache_identity(64))
        self.assertNotEqual(ENCODERS["e5"].cache_identity(512), ENCODERS["kure"].cache_identity(512))


class ExperimentCommandTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        self.data, self.labels, self.pairs = write_dataset(root)
        self.output = root / "runs"
        patches = [
            patch.dict(ENCODERS, {"fake": FAKE}),
            patch.object(SentenceEncoder, "load", side_effect=fake_load),
            patch.object(match_experiments, "load_cross_scorer", side_effect=fake_cross),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

    def tearDown(self) -> None:
        self.directory.cleanup()

    def common(self) -> list[str]:
        return ["--data", str(self.data), "--labels", str(self.labels), "--output", str(self.output), "--device", "cpu", "--mlp-epochs", "3", "--mlp-patience", "2"]

    def test_encoder_comparison_reads_only_valid_split(self) -> None:
        match_experiments.main(["encoders", *self.common(), "--encoders", "fake"])
        report = json.loads((self.output / "encoder-comparison.json").read_text(encoding="utf-8"))
        row = report["rows"]["fake"]
        self.assertEqual(report["split"], "valid")
        self.assertEqual(row["embeddingDimension"], DIMENSION)
        self.assertEqual(row["mlp"]["pairs"], SPLITS["valid"] * len(SKILLS))
        self.assertIn("pairwiseMinGap5", row["mlp"])
        self.assertNotIn("points", row["mlp"]["roc"])
        self.assertNotIn("test", json.dumps(report))

    def test_train_bi_writes_versioned_design_doc_artifacts(self) -> None:
        match_experiments.main(["train-bi", *self.common(), "--encoder", "fake"])
        directory = self.output / "bi-v1-001"
        metrics = json.loads((directory / "metrics.json").read_text(encoding="utf-8"))
        metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
        model = "expresso-fake-mlp-v1"
        self.assertEqual(set(metrics["models"]), {model, "frozen-cosine", "word_tfidf", "char_tfidf", "bm25", match_experiments.RULE_MODEL})
        test = metrics["models"][model]["test"]
        self.assertEqual(test["pairs"], SPLITS["test"] * len(SKILLS))
        self.assertTrue(test["roc"]["points"])
        self.assertIsNotNone(test["roc"]["auc"])
        rule = metrics["models"][match_experiments.RULE_MODEL]["test"]
        self.assertEqual(rule["nullPredictions"], 0)
        screening = metrics["screeningRecall"]
        self.assertEqual(screening["pool"], {"profiles": SPLITS["test"], "jobs": len(SKILLS)})
        self.assertEqual(len(screening["mlp"]["recallAtK"]), len(SKILLS))
        self.assertEqual(screening["mlp"]["recallAtK"][-1], 1.0)
        self.assertIn(f"{model} - {match_experiments.RULE_MODEL}", metrics["comparisons"])
        self.assertEqual(metadata["version"], "bi-v1-001")
        self.assertEqual(metadata["teacherModels"], {"fake-teacher": len(self.pairs)})
        self.assertTrue((directory / "checkpoint.pt").exists())
        match_experiments.main(["train-bi", *self.common(), "--encoder", "fake"])
        self.assertTrue((self.output / "bi-v1-002" / "metrics.json").exists())

    def test_train_bi_after_encoders_keeps_embedding_measurements(self) -> None:
        match_experiments.main(["encoders", *self.common(), "--encoders", "fake"])
        match_experiments.main(["train-bi", *self.common(), "--encoder", "fake"])
        embedding = json.loads((self.output / "bi-v1-001" / "metrics.json").read_text(encoding="utf-8"))["embedding"]
        self.assertEqual(embedding["source"], "encoder-comparison.json")
        self.assertEqual([run["role"] for run in embedding["runs"]], ["profile", "job"])

    def test_eval_cross_reports_model_a_and_model_b(self) -> None:
        scores = self.output / "pilot-cross" / "scores.jsonl"
        scores.parent.mkdir(parents=True)
        scores.write_text(
            "".join(json.dumps({"model": CROSS_ENCODER_ID, "profileId": p, "jobId": j, "prediction": float(len(p + j) % 50)}) + "\n" for p, j in self.pairs),
            encoding="utf-8",
        )
        match_experiments.main(["eval-cross", *self.common(), "--encoder", "fake", "--cross-scores", str(scores), "--cross-checkpoint", str(scores.parent / "trainable-state.pt")])
        metrics = json.loads((self.output / "cross-v1-001" / "metrics.json").read_text(encoding="utf-8"))
        self.assertIsNotNone(metrics["modelA"][CROSS_ENCODER_ID]["test"]["roc"]["auc"])
        model_b = metrics["modelB"]["test"]
        self.assertEqual(model_b["pairs"], SPLITS["test"] * len(SKILLS))
        self.assertEqual(model_b["records"], SPLITS["test"] * len(SKILLS) * len(SKILLS))
        for name in (CROSS_ENCODER_ID, "frozen-cosine", match_experiments.RULE_MATERIALS):
            self.assertIsNotNone(model_b["models"][name]["ndcg"])
            self.assertEqual(model_b["models"][name]["pairs"], SPLITS["test"] * len(SKILLS))
        # 규칙 함수는 공고 기술과 같은 낱말이 든 기록(교사가 연결한 기록)을 맨 위에 둔다.
        self.assertEqual(model_b["models"][match_experiments.RULE_MATERIALS]["ndcg"], 1.0)

    def test_eval_cross_reads_api_scores_for_model_a_and_b(self) -> None:
        import match_api_scorer
        from match_api_scorer_test import FakeTransport

        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}):
            match_api_scorer.run(
                match_api_scorer.build_parser().parse_args(["--provider", "decisions", "--data", str(self.data), "--labels", str(self.labels), "--output", str(self.output)]),
                transport=FakeTransport(refuse="record_2"),
                sleep=lambda _: None,
            )
        api_dir = self.output / "api-decisions"
        match_experiments.main(
            [
                "eval-cross", *self.common(), "--encoder", "fake",
                "--cross-scores", str(api_dir / "scores.jsonl"),
                "--record-scores", str(api_dir / "record-scores.jsonl"),
                "--cross-model-name", "decisions-gpt-6-luna",
            ]
        )
        metrics = json.loads((self.output / "cross-v1-001" / "metrics.json").read_text(encoding="utf-8"))
        model_a = metrics["modelA"]["decisions-gpt-6-luna"]
        self.assertEqual(model_a["test"]["pairs"], SPLITS["test"] * len(SKILLS))
        self.assertEqual(set(model_a["testByLabelSource"]), {"fake-teacher"})
        model_b = metrics["modelB"]["test"]["models"]["decisions-gpt-6-luna"]
        # 기록 3건 중 하나를 거절했으므로 모든 쌍이 평가에서 빠지고 그 수가 남는다.
        self.assertEqual((model_b["pairs"], model_b["unscoredPairs"]), (0, SPLITS["test"] * len(SKILLS)))
        self.assertIsNone(metrics["crossEncoder"].get("maxLength"))

    def test_token_stats_needs_no_model_weights(self) -> None:
        with patch("transformers.AutoTokenizer.from_pretrained", return_value=FakeTokenizer()):
            match_experiments.main(["token-stats", *self.common(), "--encoders", "fake"])
        report = json.loads((self.output / "token-stats.json").read_text(encoding="utf-8"))
        self.assertLessEqual(report["encoders"]["fake"]["profiles"]["maxLength"], FAKE.model_limit)


if __name__ == "__main__":
    unittest.main()
