"""Build and validate the Luna teacher-label boundary."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any


PROMPT_PATH = Path(__file__).parent / "prompts" / "match-pilot-teacher-v1.md"
ALLOWED_REASON_CODES = frozenset(
    {
        "ROLE_MATCH",
        "SKILL_MATCH",
        "EXPERIENCE_MATCH",
        "DOMAIN_MATCH",
        "SENIORITY_MATCH",
        "REQUIREMENT_GAP",
        "ROLE_MISMATCH",
        "EXPERIENCE_GAP",
    }
)
_RESPONSE_FIELDS = {"labels"}
_LABEL_FIELDS = {"jobId", "teacherLabel", "reasonCodes"}
_SPLITS = {"train", "valid", "test"}


class LabelValidationError(ValueError):
    """Raised when a Luna teacher response violates the pilot data contract."""


def _require_non_empty_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise LabelValidationError(f"{field} must be a non-empty string")
    return value


def _profile_id(profile: Mapping[str, Any]) -> str:
    value = profile.get("profileId", profile.get("syntheticProfileId"))
    return _require_non_empty_string(value, "profile.profileId")


def _project_profile(profile: Mapping[str, Any]) -> dict[str, Any]:
    records = profile.get("records")
    if not isinstance(records, list):
        raise LabelValidationError("profile.records must be a list")
    projected_records = []
    for index, record in enumerate(records):
        if not isinstance(record, Mapping):
            raise LabelValidationError(f"profile.records[{index}] must be an object")
        properties = record.get("properties")
        if not isinstance(properties, Mapping):
            raise LabelValidationError(
                f"profile.records[{index}].properties must be an object"
            )
        projected_records.append(
            {
                "title": _require_non_empty_string(
                    record.get("title"), f"profile.records[{index}].title"
                ),
                "properties": dict(properties),
                "bodyMd": _require_non_empty_string(
                    record.get("bodyMd"), f"profile.records[{index}].bodyMd"
                ),
            }
        )
    return {"profileId": _profile_id(profile), "records": projected_records}


def _project_jobs(jobs: Sequence[Mapping[str, Any]]) -> list[dict[str, str]]:
    if isinstance(jobs, (str, bytes)) or not isinstance(jobs, Sequence):
        raise LabelValidationError("jobs must be a sequence")
    if len(jobs) != 20:
        raise LabelValidationError(f"teacher prompt requires exactly 20 jobs: {len(jobs)}")
    projected_jobs = []
    job_ids = []
    for index, job in enumerate(jobs):
        if not isinstance(job, Mapping):
            raise LabelValidationError(f"jobs[{index}] must be an object")
        job_id = _require_non_empty_string(job.get("jobId"), f"jobs[{index}].jobId")
        projected_jobs.append(
            {
                "jobId": job_id,
                "text": _require_non_empty_string(job.get("text"), f"jobs[{index}].text"),
            }
        )
        job_ids.append(job_id)
    if len(set(job_ids)) != len(job_ids):
        raise LabelValidationError("teacher prompt job IDs must be unique")
    return projected_jobs


def build_teacher_prompt(
    profile: Mapping[str, Any], jobs: Sequence[Mapping[str, Any]]
) -> str:
    """Build one Luna request from one profile and exactly twenty jobs."""
    template = PROMPT_PATH.read_text(encoding="utf-8")
    return (
        template.replace(
            "{{PROFILE_JSON}}",
            json.dumps(_project_profile(profile), ensure_ascii=False, separators=(",", ": ")),
        )
        .replace(
            "{{JOBS_JSON}}",
            json.dumps(_project_jobs(jobs), ensure_ascii=False, separators=(",", ": ")),
        )
    )


def _parse_response(response: str | Mapping[str, Any]) -> Mapping[str, Any]:
    if isinstance(response, str):
        try:
            response = json.loads(response)
        except json.JSONDecodeError as error:
            raise LabelValidationError(f"teacher response is not valid JSON: {error.msg}") from error
    if not isinstance(response, Mapping):
        raise LabelValidationError("teacher response must be a JSON object")
    if set(response) != _RESPONSE_FIELDS:
        raise LabelValidationError("teacher response fields must be exactly ['labels']")
    return response


def _validate_expected_job_ids(expected_job_ids: Sequence[str]) -> list[str]:
    if isinstance(expected_job_ids, (str, bytes)) or not isinstance(expected_job_ids, Sequence):
        raise LabelValidationError("expected_job_ids must be a sequence")
    if len(expected_job_ids) != 20:
        raise LabelValidationError("expected_job_ids must contain exactly 20 jobs")
    job_ids = [
        _require_non_empty_string(job_id, f"expected_job_ids[{index}]")
        for index, job_id in enumerate(expected_job_ids)
    ]
    if len(set(job_ids)) != len(job_ids):
        raise LabelValidationError("expected_job_ids must be unique")
    return job_ids


def validate_teacher_response(
    response: str | Mapping[str, Any],
    *,
    profile_id: str,
    split: str,
    expected_job_ids: Sequence[str],
) -> list[dict[str, Any]]:
    """Validate Luna JSON and normalize it into ranking-harness label rows."""
    profile_id = _require_non_empty_string(profile_id, "profile_id")
    if split not in _SPLITS:
        raise LabelValidationError("split must be one of train, valid, test")
    expected = _validate_expected_job_ids(expected_job_ids)
    payload = _parse_response(response)
    labels = payload.get("labels")
    if not isinstance(labels, list) or len(labels) != 20:
        count = len(labels) if isinstance(labels, list) else "non-list"
        raise LabelValidationError(f"teacher response must contain exactly 20 labels: {count}")

    labels_by_job_id: dict[str, dict[str, Any]] = {}
    for index, label in enumerate(labels):
        if not isinstance(label, Mapping):
            raise LabelValidationError(f"labels[{index}] must be an object")
        if set(label) != _LABEL_FIELDS:
            raise LabelValidationError(
                f"labels[{index}] fields must be exactly {sorted(_LABEL_FIELDS)}"
            )
        job_id = _require_non_empty_string(label.get("jobId"), f"labels[{index}].jobId")
        if job_id in labels_by_job_id:
            raise LabelValidationError(f"duplicate job IDs: {job_id}")
        teacher_label = label.get("teacherLabel")
        if isinstance(teacher_label, bool) or not isinstance(teacher_label, int) or not 0 <= teacher_label <= 3:
            raise LabelValidationError(f"labels[{index}].teacherLabel must be an integer from 0 to 3")
        reason_codes = label.get("reasonCodes")
        if not isinstance(reason_codes, list) or any(
            not isinstance(code, str) or code not in ALLOWED_REASON_CODES
            for code in reason_codes
        ):
            raise LabelValidationError(f"labels[{index}].reasonCodes contain an invalid code")
        if len(set(reason_codes)) != len(reason_codes):
            raise LabelValidationError(f"labels[{index}].reasonCodes must not repeat codes")
        labels_by_job_id[job_id] = {
            "teacherLabel": teacher_label,
            "reasonCodes": reason_codes,
        }

    actual_job_ids = set(labels_by_job_id)
    expected_job_id_set = set(expected)
    unknown = sorted(actual_job_ids - expected_job_id_set)
    missing = sorted(expected_job_id_set - actual_job_ids)
    job_id_errors = []
    if unknown:
        job_id_errors.append(f"unknown job IDs: {unknown}")
    if missing:
        job_id_errors.append(f"missing job IDs: {missing}")
    if job_id_errors:
        raise LabelValidationError("; ".join(job_id_errors))

    return [
        {
            "profileId": profile_id,
            "jobId": job_id,
            "split": split,
            "teacherLabel": labels_by_job_id[job_id]["teacherLabel"],
            "humanLabel": None,
            "reasonCodes": labels_by_job_id[job_id]["reasonCodes"],
        }
        for job_id in expected
    ]
