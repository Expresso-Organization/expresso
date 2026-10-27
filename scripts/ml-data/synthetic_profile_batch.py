import argparse
import hashlib
import json
import zipfile
from pathlib import Path


DOMAINS = [
    ("01", "Management", "management", ["기획 · PM"]),
    ("02", "SalesMarketing", "sales-marketing", ["기획 · PM", "데이터"]),
    ("03", "PublicService", "public-service", ["기획 · PM"]),
    ("04", "RND", "rnd", ["ML · AI", "데이터"]),
    ("05", "ICT", "ict", ["백엔드", "DevOps"]),
    ("06", "Design", "design", ["디자인"]),
    ("07", "ProductionManufacturing", "production", ["기획 · PM", "데이터"]),
]
GENDERS = ("Female", "Male")
EXPERIENCE_LEVELS = ("New", "Experienced")
EXTRA_STRATA = (
    ("05", "ICT", "ict", ["데이터", "ML · AI"], "Female", "Experienced"),
    ("05", "ICT", "ict", ["모바일"], "Male", "New"),
)

FACTUAL_MARKERS = (
    "프로젝트",
    "경험",
    "업무",
    "성과",
    "달성",
    "공부",
    "학습",
    "자격",
    "수상",
    "활동",
    "연구",
    "개발",
    "분석",
    "제작",
    "참여",
    "수행",
    "근무",
    "사용",
    "해결",
)
HYPOTHETICAL_MARKERS = (
    "입사하게 된다면",
    "입사한다면",
    "된다면",
    "만약",
    "지원 동기",
    "희망 부서",
    "앞으로",
    "하고 싶",
    "하시겠습니까",
    "하실 건가",
)


def _zip_name(number, domain, gender, experience):
    return f"TL_{number}.{domain}_{gender}_{experience}.zip"


def _existing_zip_names(existing_profiles):
    return {
        source["zip"]
        for profile in existing_profiles
        for source in profile.get("sources", [])
    }


def build_profile_specs(existing_profiles):
    existing_zip_names = _existing_zip_names(existing_profiles)
    existing_seeds = {profile["profileSeed"] for profile in existing_profiles}
    specs = []
    experienced_index = 0

    for number, domain, slug, target_roles in DOMAINS:
        for gender in GENDERS:
            for experience in EXPERIENCE_LEVELS:
                zip_name = _zip_name(number, domain, gender, experience)
                if zip_name in existing_zip_names:
                    continue
                if experience == "Experienced":
                    experience_years = 3 + experienced_index % 6
                    experienced_index += 1
                else:
                    experience_years = 0
                specs.append({
                    "profileSeed": f"{slug}-{gender.lower()}-{experience.lower()}-001",
                    "targetRoles": target_roles,
                    "experienceYears": experience_years,
                    "primaryGoal": "build" if experience == "New" else "organize",
                    "zip": zip_name,
                })

    for number, domain, slug, target_roles, gender, experience in EXTRA_STRATA:
        specs.append({
            "profileSeed": f"{slug}-{gender.lower()}-{experience.lower()}-002",
            "targetRoles": target_roles,
            "experienceYears": 0 if experience == "New" else 6,
            "primaryGoal": "build" if experience == "New" else "organize",
            "zip": _zip_name(number, domain, gender, experience),
        })

    if len(specs) != 25:
        raise ValueError(f"기존 5개 프로필 기준 신규 프로필은 25개여야 합니다: {len(specs)}")
    for index, spec in enumerate(specs, start=len(existing_profiles) + 1):
        spec["profileSeed"] = f"synthetic-profile-{index:03d}"
    duplicate_seeds = existing_seeds.intersection(spec["profileSeed"] for spec in specs)
    if duplicate_seeds:
        raise ValueError(f"기존 프로필 ID와 중복됩니다: {sorted(duplicate_seeds)}")
    return specs


def _entry_score(payload, entry_name):
    dataset = payload["dataSet"]
    question = dataset["question"]["raw"]["text"]
    answer = dataset["answer"]
    summary = answer["summary"]["text"]
    text = f"{question} {summary}"
    score = sum(text.count(marker) * 3 for marker in FACTUAL_MARKERS)
    score -= sum(text.count(marker) * 8 for marker in HYPOTHETICAL_MARKERS)
    # 같은 점수일 때도 실행마다 동일한 표본을 고른다.
    tie_breaker = hashlib.sha256(entry_name.encode("utf-8")).hexdigest()
    return score, tie_breaker


def select_source_entries(zip_path, count, excluded_entries=None):
    zip_path = Path(zip_path)
    excluded_entries = {Path(item).name for item in (excluded_entries or set())}
    candidates = []
    with zipfile.ZipFile(zip_path) as archive:
        for stored_name in archive.namelist():
            entry_name = Path(stored_name).name
            if not entry_name.endswith(".json") or entry_name in excluded_entries:
                continue
            try:
                payload = json.loads(archive.read(stored_name))
            except json.JSONDecodeError:
                continue
            score, tie_breaker = _entry_score(payload, entry_name)
            candidates.append((score, tie_breaker, entry_name))

    candidates.sort(key=lambda item: (-item[0], item[1]))
    if len(candidates) < count:
        raise ValueError(f"{zip_path.name}에서 중복 없는 근거 {count}개를 고를 수 없습니다")
    return [
        {"zip": zip_path.name, "entry": entry_name}
        for _, _, entry_name in candidates[:count]
    ]


def _find_zip(zip_root, zip_name):
    matches = list(Path(zip_root).rglob(zip_name))
    if len(matches) != 1:
        raise ValueError(f"원천 ZIP을 하나로 결정할 수 없습니다: {zip_name} ({len(matches)}개)")
    return matches[0]


def build_batch_manifest(existing_manifest, zip_root, sources_per_profile=8):
    existing_profiles = existing_manifest["profiles"]
    excluded_by_zip = {}
    for profile in existing_profiles:
        for source in profile.get("sources", []):
            excluded_by_zip.setdefault(source["zip"], set()).add(source["entry"])

    profiles = []
    for spec in build_profile_specs(existing_profiles):
        excluded = excluded_by_zip.setdefault(spec["zip"], set())
        sources = select_source_entries(
            _find_zip(zip_root, spec["zip"]),
            sources_per_profile,
            excluded,
        )
        excluded.update(source["entry"] for source in sources)
        profiles.append({
            "profileSeed": spec["profileSeed"],
            "targetRoles": spec["targetRoles"],
            "experienceYears": spec["experienceYears"],
            "primaryGoal": spec["primaryGoal"],
            "sources": sources,
        })
    return {"profiles": profiles}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("existing_manifest", type=Path)
    parser.add_argument("zip_root", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--sources-per-profile", type=int, default=8)
    args = parser.parse_args()

    existing_manifest = json.loads(args.existing_manifest.read_text(encoding="utf-8"))
    manifest = build_batch_manifest(existing_manifest, args.zip_root, args.sources_per_profile)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
