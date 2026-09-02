"""합성 프로필 v4 Qwen 실행과 Qwen·Luna 품질 비교 도구."""

from __future__ import annotations

import argparse
import copy
import json
import re
import statistics
import time
import urllib.error
import urllib.request
from itertools import combinations
from pathlib import Path
from typing import Any

from synthetic_profile import load_seed_categories
from synthetic_profile_v4 import (
    assemble_profile,
    body_min_length_for_prompt,
    prepare_length_pilot_inputs,
    prepare_pilot_inputs,
    validate_creative_property_values,
    validate_draft,
    INTERVIEW_STYLE_MARKERS,
)


SCRIPT_DIR = Path(__file__).parent
PROMPT_PATH = SCRIPT_DIR / "prompts" / "synthetic-profile-v4.md"
SCHEMA_PATH = SCRIPT_DIR / "synthetic_profile_draft_v4.schema.json"
DEFAULT_SEEDS_PATH = Path(__file__).parents[2] / "packages" / "database" / "src" / "mongodb-migrations" / "0001" / "seeds.json"
WORD_PATTERN = re.compile(r"[가-힣A-Za-z][가-힣A-Za-z0-9+.#_-]{1,}|\d+(?:[.,]\d+)?")
NUMBER_PATTERN = re.compile(r"\d+(?:[.,]\d+)?")
STOPWORDS = {
    "그리고", "에서", "으로", "하며", "했다", "맡았다", "과정을", "업무를", "프로젝트", "기록했다",
    "정리했다", "시작해", "마쳤다", "사용했다", "담당했다", "참여했다", "결과를", "같은", "이후",
}
CLICHES = (
    "역량을",
    "기여했습니다",
    "기여했다",
    "효율성을",
    "성장할",
    "최선을",
    "자신감",
    "깨달았습니다",
    "발전시키",
    "기반을 마련",
    "신뢰성을",
    "체계적으로",
    "협업 문화를",
)
EVIDENCE_ANCHOR_GROUPS = {
    "failure": ("실패", "탈락", "떨어", "불합격", "못하", "못 했", "못했"),
    "success": (
        "성공", "완료", "마무리", "합격", "수상", "취득", "달성", "해결", "복구",
        "개선", "극복", "해소", "풀었", "풀어", "마쳤", "끝냈", "성과",
    ),
    "departure": ("퇴사", "이직", "그만두", "그만뒀"),
    "leadership": ("총괄", "리더", "팀장", "주도"),
    "responsibility": ("담당", "맡"),
}
CLAIM_MARKERS = (
    ("기여", ("기여",)),
    ("성과", ("성과",)),
    ("효율", ("효율",)),
    ("높이", ("높이", "높였")),
    ("향상", ("향상",)),
    ("강화", ("강화",)),
    ("개선", ("개선",)),
    ("확보", ("확보",)),
    ("신뢰", ("신뢰",)),
    ("안정성", ("안정성",)),
    ("일관성", ("일관성",)),
    ("품질", ("품질",)),
    ("역량", ("역량",)),
    ("능력", ("능력",)),
    ("습득", ("습득",)),
    ("익히", ("익히", "익혔")),
    ("이해", ("이해",)),
    ("기반", ("기반",)),
    ("체계적", ("체계적",)),
    ("성장", ("성장",)),
    ("주도", ("주도",)),
    ("유지", ("유지",)),
    ("감소", ("감소",)),
    ("줄이", ("줄이", "줄였")),
)
REPETITIVE_META_PATTERNS = ("시점은", "기간은", "대상은", "담당 업무는", "사용 도구는")


def _property_schema(property_type: str, *, forbid_digits: bool = False) -> dict[str, Any]:
    if property_type == "text":
        schema: dict[str, Any] = {"type": "string", "minLength": 1}
        if forbid_digits:
            schema["pattern"] = "^[^0-9]*$"
        return schema
    if property_type == "tags":
        item_schema: dict[str, Any] = {"type": "string", "minLength": 1}
        if forbid_digits:
            item_schema["pattern"] = "^[^0-9]*$"
        return {"type": "array", "minItems": 1, "items": item_schema}
    if property_type == "date":
        return {"type": "string", "pattern": "^\\d{4}-(?:0[1-9]|1[0-2])$"}
    raise ValueError(f"unsupported property type: {property_type}")


def build_output_schema(input_payload: dict[str, Any], *, body_min_length: int = 40) -> dict[str, Any]:
    """입력별 사건 순서와 프로퍼티 계획을 디코딩 문법에 고정한다."""
    length_plan = input_payload.get("bodyLengthPlan", {})
    body_max_length = (
        length_plan.get("recordMaxChars", length_plan.get("upperBoundChars", 450))
        if isinstance(length_plan, dict)
        else 450
    )
    record_schemas = []
    creative_details = input_payload.get("renderingPolicy") == "skeleton-grounded-creative-v1"
    for index, event in enumerate(input_payload["events"], start=1):
        category_schema = input_payload["propertySchema"][event["categoryKey"]]
        planned = event["propertyKeys"]
        record_length_target = event.get("bodyLengthTarget", {})
        record_min_length = record_length_target.get("minChars", body_min_length)
        record_max_length = (
            record_length_target.get("maxChars", body_max_length)
            if creative_details
            or (isinstance(length_plan, dict) and length_plan.get("band") == "very_short")
            else body_max_length
        )
        skeleton_lead = event.get("skeletonLead")
        if creative_details:
            lead_chars = len(skeleton_lead.strip()) + 1 if isinstance(skeleton_lead, str) else 0
            detail_schema: dict[str, Any] = {
                "type": "string",
                "minLength": max(1, record_min_length - lead_chars),
                "maxLength": max(1, record_max_length - lead_chars),
                "pattern": (
                    "^[^一-鿿]*$"
                    if event.get("renderMode") == "rewrite_evidence"
                    else "^[^0-9一-鿿]*$"
                ),
            }
            content_field = "detailMd"
            content_schema = detail_schema
        else:
            body_schema: dict[str, Any] = {
                "type": "string",
                "minLength": record_min_length,
                "maxLength": record_max_length,
            }
            has_fact_numbers = NUMBER_PATTERN.search(" ".join(event.get("facts", []))) is not None
            if isinstance(skeleton_lead, str):
                body_schema["pattern"] = "^" + re.escape(skeleton_lead)
                if not has_fact_numbers:
                    body_schema["pattern"] += "[^0-9]*$"
            elif not has_fact_numbers:
                body_schema["pattern"] = "^[^0-9]*$"
            content_field = "bodyMd"
            content_schema = body_schema
        record_schemas.append(
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["draftId", "eventId", "categoryKey", "title", "properties", content_field],
                "properties": {
                    "draftId": {"const": f"r{index}"},
                    "eventId": {"const": event["eventId"]},
                    "categoryKey": {"const": event["categoryKey"]},
                    "title": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 100,
                        **({"pattern": "^[^0-9]*$"} if creative_details else {}),
                    },
                    "properties": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": planned,
                        "properties": {
                            key: (
                                {"const": event["propertyValues"][key]}
                                if creative_details and key in event.get("propertyValues", {})
                                else _property_schema(category_schema[key], forbid_digits=creative_details)
                            )
                            for key in planned
                        },
                    },
                    content_field: content_schema,
                },
            }
        )
    target = input_payload["targetRecordCount"]
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["status", "profileSeed", "persona", "records"],
        "properties": {
            "status": {"const": "generated"},
            "profileSeed": {"const": input_payload["profileSeed"]},
            "persona": {"const": input_payload["persona"]},
            "records": {
                "type": "array",
                "minItems": target,
                "maxItems": target,
                "prefixItems": record_schemas,
            },
        },
    }


def _without_numbers(value: str) -> str:
    return re.sub(r"\s+", " ", NUMBER_PATTERN.sub("", value)).strip()


def _without_numbers_or_han(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[\u4e00-\u9fff]", "", _without_numbers(value))).strip()


def sanitize_creative_record(
    event: dict[str, Any],
    record: dict[str, Any],
    category_property_schema: dict[str, str],
    *,
    allow_below_minimum: bool = False,
) -> dict[str, Any]:
    """창작 세부를 사실 안전성과 목표 길이에 맞춰 문장 단위로 정리한다."""
    sanitized = copy.deepcopy(record)
    sanitized["title"] = _without_numbers_or_han(str(sanitized.get("title", ""))) or "경력 기록"

    properties = sanitized.get("properties")
    if isinstance(properties, dict):
        for key, value in list(properties.items()):
            if category_property_schema.get(key) == "date":
                continue
            if isinstance(value, str):
                properties[key] = _without_numbers_or_han(value)
            elif isinstance(value, list):
                properties[key] = [_without_numbers_or_han(str(item)) for item in value]

    lead = str(event.get("skeletonLead", "")).strip()
    lead_sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?。！？])\s+", lead)
        if sentence.strip()
    ]
    raw_detail = re.sub(r"\s+", " ", str(sanitized.get("detailMd", ""))).strip()
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?。！？])\s+", raw_detail)
        if sentence.strip()
    ]
    usable: list[str] = []
    for sentence in sentences:
        if not re.search(r"[.!?。！？)]$", sentence):
            continue
        allowed_numbers = (
            {
                _normalize_number(value)
                for value in NUMBER_PATTERN.findall(" ".join(event.get("facts", [])))
            }
            if event.get("renderMode") == "rewrite_evidence"
            else set()
        )
        sentence_numbers = {
            _normalize_number(value) for value in NUMBER_PATTERN.findall(sentence)
        }
        if (
            (sentence_numbers and not sentence_numbers.issubset(allowed_numbers))
            or re.search(r"[\u4e00-\u9fff]", sentence)
        ):
            continue
        if any(_similarity(lead_sentence, sentence) >= 0.45 for lead_sentence in lead_sentences):
            continue
        if any(_similarity(previous, sentence) >= 0.75 for previous in usable):
            continue
        usable.append(sentence)

    if not usable:
        usable = ["작업 과정에서 확인한 내용과 판단 근거를 개인 기록으로 남겼다."]
    target = event.get("bodyLengthTarget", {}).get("targetChars")
    if isinstance(target, (int, float)):
        candidates = [""] + [" ".join(usable[:count]) for count in range(1, len(usable) + 1)]
        minimum = event.get("bodyLengthTarget", {}).get("minChars", 1)
        eligible = (
            candidates
            if allow_below_minimum
            else [
                candidate
                for candidate in candidates
                if len(" ".join(part for part in (lead, candidate) if part)) >= minimum
            ]
        )
        required_anchors = evidence_anchor_requirements(event)
        anchored = [
            candidate
            for candidate in eligible
            if all(any(variant in candidate for variant in variants) for variants in required_anchors.values())
        ]
        if anchored:
            eligible = anchored
        detail = min(
            eligible or candidates,
            key=lambda candidate: abs(len(" ".join(part for part in (lead, candidate) if part)) - target),
        )
    else:
        detail = " ".join(usable)
    sanitized["detailMd"] = detail
    return sanitized


def compose_skeleton_bodies(input_payload: dict[str, Any], draft: Any) -> Any:
    """코드가 고정 사실을 붙여 최종 Expresso 본문을 만든다."""
    if input_payload.get("renderingPolicy") != "skeleton-grounded-creative-v1":
        return copy.deepcopy(draft)
    validate_creative_property_values(input_payload)
    if not isinstance(draft, dict) or not isinstance(draft.get("records"), list):
        return copy.deepcopy(draft)

    composed = copy.deepcopy(draft)
    events = {event.get("eventId"): event for event in input_payload.get("events", [])}
    property_schema = input_payload.get("propertySchema", {})
    allow_below_minimum = input_payload.get("bodyLengthPlan", {}).get("band") == "very_short"
    for index, record in enumerate(composed["records"]):
        if not isinstance(record, dict):
            continue
        event = events.get(record.get("eventId"), {})
        category_schema = property_schema.get(event.get("categoryKey"), {})
        record = sanitize_creative_record(
            event,
            record,
            category_schema,
            allow_below_minimum=allow_below_minimum,
        )
        record["properties"] = copy.deepcopy(event["propertyValues"])
        composed["records"][index] = record
        lead = str(event.get("skeletonLead", "")).strip()
        detail = str(record.pop("detailMd", "")).strip()
        record["bodyMd"] = " ".join(part for part in (lead, detail) if part)
    return composed


def build_record_repair_schema(
    input_payload: dict[str, Any],
    record_index: int,
    *,
    body_min_length: int = 40,
) -> dict[str, Any]:
    records = build_output_schema(input_payload, body_min_length=body_min_length)["properties"]["records"]
    return records["prefixItems"][record_index]


def _tokens(text: str) -> set[str]:
    return {token.lower() for token in WORD_PATTERN.findall(text) if token not in STOPWORDS}


def _visible_record_text(record: dict[str, Any]) -> str:
    return " ".join(
        [
            str(record.get("title", "")),
            str(record.get("bodyMd", "")),
            json.dumps(record.get("properties", {}), ensure_ascii=False),
        ]
    )


def _normalize_number(value: str) -> str:
    compact = value.replace(",", "")
    if "." in compact:
        whole, fraction = compact.split(".", 1)
        return f"{int(whole)}.{fraction.rstrip('0') or '0'}"
    return str(int(compact))


def _trigrams(text: str) -> set[str]:
    normalized = re.sub(r"\s+", "", text)
    return {normalized[index : index + 3] for index in range(max(0, len(normalized) - 2))}


def _similarity(left: str, right: str) -> float:
    left_parts = _trigrams(left)
    right_parts = _trigrams(right)
    union = left_parts | right_parts
    if not union:
        return 0.0
    intersection = len(left_parts & right_parts)
    jaccard = intersection / len(union)
    containment = intersection / min(len(left_parts), len(right_parts))
    return max(jaccard, containment)


def find_unsupported_claims(input_payload: dict[str, Any], draft: Any) -> list[dict[str, Any]]:
    if not isinstance(draft, dict) or not isinstance(draft.get("records"), list):
        return []
    event_by_id = {event["eventId"]: event for event in input_payload["events"]}
    unsupported = []
    for index, record in enumerate(draft["records"], start=1):
        if not isinstance(record, dict):
            continue
        event = event_by_id.get(record.get("eventId"))
        if not event:
            continue
        visible = _visible_record_text(record)
        facts = " ".join(event.get("facts", []))
        markers = [
            label
            for label, variants in CLAIM_MARKERS
            if any(variant in visible for variant in variants)
            and not any(variant in facts for variant in variants)
        ]
        if markers:
            unsupported.append({"eventId": event["eventId"], "recordIndex": index, "markers": markers})
    return unsupported


def find_number_conflicts(input_payload: dict[str, Any], draft: Any) -> list[dict[str, Any]]:
    """경력 골격의 정밀 수치가 빠지거나 새로 생긴 기록을 찾는다."""
    if not isinstance(draft, dict) or not isinstance(draft.get("records"), list):
        return []
    event_by_id = {event["eventId"]: event for event in input_payload["events"]}
    conflicts = []
    for index, record in enumerate(draft["records"], start=1):
        if not isinstance(record, dict):
            continue
        event = event_by_id.get(record.get("eventId"))
        if not event:
            continue
        facts = " ".join(event.get("facts", []))
        visible = _visible_record_text(record)
        expected = {_normalize_number(value) for value in NUMBER_PATTERN.findall(facts)}
        actual = {_normalize_number(value) for value in NUMBER_PATTERN.findall(visible)}
        missing = sorted(expected - actual)
        invented = sorted(actual - expected)
        if missing or invented:
            conflicts.append(
                {
                    "eventId": event["eventId"],
                    "recordIndex": index,
                    "missing": missing,
                    "invented": invented,
                }
            )
    return conflicts


def evidence_anchor_requirements(event: dict[str, Any]) -> dict[str, list[str]]:
    """재서술에서 반드시 보존해야 할 결과·역할 의미군을 계산한다."""
    if event.get("renderMode") != "rewrite_evidence":
        return {}
    facts = " ".join(event.get("facts", []))
    return {
        label: list(variants)
        for label, variants in EVIDENCE_ANCHOR_GROUPS.items()
        if any(variant in facts for variant in variants)
    }


def find_evidence_anchor_conflicts(input_payload: dict[str, Any], draft: Any) -> list[dict[str, Any]]:
    if not isinstance(draft, dict) or not isinstance(draft.get("records"), list):
        return []
    event_by_id = {event["eventId"]: event for event in input_payload.get("events", [])}
    conflicts = []
    for index, record in enumerate(draft["records"], start=1):
        if not isinstance(record, dict):
            continue
        event = event_by_id.get(record.get("eventId"), {})
        required = evidence_anchor_requirements(event)
        body = str(record.get("bodyMd", ""))
        missing = [
            label for label, variants in required.items() if not any(variant in body for variant in variants)
        ]
        if missing:
            conflicts.append({"eventId": event.get("eventId"), "recordIndex": index, "missing": missing})
    return conflicts


def _find_repetitive_meta(draft: Any) -> list[dict[str, Any]]:
    if not isinstance(draft, dict) or not isinstance(draft.get("records"), list):
        return []
    repetitive = []
    for index, record in enumerate(draft["records"], start=1):
        if not isinstance(record, dict):
            continue
        body = str(record.get("bodyMd", ""))
        matches = [pattern for pattern in REPETITIVE_META_PATTERNS if pattern in body]
        if matches:
            repetitive.append(
                {"eventId": record.get("eventId"), "recordIndex": index, "patterns": matches}
            )
    return repetitive


def _find_style_violations(input_payload: dict[str, Any], draft: Any) -> list[dict[str, Any]]:
    if not isinstance(draft, dict) or not isinstance(draft.get("records"), list):
        return []
    violations = []
    event_by_id = {event["eventId"]: event for event in input_payload.get("events", [])}
    for index, record in enumerate(draft["records"], start=1):
        if not isinstance(record, dict):
            continue
        body = str(record.get("bodyMd", "")).strip()
        visible = " ".join(
            (
                str(record.get("title", "")),
                body,
                json.dumps(record.get("properties", {}), ensure_ascii=False),
            )
        )
        kinds = []
        if body and not re.search(r"[.!?。！？)]$", body):
            kinds.append("incomplete_sentence")
        sentences = [
            re.sub(r"\s+", " ", sentence.strip())
            for sentence in re.split(r"(?<=[.!?。！？])\s+", body)
            if len(sentence.strip()) >= 10
        ]
        if len(sentences) != len(set(sentences)):
            kinds.append("repeated_sentence")
        if re.search(r"[\u4e00-\u9fff]", visible):
            kinds.append("foreign_script")
        if any(marker in body for marker in INTERVIEW_STYLE_MARKERS):
            kinds.append("interview_style")
        event = event_by_id.get(record.get("eventId"), {})
        if event.get("renderMode") == "rewrite_evidence" and any(
            len(str(fact).strip()) >= 40 and str(fact).strip().rstrip(".") in body
            for fact in event.get("facts", [])
        ):
            kinds.append("source_verbatim_copy")
        if kinds:
            violations.append({"recordIndex": index, "kinds": kinds})
    return violations


def validate_renderer_output(
    input_payload: dict[str, Any],
    draft: Any,
    *,
    enforce_grounding: bool = False,
    enforce_skeleton: bool = False,
    body_min_length: int = 40,
) -> dict[str, Any]:
    validation = validate_draft(input_payload, draft, body_min_length=body_min_length)
    unsupported = find_unsupported_claims(input_payload, draft) if enforce_grounding else []
    repetitive = _find_repetitive_meta(draft) if enforce_grounding or enforce_skeleton else []
    number_conflicts = find_number_conflicts(input_payload, draft) if enforce_skeleton else []
    style_violations = _find_style_violations(input_payload, draft) if enforce_skeleton else []
    anchor_conflicts = find_evidence_anchor_conflicts(input_payload, draft) if enforce_skeleton else []
    errors = list(validation["errors"])
    errors.extend(
        f"record_{item['recordIndex']}_unsupported_claim:{','.join(item['markers'])}"
        for item in unsupported
    )
    errors.extend(
        f"record_{item['recordIndex']}_repetitive_meta:{','.join(item['patterns'])}"
        for item in repetitive
    )
    for item in number_conflicts:
        if item["missing"]:
            errors.append(f"record_{item['recordIndex']}_missing_number:{','.join(item['missing'])}")
        if item["invented"]:
            errors.append(f"record_{item['recordIndex']}_invented_number:{','.join(item['invented'])}")
    errors.extend(
        f"record_{item['recordIndex']}_{kind}"
        for item in style_violations
        for kind in item["kinds"]
    )
    errors.extend(
        f"record_{item['recordIndex']}_missing_anchor:{','.join(item['missing'])}"
        for item in anchor_conflicts
    )
    return {
        **validation,
        "valid": not errors,
        "errors": errors,
        "unsupportedClaims": unsupported,
        "repetitiveMeta": repetitive,
        "numberConflicts": number_conflicts,
        "styleViolations": style_violations,
        "evidenceAnchorConflicts": anchor_conflicts,
    }


def build_revision_instruction(
    errors: list[str],
    body_length_plan: dict[str, Any] | None,
    input_payload: dict[str, Any] | None = None,
    *,
    record_length_context: dict[str, int] | None = None,
) -> str:
    instruction = "출력이 계약을 위반했다. 다음 오류만 고쳐 전체 JSON을 다시 출력하라: "
    instruction += json.dumps(errors, ensure_ascii=False)
    if {"body_length_mean", "body_length_band"} & set(errors) and body_length_plan:
        instruction += (
            f" 프로필의 평균 본문 길이를 {body_length_plan.get('targetMeanChars')}자에 맞춰라."
            " 입력 사건의 뼈대는 유지하면서 상황·과정·판단·협업 세부를 자연스럽게 확장하라."
            " 새 날짜·수치·기관·자격·핵심 성과를 만들지는 마라."
        )
        if record_length_context:
            instruction += (
                f" 현재 최종 본문은 {record_length_context['currentBodyChars']}자다."
                f" 이 기록의 최종 본문을 {record_length_context['targetBodyChars']}자에 가깝게,"
                f" 반드시 {record_length_context['minBodyChars']}~"
                f"{record_length_context['maxBodyChars']}자 안으로 작성하라."
                f" 고정 뼈대 {record_length_context['skeletonChars']}자를 제외한 나머지만"
                " detailMd에 여러 완결 문장과 자연스러운 문단으로 작성하라."
            )
    if any("missing_number" in error for error in errors):
        instruction += (
            " 빠진 뼈대 수치는 해당 사건의 facts를 확인해 본문 첫 문장에 모두 넣어라."
            " 문장을 끝에 덧붙이지 말고 기존 세부 문장 일부를 줄여 그 자리에 교체하라."
        )
    if any("invented_number" in error for error in errors):
        instruction += (
            " 입력에 없는 수치 표현은 숫자를 제거하고 '여러', '대부분', '눈에 띄게' 같은"
            " 정성 표현으로 바꿔라. 본문 길이는 유지하라."
        )
    if any("interview_style" in error or "source_verbatim_copy" in error for error in errors):
        instruction += (
            " 면접 답변의 가정형·포부·지원자 호칭을 제거하고 실제로 끝난 행동만 과거형 개인 기록으로 다시 써라."
            " 원문 전체 문장을 그대로 복사하지 말고 핵심 사건만 보존해 재서술하라."
        )
    if any("missing_anchor" in error for error in errors):
        instruction += (
            " 원문 경험의 핵심 결과와 역할 의미를 빠뜨리지 마라."
            " outputContract.requiredEvidenceAnchors의 각 의미군을 본문에 자연스럽게 한 번 이상 반영하라."
        )
    if input_payload and any("_number" in error for error in errors):
        record_indexes = {
            int(match.group(1)) - 1
            for error in errors
            if (match := re.match(r"record_(\d+)_", error))
        }
        relevant_facts = [
            {
                "eventId": input_payload["events"][index]["eventId"],
                "facts": input_payload["events"][index]["facts"],
            }
            for index in sorted(record_indexes)
            if 0 <= index < len(input_payload.get("events", []))
        ]
        instruction += " 교정 대상 사건의 원문 facts: " + json.dumps(relevant_facts, ensure_ascii=False)
    return instruction


def invalid_record_indexes(errors: list[str], *, record_count: int | None = None) -> list[int]:
    indexes = {
            int(match.group(1)) - 1
            for error in errors
            if (match := re.match(r"record_(\d+)_", error))
    }
    if {"body_length_mean", "body_length_band"} & set(errors) and record_count is not None:
        indexes.update(range(record_count))
    return sorted(indexes)


def repair_record_indexes(
    input_payload: dict[str, Any],
    draft: dict[str, Any],
    errors: list[str],
) -> list[int]:
    """프로필 평균 오류는 목표 반대편에 있는 기록만 골라 교정한다."""
    records = draft.get("records", [])
    explicit = set(invalid_record_indexes(errors))
    if not ({"body_length_mean", "body_length_band"} & set(errors)):
        return sorted(explicit)
    if not isinstance(records, list) or not records:
        return sorted(explicit)

    target_mean = input_payload.get("bodyLengthPlan", {}).get("targetMeanChars")
    if not isinstance(target_mean, (int, float)):
        return sorted(explicit)
    current_lengths = [
        len(str(record.get("bodyMd", "")).strip()) if isinstance(record, dict) else 0
        for record in records
    ]
    current_mean = statistics.fmean(current_lengths)
    deltas = []
    for index, current in enumerate(current_lengths):
        events = input_payload.get("events", [])
        event_target = (
            events[index].get("bodyLengthTarget", {}).get("targetChars", target_mean)
            if index < len(events)
            else target_mean
        )
        deltas.append((index, current - event_target))

    if current_mean > target_mean:
        candidates = sorted(
            (item for item in deltas if item[1] > 0),
            key=lambda item: item[1],
            reverse=True,
        )
    else:
        candidates = sorted(
            (item for item in deltas if item[1] < 0),
            key=lambda item: item[1],
        )
    if not candidates:
        candidates = sorted(
            deltas,
            key=lambda item: item[1],
            reverse=current_mean > target_mean,
        )[:1]
    explicit.update(index for index, _ in candidates)
    return sorted(explicit)


def score_draft(
    input_payload: dict[str, Any],
    draft: Any,
    *,
    elapsed_seconds: float | None = None,
    output_tokens: int | None = None,
    body_min_length: int = 40,
) -> dict[str, Any]:
    validation = validate_draft(input_payload, draft, body_min_length=body_min_length)
    records = draft.get("records", []) if isinstance(draft, dict) and isinstance(draft.get("records"), list) else []
    event_by_id = {event["eventId"]: event for event in input_payload["events"]}
    coverage_values = []
    invented_numbers = []
    body_lengths = []
    cliche_count = 0
    for record in records:
        if not isinstance(record, dict):
            continue
        event = event_by_id.get(record.get("eventId"))
        if not event:
            continue
        visible = _visible_record_text(record)
        fact_text = " ".join(event.get("facts", []))
        fact_tokens = _tokens(fact_text)
        visible_tokens = _tokens(visible)
        coverage_values.append(len(fact_tokens & visible_tokens) / len(fact_tokens) if fact_tokens else 1.0)
        allowed_numbers = {_normalize_number(value) for value in NUMBER_PATTERN.findall(fact_text)}
        visible_numbers = {_normalize_number(value) for value in NUMBER_PATTERN.findall(visible)}
        added_numbers = sorted(visible_numbers - allowed_numbers)
        if added_numbers:
            invented_numbers.append({"eventId": event["eventId"], "values": added_numbers})
        body = str(record.get("bodyMd", ""))
        body_lengths.append(len(body))
        cliche_count += sum(body.count(marker) for marker in CLICHES)

    unsupported_claims = find_unsupported_claims(input_payload, draft)
    repetitive_meta = _find_repetitive_meta(draft)

    duplicate_pairs = sum(
        _similarity(str(left.get("bodyMd", "")), str(right.get("bodyMd", ""))) >= 0.65
        for left, right in combinations([record for record in records if isinstance(record, dict)], 2)
    )
    target = input_payload["targetRecordCount"]
    return {
        "profileSeed": input_payload["profileSeed"],
        "targetRecordCount": target,
        "actualRecordCount": len(records),
        "schemaValid": validation["valid"],
        "validationErrors": validation["errors"],
        "recordCompletionRate": round(len(records) / target, 4) if target else 1.0,
        "propertyCounts": validation["propertyCounts"],
        "factTokenCoverage": round(statistics.fmean(coverage_values), 4) if coverage_values else 0.0,
        "inventedNumbers": invented_numbers,
        "duplicateRecordPairs": duplicate_pairs,
        "clicheCount": cliche_count,
        "groundingValid": not unsupported_claims,
        "unsupportedClaims": unsupported_claims,
        "unsupportedClaimCount": sum(len(item["markers"]) for item in unsupported_claims),
        "repetitiveMeta": repetitive_meta,
        "repetitiveMetaCount": sum(len(item["patterns"]) for item in repetitive_meta),
        "bodyLengthMean": round(statistics.fmean(body_lengths), 2) if body_lengths else 0.0,
        "bodyLengthStd": round(statistics.pstdev(body_lengths), 2) if len(body_lengths) > 1 else 0.0,
        "elapsedSeconds": elapsed_seconds,
        "outputTokens": output_tokens,
    }


def _post_json(url: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _detail_length_contract(event: dict[str, Any]) -> dict[str, int]:
    target = event.get("bodyLengthTarget", {})
    lead = str(event.get("skeletonLead", "")).strip()
    separator = 1 if lead else 0
    minimum = max(0, int(target.get("minChars", 0)) - len(lead) - separator)
    return {
        "minChars": minimum,
        "targetChars": max(0, int(target.get("targetChars", 0)) - len(lead) - separator),
        "maxChars": max(0, int(target.get("maxChars", 0)) - len(lead) - separator),
        "minSentences": max(1, (minimum + 54) // 55),
    }


def _record_candidate_valid(event: dict[str, Any], index: int, candidate: Any) -> bool:
    fields = {"draftId", "eventId", "categoryKey", "title", "properties", "detailMd"}
    detail = candidate.get("detailMd", "") if isinstance(candidate, dict) else ""
    detail_contract = _detail_length_contract(event)
    complete_sentences = len(
        [
            sentence
            for sentence in re.split(r"(?<=[.!?。！？])\s+", detail.strip())
            if sentence.strip() and re.search(r"[.!?。！？)]$", sentence.strip())
        ]
    )
    long_detail_valid = (
        detail_contract["minChars"] < 120
        or (
            len(detail.strip()) >= detail_contract["minChars"]
            and complete_sentences >= detail_contract["minSentences"]
        )
    )
    required_anchors = evidence_anchor_requirements(event)
    return (
        isinstance(candidate, dict)
        and set(candidate) == fields
        and candidate.get("draftId") == f"r{index + 1}"
        and candidate.get("eventId") == event.get("eventId")
        and candidate.get("categoryKey") == event.get("categoryKey")
        and isinstance(candidate.get("title"), str)
        and bool(candidate["title"].strip())
        and isinstance(candidate.get("properties"), dict)
        and set(candidate["properties"]) == set(event.get("propertyKeys", []))
        and isinstance(candidate.get("detailMd"), str)
        and long_detail_valid
        and not any(marker in detail for marker in INTERVIEW_STYLE_MARKERS)
        and all(any(variant in detail for variant in variants) for variants in required_anchors.values())
        and not (
            event.get("renderMode") == "rewrite_evidence"
            and any(
                len(str(fact).strip()) >= 40 and str(fact).strip().rstrip(".") in detail
                for fact in event.get("facts", [])
            )
        )
    )


def generate_qwen_by_record(
    input_payload: dict[str, Any],
    *,
    model: str,
    base_url: str,
    timeout: int,
    prompt_version: str = "synthetic-profile-v4.2",
    max_attempts: int = 3,
    post_json: Any = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """긴 프로필을 기록별 짧은 호출로 생성해 실패 범위와 재시도 비용을 제한한다."""
    validate_creative_property_values(input_payload)
    post_json = post_json or _post_json
    prompt = (SCRIPT_DIR / "prompts" / f"{prompt_version}.md").read_text(encoding="utf-8")
    body_min_length = body_min_length_for_prompt(prompt_version)
    records = []
    record_calls = 0
    parse_failures = 0
    transport_failures = 0
    contract_failures = 0
    output_tokens = 0
    eval_duration = 0
    done_reasons = []

    for index, event in enumerate(input_payload["events"]):
        parsed_record = None
        for attempt in range(max_attempts):
            record_calls += 1
            try:
                response = post_json(
                    f"{base_url.rstrip('/')}/api/chat",
                    {
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": prompt
                            + "\n# 단일 기록 생성 모드\n"
                            + "아래 사건 하나의 record JSON 객체만 출력한다. 프로필 루트나 다른 기록은 출력하지 않는다.",
                        },
                        {
                            "role": "user",
                            "content": json.dumps(
                                {
                                    "profileSeed": input_payload["profileSeed"],
                                    "persona": input_payload["persona"],
                                    "bodyLengthPlan": input_payload.get("bodyLengthPlan"),
                                    "event": event,
                                    "outputContract": {
                                        "draftId": f"r{index + 1}",
                                        "eventId": event["eventId"],
                                        "categoryKey": event["categoryKey"],
                                        "propertyKeys": event["propertyKeys"],
                                        "propertyValues": event.get("propertyValues", {}),
                                        "detailLength": _detail_length_contract(event),
                                        "requiredEvidenceAnchors": evidence_anchor_requirements(event),
                                        "fields": [
                                            "draftId",
                                            "eventId",
                                            "categoryKey",
                                            "title",
                                            "properties",
                                            "detailMd",
                                        ],
                                    },
                                },
                                ensure_ascii=False,
                            ),
                        },
                    ],
                    "stream": False,
                    "format": "json",
                    "think": False,
                    "keep_alive": "15m",
                    "options": {
                        "temperature": 0,
                        "seed": 42 + index + attempt,
                        "num_ctx": 8192,
                        "num_predict": 1536,
                    },
                    },
                    timeout,
                )
            except (urllib.error.URLError, TimeoutError):
                transport_failures += 1
                continue
            output_tokens += response.get("eval_count", 0) or 0
            eval_duration += response.get("eval_duration", 0) or 0
            done_reasons.append(response.get("done_reason"))
            content = response.get("message", {}).get("content", "")
            try:
                candidate = json.loads(content)
            except (json.JSONDecodeError, TypeError):
                parse_failures += 1
                continue
            if _record_candidate_valid(event, index, candidate):
                parsed_record = candidate
                break
            contract_failures += 1

        if parsed_record is None:
            parsed_record = {
                "draftId": f"r{index + 1}",
                "eventId": event["eventId"],
                "categoryKey": event["categoryKey"],
                "title": "생성 실패",
                "properties": copy.deepcopy(event.get("propertyValues", {})),
                "detailMd": "",
                "generationFailure": True,
            }
        records.append(parsed_record)

    raw_draft = {
        "status": "generated",
        "profileSeed": input_payload["profileSeed"],
        "persona": input_payload["persona"],
        "records": records,
    }
    return compose_skeleton_bodies(input_payload, raw_draft), {
        "recordCalls": record_calls,
        "parseFailures": parse_failures,
        "transportFailures": transport_failures,
        "contractFailures": contract_failures,
        "outputTokens": output_tokens,
        "evalDuration": eval_duration,
        "doneReasons": done_reasons,
    }


def repair_qwen_records(
    input_payload: dict[str, Any],
    draft: dict[str, Any],
    *,
    model: str,
    base_url: str,
    timeout: int,
    prompt_version: str = "synthetic-profile-v4.2",
    max_rounds: int = 2,
    post_json: Any = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """전체 프로필 재생성 후에도 남은 오류 기록만 좁은 컨텍스트로 교정한다."""
    post_json = post_json or _post_json
    prompt = (SCRIPT_DIR / "prompts" / f"{prompt_version}.md").read_text(encoding="utf-8")
    body_min_length = body_min_length_for_prompt(prompt_version)
    working = copy.deepcopy(draft)
    repairs = 0
    rounds = 0
    calls = 0
    output_tokens = 0
    eval_duration = 0
    transport_failures = 0
    validation = validate_renderer_output(
        input_payload,
        working,
        enforce_skeleton=True,
        body_min_length=body_min_length,
    )
    while not validation["valid"] and rounds < max_rounds:
        indexes = repair_record_indexes(input_payload, working, validation["errors"])
        if not indexes:
            break
        rounds += 1
        for index in indexes:
            record_errors = [
                error for error in validation["errors"] if error.startswith(f"record_{index + 1}_")
            ]
            for profile_error in ("body_length_mean", "body_length_band"):
                if profile_error in validation["errors"]:
                    record_errors.append(profile_error)
            event = input_payload["events"][index]
            current_body = str(working["records"][index].get("bodyMd", "")).strip()
            body_target = event.get("bodyLengthTarget", {})
            record_length_context = {
                "currentBodyChars": len(current_body),
                "targetBodyChars": int(body_target.get("targetChars", len(current_body))),
                "minBodyChars": int(body_target.get("minChars", 20)),
                "maxBodyChars": int(body_target.get("maxChars", 1000)),
                "skeletonChars": len(str(event.get("skeletonLead", "")).strip()),
            }
            repair_prompt = (
                prompt
                + "\n# 단일 기록 교정 모드\n"
                + "아래 사건 하나의 record JSON 객체만 출력한다. 다른 기록은 출력하지 않는다.\n"
                + build_revision_instruction(
                    record_errors,
                    input_payload.get("bodyLengthPlan"),
                    input_payload,
                    record_length_context=record_length_context,
                )
            )
            calls += 1
            try:
                response = post_json(
                    f"{base_url.rstrip('/')}/api/chat",
                    {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": repair_prompt},
                        {
                            "role": "user",
                            "content": json.dumps(
                                {
                                    "profileSeed": input_payload["profileSeed"],
                                    "persona": input_payload["persona"],
                                    "event": event,
                                    "validationErrors": record_errors,
                                    "currentBodyChars": len(current_body),
                                    "outputContract": {
                                        "draftId": f"r{index + 1}",
                                        "eventId": event["eventId"],
                                        "categoryKey": event["categoryKey"],
                                        "propertyKeys": event["propertyKeys"],
                                        "propertyValues": event.get("propertyValues", {}),
                                        "detailLength": _detail_length_contract(event),
                                        "requiredEvidenceAnchors": evidence_anchor_requirements(event),
                                        "fields": [
                                            "draftId",
                                            "eventId",
                                            "categoryKey",
                                            "title",
                                            "properties",
                                            "detailMd",
                                        ],
                                    },
                                },
                                ensure_ascii=False,
                            ),
                        },
                    ],
                    "stream": False,
                    "format": "json",
                    "think": False,
                    "keep_alive": "15m",
                    "options": {
                        "temperature": 0,
                        "seed": 42 + rounds,
                        "num_ctx": 16384,
                        "num_predict": 4096,
                    },
                    },
                    timeout,
                )
            except (urllib.error.URLError, TimeoutError):
                transport_failures += 1
                continue
            output_tokens += response.get("eval_count", 0) or 0
            eval_duration += response.get("eval_duration", 0) or 0
            content = response.get("message", {}).get("content", "")
            try:
                repaired_record = json.loads(content)
                if (
                    input_payload.get("renderingPolicy") == "skeleton-grounded-creative-v1"
                    and not _record_candidate_valid(event, index, repaired_record)
                ):
                    continue
                repaired_draft = compose_skeleton_bodies(
                    input_payload,
                    {"records": [repaired_record]},
                )
                working["records"][index] = repaired_draft["records"][0]
                repairs += 1
            except (json.JSONDecodeError, TypeError):
                continue
        validation = validate_renderer_output(
            input_payload,
            working,
            enforce_skeleton=True,
            body_min_length=body_min_length,
        )
    return working, {
        "valid": validation["valid"],
        "errors": validation["errors"],
        "rounds": rounds,
        "repairs": repairs,
        "calls": calls,
        "transportFailures": transport_failures,
        "outputTokens": output_tokens,
        "evalDuration": eval_duration,
        "bodyLengthMean": validation.get("bodyLengthMean"),
    }


def generate_qwen(
    input_paths: list[Path],
    output_dir: Path,
    *,
    model: str,
    base_url: str,
    timeout: int,
    prompt_version: str = "synthetic-profile-v4",
    enforce_grounding: bool = False,
    enforce_skeleton: bool = False,
    max_attempts: int = 3,
) -> list[Path]:
    prompt_path = SCRIPT_DIR / "prompts" / f"{prompt_version}.md"
    prompt = prompt_path.read_text(encoding="utf-8")
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata = []
    paths = []
    for input_path in input_paths:
        input_payload = json.loads(input_path.read_text(encoding="utf-8"))
        body_min_length = body_min_length_for_prompt(prompt_version)
        parsed = None
        response: dict[str, Any] = {}
        started = time.perf_counter()
        attempts = 0
        parse_error = None
        validation_errors: list[str] = []
        if input_payload.get("renderingPolicy") == "skeleton-grounded-creative-v1":
            parsed, record_run = generate_qwen_by_record(
                input_payload,
                model=model,
                base_url=base_url,
                timeout=timeout,
                prompt_version=prompt_version,
                max_attempts=max_attempts,
            )
            attempts = record_run["recordCalls"]
            response = {
                "done_reason": "record_calls",
                "eval_count": record_run["outputTokens"],
                "eval_duration": record_run["evalDuration"],
            }
            validation = validate_renderer_output(
                input_payload,
                parsed,
                enforce_grounding=enforce_grounding,
                enforce_skeleton=enforce_skeleton,
                body_min_length=body_min_length,
            )
            validation_errors = validation["errors"]
            parse_error = f"record_parse_failures:{record_run['parseFailures']}" if record_run["parseFailures"] else None
            if validation_errors and max_attempts > 1:
                parsed, repair_run = repair_qwen_records(
                    input_payload,
                    parsed,
                    model=model,
                    base_url=base_url,
                    timeout=timeout,
                    prompt_version=prompt_version,
                    max_rounds=max_attempts - 1,
                )
                attempts += repair_run["calls"]
                response["eval_count"] += repair_run["outputTokens"]
                response["eval_duration"] += repair_run["evalDuration"]
                validation = validate_renderer_output(
                    input_payload,
                    parsed,
                    enforce_grounding=enforce_grounding,
                    enforce_skeleton=enforce_skeleton,
                    body_min_length=body_min_length,
                )
                validation_errors = validation["errors"]
        else:
            schema = build_output_schema(input_payload, body_min_length=body_min_length)
            messages = [
                {"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(input_payload, ensure_ascii=False)},
            ]
            while attempts < max_attempts:
                attempts += 1
                response = _post_json(
                    f"{base_url.rstrip('/')}/api/chat",
                    {
                        "model": model,
                        "messages": messages,
                        "stream": False,
                        "format": schema,
                        "think": False,
                        "keep_alive": "15m",
                        "options": {"temperature": 0, "seed": 42, "num_ctx": 32768, "num_predict": 8192},
                    },
                    timeout,
                )
                content = response.get("message", {}).get("content", "")
                try:
                    parsed = json.loads(content)
                    parse_error = None
                except (json.JSONDecodeError, TypeError) as exc:
                    parsed = None
                    parse_error = str(exc)
                validation = validate_renderer_output(
                    input_payload,
                    parsed,
                    enforce_grounding=enforce_grounding,
                    enforce_skeleton=enforce_skeleton,
                    body_min_length=body_min_length,
                )
                validation_errors = validation["errors"]
                if validation["valid"]:
                    break
                messages.extend(
                    [
                        {"role": "assistant", "content": content},
                        {
                            "role": "user",
                            "content": build_revision_instruction(
                                validation_errors,
                                input_payload.get("bodyLengthPlan"),
                                input_payload,
                            ),
                        },
                    ]
                )
        elapsed = time.perf_counter() - started
        if parsed is None:
            parsed = {"status": "invalid", "parseError": parse_error}
        output_path = output_dir / input_path.name
        output_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        paths.append(output_path)
        metadata.append(
            {
                "profileSeed": input_payload["profileSeed"],
                "attempts": attempts,
                "elapsedSeconds": round(elapsed, 4),
                "doneReason": response.get("done_reason"),
                "promptTokens": response.get("prompt_eval_count"),
                "outputTokens": response.get("eval_count"),
                "evalTokensPerSecond": round(
                    response.get("eval_count", 0) / (response.get("eval_duration", 1) / 1_000_000_000), 4
                ) if response.get("eval_duration") else None,
                "parseError": parse_error,
                "validationErrors": validation_errors,
                "promptVersion": prompt_version,
                "unsupportedClaims": validation.get("unsupportedClaims", []),
            }
        )
        print(f"{input_payload['profileSeed']}: attempts={attempts} valid={not validation_errors} elapsed={elapsed:.1f}s", flush=True)
    (output_dir / "run-metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return paths


def assemble_directory(
    input_dir: Path,
    draft_dir: Path,
    output_dir: Path,
    *,
    generator_model: str,
    seeds_path: Path,
    prompt_version: str = "synthetic-profile-v4",
) -> list[Path]:
    categories = load_seed_categories(seeds_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for input_path in sorted(input_dir.glob("*.json")):
        draft_path = draft_dir / input_path.name
        profile = assemble_profile(
            json.loads(input_path.read_text(encoding="utf-8")),
            json.loads(draft_path.read_text(encoding="utf-8")),
            categories,
            generator_model=generator_model,
            prompt_version=prompt_version,
        )
        output_path = output_dir / input_path.name
        output_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        outputs.append(output_path)
    return outputs


def normalize_run_metadata(payload: Any) -> dict[str, dict[str, Any]]:
    if isinstance(payload, list):
        return {item["profileSeed"]: item for item in payload}
    if isinstance(payload, dict) and isinstance(payload.get("profiles"), dict):
        return {
            profile_seed: {"profileSeed": profile_seed, **values}
            for profile_seed, values in payload["profiles"].items()
        }
    raise ValueError("unsupported run metadata format")


def compare_directories(input_dir: Path, model_dirs: dict[str, Path]) -> dict[str, Any]:
    results: dict[str, Any] = {"models": {}}
    for model_name, draft_dir in model_dirs.items():
        metadata_path = draft_dir / "run-metadata.json"
        metadata = normalize_run_metadata(
            json.loads(metadata_path.read_text(encoding="utf-8"))
        ) if metadata_path.exists() else {}
        profile_scores = []
        for input_path in sorted(input_dir.glob("*.json")):
            payload = json.loads(input_path.read_text(encoding="utf-8"))
            draft = json.loads((draft_dir / input_path.name).read_text(encoding="utf-8"))
            run = metadata.get(payload["profileSeed"], {})
            profile_scores.append(
                score_draft(
                    payload,
                    draft,
                    elapsed_seconds=run.get("elapsedSeconds"),
                    output_tokens=run.get("outputTokens"),
                    body_min_length=body_min_length_for_prompt(
                        run.get("promptVersion", "synthetic-profile-v4")
                    ),
                )
            )
        results["models"][model_name] = {
            "profiles": profile_scores,
            "schemaPassRate": round(sum(item["schemaValid"] for item in profile_scores) / len(profile_scores), 4),
            "recordCompletionRate": round(statistics.fmean(item["recordCompletionRate"] for item in profile_scores), 4),
            "factTokenCoverage": round(statistics.fmean(item["factTokenCoverage"] for item in profile_scores), 4),
            "inventedNumberCount": sum(len(item["inventedNumbers"]) for item in profile_scores),
            "duplicateRecordPairs": sum(item["duplicateRecordPairs"] for item in profile_scores),
            "clicheCount": sum(item["clicheCount"] for item in profile_scores),
            "groundingPassRate": round(sum(item["groundingValid"] for item in profile_scores) / len(profile_scores), 4),
            "unsupportedClaimCount": sum(item["unsupportedClaimCount"] for item in profile_scores),
            "repetitiveMetaCount": sum(item["repetitiveMetaCount"] for item in profile_scores),
            "bodyLengthMean": round(statistics.fmean(item["bodyLengthMean"] for item in profile_scores), 2),
            "elapsedSecondsTotal": round(sum(item["elapsedSeconds"] or 0 for item in profile_scores), 2),
        }
    return results


def _add_qwen_arguments(parser: argparse.ArgumentParser, *, prompt_version: str) -> None:
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--model", default="qwen3:30b-a3b-instruct-2507-q4_K_M")
    parser.add_argument("--base-url", default="http://127.0.0.1:11434")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--prompt-version", default=prompt_version)
    parser.add_argument("--max-attempts", type=int, default=3)


def _add_assemble_arguments(parser: argparse.ArgumentParser, *, prompt_version: str) -> None:
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("draft_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--model", required=True)
    parser.add_argument("--seeds", type=Path, default=DEFAULT_SEEDS_PATH)
    parser.add_argument("--prompt-version", default=prompt_version)


def build_cli_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("output_dir", type=Path)
    prepare_parser.add_argument("--seeds", type=Path, default=DEFAULT_SEEDS_PATH)
    prepare_v42_parser = subparsers.add_parser("prepare-v4.2")
    prepare_v42_parser.add_argument("output_dir", type=Path)
    prepare_v42_parser.add_argument("--seeds", type=Path, default=DEFAULT_SEEDS_PATH)
    qwen_parser = subparsers.add_parser("qwen")
    _add_qwen_arguments(qwen_parser, prompt_version="synthetic-profile-v4")
    qwen_parser.add_argument("--enforce-grounding", action="store_true")
    qwen_parser.add_argument("--enforce-skeleton", action="store_true")
    qwen_v42_parser = subparsers.add_parser("qwen-v4.2")
    _add_qwen_arguments(qwen_v42_parser, prompt_version="synthetic-profile-v4.2")
    qwen_v42_parser.set_defaults(enforce_grounding=False, enforce_skeleton=True)
    assemble_parser = subparsers.add_parser("assemble")
    _add_assemble_arguments(assemble_parser, prompt_version="synthetic-profile-v4")
    assemble_v42_parser = subparsers.add_parser("assemble-v4.2")
    _add_assemble_arguments(assemble_v42_parser, prompt_version="synthetic-profile-v4.2")
    compare_parser = subparsers.add_parser("compare")
    compare_parser.add_argument("input_dir", type=Path)
    compare_parser.add_argument("output", type=Path)
    compare_parser.add_argument("--model-dir", action="append", required=True)
    return parser


def main() -> None:
    args = build_cli_parser().parse_args()

    if args.command == "prepare":
        for path in prepare_pilot_inputs(args.output_dir, load_seed_categories(args.seeds)):
            print(path)
    elif args.command == "prepare-v4.2":
        for path in prepare_length_pilot_inputs(args.output_dir, load_seed_categories(args.seeds)):
            print(path)
    elif args.command in {"qwen", "qwen-v4.2"}:
        generate_qwen(
            sorted(args.input_dir.glob("*.json")),
            args.output_dir,
            model=args.model,
            base_url=args.base_url,
            timeout=args.timeout,
            prompt_version=args.prompt_version,
            enforce_grounding=args.enforce_grounding,
            enforce_skeleton=args.enforce_skeleton,
            max_attempts=args.max_attempts,
        )
    elif args.command in {"assemble", "assemble-v4.2"}:
        assemble_directory(
            args.input_dir,
            args.draft_dir,
            args.output_dir,
            generator_model=args.model,
            seeds_path=args.seeds,
            prompt_version=args.prompt_version,
        )
    elif args.command == "compare":
        model_dirs = {}
        for item in args.model_dir:
            label, separator, path = item.partition("=")
            if not separator:
                raise ValueError("--model-dir는 LABEL=PATH 형식이어야 합니다")
            model_dirs[label] = Path(path)
        result = compare_directories(args.input_dir, model_dirs)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
