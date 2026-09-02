"""합성 프로필 v4 초안을 검증하고 Expresso 객체로 조립한다."""

from __future__ import annotations

import hashlib
import json
import random
import re
import uuid
from copy import deepcopy
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from statistics import NormalDist, fmean
from typing import Any


CATEGORY_KEYS = (
    "experience",
    "project",
    "education_history",
    "certification_award",
    "academic_writing",
    "activity_leadership",
    "skill_tool",
)
BASIC_PROPERTY_KEYS = {
    "experience": ("role", "organization"),
    "project": ("role", "technologies"),
    "education_history": ("institution", "program", "startMonth", "endMonth"),
    "certification_award": ("issuer", "issuedMonth"),
    "academic_writing": ("publication", "publishedMonth"),
    "activity_leadership": ("role", "organization"),
    "skill_tool": ("group",),
}
RECORD_FIELDS = {"draftId", "eventId", "categoryKey", "title", "properties", "bodyMd"}
PERSONA_FIELDS = {"targetRoles", "experienceYears", "primaryGoal"}
PROTECTED_TEXT = re.compile(
    r"\b(?:sampid|hid|respondent(?:Id)?|row(?:Id|Number)|gender|birth(?:Date|Month)?|salary|income)\b",
    re.IGNORECASE,
)
UUID_NAMESPACE = uuid.UUID("535f1110-bd33-4606-8bd8-a9ca3bbb0e7d")
PROMPT_VERSION = "synthetic-profile-v4"
PROMPT_PATH = Path(__file__).parent / "prompts" / f"{PROMPT_VERSION}.md"


def body_min_length_for_prompt(prompt_version: str) -> int:
    return 20 if prompt_version == "synthetic-profile-v4.1" else 40


def build_body_length_plans(
    profile_count: int,
    *,
    target_min_chars: int = 40,
    target_max_chars: int = 800,
    population_mean_chars: int = 300,
    population_std_chars: int = 160,
    record_max_chars: int = 1000,
    seed: int = 42,
) -> list[dict[str, Any]]:
    if profile_count < 1:
        raise ValueError("profile_count must be positive")
    if not 0 < target_min_chars < population_mean_chars < target_max_chars:
        raise ValueError("body length bounds must contain the population mean")
    if population_std_chars < 1:
        raise ValueError("population_std_chars must be positive")
    if record_max_chars < target_max_chars:
        raise ValueError("record_max_chars must be at least target_max_chars")

    distribution = NormalDist(population_mean_chars, population_std_chars)
    plans = []
    for index in range(profile_count):
        quantile = (index + 0.5) / profile_count
        target = round(distribution.inv_cdf(quantile))
        target = max(target_min_chars, min(target_max_chars, target))
        if target < population_mean_chars - population_std_chars:
            band = "very_short"
        elif target < population_mean_chars:
            band = "moderately_short"
        elif target < population_mean_chars + population_std_chars:
            band = "moderately_long"
        else:
            band = "very_long"
        plans.append(
            {
                "distributionVersion": "clipped-normal-v2",
                "targetMinChars": target_min_chars,
                "targetMaxChars": target_max_chars,
                "recordMaxChars": record_max_chars,
                "populationMeanChars": population_mean_chars,
                "populationStdChars": population_std_chars,
                "targetMeanChars": target,
                "toleranceChars": max(10, round(target * 0.15)),
                "band": band,
            }
        )
    random.Random(seed).shuffle(plans)
    return plans


def assign_body_length_plans(
    input_payloads: list[dict[str, Any]],
    *,
    target_min_chars: int = 40,
    target_max_chars: int = 800,
    population_mean_chars: int = 300,
    population_std_chars: int = 160,
    record_max_chars: int = 1000,
    seed: int = 42,
) -> list[dict[str, Any]]:
    """배치의 각 프로필 입력에 서로 다른 평균 본문 길이 계획을 붙인다."""
    plans = build_body_length_plans(
        len(input_payloads),
        target_min_chars=target_min_chars,
        target_max_chars=target_max_chars,
        population_mean_chars=population_mean_chars,
        population_std_chars=population_std_chars,
        record_max_chars=record_max_chars,
        seed=seed,
    )
    planned_payloads = deepcopy(input_payloads)
    for payload, plan in zip(planned_payloads, plans, strict=True):
        payload["bodyLengthPlan"] = plan
        payload["renderingPolicy"] = "skeleton-grounded-creative-v1"
        _attach_record_length_targets(payload)
    return planned_payloads


def _attach_record_length_targets(payload: dict[str, Any]) -> None:
    events = payload.get("events", [])
    if not events:
        return
    validate_creative_property_values(payload)
    plan = payload["bodyLengthPlan"]
    target_mean = plan["targetMeanChars"]
    seed_bytes = hashlib.sha256(f"{payload['profileSeed']}:body-length".encode()).digest()[:8]
    rng = random.Random(int.from_bytes(seed_bytes, "big"))
    weights = [rng.uniform(0.85, 1.15) for _ in events]
    weight_mean = fmean(weights)
    targets = [round(target_mean * weight / weight_mean) for weight in weights]
    for event, target in zip(events, targets, strict=True):
        event["skeletonLead"] = " ".join(
            f"{str(fact).strip().rstrip('.')}." for fact in event.get("facts", [])
        )
        minimum = max(40, round(target * 0.90))
        maximum = min(plan["recordMaxChars"], max(minimum + 20, round(target * 1.15)))
        event["bodyLengthTarget"] = {
            "targetChars": target,
            "minChars": minimum,
            "maxChars": maximum,
        }


def validate_creative_property_values(payload: dict[str, Any]) -> None:
    """LLM 호출 전에 모든 노출 프로퍼티 값이 골격에서 확정됐는지 검사한다."""
    for event in payload.get("events", []):
        property_keys = event.get("propertyKeys")
        property_values = event.get("propertyValues")
        if (
            not isinstance(property_keys, list)
            or not isinstance(property_values, dict)
            or set(property_keys) != set(property_values)
        ):
            raise ValueError(
                f"{event.get('eventId', 'unknown')}: propertyValues must exactly match propertyKeys"
            )


def _stable_uuid(*parts: str) -> str:
    return str(uuid.uuid5(UUID_NAMESPACE, ":".join(parts)))


def _property_value_valid(value: Any, property_type: str) -> bool:
    if property_type == "text":
        return isinstance(value, str) and bool(value.strip())
    if property_type == "tags":
        return (
            isinstance(value, list)
            and bool(value)
            and all(isinstance(item, str) and bool(item.strip()) for item in value)
        )
    if property_type == "date":
        return isinstance(value, str) and re.fullmatch(r"\d{4}-(?:0[1-9]|1[0-2])", value) is not None
    return False


def _event(
    number: int,
    category_key: str,
    facts: list[str],
    property_keys: list[str],
    *,
    property_values: dict[str, Any] | None = None,
    survey: list[str] | None = None,
    narrative: list[str] | None = None,
    synthetic: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "eventId": f"ev{number}",
        "categoryKey": category_key,
        "timeOrder": number,
        "facts": facts,
        "propertyKeys": property_keys,
        "propertyValues": property_values or {},
        "provenance": {
            "surveyCalibration": survey or [],
            "narrativeEvidence": narrative or [],
            "syntheticFields": synthetic or [],
        },
    }


def build_pilot_inputs(property_schema: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
    """동일 렌더러 비교에 쓰는 5·9·14개 기록 골격을 만든다.

    사건 수와 프로퍼티 계획은 모델 호출 전에 고정한다. 아래 사건은 특정 조사 응답자의
    궤적이 아니라 YP2021 집계 전이와 공개 면접 서술 atom을 조합한 파일럿 골격이다.
    """
    profiles = [
        {
            "profileSeed": "v4-pilot-005",
            "profileFamily": "pilot-public-project",
            "split": "pilot",
            "persona": {"targetRoles": ["기획 · PM"], "experienceYears": 4, "primaryGoal": "organize"},
            "events": [
                _event(1, "education_history", ["행정학 계열 학사 과정을 2018-03에 시작해 2022-02에 마쳤다"], ["program", "startMonth"], property_values={"program": "행정학 계열 학사 과정", "startMonth": "2018-03"}, survey=["yp2021:v1:education_completion"]),
                _event(2, "activity_leadership", ["지역 문제를 조사하고 개선안을 정리하는 직업교육훈련에 참여했다"], [], survey=["yp2021:v1:training_after_education"], synthetic=["training_provider"]),
                _event(3, "project", ["오염도를 측정해 웹사이트에 게시하는 프로젝트에서 업무 분담과 협약을 조율했다", "프로젝트를 끝까지 마무리했다"], ["role"], property_values={"role": "업무 분담·협약 조율"}, narrative=["aih-71592-ckmk_d_ps_m_n_308337"]),
                _event(4, "project", ["마을을 관광지로 바꾸는 프로젝트에서 현장 분위기와 최신 흐름을 조사했다", "조사 결과를 바탕으로 공간 변화안을 기획하고 완성까지 참여했다"], [], narrative=["aih-71592-ckmk_d_ps_m_n_387220"]),
                _event(5, "experience", ["공공 프로젝트 운영 실무를 4년간 담당했다", "기획안 정리, 참여자 조율, 결과 보고를 맡았다"], ["role"], property_values={"role": "공공 프로젝트 운영"}, survey=["yp2021:v1:first_job_duration", "yp2021:v1:occupation_industry_transition"], synthetic=["organization"]),
            ],
        },
        {
            "profileSeed": "v4-pilot-009",
            "profileFamily": "pilot-data-career",
            "split": "pilot",
            "persona": {"targetRoles": ["데이터"], "experienceYears": 3, "primaryGoal": "build"},
            "events": [
                _event(1, "education_history", ["정보통신 계열 학사 과정을 2017-03에 시작해 2021-02에 마쳤다", "수업에서 데이터베이스 기초를 배웠다"], ["program", "startMonth"], property_values={"program": "정보통신 계열 학사 과정", "startMonth": "2017-03"}, survey=["yp2021:v1:major_to_first_job"], synthetic=["institution"]),
                _event(2, "certification_award", ["2021-06에 데이터 분석 기초 자격을 취득했다"], ["issuedMonth"], property_values={"issuedMonth": "2021-06"}, survey=["yp2021:v1:qualification_after_education"], synthetic=["issuer", "certificate_name"]),
                _event(3, "activity_leadership", ["취업 준비 기간에 Python과 SQL을 활용한 데이터 처리 훈련을 3개월 이수했다"], [], survey=["yp2021:v1:training_field_duration"], synthetic=["training_provider"]),
                _event(4, "project", ["Python으로 공공데이터의 형식을 통일하고 결측값 처리 기준을 문서화했다", "정리된 데이터를 팀 분석에 사용할 수 있게 전달했다"], ["technologies"], property_values={"technologies": ["Python"]}, narrative=["aih-71592-ckmk_d_ps_f_e_287617"], synthetic=["dataset_name"]),
                _event(5, "skill_tool", ["프로젝트와 훈련에서 Python과 SQL을 반복해서 사용했다", "간단한 분석 결과를 표와 그래프로 정리했다"], [], survey=["yp2021:v1:training_to_job"], narrative=["aih-71592-ckmk_d_ps_f_e_287617"]),
                _event(6, "experience", ["2021-09부터 데이터 운영 보조 업무를 담당했다", "정기 적재 결과와 오류 목록을 확인했다"], ["role"], property_values={"role": "데이터 운영 보조"}, survey=["yp2021:v1:first_job_start", "yp2021:v1:occupation_industry_transition"], synthetic=["organization"]),
                _event(7, "project", ["반복 점검 항목을 체크리스트로 만들고 팀이 같은 순서로 확인하도록 정리했다", "누락된 확인 절차를 줄였다"], [], narrative=["aih-71592-ckmk_d_ps_m_n_377304"], synthetic=["metric"]),
                _event(8, "experience", ["첫 일자리 이후 같은 데이터 직군으로 이직했다", "데이터 정제와 운영 현황 보고를 맡았다"], [], survey=["yp2021:v1:job_change_interval", "yp2021:v1:same_occupation_transition"], synthetic=["organization", "job_start_month"]),
                _event(9, "activity_leadership", ["신입 구성원에게 데이터 점검 순서와 오류 기록 방법을 설명했다", "실제 작업 예시를 함께 확인했다"], [], narrative=["aih-71592-ckmk_d_ps_m_n_324460"]),
            ],
        },
        {
            "profileSeed": "v4-pilot-014",
            "profileFamily": "pilot-rnd-career",
            "split": "pilot",
            "persona": {"targetRoles": ["ML · AI"], "experienceYears": 6, "primaryGoal": "organize"},
            "events": [
                _event(1, "education_history", ["기계공학 계열 학사 과정을 2013-03에 시작해 2017-02에 마쳤다", "실험과 기초 프로그래밍 수업을 이수했다"], ["program"], property_values={"program": "기계공학 계열 학사 과정"}, survey=["yp2021:v1:major_to_first_job"], synthetic=["institution"]),
                _event(2, "activity_leadership", ["학부 실험실에서 분석 기기와 실험 일정을 관리했다"], [], narrative=["aih-71592-ckmk_d_rnd_m_n_497009"]),
                _event(3, "project", ["분석 기기 관리 프로그램 프로젝트의 전체 일정을 작성하고 진행 상황을 총괄했다"], [], narrative=["aih-71592-ckmk_d_rnd_m_n_497009"], synthetic=["project_name"]),
                _event(4, "academic_writing", ["대학원에서 사회 실험을 포함한 연구를 수행했다", "연구 과정에서 참여자 보호와 연구 윤리 점검 항목을 기록했다"], [], narrative=["aih-71592-ckmk_d_rnd_m_n_252381"], survey=["yp2021:v1:graduate_education"]),
                _event(5, "activity_leadership", ["첫 취업 전 Python 데이터 처리 직업교육훈련을 4개월 이수했다"], [], survey=["yp2021:v1:training_field_duration"], synthetic=["training_provider"]),
                _event(6, "certification_award", ["2018-05에 데이터 처리 관련 자격을 취득했다"], ["issuedMonth"], property_values={"issuedMonth": "2018-05"}, survey=["yp2021:v1:qualification_timing"], synthetic=["issuer", "certificate_name"]),
                _event(7, "experience", ["2018-07부터 제조 분야 연구개발 보조 업무를 담당했다", "실험 데이터 정리와 장비 상태 기록을 맡았다"], ["role"], property_values={"role": "제조 분야 연구개발 보조"}, survey=["yp2021:v1:first_job_start", "yp2021:v1:industry_occupation_pair"], synthetic=["organization"]),
                _event(8, "project", ["실험 결과를 반복해서 정리하던 절차를 Python 스크립트로 바꿨다", "파일 이름과 측정 항목을 같은 형식으로 맞췄다"], [], narrative=["aih-71592-ckmk_d_rnd_m_n_481072"], synthetic=["technology_detail"]),
                _event(9, "activity_leadership", ["재직 중 머신러닝 기초와 예측 모델 실습 훈련을 6개월 이수했다"], [], survey=["yp2021:v1:training_during_job"], synthetic=["training_provider"]),
                _event(10, "academic_writing", ["설비 측정값 변화와 점검 결과의 관계를 사내 기술 문서로 정리했다", "분석 범위와 한계를 함께 기록했다"], [], narrative=["aih-71592-ckmk_d_rnd_m_n_252381"], synthetic=["publication_title"]),
                _event(11, "experience", ["첫 일자리 종료 후 5개월 뒤 연구개발 데이터 직무로 이직했다", "실험 데이터 파이프라인 운영과 분석 지원을 담당했다"], [], survey=["yp2021:v1:job_change_interval", "yp2021:v1:occupation_transition"], synthetic=["organization", "job_start_month"]),
                _event(12, "project", ["설비 이상 징후를 찾는 예측 모델 파일럿에서 데이터 전처리와 검증 데이터 구성을 맡았다", "현장 점검 결과와 예측 결과가 다른 사례를 따로 정리했다"], [], narrative=["aih-71592-ckmk_d_rnd_m_n_355563"], synthetic=["model_type", "metric"]),
                _event(13, "skill_tool", ["업무에서 Python, SQL, Jupyter를 사용해 실험 데이터와 모델 결과를 확인했다"], [], survey=["yp2021:v1:training_to_same_occupation"], synthetic=["last_used_month"]),
                _event(14, "activity_leadership", ["새로 합류한 연구원에게 데이터 저장 규칙과 실험 기록 확인 순서를 설명했다", "첫 분석 작업을 함께 검토했다"], [], narrative=["aih-71592-ckmk_d_rnd_m_n_496730"]),
            ],
        },
    ]
    return [
        {
            "schemaVersion": 4,
            "sourceDataset": "YP2021-AGGREGATE+AIHUB-71592",
            "profileSeed": profile["profileSeed"],
            "profileFamily": profile["profileFamily"],
            "split": profile["split"],
            "persona": profile["persona"],
            "targetRecordCount": len(profile["events"]),
            "propertySchema": property_schema,
            "events": profile["events"],
        }
        for profile in profiles
    ]


def build_length_pilot_inputs(property_schema: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
    """v4.2의 네 평균 본문 길이 구간을 실제 로컬 모델로 점검할 입력을 만든다."""
    base = build_pilot_inputs(property_schema)
    variants = [deepcopy(base[0]), deepcopy(base[1]), deepcopy(base[2]), deepcopy(base[2])]
    configurations = (
        ("very-short", "very_short", 100),
        ("moderately-short", "moderately_short", 220),
        ("moderately-long", "moderately_long", 380),
        ("very-long", "very_long", 520),
    )
    for payload, (seed_suffix, band, target) in zip(variants, configurations, strict=True):
        original_seed = payload["profileSeed"]
        payload["profileSeed"] = f"v4.2-length-{seed_suffix}"
        payload["profileFamily"] = f"length-pilot:{original_seed}"
        payload["renderingPolicy"] = "skeleton-grounded-creative-v1"
        payload["bodyLengthPlan"] = {
            "distributionVersion": "clipped-normal-v2",
            "targetMinChars": 40,
            "targetMaxChars": 800,
            "recordMaxChars": 1000,
            "populationMeanChars": 300,
            "populationStdChars": 160,
            "targetMeanChars": target,
            "toleranceChars": max(10, round(target * 0.15)),
            "band": band,
        }
        _attach_record_length_targets(payload)
    return variants


def basic_property_schema(seed_categories: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    category_by_key = {category["key"]: category for category in seed_categories}
    if set(category_by_key) != set(CATEGORY_KEYS):
        raise ValueError("exactly seven system career categories are required")
    return {
        category_key: {
            key: category_by_key[category_key]["propertySchema"][key]["type"]
            for key in keys
            if key in category_by_key[category_key]["propertySchema"]
        }
        for category_key, keys in BASIC_PROPERTY_KEYS.items()
    }


def prepare_pilot_inputs(output_dir: str | Path, seed_categories: list[dict[str, Any]]) -> list[Path]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for payload in build_pilot_inputs(basic_property_schema(seed_categories)):
        path = output_dir / f"{payload['profileSeed']}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        paths.append(path)
    return paths


def prepare_length_pilot_inputs(
    output_dir: str | Path,
    seed_categories: list[dict[str, Any]],
) -> list[Path]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    property_schema = basic_property_schema(seed_categories)
    for payload in build_length_pilot_inputs(property_schema):
        path = output_dir / f"{payload['profileSeed']}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        paths.append(path)
    return paths


def validate_draft(input_payload: dict[str, Any], draft: Any, *, body_min_length: int = 40) -> dict[str, Any]:
    """모델 초안이 코드가 결정한 사건·프로퍼티 계획을 그대로 따르는지 검사한다."""
    errors: list[str] = []
    if not isinstance(draft, dict):
        return {"valid": False, "errors": ["draft_not_object"], "propertyCounts": {"0": 0, "1": 0, "2": 0}}

    if set(draft) != {"status", "profileSeed", "persona", "records"}:
        errors.append("root_fields")
    if draft.get("status") != "generated":
        errors.append("status")
    if draft.get("profileSeed") != input_payload.get("profileSeed"):
        errors.append("profile_seed")
    if draft.get("persona") != input_payload.get("persona"):
        errors.append("persona")

    events = input_payload.get("events") if isinstance(input_payload.get("events"), list) else []
    records = draft.get("records") if isinstance(draft.get("records"), list) else []
    expected_event_ids = [event.get("eventId") for event in events]
    actual_event_ids = [record.get("eventId") for record in records if isinstance(record, dict)]
    if (
        len(records) != input_payload.get("targetRecordCount")
        or len(records) != len(events)
        or actual_event_ids != expected_event_ids
    ):
        errors.append("event_sequence")

    property_counts = Counter({"0": 0, "1": 0, "2": 0})
    body_lengths: list[int] = []
    length_plan = input_payload.get("bodyLengthPlan")
    body_max_length = 450
    if length_plan is not None:
        version = length_plan.get("distributionVersion") if isinstance(length_plan, dict) else None
        required_length_fields = (
            {
                "distributionVersion",
                "targetMinChars",
                "targetMaxChars",
                "recordMaxChars",
                "populationMeanChars",
                "populationStdChars",
                "targetMeanChars",
                "toleranceChars",
                "band",
            }
            if version in {"truncated-normal-v2", "clipped-normal-v2"}
            else {
                "distributionVersion",
                "upperBoundChars",
                "populationMeanChars",
                "populationStdChars",
                "targetMeanChars",
                "toleranceChars",
                "band",
            }
        )
        if not isinstance(length_plan, dict) or not required_length_fields.issubset(length_plan):
            errors.append("body_length_plan")
            length_plan = None
        elif isinstance(length_plan.get("recordMaxChars"), int):
            body_max_length = length_plan["recordMaxChars"]
        elif isinstance(length_plan.get("upperBoundChars"), int):
            body_max_length = length_plan["upperBoundChars"]
    event_by_id = {event.get("eventId"): event for event in events}
    property_schema = input_payload.get("propertySchema", {})
    for index, record in enumerate(records, start=1):
        prefix = f"record_{index}"
        if not isinstance(record, dict):
            errors.append(f"{prefix}_object")
            continue
        if set(record) != RECORD_FIELDS:
            errors.append(f"{prefix}_fields")
        if record.get("draftId") != f"r{index}":
            errors.append(f"{prefix}_draft_id")
        event = event_by_id.get(record.get("eventId"))
        if not event:
            errors.append(f"{prefix}_event")
            continue
        category_key = record.get("categoryKey")
        if category_key != event.get("categoryKey") or category_key not in CATEGORY_KEYS:
            errors.append(f"{prefix}_category")
        title = record.get("title")
        body = record.get("bodyMd")
        if not isinstance(title, str) or not 1 <= len(title.strip()) <= 100:
            errors.append(f"{prefix}_title")
        # 사건별 길이는 생성 다양성을 위한 가이드다. 합격 여부는 프로필 평균과
        # 기록 안전 상한으로만 결정해 짧고 긴 기록이 한 프로필 안에 공존하게 한다.
        if not isinstance(body, str) or not body_min_length <= len(body.strip()) <= body_max_length:
            errors.append(f"{prefix}_body")
        elif isinstance(body, str):
            body_lengths.append(len(body.strip()))
            skeleton_lead = event.get("skeletonLead")
            if isinstance(skeleton_lead, str) and not body.strip().startswith(skeleton_lead):
                errors.append(f"{prefix}_skeleton_lead")
        visible_text = f"{title or ''} {body or ''}"
        if PROTECTED_TEXT.search(visible_text):
            errors.append(f"{prefix}_protected_text")

        properties = record.get("properties")
        if not isinstance(properties, dict):
            errors.append(f"{prefix}_properties")
            continue
        planned_keys = event.get("propertyKeys") if isinstance(event.get("propertyKeys"), list) else []
        if len(properties) > 2 or set(properties) != set(planned_keys):
            errors.append(f"{prefix}_property_keys")
        property_counts[str(min(len(properties), 2))] += 1
        category_schema = property_schema.get(category_key, {}) if isinstance(property_schema, dict) else {}
        for key, value in properties.items():
            if key not in category_schema or not _property_value_valid(value, category_schema.get(key)):
                errors.append(f"{prefix}_property_{key}")

    body_length_mean = round(fmean(body_lengths), 2) if body_lengths else 0.0
    if length_plan is not None:
        target = length_plan.get("targetMeanChars")
        tolerance = length_plan.get("toleranceChars")
        if not isinstance(target, (int, float)) or not isinstance(tolerance, (int, float)) or tolerance < 0:
            errors.append("body_length_plan")
        elif abs(body_length_mean - target) > tolerance:
            errors.append("body_length_mean")

    return {
        "valid": not errors,
        "errors": list(dict.fromkeys(errors)),
        "propertyCounts": dict(property_counts),
        "bodyLengthMean": body_length_mean,
    }


def assemble_profile(
    input_payload: dict[str, Any],
    draft: dict[str, Any],
    seed_categories: list[dict[str, Any]],
    *,
    generator_model: str,
    prompt_version: str = PROMPT_VERSION,
    created_at: str | None = None,
) -> dict[str, Any]:
    """검증된 v4 초안을 실제 Expresso 합성 프로필 객체로 바꾼다."""
    validation = validate_draft(
        input_payload,
        draft,
        body_min_length=body_min_length_for_prompt(prompt_version),
    )
    if not validation["valid"]:
        raise ValueError(", ".join(validation["errors"]))
    if {category["key"] for category in seed_categories} != set(CATEGORY_KEYS):
        raise ValueError("exactly seven system career categories are required")

    created_at = created_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    profile_seed = input_payload["profileSeed"]
    category_by_key = {category["key"]: category for category in seed_categories}
    event_by_id = {event["eventId"]: event for event in input_payload["events"]}
    counts = Counter(record["categoryKey"] for record in draft["records"])
    records = []
    lineage = []
    for record in draft["records"]:
        category = category_by_key[record["categoryKey"]]
        record_id = _stable_uuid(profile_seed, "record", record["eventId"])
        records.append(
            {
                "id": record_id,
                "categoryId": category["_id"],
                "title": record["title"],
                "status": "organized",
                "origin": "ai",
                "properties": record["properties"],
                "bodyMd": record["bodyMd"],
                "version": 1,
                "updatedAt": created_at,
            }
        )
        provenance = event_by_id[record["eventId"]]["provenance"]
        lineage.append(
            {
                "recordId": record_id,
                "eventId": record["eventId"],
                "surveyCalibration": provenance["surveyCalibration"],
                "narrativeEvidence": provenance["narrativeEvidence"],
                "sourceFamilies": provenance.get("sourceFamilies", []),
                "syntheticFields": provenance["syntheticFields"],
            }
        )

    categories = [
        {
            "id": category["_id"],
            "key": category["key"],
            "name": category["name"],
            "icon": category["icon"],
            "defaultView": category["defaultView"],
            "isSystem": category["isSystem"],
            "propertySchema": category["propertySchema"],
            "sortOrder": category["sortOrder"],
            "recordCount": counts[category["key"]],
            "version": category["version"],
        }
        for category in sorted(seed_categories, key=lambda item: item["sortOrder"])
    ]
    prompt_path = Path(__file__).parent / "prompts" / f"{prompt_version}.md"
    prompt_sha = hashlib.sha256(prompt_path.read_bytes()).hexdigest() if prompt_path.exists() else None
    profile_identity = generator_model if prompt_version == PROMPT_VERSION else f"{generator_model}:{prompt_version}"
    return {
        "schemaVersion": 1,
        "syntheticProfileId": _stable_uuid(profile_seed, "profile", profile_identity),
        "datasetMeta": {
            "sourceDataset": input_payload.get("sourceDataset", "YP2021-AGGREGATE+AIHUB-71592"),
            "profileSeed": profile_seed,
            "profileFamily": input_payload.get("profileFamily"),
            "split": input_payload.get("split"),
            "generatorModel": generator_model,
            "promptVersion": prompt_version,
            "promptSha256": prompt_sha,
            "targetRecordCount": input_payload["targetRecordCount"],
            "actualRecordCount": len(records),
            "bodyLengthPlan": input_payload.get("bodyLengthPlan"),
            "actualBodyLengthMean": validation["bodyLengthMean"],
            "renderingPolicy": input_payload.get("renderingPolicy", "facts-only"),
            "createdAt": created_at,
        },
        "careerProfile": {**draft["persona"], "updatedAt": created_at},
        "categories": categories,
        "records": records,
        "recordLinks": [],
        "skills": [],
        "skillEvidenceBySkillId": {},
        "provenance": {"recordLineage": lineage},
        "humanReview": {
            "status": "pending",
            "reviewer": None,
            "reviewedAt": None,
            "decision": None,
            "notes": None,
        },
    }


def load_json(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))
