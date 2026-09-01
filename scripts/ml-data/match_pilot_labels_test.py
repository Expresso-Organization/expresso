import json
import unittest

from match_pilot_labels import (
    LabelValidationError,
    build_teacher_prompt,
    validate_teacher_response,
)


PROFILE = {
    "profileId": "profile-001",
    "records": [
        {
            "title": "Ranking API",
            "properties": {"role": "Backend", "skills": ["Python", "MongoDB"]},
            "bodyMd": "Measured search quality and operated a ranking API.",
            "recordLineage": "lineage-secret",
        }
    ],
    "provenance": {"sourceAtomIds": ["secret-atom"]},
    "humanReview": {"notes": "review-secret"},
}


def _jobs():
    return [
        {"jobId": f"job-{number:03d}", "text": f"Backend engineer role {number}"}
        for number in range(1, 21)
    ]


def _response():
    return {
        "labels": [
            {
                "jobId": job["jobId"],
                "teacherLabel": 3 if index == 1 else 1,
                "reasonCodes": ["ROLE_MATCH"] if index == 1 else ["SKILL_MATCH"],
            }
            for index, job in enumerate(_jobs(), start=1)
        ]
    }


class MatchPilotLabelsTest(unittest.TestCase):
    def test_builds_one_profile_and_exactly_twenty_jobs_without_internal_metadata(self):
        prompt = build_teacher_prompt(PROFILE, _jobs())

        self.assertIn('"profileId": "profile-001"', prompt)
        self.assertIn('"title": "Ranking API"', prompt)
        self.assertIn('"properties": {"role": "Backend","skills": ["Python","MongoDB"]}', prompt)
        self.assertIn('"bodyMd": "Measured search quality and operated a ranking API."', prompt)
        jobs_json = prompt.rsplit("Jobs:\n\n```json\n", 1)[1].split("\n```", 1)[0]
        self.assertEqual(len(json.loads(jobs_json)), 20)
        self.assertNotIn("lineage-secret", prompt)
        self.assertNotIn("secret-atom", prompt)
        self.assertNotIn("review-secret", prompt)

    def test_normalizes_valid_response_to_ranking_harness_label_rows(self):
        rows = validate_teacher_response(
            json.dumps(_response()),
            profile_id="profile-001",
            split="train",
            expected_job_ids=[job["jobId"] for job in _jobs()],
        )

        self.assertEqual(len(rows), 20)
        self.assertEqual(
            rows[0],
            {
                "profileId": "profile-001",
                "jobId": "job-001",
                "split": "train",
                "teacherLabel": 3,
                "humanLabel": None,
                "reasonCodes": ["ROLE_MATCH"],
            },
        )

    def test_rejects_response_with_wrong_label_count(self):
        response = _response()
        response["labels"].pop()

        with self.assertRaisesRegex(LabelValidationError, "exactly 20"):
            validate_teacher_response(
                response,
                profile_id="profile-001",
                split="train",
                expected_job_ids=[job["jobId"] for job in _jobs()],
            )

    def test_rejects_unknown_job_id(self):
        response = _response()
        response["labels"][0]["jobId"] = "job-unknown"

        with self.assertRaisesRegex(LabelValidationError, "unknown job IDs"):
            validate_teacher_response(
                response,
                profile_id="profile-001",
                split="train",
                expected_job_ids=[job["jobId"] for job in _jobs()],
            )

    def test_reports_missing_job_id_when_an_unknown_replaces_it(self):
        response = _response()
        response["labels"][0]["jobId"] = "job-unknown"

        with self.assertRaisesRegex(LabelValidationError, "missing job IDs"):
            validate_teacher_response(
                response,
                profile_id="profile-001",
                split="train",
                expected_job_ids=[job["jobId"] for job in _jobs()],
            )

    def test_rejects_duplicate_job_id(self):
        response = _response()
        response["labels"][-1]["jobId"] = "job-001"

        with self.assertRaisesRegex(LabelValidationError, "duplicate job IDs"):
            validate_teacher_response(
                response,
                profile_id="profile-001",
                split="train",
                expected_job_ids=[job["jobId"] for job in _jobs()],
            )

    def test_rejects_label_outside_zero_to_three(self):
        response = _response()
        response["labels"][0]["teacherLabel"] = 4

        with self.assertRaisesRegex(LabelValidationError, "teacherLabel"):
            validate_teacher_response(
                response,
                profile_id="profile-001",
                split="train",
                expected_job_ids=[job["jobId"] for job in _jobs()],
            )

    def test_rejects_invalid_reason_code(self):
        response = _response()
        response["labels"][0]["reasonCodes"] = ["MADE_UP_CODE"]

        with self.assertRaisesRegex(LabelValidationError, "reasonCodes"):
            validate_teacher_response(
                response,
                profile_id="profile-001",
                split="train",
                expected_job_ids=[job["jobId"] for job in _jobs()],
            )


if __name__ == "__main__":
    unittest.main()
