import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

try:
    import torch
except ImportError:  # pragma: no cover - 가벼운 환경에서는 torch 의존 테스트를 건너뜁니다.
    torch = None


@unittest.skipIf(torch is None, "torch is required for model fixtures")
class MatchPilotModelTest(unittest.TestCase):
    def setUp(self):
        from match_pilot_model import FrozenE5Encoder

        self.encoder = FrozenE5Encoder(
            tokenizer=FakeTokenizer(),
            model=FakeEncoder(),
            device="cpu",
            model_revision="fixture-revision",
        )

    def test_embeddings_prefix_text_mean_pool_and_normalize(self):
        profile, job = self.encoder.embed_profiles(["개발자"]), self.encoder.embed_jobs(["backend"])

        self.assertEqual(self.encoder.tokenizer.calls, [["query: 개발자"], ["passage: backend"]])
        self.assertEqual(tuple(profile.shape), (1, 4))
        self.assertTrue(torch.allclose(torch.linalg.vector_norm(profile, dim=1), torch.tensor([1.0])))
        self.assertTrue(torch.allclose(torch.linalg.vector_norm(job, dim=1), torch.tensor([1.0])))
        self.assertTrue(torch.allclose(profile, torch.tensor([[1 / 5**0.5, 2 / 5**0.5, 0.0, 0.0]])))
        self.assertTrue(all(not parameter.requires_grad for parameter in self.encoder.model.parameters()))
        self.assertFalse(self.encoder.model.training)

    def test_ranker_training_checkpoint_and_scores_are_deterministic(self):
        from match_pilot_model import (
            create_ranker,
            frozen_e5_cosine_scores,
            load_checkpoint,
            score_candidates,
            train_ranker,
            write_candidate_scores,
        )

        profile_embeddings = torch.tensor([[1.0, 0.0], [0.0, 1.0]])
        job_embeddings = torch.tensor([[1.0, 0.0], [0.0, 1.0]])
        labels = torch.tensor([3.0, 0.0])
        first = create_ranker(embedding_dimension=2, hidden_dimension=4, seed=42)
        second = create_ranker(embedding_dimension=2, hidden_dimension=4, seed=42)
        train_ranker(first, profile_embeddings, job_embeddings, labels, epochs=4, learning_rate=0.05)
        train_ranker(second, profile_embeddings, job_embeddings, labels, epochs=4, learning_rate=0.05)

        first_scores = score_candidates(first, profile_embeddings, job_embeddings)
        second_scores = score_candidates(second, profile_embeddings, job_embeddings)
        self.assertTrue(torch.allclose(first_scores, second_scores))
        self.assertTrue(
            torch.allclose(
                frozen_e5_cosine_scores(
                    profile_embeddings,
                    torch.tensor([[1.0, 0.0], [1.0, 0.0]]),
                ),
                torch.tensor([1.0, 0.0]),
            )
        )

        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "ranker.pt"
            torch.save({"state": first.state_dict(), "embeddingDimension": 2}, checkpoint)
            restored = load_checkpoint(checkpoint, embedding_dimension=2, hidden_dimension=4)
            self.assertTrue(torch.allclose(first_scores, score_candidates(restored, profile_embeddings, job_embeddings)))

            output = Path(directory) / "candidate-scores.jsonl"
            write_candidate_scores(
                output,
                model="match-pilot-mlp-v1",
                pairs=[("p-1", "j-1"), ("p-2", "j-2")],
                scores=first_scores,
            )
            rows = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(
                rows,
                [
                    {"model": "match-pilot-mlp-v1", "profileId": "p-1", "jobId": "j-1", "score": first_scores[0].item()},
                    {"model": "match-pilot-mlp-v1", "profileId": "p-2", "jobId": "j-2", "score": first_scores[1].item()},
                ],
            )

    def test_cuda_required_mode_rejects_cpu(self):
        from match_pilot_model import require_device

        with self.assertRaisesRegex(RuntimeError, "CUDA is required"):
            require_device(torch, require_cuda=True, cuda_available=False)

    def test_default_model_revision_is_pinned(self):
        from match_pilot_model import build_parser

        arguments = build_parser().parse_args(
            ["--jth-pairs", "jth.jsonl", "--profiles", "profiles.jsonl", "--jobs", "jobs.jsonl", "--labels", "labels.jsonl"]
        )

        self.assertEqual(arguments.model_revision, "d128750597153bb5987e10b1c3493a34e5a4502a")

    def test_run_writes_validated_full_score_sets_for_e5_and_mlp(self):
        from match_pilot_model import FrozenE5Encoder, build_parser, run
        from ranking_evaluation import validate_dataset

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            jth_pairs = root / "jth-pairs.jsonl"
            profiles = root / "profiles.jsonl"
            jobs = root / "jobs.jsonl"
            labels = root / "labels.jsonl"
            self._write_jsonl(
                jth_pairs,
                [
                    {"profileId": "jp-1", "profileText": "engineer", "jobId": "jj-1", "jobText": "backend", "label": 3, "split": "train"},
                    {"profileId": "jp-2", "profileText": "designer", "jobId": "jj-2", "jobText": "design", "label": 0, "split": "train"},
                ],
            )
            self._write_jsonl(
                profiles,
                [
                    {"profileId": "p-1", "text": "python", "split": "train", "sourceAtomIds": ["a-1"]},
                    {"profileId": "p-2", "text": "java", "split": "valid", "sourceAtomIds": ["a-2"]},
                    {"profileId": "p-3", "text": "go", "split": "test", "sourceAtomIds": ["a-3"]},
                ],
            )
            self._write_jsonl(
                jobs,
                [
                    {"jobId": "j-1", "text": "python", "split": "train", "duplicateGroupId": "g-1"},
                    {"jobId": "j-2", "text": "typescript", "split": "train", "duplicateGroupId": "g-2"},
                    {"jobId": "j-v1", "text": "java", "split": "valid", "duplicateGroupId": "g-v1"},
                    {"jobId": "j-v2", "text": "kotlin", "split": "valid", "duplicateGroupId": "g-v2"},
                    {"jobId": "j-t1", "text": "go", "split": "test", "duplicateGroupId": "g-t1"},
                    {"jobId": "j-t2", "text": "rust", "split": "test", "duplicateGroupId": "g-t2"},
                ],
            )
            self._write_jsonl(
                labels,
                [
                    {"profileId": "p-1", "jobId": "j-1", "split": "train", "teacherLabel": 3, "humanLabel": None, "reasonCodes": ["FIXTURE"]},
                    {"profileId": "p-1", "jobId": "j-2", "split": "train", "teacherLabel": 0, "humanLabel": None, "reasonCodes": ["FIXTURE"]},
                    {"profileId": "p-2", "jobId": "j-v1", "split": "valid", "teacherLabel": 2, "humanLabel": None, "reasonCodes": ["FIXTURE"]},
                    {"profileId": "p-2", "jobId": "j-v2", "split": "valid", "teacherLabel": 0, "humanLabel": None, "reasonCodes": ["FIXTURE"]},
                    {"profileId": "p-3", "jobId": "j-t1", "split": "test", "teacherLabel": 1, "humanLabel": None, "reasonCodes": ["FIXTURE"]},
                    {"profileId": "p-3", "jobId": "j-t2", "split": "test", "teacherLabel": 3, "humanLabel": None, "reasonCodes": ["FIXTURE"]},
                ],
            )
            arguments = build_parser().parse_args(
                ["--jth-pairs", str(jth_pairs), "--profiles", str(profiles), "--jobs", str(jobs), "--labels", str(labels), "--output", str(root / "output"), "--pretrain-epochs", "1", "--fine-tune-epochs", "1", "--hidden-dimension", "4"]
            )
            with patch.object(FrozenE5Encoder, "from_pretrained", return_value=self.encoder):
                result = run(arguments)

            self.assertTrue(result["checkpoint"].is_file())
            score_rows = [json.loads(line) for line in result["candidateScores"].read_text(encoding="utf-8").splitlines()]
            self.assertEqual(
                {row["model"] for row in score_rows},
                {"frozen-e5-cosine-v1", "match-pilot-mlp-v1"},
            )
            self.assertEqual(
                {model: sum(row["model"] == model for row in score_rows) for model in {row["model"] for row in score_rows}},
                {"frozen-e5-cosine-v1": 6, "match-pilot-mlp-v1": 6},
            )
            validate_dataset(
                [json.loads(line) for line in profiles.read_text(encoding="utf-8").splitlines()],
                [json.loads(line) for line in jobs.read_text(encoding="utf-8").splitlines()],
                [json.loads(line) for line in labels.read_text(encoding="utf-8").splitlines()],
                score_rows,
            )
            manifest = json.loads(result["manifest"].read_text(encoding="utf-8"))
            self.assertEqual(manifest["model"], {"name": "intfloat/multilingual-e5-base", "revision": "fixture-revision", "frozen": True})
            self.assertEqual(manifest["counts"], {"jthPretrainPairs": 2, "expressoFineTunePairs": 2, "candidateScores": 12})

    @staticmethod
    def _write_jsonl(path, rows):
        path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


class FakeTokenizer:
    def __init__(self):
        self.calls = []

    def __call__(self, texts, **_kwargs):
        self.calls.append(list(texts))
        return {
            "input_ids": torch.tensor([[1, 2, 0]] * len(texts)),
            "attention_mask": torch.tensor([[1, 1, 0]] * len(texts)),
        }


if torch is None:
    class FakeEncoder:
        pass
else:
    class FakeEncoder(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.weight = torch.nn.Parameter(torch.ones(1))

        def forward(self, input_ids, attention_mask):
            batch = input_ids.shape[0]
            hidden = torch.tensor(
                [[[1.0, 0.0, 0.0, 0.0], [0.0, 2.0, 0.0, 0.0], [9.0, 9.0, 9.0, 9.0]]]
                * batch
            )
            return type("Output", (), {"last_hidden_state": hidden})()


if __name__ == "__main__":
    unittest.main()
