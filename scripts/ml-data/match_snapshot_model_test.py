"""519개 스냅샷 적합도 모델의 출력 계약 테스트."""

from __future__ import annotations

import unittest
from pathlib import Path
import tempfile

try:
    import torch
except ImportError:
    torch = None

from match_snapshot_model import (
    _pair_tensors,
    OUTPUT_CONTRACT,
    MODEL_ID,
    create_suitability_ranker,
    load_suitability_checkpoint,
    raw_scores_to_suitability,
    score_suitability_candidates,
    select_lineage_clean_weak_rows,
    validate_hidden_dimension,
    validate_data_manifest,
    validate_snapshot_dataset,
)


@unittest.skipIf(torch is None, "torch is required")
class MatchSnapshotModelTest(unittest.TestCase):
    def test_public_output_is_one_clamped_zero_to_one_hundred_score(self) -> None:
        scores = raw_scores_to_suitability(torch.tensor([-1.0, 0.0, 1.5, 3.0, 4.0]))

        self.assertTrue(torch.equal(scores, torch.tensor([0.0, 0.0, 50.0, 100.0, 100.0])))

    def test_pair_targets_convert_public_score_to_internal_regression_scale(self) -> None:
        vectors = {"p": torch.tensor([1.0, 0.0]), "j0": torch.tensor([1.0, 0.0]), "j1": torch.tensor([0.0, 1.0])}
        rows = [
            {"profileId": "p", "jobId": "j0", "suitabilityScore": 0},
            {"profileId": "p", "jobId": "j1", "suitabilityScore": 100},
        ]

        _, _, targets = _pair_tensors(rows, {"p": vectors["p"]}, {"j0": vectors["j0"], "j1": vectors["j1"]}, score_field="suitabilityScore")

        self.assertTrue(torch.equal(targets, torch.tensor([0.0, 3.0])))

    def test_dataset_validation_rejects_duplicate_or_cross_split_pairs(self) -> None:
        profiles = [
            {"profileId": "p", "text": "profile", "split": "train", "sourceAtomIds": ["family:a"]},
            {"profileId": "v", "text": "valid", "split": "valid", "sourceAtomIds": ["family:b"]},
            {"profileId": "t", "text": "test", "split": "test", "sourceAtomIds": ["family:c"]},
        ]
        jobs = [
            {"jobId": "j", "text": "job", "split": "train", "duplicateGroupId": "j"},
            {"jobId": "v1", "text": "valid1", "split": "valid", "duplicateGroupId": "v1"},
            {"jobId": "v2", "text": "valid2", "split": "valid", "duplicateGroupId": "v2"},
            {"jobId": "t1", "text": "test1", "split": "test", "duplicateGroupId": "t1"},
            {"jobId": "t2", "text": "test2", "split": "test", "duplicateGroupId": "t2"},
        ]
        labels = [
            {"profileId": "p", "jobId": "j", "split": "valid", "suitabilityScore": 50, "labelSource": "structured-weak-label-v1", "reasonCodes": ["X"]},
            {"profileId": "p", "jobId": "j", "split": "valid", "suitabilityScore": 50, "labelSource": "structured-weak-label-v1", "reasonCodes": ["X"]},
        ]
        candidates = [{"profileId": "p", "jobId": "j", "split": "valid"}] * 2

        with self.assertRaises(ValueError):
            validate_snapshot_dataset(profiles, jobs, labels, candidates)

    def test_checkpoint_round_trip_keeps_zero_to_one_hundred_forward_contract(self) -> None:
        from match_pilot_model import create_ranker

        raw = create_ranker(embedding_dimension=2, hidden_dimension=4, seed=42)
        wrapper = create_suitability_ranker(raw)
        profiles = torch.tensor([[1.0, 0.0], [0.0, 1.0]])
        jobs = torch.tensor([[1.0, 0.0], [1.0, 0.0]])
        expected = score_suitability_candidates(wrapper, profiles, jobs)
        with tempfile.TemporaryDirectory() as temporary:
            checkpoint = Path(temporary) / "ranker.pt"
            torch.save({
                "model": MODEL_ID,
                "state": wrapper.state_dict(),
                "embeddingDimension": 2,
                "hiddenDimension": 4,
                "outputContract": OUTPUT_CONTRACT,
            }, checkpoint)

            restored = load_suitability_checkpoint(checkpoint)
            actual = score_suitability_candidates(restored, profiles, jobs)

        self.assertTrue(torch.allclose(actual, expected))
        self.assertTrue(torch.all((0 <= actual) & (actual <= 100)))

    def test_hidden_dimension_mismatch_is_rejected_before_saving(self) -> None:
        from match_pilot_model import create_ranker

        with self.assertRaisesRegex(ValueError, "hidden dimension is 4, not 17"):
            validate_hidden_dimension(
                create_ranker(embedding_dimension=2, hidden_dimension=4), 17
            )

    def test_lineage_overlap_is_removed_from_train_and_weak_valid(self) -> None:
        profiles = [
            {"profileId": "train-shared", "split": "train", "sourceAtomIds": ["shared-pilot"]},
            {"profileId": "train-clean", "split": "train", "sourceAtomIds": ["shared-valid"]},
            {"profileId": "valid-shared", "split": "valid", "sourceAtomIds": ["shared-valid"]},
            {"profileId": "valid-clean", "split": "valid", "sourceAtomIds": ["valid-only"]},
        ]
        labels = [
            {"profileId": profile["profileId"], "split": profile["split"]}
            for profile in profiles
        ]
        pilot_sources = {
            "pilot-eval": {
                "datasetMeta": {"sourceAtomIds": ["shared-pilot"]},
                "provenance": {"recordLineage": []},
            }
        }
        pilot_labels = [{"profileId": "pilot-eval", "split": "test"}]

        train, valid, audit = select_lineage_clean_weak_rows(
            profiles, labels, pilot_sources, pilot_labels
        )

        self.assertEqual([row["profileId"] for row in train], ["train-clean"])
        self.assertEqual([row["profileId"] for row in valid], ["valid-clean"])
        self.assertEqual(audit["excludedByPilotProfileIds"], ["train-shared"])
        self.assertEqual(audit["excludedValidByTrainProfileIds"], ["valid-shared"])

    def test_manifest_rejects_family_only_stale_profiles(self) -> None:
        manifest = {
            "schemaVersion": "match-snapshot-data-v2",
            "lineageContract": "individual-source-atoms-v1",
            "sourceAtomCount": 1,
            "nonFamilySourceAtomCount": 0,
            "outputSha256": {},
        }
        profiles = [{
            "profileId": "p",
            "sourceAtomIds": ["profile-family:f"],
        }]

        with self.assertRaisesRegex(ValueError, "lineage counts differ"):
            validate_data_manifest(manifest, Path("."), profiles)


if __name__ == "__main__":
    unittest.main()
