"""YP2021·AI Hub 기반 합성 프로필 v4.4 대규모 배치 도구."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import re
import statistics
import time
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import NormalDist
from typing import Any, Callable

from synthetic_profile import load_seed_categories
from synthetic_profile_v4 import (
    assign_body_length_plans,
    assemble_profile,
    body_length_band,
    body_mean_tolerance,
    basic_property_schema,
    body_min_length_for_prompt,
    INTERVIEW_STYLE_MARKERS,
)
from synthetic_profile_v4_experiment import (
    find_evidence_anchor_conflicts,
    generate_qwen_by_record,
    repair_qwen_records,
    validate_renderer_output,
)


PROMPT_VERSION = "synthetic-profile-v4.4"
DEFAULT_MODEL = "qwen3:30b-a3b-instruct-2507-q4_K_M"
DEFAULT_SEEDS_PATH = (
    Path(__file__).parents[2]
    / "packages"
    / "database"
    / "src"
    / "mongodb-migrations"
    / "0001"
    / "seeds.json"
)
SPLIT_ORDER = ("train", "valid", "test")
FAMILY_SIZE = 10
PROPERTY_RATIOS = (0.65, 0.30, 0.05)

DOMAIN_CONFIG = {
    "BM": {
        "slug": "management",
        "roles": ["기획 · PM"],
        "role": "사업 기획",
        "program": "경영·사회 계열 과정",
        "industry": "사업 서비스",
        "tools": ["문서 작성", "일정 관리"],
    },
    "SM": {
        "slug": "sales-marketing",
        "roles": ["기획 · PM", "데이터"],
        "role": "마케팅 기획",
        "program": "경영·사회 계열 과정",
        "industry": "유통·서비스",
        "tools": ["자료 분석", "콘텐츠 관리"],
    },
    "PS": {
        "slug": "public-service",
        "roles": ["기획 · PM"],
        "role": "행정 기획",
        "program": "인문·사회 계열 과정",
        "industry": "공공 서비스",
        "tools": ["문서 작성", "자료 관리"],
    },
    "RND": {
        "slug": "rnd",
        "roles": ["ML · AI", "데이터"],
        "role": "연구개발 데이터 분석",
        "program": "공학·자연 계열 과정",
        "industry": "연구개발·제조",
        "tools": ["Python", "데이터 분석"],
    },
    "ICT": {
        "slug": "ict",
        "roles": ["백엔드", "데이터", "DevOps"],
        "role": "소프트웨어 개발",
        "program": "컴퓨터·정보 계열 과정",
        "industry": "정보통신",
        "tools": ["Python", "SQL"],
    },
    "ARD": {
        "slug": "design",
        "roles": ["디자인"],
        "role": "디자인",
        "program": "예술·디자인 계열 과정",
        "industry": "디자인·콘텐츠",
        "tools": ["디자인 도구", "시각 자료"],
    },
    "MM": {
        "slug": "production",
        "roles": ["기획 · PM", "데이터"],
        "role": "생산 운영",
        "program": "공학·산업 계열 과정",
        "industry": "생산·제조",
        "tools": ["공정 자료", "품질 기록"],
    },
}
FACTUAL_MARKERS = (
    "프로젝트", "경험", "업무", "성과", "달성", "공부", "학습", "자격", "수상",
    "활동", "연구", "개발", "분석", "제작", "참여", "수행", "근무", "사용", "해결",
    "담당", "관리", "작성", "정리", "협업", "조율",
)
HYPOTHETICAL_MARKERS = (
    "입사하게 된다면", "입사한다면", "된다면", "만약", "지원 동기", "희망 부서",
    "앞으로", "하고 싶", "하고자", "할 예정", "할 것입니다", "하겠습니다", "해야 합니다",
    "필요합니다", "중요합니다", "바랍니다", "지원하고", "생각합니다",
    "것 같습니다", "해야 되겠습니다", "하게 된다면", "하게 되면", "하시겠",
    "지원자님", "지원자분", "면접자님", "설명 드리겠습니다", "설명드리겠습니다",
    "면접", "회사에 들어가고 싶", "상향 지원", "지원하게 된", "지원한 이유",
    "말씀드리", "궁금합니다",
    "싶습니다", "할 수 있", "될 수 있",
)
ACTION_MARKERS = (
    "했습니다", "하였습니다", "했으며", "맡았", "진행했", "수행했", "참여했", "개발했",
    "제작했", "분석했", "관리했", "작성했", "정리했", "사용했", "해결했", "근무했",
    "취득했", "수상했", "이끌었", "마무리했", "완료했", "배웠습니다", "익혔습니다",
    "해냈습니다", "해냈다", "끝냈습니다", "끝냈다",
)
EXPERIENCE_QUESTION_MARKERS = (
    "경험", "수행", "해결", "담당", "사례", "성과", "프로젝트", "어려웠던", "이룬",
)
CAREER_CONTEXT_MARKERS = (
    "프로젝트", "인턴", "직장", "회사", "업무", "실무", "연구", "학업", "학교", "대학",
    "수업", "과제", "동아리", "대외 활동", "대외활동", "공모전", "교육", "훈련", "자격",
    "시험", "수상", "조직", "팀원", "팀", "고객", "거래처", "매출", "영업", "보고서",
    "기안", "문서", "개발", "생산", "공정", "품질", "실험", "장비", "설계", "데이터",
    "프로그램", "시스템", "서비스", "기관", "봉사", "활동", "근무", "취업", "창업",
    "사업", "부서", "상사", "동료", "직원", "발표", "논문", "포트폴리오",
)
PROTECTED_PATTERNS = (
    re.compile(r"\b(?:sampid|hid)\b", re.IGNORECASE),
    re.compile(r"(?:연봉|월급|급여|소득|자산|부채)"),
    re.compile(
        r"(?:부모|어머니|아버지|엄마|아빠|가족|배우자|남편|아내|자녀|육아|임신|출산|"
        r"건강|질병|병원|장애|우울|정신질환|성별|나이)"
    ),
)
QUESTION_ECHO_MARKERS = (
    "말씀해",
    "말씀드리",
    "설명해",
    "설명드리",
    "이야기해",
    "궁금합니다",
    "알고 싶습니다",
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def _stable_int(*parts: Any) -> int:
    digest = hashlib.sha256(":|:".join(map(str, parts)).encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


def _quantile_integer_plans(
    count: int,
    *,
    mean: float,
    std: float,
    minimum: int,
    maximum: int,
    seed: int,
) -> list[int]:
    distribution = NormalDist(mean, std)
    values = [
        max(minimum, min(maximum, round(distribution.inv_cdf((index + 0.5) / count))))
        for index in range(count)
    ]
    random.Random(seed).shuffle(values)
    return values


def build_profile_specs(
    *,
    profile_count: int,
    family_size: int = FAMILY_SIZE,
    split_counts: dict[str, int] | None = None,
    seed: int = 20260903,
) -> list[dict[str, Any]]:
    """분할을 family에 먼저 고정하고 프로필별 기록·길이 계획을 배정한다."""
    if profile_count < 1 or family_size < 1 or profile_count % family_size:
        raise ValueError("profile_count must be positive and divisible by family_size")
    split_counts = split_counts or {
        "train": round(profile_count * 0.8),
        "valid": round(profile_count * 0.1),
        "test": profile_count - round(profile_count * 0.8) - round(profile_count * 0.1),
    }
    if set(split_counts) != set(SPLIT_ORDER) or sum(split_counts.values()) != profile_count:
        raise ValueError("split_counts must contain train, valid and test and sum to profile_count")
    if any(value % family_size for value in split_counts.values()):
        raise ValueError("every split count must be divisible by family_size")

    family_count = profile_count // family_size
    domains = tuple(DOMAIN_CONFIG)
    stages = ("new", "early", "mid", "experienced")
    family_numbers = list(range(1, family_count + 1))
    families_by_domain = {
        domain: [number for number in family_numbers if domains[(number - 1) % len(domains)] == domain]
        for domain in domains
    }
    for domain, numbers in families_by_domain.items():
        random.Random(_stable_int(seed, "profile-domain-split", domain)).shuffle(numbers)
    split_by_family: dict[int, str] = {}
    remaining_by_domain = {domain: list(numbers) for domain, numbers in families_by_domain.items()}
    for split in SPLIT_ORDER:
        split_family_count = split_counts[split] // family_size
        if split_family_count == 0:
            continue
        remaining_total = sum(len(numbers) for numbers in remaining_by_domain.values())
        if split == SPLIT_ORDER[-1]:
            allocation = {domain: len(numbers) for domain, numbers in remaining_by_domain.items()}
        else:
            exact = {
                domain: split_family_count * len(numbers) / remaining_total
                for domain, numbers in remaining_by_domain.items()
            }
            allocation = {domain: min(len(remaining_by_domain[domain]), math.floor(value)) for domain, value in exact.items()}
            shortfall = split_family_count - sum(allocation.values())
            ranked = sorted(
                domains,
                key=lambda domain: (-(exact[domain] - allocation[domain]), _stable_int(seed, split, domain)),
            )
            for domain in ranked:
                if shortfall == 0:
                    break
                if allocation[domain] < len(remaining_by_domain[domain]):
                    allocation[domain] += 1
                    shortfall -= 1
        for domain in domains:
            selected = remaining_by_domain[domain][: allocation[domain]]
            remaining_by_domain[domain] = remaining_by_domain[domain][allocation[domain] :]
            for family_number in selected:
                split_by_family[family_number] = split

    record_counts = _quantile_integer_plans(
        profile_count, mean=9, std=4, minimum=1, maximum=20, seed=seed + 1
    )
    # 기존 v4.2 길이 할당기와 동일한 분위수·shuffle 계약을 사용한다.
    placeholder_payloads = [{"profileSeed": str(index), "events": []} for index in range(profile_count)]
    length_plans = [
        payload["bodyLengthPlan"]
        for payload in assign_body_length_plans(placeholder_payloads, seed=seed + 2)
    ]

    specs = []
    sequence = 0
    for family_number in range(1, family_count + 1):
        domain = domains[(family_number - 1) % len(domains)]
        stage = stages[((family_number - 1) // len(domains)) % len(stages)]
        for variant in range(1, family_size + 1):
            sequence += 1
            if stage == "new":
                experience_years = variant % 2
                primary_goal = "build"
            elif stage == "early":
                experience_years = 1 + variant % 3
                primary_goal = "build"
            elif stage == "mid":
                experience_years = 3 + variant % 4
                primary_goal = "organize"
            else:
                experience_years = 6 + variant % 7
                primary_goal = "organize"
            specs.append(
                {
                    "sequenceIndex": sequence,
                    "profileSeed": f"v42-profile-{sequence:06d}",
                    "profileFamily": f"v42-family-{family_number:04d}",
                    "familyVariant": variant,
                    "split": split_by_family[family_number],
                    "domain": domain,
                    "careerStage": stage,
                    "targetRoles": DOMAIN_CONFIG[domain]["roles"],
                    "experienceYears": experience_years,
                    "primaryGoal": primary_goal,
                    "targetRecordCount": record_counts[sequence - 1],
                    "bodyLengthPlan": length_plans[sequence - 1],
                }
            )
    return specs


def _weighted_choice(rows: list[dict[str, Any]], rng: random.Random, *, value_key: str = "value") -> Any:
    total = sum(max(0, int(row["count"])) for row in rows)
    if total <= 0:
        raise ValueError("weighted table is empty")
    point = rng.randrange(total)
    for row in rows:
        point -= max(0, int(row["count"]))
        if point < 0:
            return row[value_key]
    raise AssertionError("unreachable weighted choice")


def _valid_code(value: Any, *, maximum: int | None = None) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if number < 0 or number >= 9_000_000:
        return None
    if maximum is not None and number > maximum:
        return None
    return number


def build_yp2021_calibration(dta_path: str | Path, *, minimum_cell_size: int = 20) -> dict[str, Any]:
    """4차 조사에서 허용한 열만 읽고 행 수준 식별자가 없는 집계표를 만든다."""
    import pandas as pd

    dta_path = Path(dta_path)
    columns = ["w04", "w04edu", "y04c104z", "y04c106z", "y04b104z", "y04b106z", "y04e102", "y04e302"]
    for index in range(1, 4):
        columns.extend((f"y04d006z_{index}", f"y04d008z_{index}"))
    frame = pd.read_stata(dta_path, columns=columns, convert_categoricals=False)
    frame = frame[frame["w04"].notna()]

    education = Counter()
    job_pairs = Counter()
    training_counts = Counter()
    qualification_counts = Counter()
    past_job_counts = Counter()
    for row in frame.to_dict(orient="records"):
        education_code = _valid_code(row.get("w04edu"), maximum=5)
        if education_code:
            education[education_code] += 1
        row_job_count = 0
        for industry_key, occupation_key in (
            ("y04c104z", "y04c106z"),
            ("y04b104z", "y04b106z"),
            *((f"y04d006z_{index}", f"y04d008z_{index}") for index in range(1, 4)),
        ):
            industry = _valid_code(row.get(industry_key), maximum=21)
            occupation = _valid_code(row.get(occupation_key), maximum=9)
            if industry is not None and occupation is not None:
                job_pairs[(industry, occupation)] += 1
                if industry_key != "y04c104z":
                    row_job_count += 1
        training_counts[_valid_code(row.get("y04e102"), maximum=5) or 0] += 1
        qualification_counts[_valid_code(row.get("y04e302"), maximum=5) or 0] += 1
        past_job_counts[min(row_job_count, 3)] += 1

    return {
        "version": "yp2021-w04-aggregate-v1",
        "source": {
            "file": dta_path.name,
            "sha256": hashlib.sha256(dta_path.read_bytes()).hexdigest(),
            "participantRows": len(frame),
            "minimumCellSize": minimum_cell_size,
        },
        "education": [{"value": key, "count": value} for key, value in sorted(education.items()) if value >= minimum_cell_size],
        "industryOccupation": [
            {"industry": key[0], "occupation": key[1], "count": value}
            for key, value in sorted(job_pairs.items())
            if value >= minimum_cell_size
        ],
        "trainingCount": [{"value": key, "count": value} for key, value in sorted(training_counts.items()) if value >= minimum_cell_size],
        "qualificationCount": [{"value": key, "count": value} for key, value in sorted(qualification_counts.items()) if value >= minimum_cell_size],
        "pastJobCount": [{"value": key, "count": value} for key, value in sorted(past_job_counts.items()) if value >= minimum_cell_size],
    }


def _atom_score(text: str) -> int:
    return sum(text.count(marker) * 3 for marker in FACTUAL_MARKERS) - sum(
        text.count(marker) * 8 for marker in HYPOTHETICAL_MARKERS
    )


def _strip_question_echo(summary: str, question: str) -> str:
    """요약 앞에 그대로 붙은 면접 질문을 제거하고 답변 부분만 남긴다."""
    normalized_question = question.strip().rstrip(".?!。！？").strip()
    if normalized_question and summary.startswith(normalized_question):
        summary = summary[len(normalized_question) :].lstrip(" .?!。！？")
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?。！？])\s+", summary)
        if sentence.strip()
    ]
    while sentences and any(marker in sentences[0] for marker in QUESTION_ECHO_MARKERS):
        sentences.pop(0)
    return " ".join(sentences)


def scan_aihub_atoms(zip_root: str | Path) -> dict[str, list[dict[str, Any]]]:
    """원본 ZIP을 보존한 채 사실 경험 서술 atom 카탈로그를 메모리에 만든다."""
    zip_root = Path(zip_root)
    atoms: dict[str, list[dict[str, Any]]] = defaultdict(list)
    seen_summaries: set[str] = set()
    for zip_path in sorted(zip_root.rglob("*.zip")):
        match = re.match(r"[TV]L_\d+\.([A-Za-z]+)_(?:Female|Male)_(New|Experienced)\.zip", zip_path.name)
        if not match:
            continue
        domain_name, experience = match.groups()
        domain = {
            "Management": "BM", "SalesMarketing": "SM", "PublicService": "PS", "RND": "RND",
            "ICT": "ICT", "Design": "ARD", "ProductionManufacturing": "MM",
        }[domain_name]
        with zipfile.ZipFile(zip_path) as archive:
            for stored_name in archive.namelist():
                if not stored_name.endswith(".json"):
                    continue
                try:
                    payload = json.loads(archive.read(stored_name))
                    dataset = payload["dataSet"]
                    summary = re.sub(r"\s+", " ", dataset["answer"]["summary"]["text"]).strip()
                    question = re.sub(
                        r"\s+", " ", dataset.get("question", {}).get("raw", {}).get("text", "")
                    ).strip()
                except (json.JSONDecodeError, KeyError, TypeError, UnicodeDecodeError):
                    continue
                summary = _strip_question_echo(summary, question)
                factual_score = _atom_score(summary)
                asks_for_experience = any(marker in question for marker in EXPERIENCE_QUESTION_MARKERS)
                minimum_length = 15 if asks_for_experience else 25
                has_past_action = any(marker in summary for marker in ACTION_MARKERS)
                has_career_context = any(marker in summary for marker in CAREER_CONTEXT_MARKERS)
                if (
                    len(summary) < minimum_length
                    or not asks_for_experience
                    or not has_past_action
                    or not has_career_context
                    or any(marker in summary for marker in HYPOTHETICAL_MARKERS)
                ):
                    continue
                if (
                    factual_score <= 0
                    and not any(marker in summary for marker in ACTION_MARKERS)
                    and not asks_for_experience
                ):
                    continue
                if any(pattern.search(summary) for pattern in PROTECTED_PATTERNS):
                    continue
                summary_hash = hashlib.sha256(summary.encode("utf-8")).hexdigest()
                if summary_hash in seen_summaries:
                    continue
                seen_summaries.add(summary_hash)
                entry_name = Path(stored_name).name
                atoms[domain].append(
                    {
                        "atomId": f"aih-71592-{Path(entry_name).stem}",
                        "sourceFamilyId": (
                            f"aih-family-{domain.lower()}-{experience.lower()}-"
                            f"{(_entry_number(entry_name) // 100):06d}"
                        ),
                        "occupation": domain,
                        "experienceLevel": "EXPERIENCED" if experience == "Experienced" else "NEW",
                        "summary": summary[:500],
                        "question": question[:300],
                        "factualScore": factual_score,
                        "sourceZip": zip_path.name,
                        "sourceEntry": entry_name,
                    }
                )
    for domain, domain_atoms in atoms.items():
        domain_atoms.sort(key=lambda item: (-item["factualScore"], _stable_int("atom-order", item["atomId"])))
    return dict(atoms)


def load_normalized_atoms(normalized_root: str | Path) -> dict[str, list[dict[str, Any]]]:
    """정규화 단계가 승인한 짧은 사실 골격만 프로필 샘플러 입력으로 읽는다."""
    atoms: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for path in sorted((Path(normalized_root) / "accepted").glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        result = payload.get("result", {})
        if result.get("status") != "accepted" or not str(result.get("factSpine", "")).strip():
            continue
        domain = payload["occupation"]
        atoms[domain].append(
            {
                "atomId": payload["atomId"],
                "sourceFamilyId": payload["sourceFamilyId"],
                "occupation": domain,
                "experienceLevel": payload["experienceLevel"],
                "summary": result["factSpine"].strip(),
                "question": "",
                "factualScore": 1,
                "sourceZip": payload["sourceZip"],
                "sourceEntry": payload["sourceEntry"],
                "normalizedCategoryKey": result["categoryKey"],
                "normalized": True,
            }
        )
    for domain, domain_atoms in atoms.items():
        domain_atoms.sort(key=lambda item: _stable_int("normalized-atom-order", item["atomId"]))
    return dict(atoms)


def _classify_atom(summary: str) -> str:
    if (
        any(marker in summary for marker in ("자격", "수상", "상장", "인증"))
        and any(marker in summary for marker in ("취득", "합격", "보유", "받았", "수상했"))
    ):
        return "certification_award"
    if any(marker in summary for marker in ("논문", "연구", "보고서", "집필", "문서")):
        return "academic_writing"
    if any(marker in summary for marker in ("프로젝트", "과제", "개발", "제작", "기획")):
        return "project"
    if any(marker in summary for marker in ("교육", "훈련", "멘토", "리더", "협업", "조율", "동아리", "봉사")):
        return "activity_leadership"
    if any(marker in summary for marker in ("도구", "기술", "프로그래밍", "코딩", "분석")):
        return "skill_tool"
    if any(marker in summary for marker in ("업무", "직장", "근무", "담당", "고객")):
        return "experience"
    return "activity_leadership"


def _entry_number(entry_name: str) -> int:
    match = re.search(r"(\d+)(?=\.json$)", entry_name)
    return int(match.group(1)) if match else _stable_int("entry", entry_name) % 1_000_000


def _month_offset(year: int, month: int, offset: int) -> str:
    absolute = year * 12 + month - 1 + offset
    return f"{absolute // 12:04d}-{absolute % 12 + 1:02d}"


def _korean_number(value: str) -> int | None:
    digits = {"일": 1, "이": 2, "삼": 3, "사": 4, "오": 5, "육": 6, "칠": 7, "팔": 8, "구": 9}
    if value in digits:
        return digits[value]
    if value == "십":
        return 10
    if "십" in value:
        left, right = value.split("십", 1)
        tens = digits.get(left, 1) if left else 1
        ones = digits.get(right, 0) if right else 0
        return tens * 10 + ones
    return None


def _infer_minimum_experience_years(atom: dict[str, Any]) -> int:
    """경력 골격과 프로필의 경력 연수가 정면으로 충돌하지 않게 하한을 추정한다."""
    text = str(atom.get("summary", ""))
    years = [
        int(value)
        for value in re.findall(r"(?<!\d)(\d{1,2})\s*(?:여\s*)?년", text)
        if 0 < int(value) <= 40
    ]
    for value in re.findall(r"([일이삼사오육칠팔구십]{1,3})\s*(?:여\s*)?년", text):
        parsed = _korean_number(value)
        if parsed is not None and parsed <= 40:
            years.append(parsed)
    minimum = max(years, default=0)
    if atom.get("experienceLevel") == "EXPERIENCED":
        minimum = max(minimum, 3)
    if any(marker in text for marker in ("회사", "직장", "근무", "업무", "인턴")):
        minimum = max(minimum, 1)
    if any(marker in text for marker in ("팀장", "지점장", "총괄", "관리자", "임원")):
        minimum = max(minimum, 6)
    return minimum


def _career_stage(experience_years: int) -> str:
    if experience_years <= 0:
        return "new"
    if experience_years <= 3:
        return "early"
    if experience_years <= 6:
        return "mid"
    return "experienced"


def _object_with_particle(value: str) -> str:
    last = value.rstrip()[-1]
    has_batchim = "가" <= last <= "힣" and (ord(last) - ord("가")) % 28 != 0
    return value + ("을" if has_batchim or not ("가" <= last <= "힣") else "를")


def _event(
    category: str,
    facts: list[str],
    *,
    survey: list[str] | None = None,
    narrative: list[str] | None = None,
    source_families: list[str] | None = None,
    synthetic: list[str] | None = None,
    render_mode: str = "fixed_skeleton",
) -> dict[str, Any]:
    return {
        "categoryKey": category,
        "facts": facts,
        "propertyKeys": [],
        "propertyValues": {},
        "renderMode": render_mode,
        "provenance": {
            "surveyCalibration": survey or [],
            "narrativeEvidence": narrative or [],
            "sourceFamilies": source_families or [],
            "syntheticFields": synthetic or [],
        },
    }


def _backbone_events(spec: dict[str, Any], calibration: dict[str, Any], rng: random.Random) -> list[dict[str, Any]]:
    config = DOMAIN_CONFIG[spec["domain"]]
    education_code = _weighted_choice(calibration["education"], rng)
    education_name = {1: "고등학교 과정", 2: "전문학사 과정", 3: "대학교 재학 과정", 4: "학사 과정", 5: "대학원 과정"}.get(education_code, "학업 과정")
    graduation = max(2013, 2025 - spec["experienceYears"] - 1)
    start = graduation - (4 if education_code in (3, 4) else 2)
    events = [
        _event(
            "education_history",
            [f"{config['program']}의 {education_name}을 {start}-03에 시작해 {graduation}-02에 마쳤다"],
            survey=[f"{calibration['version']}:education"],
            synthetic=["institution"],
        )
    ]
    if spec["experienceYears"] > 0:
        pair_row = _weighted_choice_row(calibration["industryOccupation"], rng)
        pair = (pair_row["industry"], pair_row["occupation"])
        job_start = f"{graduation + 1}-03"
        events.append(
            _event(
                "experience",
                [f"{job_start}부터 {config['industry']} 분야에서 {config['role']} 업무를 맡았다"],
                survey=[f"{calibration['version']}:industry-occupation:{pair[0]}-{pair[1]}"],
                synthetic=["organization"],
            )
        )
        past_jobs = int(_weighted_choice(calibration["pastJobCount"], rng))
        for index in range(min(past_jobs, 2)):
            start_month = _month_offset(graduation + 1, 3, (index + 1) * 24)
            events.append(
                _event(
                    "experience",
                    [f"{start_month}에 같은 직무 계열의 다음 일자리로 옮겨 {config['role']} 업무를 이어갔다"],
                    survey=[f"{calibration['version']}:past-job-count"],
                    synthetic=["organization"],
                )
            )
        tool = config["tools"][rng.randrange(len(config["tools"]))]
        events.append(
            _event(
                "skill_tool",
                [f"{config['role']} 업무에서 {_object_with_particle(tool)} 활용했다"],
                survey=[f"{calibration['version']}:industry-occupation:{pair[0]}-{pair[1]}"],
                synthetic=["tool_usage"],
            )
        )
    if int(_weighted_choice(calibration["trainingCount"], rng)) > 0:
        training_start = max(2013, graduation - 1)
        events.append(
            _event(
                "activity_leadership",
                [f"{training_start}-07부터 {training_start}-10까지 {config['role']} 관련 직업교육훈련을 이수했다"],
                survey=[f"{calibration['version']}:training-count"],
                synthetic=["training_provider"],
            )
        )
    if int(_weighted_choice(calibration["qualificationCount"], rng)) > 0:
        issued = max(2013, graduation)
        events.append(
            _event(
                "certification_award",
                [f"{issued}-11에 {config['role']} 관련 자격을 취득했다"],
                survey=[f"{calibration['version']}:qualification-count"],
                synthetic=["issuer", "certificate_name"],
            )
        )
    return events


def _coherent_synthetic_events(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """한 직무권 안에서만 움직이는 보조 기록 골격을 만들고 합성임을 명시한다."""
    config = DOMAIN_CONFIG[spec["domain"]]
    area = config["industry"]
    role = config["role"]
    first_tool, second_tool = config["tools"][:2]
    if spec["experienceYears"] <= 0:
        templates = [
            ("project", f"{area} 분야 수업에서 팀 과제의 요구사항 정리와 일정 관리를 맡았다"),
            ("skill_tool", f"{role} 관련 과제를 수행하며 {_object_with_particle(first_tool)} 활용했다"),
            ("education_history", f"{role} 기초 과정을 수강하고 학습 내용을 개인 노트로 정리했다"),
            ("project", f"{area} 분야 사례를 조사해 문제와 해결 방향을 발표 자료로 만들었다"),
            ("activity_leadership", f"직무 관련 스터디에서 자료 조사와 회의 기록을 담당했다"),
            ("academic_writing", f"{area} 분야 사례를 비교해 짧은 분석 보고서를 작성했다"),
            ("project", "팀 과제에서 구성원의 의견을 모아 작업 순서와 역할을 정리했다"),
            ("skill_tool", f"반복 과제를 정리하기 위해 {_object_with_particle(second_tool)} 익혀 활용했다"),
            ("activity_leadership", "교내 활동에서 일정과 준비 항목을 정리해 구성원에게 공유했다"),
            ("academic_writing", "수업에서 다룬 자료의 근거를 확인하고 참고 내용을 문서로 남겼다"),
            ("project", "과제 결과물의 오류를 점검하고 수정 사항을 팀원과 나누어 반영했다"),
            ("skill_tool", f"{first_tool}으로 자료를 정리하고 결과를 검토하는 연습을 했다"),
            ("activity_leadership", "스터디 구성원이 맡을 주제를 나누고 발표 순서를 조율했다"),
            ("education_history", f"{role} 관련 실습 과정을 마치고 작업 과정을 회고로 정리했다"),
            ("project", "제한된 일정 안에서 핵심 기능을 먼저 완성하는 방식으로 팀 과제를 진행했다"),
            ("academic_writing", "과제 수행 중 확인한 문제와 수정 과정을 보고서에 기록했다"),
            ("activity_leadership", "직무 사례 발표에서 질문을 모아 답변 자료를 정리했다"),
            ("skill_tool", f"{second_tool}으로 여러 자료를 한 형식으로 정리했다"),
            ("project", "기존 결과물의 사용 흐름을 살펴보고 불편한 부분을 수정하는 과제를 수행했다"),
            ("education_history", "팀 피드백을 반영해 과제 결과물을 수정하고 제출 과정을 마쳤다"),
        ]
    else:
        templates = [
            ("experience", "업무를 시작한 뒤 반복되는 요청과 처리 순서를 개인 문서로 정리했다"),
            ("project", f"{area} 분야의 작업 자료를 정리하는 내부 개선 과제에 참여했다"),
            ("skill_tool", f"{role} 업무에서 {_object_with_particle(first_tool)} 활용해 자료를 작성하고 검토했다"),
            ("project", "동료와 요구사항을 나누고 결과물을 함께 검토하는 협업 과제를 수행했다"),
            ("activity_leadership", "직무 관련 사내 학습 모임에 참여해 사례를 정리하고 공유했다"),
            ("academic_writing", f"{area} 분야의 업무 사례를 조사해 내부 보고서를 작성했다"),
            ("experience", "업무 인수인계를 위해 절차와 주의사항을 문서로 정리했다"),
            ("project", "반복되는 오류를 확인하고 점검 기준을 만드는 개선 작업에 참여했다"),
            ("activity_leadership", "새 구성원에게 작업 절차를 공유하고 질문을 정리해 전달했다"),
            ("skill_tool", f"{second_tool}으로 진행 상황과 검토 결과를 정리했다"),
            ("experience", "여러 요청의 우선순위를 정하고 처리 상태를 동료와 공유했다"),
            ("project", "흩어진 자료의 형식을 맞추고 팀이 함께 사용할 작업 기준을 만들었다"),
            ("academic_writing", "업무 중 확인한 사례와 판단 근거를 비교해 문서로 남겼다"),
            ("activity_leadership", "직무 학습 시간에 실무 사례를 준비해 동료들과 토론했다"),
            ("skill_tool", f"{first_tool}과 {second_tool}을 함께 사용해 결과물을 점검했다"),
            ("project", "중간 피드백을 반영해 작업 범위와 완료 기준을 다시 정리했다"),
            ("experience", "처리 과정에서 발견한 문제를 기록하고 다음 업무 때 확인할 항목을 만들었다"),
            ("activity_leadership", "팀 지식 공유 자리에서 작업 사례와 주의사항을 발표했다"),
            ("project", "업무 흐름에서 시간이 오래 걸리는 단계를 찾아 정리 방식을 바꾸었다"),
            ("experience", "완료한 업무의 결과와 남은 확인 사항을 다음 담당자에게 전달했다"),
        ]
    return [
        _event(category, [fact], synthetic=["event_skeleton", "situation_detail", "work_process", "reflection"])
        for category, fact in templates
    ]


def _weighted_choice_row(rows: list[dict[str, Any]], rng: random.Random) -> dict[str, Any]:
    total = sum(max(0, int(row["count"])) for row in rows)
    point = rng.randrange(total)
    for row in rows:
        point -= max(0, int(row["count"]))
        if point < 0:
            return row
    raise AssertionError("unreachable weighted row")


def _property_candidates(event: dict[str, Any], spec: dict[str, Any]) -> list[tuple[str, Any]]:
    config = DOMAIN_CONFIG[spec["domain"]]
    facts = " ".join(event["facts"])
    dates = re.findall(r"\b\d{4}-\d{2}\b", facts)
    category = event["categoryKey"]
    if category == "experience":
        return [("role", config["role"]), ("organization", f"{config['industry']} 분야 조직")]
    if category == "project":
        return [("role", "프로젝트 참여"), ("technologies", config["tools"])]
    if category == "education_history":
        candidates = [("program", config["program"])]
        if dates:
            candidates.append(("startMonth", dates[0]))
        return candidates
    if category == "certification_award":
        return [("issuedMonth", dates[0])] if dates else [("issuer", "직무 관련 기관")]
    if category == "academic_writing":
        return [("publication", "연구·문서 기록")]
    if category == "activity_leadership":
        return [("role", "참여자"), ("organization", "교육·활동 조직")]
    return [("group", config["role"])]


def _property_count_plan(total: int, seed: int) -> list[int]:
    zero = round(total * PROPERTY_RATIOS[0])
    one = round(total * PROPERTY_RATIOS[1])
    values = [0] * zero + [1] * one + [2] * (total - zero - one)
    random.Random(seed).shuffle(values)
    return values


def build_synthetic_inputs(
    specs: list[dict[str, Any]],
    atoms_by_domain: dict[str, list[dict[str, Any]]],
    yp_calibration: dict[str, Any],
    property_schema: dict[str, dict[str, str]],
    *,
    seed: int = 20260903,
) -> list[dict[str, Any]]:
    """집계 골격과 중복 없는 AI Hub atom을 결합해 렌더러 입력을 만든다."""
    atom_queues: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    split_weights = {"train": 0.8, "valid": 0.1, "test": 0.1}
    for domain, atoms in atoms_by_domain.items():
        families: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for atom in atoms:
            families[atom.get("sourceFamilyId", atom["atomId"])].append(atom)
        assigned_counts = Counter({split: 0 for split in SPLIT_ORDER})
        ordered_families = sorted(
            families.items(),
            key=lambda item: _stable_int("source-family-order", domain, item[0]),
        )
        for _source_family, family_atoms in ordered_families:
            source_split = min(
                SPLIT_ORDER,
                key=lambda split: (
                    assigned_counts[split] / split_weights[split],
                    _stable_int("source-family-tie", domain, _source_family, split),
                ),
            )
            atom_queues[(domain, source_split)].extend(family_atoms)
            assigned_counts[source_split] += len(family_atoms)
    for queue in atom_queues.values():
        queue.sort(key=lambda item: (-item.get("factualScore", 1), _stable_int("atom-queue", item["atomId"])))
    atom_offsets: Counter[tuple[str, str]] = Counter()
    raw_payloads = []
    for spec in specs:
        queue_key = (spec["domain"], spec["split"])
        queue = atom_queues.get(queue_key, [])
        if not queue:
            raise ValueError(
                f"no AI Hub atoms for domain {spec['domain']} and split {spec['split']}"
            )
        offset = atom_offsets[queue_key]
        atom = queue[offset % len(queue)]
        atom_offsets[queue_key] += 1
        inferred_years = _infer_minimum_experience_years(atom)
        if inferred_years > spec["experienceYears"]:
            spec["experienceYears"] = inferred_years
            spec["careerStage"] = _career_stage(inferred_years)

        rng = random.Random(_stable_int(seed, spec["profileSeed"]))
        primary_event = _event(
            atom.get("normalizedCategoryKey")
            or _classify_atom(f"{atom.get('question', '')} {atom['summary']}"),
            [atom["summary"].rstrip(". ")],
            narrative=[atom["atomId"]],
            source_families=[atom.get("sourceFamilyId", atom["atomId"])],
            synthetic=["situation_detail", "work_process", "reflection"],
            render_mode="fixed_skeleton" if atom.get("normalized") else "rewrite_evidence",
        )
        event_candidates = [
            primary_event,
            *_backbone_events(spec, yp_calibration, rng),
            *_coherent_synthetic_events(spec),
        ]
        target = spec["targetRecordCount"]
        events = event_candidates[:target]
        if len(events) != target:
            raise ValueError(f"insufficient coherent events for {spec['profileSeed']}")
        raw_payloads.append(
            {
                "schemaVersion": 4,
                "sourceDataset": "YP2021-AGGREGATE+AIHUB-71592",
                "profileSeed": spec["profileSeed"],
                "profileFamily": spec["profileFamily"],
                "split": spec["split"],
                "sourceDomain": spec["domain"],
                "persona": {
                    "targetRoles": spec["targetRoles"],
                    "experienceYears": spec["experienceYears"],
                    "primaryGoal": spec["primaryGoal"],
                    "anchorFact": atom["summary"],
                    "sourceExperienceLevel": atom.get("experienceLevel"),
                },
                "targetRecordCount": target,
                "propertySchema": property_schema,
                "events": events,
                "bodyLengthPlan": spec["bodyLengthPlan"],
                "renderingPolicy": "skeleton-grounded-creative-v1",
            }
        )

    total_events = sum(len(payload["events"]) for payload in raw_payloads)
    all_events: list[tuple[dict[str, Any], list[tuple[str, Any]]]] = []
    for payload, spec in zip(raw_payloads, specs, strict=True):
        for index, event in enumerate(payload["events"], start=1):
            event["eventId"] = f"ev{index}"
            event["timeOrder"] = index
            candidates = [
                (key, value)
                for key, value in _property_candidates(event, spec)
                if key in property_schema[event["categoryKey"]]
            ]
            event["propertyKeys"] = []
            event["propertyValues"] = {}
            all_events.append((event, candidates))

    desired = Counter(_property_count_plan(total_events, seed + 9))
    order = list(range(total_events))
    random.Random(seed + 10).shuffle(order)
    selected_twos = [index for index in order if len(all_events[index][1]) >= 2][: desired[2]]
    if len(selected_twos) != desired[2]:
        raise ValueError("insufficient events with two basic property candidates")
    selected_two_set = set(selected_twos)
    selected_ones = [
        index
        for index in order
        if index not in selected_two_set and all_events[index][1]
    ][: desired[1]]
    if len(selected_ones) != desired[1]:
        raise ValueError("insufficient events with a basic property candidate")
    property_budget = {index: 2 for index in selected_twos}
    property_budget.update({index: 1 for index in selected_ones})
    for index, (event, candidates) in enumerate(all_events):
        selected = candidates[: property_budget.get(index, 0)]
        event["propertyKeys"] = [key for key, _ in selected]
        event["propertyValues"] = {key: value for key, value in selected}
    return assign_body_length_plans(raw_payloads, seed=seed + 2)


def build_shards(
    specs: list[dict[str, Any]],
    *,
    shard_size: int = 25,
    device_weights: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    if shard_size < 1 or len(specs) % shard_size:
        raise ValueError("spec count must be divisible by shard_size")
    device_weights = device_weights or {"windows": 0.31, "mac": 0.69}
    if set(device_weights) != {"windows", "mac"} or not math.isclose(sum(device_weights.values()), 1.0):
        raise ValueError("device weights must contain windows and mac and sum to one")
    shards = []
    previous_mac = 0
    for shard_index, start in enumerate(range(0, len(specs), shard_size), start=1):
        mac_target = round(shard_index * device_weights["mac"])
        device = "mac" if mac_target > previous_mac else "windows"
        previous_mac = mac_target
        chunk = specs[start : start + shard_size]
        shards.append(
            {
                "shardId": f"shard-{shard_index:04d}",
                "device": device,
                "startIndex": chunk[0]["sequenceIndex"],
                "endIndex": chunk[-1]["sequenceIndex"],
                "profiles": [item["profileSeed"] for item in chunk],
            }
        )
    return shards


def _complete_profile(path: Path, payload: dict[str, Any]) -> bool:
    try:
        profile = json.loads(path.read_text(encoding="utf-8"))
        meta = profile["datasetMeta"]
        return (
            meta["profileSeed"] == payload["profileSeed"]
            and meta["profileFamily"] == payload["profileFamily"]
            and meta["split"] == payload["split"]
            and meta["promptVersion"] == PROMPT_VERSION
            and meta["actualRecordCount"] == payload["targetRecordCount"]
            and len(profile["records"]) == payload["targetRecordCount"]
        )
    except (OSError, json.JSONDecodeError, KeyError, TypeError):
        return False


def run_shard(
    shard: dict[str, Any],
    *,
    input_dir: Path,
    output_root: Path,
    renderer: Callable[[dict[str, Any]], tuple[Any, ...]],
) -> dict[str, Any]:
    """프로필별 원자적 완료 파일을 기준으로 안전하게 shard를 재개한다."""
    output_root = Path(output_root)
    states: dict[str, dict[str, Any]] = {}
    skipped = 0
    for profile_seed in shard["profiles"]:
        input_path = Path(input_dir) / f"{profile_seed}.json"
        payload = json.loads(input_path.read_text(encoding="utf-8"))
        profile_path = output_root / "profiles" / payload["split"] / input_path.name
        if _complete_profile(profile_path, payload):
            states[profile_seed] = {"status": "complete", "path": str(profile_path)}
            skipped += 1
            continue
        started = time.perf_counter()
        try:
            result = renderer(payload)
            if len(result) == 2:
                profile, metadata = result
                draft = None
            else:
                profile, metadata, draft = result
            _atomic_write_json(profile_path, profile)
            _atomic_write_json(output_root / "metadata" / f"{profile_seed}.json", metadata)
            if draft is not None:
                _atomic_write_json(output_root / "drafts" / payload["split"] / input_path.name, draft)
            states[profile_seed] = {
                "status": "complete",
                "path": str(profile_path),
                "elapsedSeconds": round(time.perf_counter() - started, 4),
            }
        except Exception as exc:  # 한 프로필 실패가 나머지 shard를 중단시키지 않는다.
            error = {
                "profileSeed": profile_seed,
                "shardId": shard["shardId"],
                "errorType": type(exc).__name__,
                "message": str(exc),
                "failedAt": _utc_now(),
            }
            _atomic_write_json(output_root / "errors" / f"{profile_seed}.json", error)
            states[profile_seed] = {"status": "failed", "error": error}
        completed = sum(item["status"] == "complete" for item in states.values())
        failed = sum(item["status"] == "failed" for item in states.values())
        _atomic_write_json(
            output_root / "states" / f"{shard['shardId']}.json",
            {
                "schemaVersion": 1,
                "shardId": shard["shardId"],
                "device": shard["device"],
                "updatedAt": _utc_now(),
                "completed": completed,
                "failed": failed,
                "profiles": states,
            },
        )
        print(f"{shard['shardId']} {profile_seed}: {states[profile_seed]['status']}", flush=True)
    completed = sum(item["status"] == "complete" for item in states.values())
    failed = sum(item["status"] == "failed" for item in states.values())
    _atomic_write_json(
        output_root / "states" / f"{shard['shardId']}.json",
        {
            "schemaVersion": 1,
            "shardId": shard["shardId"],
            "device": shard["device"],
            "updatedAt": _utc_now(),
            "completed": completed,
            "failed": failed,
            "profiles": states,
        },
    )
    return {
        "shardId": shard["shardId"],
        "completed": completed,
        "failed": failed,
        "skipped": skipped,
    }


def render_profile(
    payload: dict[str, Any],
    *,
    seed_categories: list[dict[str, Any]],
    model: str,
    base_url: str,
    timeout: int,
    max_attempts: int,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    started = time.perf_counter()
    draft, generation = generate_qwen_by_record(
        payload,
        model=model,
        base_url=base_url,
        timeout=timeout,
        prompt_version=PROMPT_VERSION,
        max_attempts=max_attempts,
    )
    validation = validate_renderer_output(
        payload,
        draft,
        enforce_skeleton=True,
        body_min_length=body_min_length_for_prompt(PROMPT_VERSION),
    )
    repair = None
    if not validation["valid"] and max_attempts > 1:
        draft, repair = repair_qwen_records(
            payload,
            draft,
            model=model,
            base_url=base_url,
            timeout=timeout,
            prompt_version=PROMPT_VERSION,
            max_rounds=max_attempts - 1,
        )
        validation = validate_renderer_output(
            payload,
            draft,
            enforce_skeleton=True,
            body_min_length=body_min_length_for_prompt(PROMPT_VERSION),
        )
    if not validation["valid"]:
        raise ValueError("renderer validation failed: " + ", ".join(validation["errors"]))
    profile = assemble_profile(
        payload,
        draft,
        seed_categories,
        generator_model=model,
        prompt_version=PROMPT_VERSION,
    )
    metadata = {
        "profileSeed": payload["profileSeed"],
        "deviceElapsedSeconds": round(time.perf_counter() - started, 4),
        "generation": generation,
        "repair": repair,
        "validation": validation,
        "model": model,
        "promptVersion": PROMPT_VERSION,
    }
    return profile, metadata, draft


def band_distribution_max_deviation(planned: Counter, actual: Counter) -> float:
    total_planned = sum(planned.values())
    total_actual = sum(actual.values())
    if total_planned == 0 or total_actual == 0:
        return 0.0
    keys = set(planned) | set(actual)
    return round(
        max(abs(planned[key] / total_planned - actual[key] / total_actual) for key in keys),
        4,
    )


def inspect_batch(specs: list[dict[str, Any]], *, output_root: Path, checkpoint: int) -> dict[str, Any]:
    selected = [item for item in specs if item["sequenceIndex"] <= checkpoint]
    profiles = []
    missing = []
    for spec in selected:
        path = Path(output_root) / "profiles" / spec["split"] / f"{spec['profileSeed']}.json"
        try:
            profiles.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            missing.append(spec["profileSeed"])
    family_splits: dict[str, set[str]] = defaultdict(set)
    atom_splits: dict[str, set[str]] = defaultdict(set)
    source_family_splits: dict[str, set[str]] = defaultdict(set)
    length_errors = 0
    length_band_errors = 0
    interview_style_failures = 0
    verbatim_evidence_copies = 0
    evidence_anchor_failures = 0
    properties = Counter()
    bands = Counter()
    actual_bands = Counter()
    actual_means = []
    target_means = []
    for profile in profiles:
        meta = profile["datasetMeta"]
        input_path = output_root / "inputs" / f"{meta['profileSeed']}.json"
        input_payload = (
            json.loads(input_path.read_text(encoding="utf-8")) if input_path.exists() else {"events": []}
        )
        draft_for_content_gate = {
            "records": [
                {
                    "eventId": event.get("eventId"),
                    "bodyMd": record.get("bodyMd", ""),
                }
                for record, event in zip(
                    profile.get("records", []), input_payload.get("events", []), strict=False
                )
            ]
        }
        evidence_anchor_failures += len(
            find_evidence_anchor_conflicts(input_payload, draft_for_content_gate)
        )
        family_splits[meta["profileFamily"]].add(meta["split"])
        plan = meta.get("bodyLengthPlan") or {}
        bands[plan.get("band")] += 1
        actual = meta.get("actualBodyLengthMean")
        target = plan.get("targetMeanChars")
        tolerance = body_mean_tolerance(plan, len(profile.get("records", [])))
        if isinstance(actual, (int, float)) and isinstance(target, (int, float)):
            actual_means.append(actual)
            target_means.append(target)
            if not isinstance(tolerance, (int, float)) or abs(actual - target) > tolerance:
                length_errors += 1
            if body_length_band(actual, plan) != plan.get("band"):
                length_band_errors += 1
            actual_bands[body_length_band(actual, plan)] += 1
        for record, event in zip(profile.get("records", []), input_payload.get("events", []), strict=False):
            properties[len(record.get("properties", {}))] += 1
            body = str(record.get("bodyMd", ""))
            if any(marker in body for marker in INTERVIEW_STYLE_MARKERS):
                interview_style_failures += 1
            if event.get("renderMode") == "rewrite_evidence":
                if any(
                    len(str(fact).strip()) >= 40 and str(fact).strip().rstrip(".") in body
                    for fact in event.get("facts", [])
                ):
                    verbatim_evidence_copies += 1
        for lineage in profile.get("provenance", {}).get("recordLineage", []):
            for atom in lineage.get("narrativeEvidence", []):
                atom_splits[atom].add(meta["split"])
            for source_family in lineage.get("sourceFamilies", []):
                source_family_splits[source_family].add(meta["split"])
    completed = len(profiles)
    band_distribution_deviation = band_distribution_max_deviation(bands, actual_bands)
    return {
        "schemaVersion": 1,
        "checkpoint": checkpoint,
        "generatedAt": _utc_now(),
        "counts": {
            "planned": len(selected),
            "completed": completed,
            "missing": len(missing),
            "split": dict(Counter(profile["datasetMeta"]["split"] for profile in profiles)),
            "bands": dict(bands),
            "actualBands": dict(actual_bands),
        },
        "length": {
            "profileToleranceFailures": length_errors,
            "profileBandFailures": length_band_errors,
            "bandDistributionMaxDeviation": band_distribution_deviation,
            "targetMean": round(statistics.fmean(target_means), 2) if target_means else None,
            "actualMean": round(statistics.fmean(actual_means), 2) if actual_means else None,
            "targetStd": round(statistics.pstdev(target_means), 2) if len(target_means) > 1 else None,
            "actualStd": round(statistics.pstdev(actual_means), 2) if len(actual_means) > 1 else None,
        },
        "content": {
            "interviewStyleFailures": interview_style_failures,
            "verbatimEvidenceCopies": verbatim_evidence_copies,
            "evidenceAnchorFailures": evidence_anchor_failures,
        },
        "properties": {str(key): value for key, value in sorted(properties.items())},
        "leakage": {
            "profileFamilies": sum(len(splits) > 1 for splits in family_splits.values()),
            "sourceAtoms": sum(len(splits) > 1 for splits in atom_splits.values()),
            "sourceFamilies": sum(len(splits) > 1 for splits in source_family_splits.values()),
        },
        "missingProfileSeeds": missing,
        "gatePassed": completed == len(selected)
        and length_errors == 0
        and band_distribution_deviation <= 0.05
        and interview_style_failures == 0
        and verbatim_evidence_copies == 0
        and evidence_anchor_failures == 0
        and not any(len(splits) > 1 for splits in family_splits.values())
        and not any(len(splits) > 1 for splits in atom_splits.values())
        and not any(len(splits) > 1 for splits in source_family_splits.values()),
    }


def prepare_batch(args: argparse.Namespace) -> None:
    output_root = args.output_root.resolve()
    seeds = load_seed_categories(args.seeds)
    property_schema = basic_property_schema(seeds)
    calibration = (
        json.loads(args.yp_calibration.read_text(encoding="utf-8"))
        if args.yp_calibration is not None
        else build_yp2021_calibration(args.yp_dta)
    )
    atoms = (
        load_normalized_atoms(args.normalized_atoms)
        if args.normalized_atoms is not None
        else scan_aihub_atoms(args.aihub_root)
    )
    missing_domains = set(DOMAIN_CONFIG) - set(atoms)
    if missing_domains:
        raise ValueError(f"normalized atom catalog is missing domains: {sorted(missing_domains)}")
    specs = build_profile_specs(profile_count=args.profile_count, family_size=args.family_size, seed=args.seed)
    payloads = build_synthetic_inputs(specs, atoms, calibration, property_schema, seed=args.seed)
    shards = build_shards(specs, shard_size=args.shard_size, device_weights={"windows": args.windows_weight, "mac": 1 - args.windows_weight})
    for payload in payloads:
        _atomic_write_json(output_root / "inputs" / f"{payload['profileSeed']}.json", payload)
    _atomic_write_json(output_root / "calibration" / "yp2021-w04-aggregate-v1.json", calibration)
    _atomic_write_json(
        output_root / "atom-catalog-summary.json",
        {"counts": {domain: len(items) for domain, items in atoms.items()}},
    )
    _atomic_write_json(
        output_root / "manifest.json",
        {
            "schemaVersion": 1,
            "batchId": output_root.name,
            "createdAt": _utc_now(),
            "profileCount": len(specs),
            "familySize": args.family_size,
            "seed": args.seed,
            "promptVersion": PROMPT_VERSION,
            "model": args.model,
            "checkpoints": [300, 1000, args.profile_count],
            "deviceWeights": {"windows": args.windows_weight, "mac": 1 - args.windows_weight},
            "profiles": specs,
            "shards": shards,
        },
    )
    print(json.dumps({"profiles": len(specs), "shards": len(shards), "outputRoot": str(output_root)}, ensure_ascii=False))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("output_root", type=Path)
    yp_source = prepare.add_mutually_exclusive_group(required=True)
    yp_source.add_argument("--yp-dta", type=Path)
    yp_source.add_argument("--yp-calibration", type=Path)
    atom_source = prepare.add_mutually_exclusive_group(required=True)
    atom_source.add_argument("--aihub-root", type=Path)
    atom_source.add_argument("--normalized-atoms", type=Path)
    prepare.add_argument("--seeds", type=Path, default=DEFAULT_SEEDS_PATH)
    prepare.add_argument("--profile-count", type=int, default=3000)
    prepare.add_argument("--family-size", type=int, default=10)
    prepare.add_argument("--shard-size", type=int, default=25)
    prepare.add_argument("--windows-weight", type=float, default=0.31)
    prepare.add_argument("--seed", type=int, default=20260903)
    prepare.add_argument("--model", default=DEFAULT_MODEL)

    run = subparsers.add_parser("run")
    run.add_argument("manifest", type=Path)
    run.add_argument("--device", choices=("windows", "mac"), required=True)
    run.add_argument("--checkpoint", type=int, default=300)
    run.add_argument("--shard-id")
    run.add_argument("--output-root", type=Path)
    run.add_argument("--seeds", type=Path, default=DEFAULT_SEEDS_PATH)
    run.add_argument("--model", default=DEFAULT_MODEL)
    run.add_argument("--base-url", default="http://127.0.0.1:11434")
    run.add_argument("--timeout", type=int, default=900)
    run.add_argument("--max-attempts", type=int, default=3)

    quality = subparsers.add_parser("quality")
    quality.add_argument("manifest", type=Path)
    quality.add_argument("--checkpoint", type=int, required=True)
    quality.add_argument("--output-root", type=Path)
    quality.add_argument("--report", type=Path)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "prepare":
        prepare_batch(args)
        return
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    output_root = (args.output_root or args.manifest.parent).resolve()
    if args.command == "quality":
        report = inspect_batch(manifest["profiles"], output_root=output_root, checkpoint=args.checkpoint)
        report_path = args.report or output_root / "quality" / f"checkpoint-{args.checkpoint:04d}.json"
        _atomic_write_json(report_path, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        raise SystemExit(0 if report["gatePassed"] else 1)

    seed_categories = load_seed_categories(args.seeds)
    renderer = lambda payload: render_profile(
        payload,
        seed_categories=seed_categories,
        model=args.model,
        base_url=args.base_url,
        timeout=args.timeout,
        max_attempts=args.max_attempts,
    )
    shards = [
        shard
        for shard in manifest["shards"]
        if shard["device"] == args.device
        and shard["endIndex"] <= args.checkpoint
        and (args.shard_id is None or shard["shardId"] == args.shard_id)
    ]
    for shard in shards:
        result = run_shard(shard, input_dir=args.manifest.parent / "inputs", output_root=output_root, renderer=renderer)
        print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
