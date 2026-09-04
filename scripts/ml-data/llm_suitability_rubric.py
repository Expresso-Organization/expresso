"""공고 적합도 Sonnet 교사 라벨의 프롬프트, 스키마, 산술 계약."""

from __future__ import annotations

import json
import math
from typing import Any, Sequence


RUBRIC_VERSION = "job-profile-fit-v1"
LABEL_SOURCE = "claude-code-sonnet-5"
COVERAGE_POINTS = {
    "strong": 100,
    "adequate": 75,
    "partial": 50,
    "transferable": 25,
    "not_evidenced": 0,
}
DIMENSION_WEIGHTS = {"must": 0.45, "responsibility": 0.40, "preferred": 0.15}
KIND_CODES = {"m": "must", "r": "responsibility", "p": "preferred"}
COVERAGE_CODES = {"s": "strong", "a": "adequate", "x": "partial", "t": "transferable", "n": "not_evidenced"}


def _round_half_up(value: float) -> int:
    return int(math.floor(value + 0.5))


def build_prompt(profile: dict[str, Any], jobs: Sequence[dict[str, Any]]) -> str:
    """모델이 해석 판단만 수행하고 계산 계약은 고정되도록 평가 지시를 만든다."""
    compact_records = [
        {
            "evidenceId": f"e{index}",
            "title": record.get("title", ""),
            "properties": record.get("properties", {}),
            "bodyMd": record.get("bodyMd", ""),
        }
        for index, record in enumerate(profile.get("records", []))
    ]
    payload = {
        "profile": {
            "experienceYears": profile.get("experienceYears"),
            "records": compact_records,
        },
        "jobs": [{"jobId": job["jobId"], "fields": job.get("fields", {})} for job in jobs],
    }
    return f"""당신은 채용 합격 가능성이 아니라 '현재 프로필에 기록된 경력 근거의 공고 부합도'를 평가한다.
이 점수는 합격 확률이 아니다. 각 공고를 서로 독립적으로 평가하라.

[절대 원칙]
- 프로필에 적힌 제목, properties, bodyMd, experienceYears만 근거로 사용한다.
- 희망 직무나 직무명 유사성만으로 요구사항 충족을 만들지 않는다.
- 공고 fields에 없는 요구사항은 만들지 않는다. 빈 field는 무시한다.
- 값이 false인 required field는 '필수 아님'이므로 요구사항으로 만들지 않는다. false를 불충족 조건으로 해석하지 않는다.
- _rare_skill_은 결측 placeholder이므로 무시한다. contract_type, remote, location, salary는 평가하지 않는다.
- 기록이 짧거나 적은 사실 자체를 벌점으로 주지 않는다. 확인 불가능한 요구만 not_evidenced로 둔다.
- 필수요건 불충족에 탈락, 거절, 최종 점수 상한을 적용하지 않는다. 해당 요구만 낮게 평가한다.
- 근무지, 고용형태, 원격 여부, 급여 같은 condition은 점수에서 제외한다.
- 한 공고에서 중복을 제거한 핵심 요구사항을 총 1~8개로 추린다.

[요구사항 종류]
- must: 명시된 필수 기술, 경력, 학력, 자격, 언어
- responsibility: 해당 직무에서 실제로 수행할 핵심 업무
- preferred: 공고 field가 우대·plus·bonus임을 명시한 사항만 포함한다. 일반적인 soft skill이나 company value를
  임의로 preferred로 올리지 않는다. 명시 근거가 없으면 이 축은 applicable=false

[근거 판정]
- strong=100: 구체적인 행동, 범위, 결과가 있는 강한 직접 근거
- adequate=75: 해당 요구를 수행했다고 볼 수 있는 직접 근거
- partial=50: 일부만 충족하거나 깊이·범위가 부족한 직접 근거
- transferable=25: 인접 경험은 있으나 해당 요구의 직접 경험은 아님
- not_evidenced=0: 현재 프로필에서 확인할 수 없거나 명시적으로 부족함
not_evidenced이면 근거 배열은 비운다. 나머지 판정은 입력의 evidenceId를 하나 이상 연결한다.

[출력 범위]
당신은 요구사항별 kind와 coverage를 판단하되 축 점수나 최종 점수를 계산하지 않는다.
축 점수와 matchScore는 후처리 코드가 coverage를 must 45, responsibility 40, preferred 15 비중으로 계산한다.
출력은 토큰 절약을 위해 다음 코드를 쓴다: k는 m=must, r=responsibility, p=preferred이고,
c는 s=strong, a=adequate, x=partial, t=transferable, n=not_evidenced이다. e에는 evidenceId만 넣는다.
reason은 한국어 한 문장, confidence는 주어진 기록으로 판단할 수 있는 확신도 0~100이다.
모든 공고를 정확히 한 번 출력하고 JSON Schema를 엄격히 따른다.

[평가 입력]
{json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))}
"""


def output_schema(profile_id: str, job_ids: Sequence[str]) -> dict[str, Any]:
    count = len(job_ids)
    label_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["j", "a", "r", "f"],
        "properties": {
            "j": {"type": "string", "enum": list(job_ids)},
            "a": {
                "type": "array",
                "minItems": 1,
                "maxItems": 8,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["q", "k", "c", "e"],
                    "properties": {
                        "q": {"type": "string", "minLength": 1, "maxLength": 240},
                        "k": {"type": "string", "enum": list(KIND_CODES)},
                        "c": {"type": "string", "enum": list(COVERAGE_CODES)},
                        "e": {
                            "type": "array",
                            "items": {"type": "string", "pattern": "^e[0-9]+$"},
                        },
                    },
                },
            },
            "r": {"type": "string", "minLength": 1, "maxLength": 500},
            "f": {"type": "integer", "minimum": 0, "maximum": 100},
        },
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["labels"],
        "properties": {
            "labels": {
                "type": "array",
                "minItems": count,
                "maxItems": count,
                "items": label_schema,
            },
        },
    }


def _expand_compact_payload(profile: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    labels = payload.get("labels")
    if not isinstance(labels, list) or not labels or "j" not in labels[0]:
        return payload
    evidence_map = {
        f"e{index}": str(record["recordId"])
        for index, record in enumerate(profile.get("records", []))
    }
    expanded = []
    for label in labels:
        assessments = []
        for item in label.get("a", []):
            assessments.append(
                {
                    "requirement": item.get("q"),
                    "kind": KIND_CODES.get(str(item.get("k")), str(item.get("k"))),
                    "coverage": COVERAGE_CODES.get(str(item.get("c")), str(item.get("c"))),
                    "evidenceRecordIds": [evidence_map.get(str(ref), str(ref)) for ref in item.get("e", [])],
                }
            )
        expanded.append(
            {
                "profileId": profile["profileId"],
                "jobId": label.get("j"),
                "requirementAssessments": assessments,
                "reason": label.get("r"),
                "confidence": label.get("f"),
            }
        )
    return {"profileId": profile["profileId"], "labels": expanded}


def validate_labels(
    profile: dict[str, Any],
    jobs: Sequence[dict[str, Any]],
    payload: dict[str, Any],
    *,
    label_source: str = LABEL_SOURCE,
) -> list[dict[str, Any]]:
    """ID와 근거를 검증하고 coverage 판단에서 점수를 결정적으로 계산한다."""
    payload = _expand_compact_payload(profile, payload)
    profile_id = str(profile["profileId"])
    expected_jobs = {str(job["jobId"]) for job in jobs}
    record_ids = {str(record["recordId"]) for record in profile.get("records", [])}
    if payload.get("profileId") != profile_id:
        raise ValueError("profileId mismatch")
    labels = payload.get("labels")
    if not isinstance(labels, list):
        raise ValueError("labels must be an array")
    actual_jobs = [str(label.get("jobId")) for label in labels if isinstance(label, dict)]
    if len(labels) != len(expected_jobs) or set(actual_jobs) != expected_jobs or len(actual_jobs) != len(set(actual_jobs)):
        raise ValueError("labels must contain every expected job exactly once")

    for label in labels:
        if label.get("profileId") != profile_id:
            raise ValueError("label profileId mismatch")
        if not isinstance(label.get("confidence"), int) or not 0 <= label["confidence"] <= 100:
            raise ValueError("confidence out of range")
        assessments = label.get("requirementAssessments")
        if not isinstance(assessments, list) or not 1 <= len(assessments) <= 8:
            raise ValueError("requirementAssessments must contain 1 to 8 requirements")
        by_kind: dict[str, list[int]] = {kind: [] for kind in DIMENSION_WEIGHTS}
        for assessment in assessments:
            kind = assessment.get("kind")
            coverage = assessment.get("coverage")
            evidence_ids = assessment.get("evidenceRecordIds")
            if kind not in DIMENSION_WEIGHTS or coverage not in COVERAGE_POINTS:
                raise ValueError("unknown requirement kind or coverage")
            if not isinstance(evidence_ids, list):
                raise ValueError("evidenceRecordIds must be an array")
            if len(evidence_ids) != len(set(evidence_ids)):
                raise ValueError("duplicate evidence record")
            unknown = set(evidence_ids) - record_ids
            if unknown:
                raise ValueError(f"unknown evidence record: {sorted(unknown)}")
            if coverage == "not_evidenced" and evidence_ids:
                raise ValueError("not_evidenced must not reference evidence")
            if coverage != "not_evidenced" and not evidence_ids:
                raise ValueError("evidenced coverage requires a record")
            by_kind[kind].append(COVERAGE_POINTS[coverage])

        dimensions: dict[str, dict[str, Any]] = {}
        applicable: list[str] = []
        for kind, points in by_kind.items():
            expected_score = _round_half_up(sum(points) / len(points)) if points else 0
            dimensions[kind] = {"applicable": bool(points), "score": expected_score}
            if points:
                applicable.append(kind)
        if not applicable:
            raise ValueError("at least one scoring dimension must apply")
        weight_total = sum(DIMENSION_WEIGHTS[kind] for kind in applicable)
        expected_match = _round_half_up(
            sum(dimensions[kind]["score"] * DIMENSION_WEIGHTS[kind] for kind in applicable) / weight_total
        )
        label["dimensionScores"] = dimensions
        label["matchScore"] = expected_match
        label["rubricVersion"] = RUBRIC_VERSION
        label["labelSource"] = label_source
    return sorted(labels, key=lambda label: label["jobId"])
