from __future__ import annotations

import math
from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).parent))

from llm_suitability_train import (
    affine_calibrate,
    build_selected_profile_text,
    cross_encoder_scores,
    freeze_cross_encoder_layers,
    group_pairwise_loss,
    pair_features,
    predict_mlp,
    ranking_metrics,
    render_job,
    render_profile,
    select_top_record_indices,
    train_mlp,
    validate_training_inputs,
)


class LlmSuitabilityTrainTest(unittest.TestCase):
    def test_renderers_keep_user_content_and_exclude_internal_ids(self) -> None:
        profile = {
            "profileId": "internal-profile",
            "experienceYears": 3,
            "split": "train",
            "records": [
                {
                    "recordId": "internal-record",
                    "title": "결제 장애 대응",
                    "properties": {"role": "백엔드", "empty": ""},
                    "bodyMd": "재시도 정책을 고쳐 오류율을 낮췄다.",
                }
            ],
        }
        job = {
            "jobId": "internal-job",
            "split": "train",
            "fields": {
                "job_category": "backend developer",
                "llm_hard_skills": "python;sql",
                "unused": "",
            },
        }

        profile_text = render_profile(profile)
        job_text = render_job(job)

        self.assertEqual(
            profile_text,
            "경력 연차: 3년\n\n[기록 1]\n제목: 결제 장애 대응\nrole: 백엔드\n본문:\n재시도 정책을 고쳐 오류율을 낮췄다.",
        )
        self.assertIn("직무: backend developer", job_text)
        self.assertIn("필수 기술: python;sql", job_text)
        self.assertNotIn("internal-profile", profile_text)
        self.assertNotIn("internal-record", profile_text)
        self.assertNotIn("internal-job", job_text)

    def test_training_input_validation_requires_exact_candidate_coverage(self) -> None:
        profiles = [
            {"profileId": "p1", "split": "train", "records": [], "experienceYears": 0},
            {"profileId": "p2", "split": "test", "records": [], "experienceYears": 0},
        ]
        jobs = [
            {"jobId": "j1", "split": "train", "fields": {}},
            {"jobId": "j2", "split": "test", "fields": {}},
        ]
        candidates = [
            {"profileId": "p1", "jobId": "j1", "split": "train", "candidateBucket": "role"},
            {"profileId": "p2", "jobId": "j2", "split": "test", "candidateBucket": "random"},
        ]
        labels = [
            {"profileId": "p1", "jobId": "j1", "split": "train", "matchScore": 10},
            {"profileId": "p2", "jobId": "j2", "split": "test", "matchScore": 90},
        ]

        result = validate_training_inputs(profiles, jobs, candidates, labels)
        self.assertEqual(result, {"profiles": 2, "jobs": 2, "pairs": 2})

        with self.assertRaisesRegex(ValueError, "candidate and label pairs differ"):
            validate_training_inputs(profiles, jobs, candidates, labels[:-1])

    def test_ranking_metrics_are_perfect_for_exact_predictions(self) -> None:
        rows = [
            {"profileId": "p1", "target": 90, "prediction": 90},
            {"profileId": "p1", "target": 60, "prediction": 60},
            {"profileId": "p1", "target": 20, "prediction": 20},
            {"profileId": "p2", "target": 50, "prediction": 50},
            {"profileId": "p2", "target": 10, "prediction": 10},
        ]

        result = ranking_metrics(rows, relevance_threshold=60)

        self.assertEqual(result["mae"], 0.0)
        self.assertEqual(result["rmse"], 0.0)
        self.assertAlmostEqual(result["spearman"], 1.0)
        self.assertAlmostEqual(result["ndcgAt10"], 1.0)
        self.assertAlmostEqual(result["pairwiseAccuracy"], 1.0)
        self.assertAlmostEqual(result["mapAt10"], 1.0)
        self.assertAlmostEqual(result["mrrAt10"], 1.0)
        self.assertEqual(result["profilesWithRelevant"], 1)

    def test_record_selection_is_similarity_sorted_and_stable(self) -> None:
        import torch

        records = torch.tensor(
            [
                [1.0, 0.0],
                [0.0, 1.0],
                [0.8, 0.2],
                [1.0, 0.0],
            ]
        )
        job = torch.tensor([1.0, 0.0])

        self.assertEqual(select_top_record_indices(records, job, limit=3), [0, 3, 2])

    def test_pairwise_loss_prefers_the_higher_teacher_score(self) -> None:
        import torch

        targets = torch.tensor([90.0, 20.0, 50.0])
        groups = torch.tensor([0, 0, 1])
        correct = torch.tensor([3.0, -3.0, 0.0])
        reversed_order = torch.tensor([-3.0, 3.0, 0.0])

        correct_loss = group_pairwise_loss(correct, targets, groups, min_delta=5.0)
        reversed_loss = group_pairwise_loss(reversed_order, targets, groups, min_delta=5.0)

        self.assertTrue(math.isfinite(float(correct_loss)))
        self.assertLess(float(correct_loss), float(reversed_loss))

    def test_cross_encoder_input_contains_only_selected_records(self) -> None:
        profile = {
            "experienceYears": 2,
            "records": [
                {"title": "첫 기록", "properties": {}, "bodyMd": "포함하지 않음"},
                {"title": "둘째 기록", "properties": {}, "bodyMd": "선택된 본문"},
                {"title": "셋째 기록", "properties": {}, "bodyMd": "함께 선택"},
            ],
        }

        text = build_selected_profile_text(profile, [2, 1])

        self.assertIn("셋째 기록", text)
        self.assertIn("둘째 기록", text)
        self.assertNotIn("첫 기록", text)
        self.assertLess(text.index("셋째 기록"), text.index("둘째 기록"))

    def test_pair_features_match_profile_job_difference_and_product_contract(self) -> None:
        import torch

        profile = torch.tensor([[1.0, 2.0]])
        job = torch.tensor([[3.0, 5.0]])

        actual = pair_features(profile, job)

        expected = torch.tensor([[1.0, 2.0, 3.0, 5.0, 2.0, 3.0, 3.0, 10.0]])
        self.assertTrue(torch.equal(actual, expected))

    def test_affine_calibration_uses_training_relation_and_clips_output(self) -> None:
        calibrated = affine_calibrate(
            train_scores=[0.0, 0.5, 1.0],
            train_targets=[0.0, 50.0, 100.0],
            evaluation_scores=[-1.0, 0.25, 2.0],
        )

        self.assertEqual(calibrated, [0.0, 25.0, 100.0])

    def test_mlp_training_learns_toy_score_order_and_zero_to_hundred_output(self) -> None:
        import torch

        features = torch.tensor([[0.0], [1.0], [2.0], [3.0]])
        targets = torch.tensor([0.0, 30.0, 70.0, 100.0])
        groups = torch.tensor([0, 0, 0, 0])

        model, history = train_mlp(
            features,
            targets,
            groups,
            features,
            targets,
            hidden_dimension=8,
            epochs=120,
            learning_rate=0.05,
            profile_batch_size=1,
            patience=30,
            seed=7,
            device="cpu",
        )
        predictions = predict_mlp(model, features, device="cpu")

        self.assertGreaterEqual(history["bestEpoch"], 1)
        self.assertTrue(torch.all((0 <= predictions) & (predictions <= 100)))
        self.assertTrue(torch.all(predictions[1:] > predictions[:-1]))
        self.assertLess(float(torch.mean(torch.abs(predictions - targets))), 15.0)

    def test_cross_encoder_logits_map_to_zero_to_hundred(self) -> None:
        import torch

        actual = cross_encoder_scores(torch.tensor([-100.0, 0.0, 100.0]))

        self.assertAlmostEqual(float(actual[0]), 0.0, places=4)
        self.assertAlmostEqual(float(actual[1]), 50.0, places=4)
        self.assertAlmostEqual(float(actual[2]), 100.0, places=4)

    def test_cross_encoder_freezes_base_except_last_layers_and_classifier(self) -> None:
        import torch

        class FakeBackbone(torch.nn.Module):
            def __init__(self) -> None:
                super().__init__()
                self.embeddings = torch.nn.Linear(2, 2)
                self.encoder = torch.nn.Module()
                self.encoder.layer = torch.nn.ModuleList(
                    [torch.nn.Linear(2, 2) for _ in range(4)]
                )

        class FakeModel(torch.nn.Module):
            def __init__(self) -> None:
                super().__init__()
                self.roberta = FakeBackbone()
                self.classifier = torch.nn.Linear(2, 1)

        model = FakeModel()
        result = freeze_cross_encoder_layers(model, train_last_layers=2)
        trainable = {name for name, value in model.named_parameters() if value.requires_grad}

        self.assertTrue(all(name.startswith(("roberta.encoder.layer.2", "roberta.encoder.layer.3", "classifier")) for name in trainable))
        self.assertFalse(model.roberta.embeddings.weight.requires_grad)
        self.assertGreater(result["trainableParameters"], 0)
        self.assertLess(result["trainableParameters"], result["totalParameters"])


if __name__ == "__main__":
    unittest.main()
