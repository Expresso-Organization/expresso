"""LLM 적합도 라벨 최종 품질 감사 테스트."""

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from llm_suitability_audit import audit_labels


def _write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


class LlmSuitabilityAuditTest(unittest.TestCase):
    def test_audits_complete_consistent_dataset(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, labels = root / "data", root / "labels"
            _write_jsonl(data / "profiles.jsonl", [{"profileId": "p1", "split": "train", "records": [{"recordId": "r1"}]}])
            _write_jsonl(data / "jobs.jsonl", [{"jobId": "j1", "split": "train", "fields": {}}])
            _write_jsonl(data / "candidate-manifest.jsonl", [{"profileId": "p1", "jobId": "j1", "split": "train", "candidateBucket": "role"}])
            _write_jsonl(labels / "suitability-labels.jsonl", [{
                "profileId": "p1", "jobId": "j1", "split": "train", "candidateBucket": "role",
                "matchScore": 75,
                "dimensionScores": {"must": {"applicable": True, "score": 75}, "responsibility": {"applicable": False, "score": 0}, "preferred": {"applicable": False, "score": 0}},
                "requirementAssessments": [{"requirement": "API", "kind": "must", "coverage": "adequate", "evidenceRecordIds": ["r1"]}],
                "reason": "근거 있음", "confidence": 90,
                "rubricVersion": "job-profile-fit-v1", "labelSource": "claude-code-sonnet-5",
            }])

            report = audit_labels(data, labels, expected_profiles=1, expected_pairs=1)
            self.assertEqual(report["qualityGate"], "PASS")
            self.assertEqual(report["errors"], [])

    def test_rejects_missing_pair_unknown_record_and_score_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, labels = root / "data", root / "labels"
            _write_jsonl(data / "profiles.jsonl", [{"profileId": "p1", "split": "train", "records": []}])
            _write_jsonl(data / "jobs.jsonl", [{"jobId": "j1", "split": "train", "fields": {}}])
            _write_jsonl(data / "candidate-manifest.jsonl", [{"profileId": "p1", "jobId": "j1", "split": "train", "candidateBucket": "role"}])
            _write_jsonl(labels / "suitability-labels.jsonl", [])

            report = audit_labels(data, labels, expected_profiles=1, expected_pairs=1)
            self.assertEqual(report["qualityGate"], "FAIL")
            self.assertTrue(any("missing labels" in error for error in report["errors"]))

    def test_accepts_declared_mixed_teacher_sources(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, labels = root / "data", root / "labels"
            _write_jsonl(data / "profiles.jsonl", [
                {"profileId": "p1", "split": "train", "records": [{"recordId": "r1"}]},
                {"profileId": "p2", "split": "train", "records": [{"recordId": "r2"}]},
            ])
            _write_jsonl(data / "jobs.jsonl", [
                {"jobId": "j1", "split": "train", "fields": {}},
                {"jobId": "j2", "split": "train", "fields": {}},
            ])
            _write_jsonl(data / "candidate-manifest.jsonl", [
                {"profileId": "p1", "jobId": "j1", "split": "train", "candidateBucket": "role"},
                {"profileId": "p2", "jobId": "j2", "split": "train", "candidateBucket": "random"},
            ])
            rows = []
            for profile_id, job_id, record_id, bucket, source in (
                ("p1", "j1", "r1", "role", "claude-code-sonnet-5"),
                ("p2", "j2", "r2", "random", "gpt-5.6-luna"),
            ):
                rows.append({
                    "profileId": profile_id, "jobId": job_id, "split": "train", "candidateBucket": bucket,
                    "matchScore": 75,
                    "dimensionScores": {"must": {"applicable": True, "score": 75}, "responsibility": {"applicable": False, "score": 0}, "preferred": {"applicable": False, "score": 0}},
                    "requirementAssessments": [{"requirement": "API", "kind": "must", "coverage": "adequate", "evidenceRecordIds": [record_id]}],
                    "reason": "근거 있음", "confidence": 90,
                    "rubricVersion": "job-profile-fit-v1", "labelSource": source,
                })
            _write_jsonl(labels / "suitability-labels.jsonl", rows)

            report = audit_labels(
                data,
                labels,
                expected_profiles=2,
                expected_pairs=2,
                allowed_label_sources={"claude-code-sonnet-5", "gpt-5.6-luna"},
            )

            self.assertEqual(report["qualityGate"], "PASS")
            self.assertEqual(report["labelSources"], ["claude-code-sonnet-5", "gpt-5.6-luna"])


if __name__ == "__main__":
    unittest.main()
