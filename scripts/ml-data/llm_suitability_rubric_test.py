"""Sonnet 적합도 평가 루브릭과 출력 계약 테스트."""

from __future__ import annotations

import unittest

from llm_suitability_rubric import build_prompt, output_schema, validate_labels


PROFILE = {
    "profileId": "profile-1",
    "split": "train",
    "experienceYears": 3,
    "records": [
        {
            "recordId": "record-1",
            "title": "API 운영",
            "properties": {},
            "bodyMd": "Python API를 운영했다.",
        }
    ],
}
JOBS = [
    {
        "jobId": "job-1",
        "split": "train",
        "fields": {"job_category": "backend engineer", "skills": "python"},
    }
]


def _label() -> dict[str, object]:
    return {
        "profileId": "profile-1",
        "jobId": "job-1",
        "requirementAssessments": [
            {
                "requirement": "Python 실무 경험",
                "kind": "must",
                "coverage": "adequate",
                "evidenceRecordIds": ["record-1"],
            },
            {
                "requirement": "API 운영",
                "kind": "responsibility",
                "coverage": "adequate",
                "evidenceRecordIds": ["record-1"],
            },
            {
                "requirement": "클라우드 경험",
                "kind": "preferred",
                "coverage": "transferable",
                "evidenceRecordIds": ["record-1"],
            },
        ],
        "reason": "API 운영 경험은 직접 확인되지만 클라우드 근거는 인접 경험 수준이다.",
        "confidence": 82,
    }


class LlmSuitabilityRubricTest(unittest.TestCase):
    def test_prompt_and_schema_encode_single_score_and_exact_jobs(self) -> None:
        prompt = build_prompt(PROFILE, JOBS)
        schema = output_schema("profile-1", ["job-1"])

        self.assertIn("합격 확률이 아니다", prompt)
        self.assertIn("점수 상한", prompt)
        self.assertIn("점수를 계산하지 않는다", prompt)
        self.assertIn('"evidenceId":"e0"', prompt)
        self.assertNotIn("record-1", prompt)
        self.assertEqual(schema["properties"]["labels"]["minItems"], 1)
        self.assertEqual(schema["properties"]["labels"]["maxItems"], 1)
        self.assertEqual(schema["additionalProperties"], False)

    def test_expands_compact_teacher_output_to_full_label(self) -> None:
        compact = {
            "labels": [{
                "j": "job-1",
                "a": [{"q": "Python 실무 경험", "k": "m", "c": "a", "e": ["e0"]}],
                "r": "직접 근거가 있다.",
                "f": 90,
            }]
        }

        result = validate_labels(PROFILE, JOBS, compact)

        self.assertEqual(result[0]["profileId"], "profile-1")
        self.assertEqual(result[0]["jobId"], "job-1")
        self.assertEqual(result[0]["requirementAssessments"][0]["evidenceRecordIds"], ["record-1"])
        self.assertEqual(result[0]["matchScore"], 75)

    def test_validates_requirement_dimension_and_weighted_score(self) -> None:
        result = validate_labels(PROFILE, JOBS, {"profileId": "profile-1", "labels": [_label()]})
        self.assertEqual(result[0]["matchScore"], 68)
        self.assertEqual(result[0]["dimensionScores"]["must"], {"applicable": True, "score": 75})
        self.assertEqual(result[0]["rubricVersion"], "job-profile-fit-v1")

    def test_preserves_explicit_teacher_source(self) -> None:
        result = validate_labels(
            PROFILE,
            JOBS,
            {"profileId": "profile-1", "labels": [_label()]},
            label_source="gpt-5.6-luna",
        )

        self.assertEqual(result[0]["labelSource"], "gpt-5.6-luna")

    def test_redistributes_missing_preferred_weight(self) -> None:
        label = _label()
        label["requirementAssessments"] = label["requirementAssessments"][:2]  # type: ignore[index]

        result = validate_labels(PROFILE, JOBS, {"profileId": "profile-1", "labels": [label]})
        self.assertEqual(result[0]["matchScore"], 75)

    def test_allows_empty_profile_with_not_evidenced_requirements(self) -> None:
        empty = {**PROFILE, "records": []}
        label = _label()
        label["requirementAssessments"] = [
            {
                "requirement": "Python 실무 경험",
                "kind": "must",
                "coverage": "not_evidenced",
                "evidenceRecordIds": [],
            }
        ]
        validate_labels(empty, JOBS, {"profileId": "profile-1", "labels": [label]})

    def test_rejects_unknown_evidence(self) -> None:
        unknown = _label()
        unknown["requirementAssessments"][0]["evidenceRecordIds"] = ["fabricated"]  # type: ignore[index]
        with self.assertRaisesRegex(ValueError, "unknown evidence record"):
            validate_labels(PROFILE, JOBS, {"profileId": "profile-1", "labels": [unknown]})

    def test_rejects_duplicate_evidence_references_in_post_validation(self) -> None:
        duplicate = _label()
        duplicate["requirementAssessments"][0]["evidenceRecordIds"] = ["record-1", "record-1"]  # type: ignore[index]

        with self.assertRaisesRegex(ValueError, "duplicate evidence record"):
            validate_labels(PROFILE, JOBS, {"profileId": "profile-1", "labels": [duplicate]})


if __name__ == "__main__":
    unittest.main()
