import argparse
import hashlib
import json
import uuid
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


CATEGORY_KEYS = [
    "experience",
    "project",
    "education_history",
    "certification_award",
    "academic_writing",
    "activity_leadership",
    "skill_tool",
]
TARGET_ROLES = {"백엔드", "프론트엔드", "데이터", "ML · AI", "모바일", "DevOps", "기획 · PM", "디자인"}
CAREER_GOALS = {"explore", "build", "organize"}
UUID_NAMESPACE = uuid.UUID("bd23afba-1896-48c7-a405-f06146764117")
PROMPT_VERSION = "synthetic-profile-v3"
PROMPT_PATH = Path(__file__).parent / "prompts" / f"{PROMPT_VERSION}.md"
DEFAULT_SEEDS_PATH = Path(__file__).parents[2] / "packages" / "database" / "src" / "mongodb-migrations" / "0001" / "seeds.json"
DISALLOWED_RECORD_MARKERS = (
    "가상의 프로젝트",
    "실무 경험은 없",
    "실무에서 수행한 경험은 없",
    "앞으로",
    "하고 싶",
    "하고자 한다",
    "할 계획",
    "할 예정이다",
)


def _clip(value, limit):
    return str(value or "").strip()[:limit]


def extract_evidence_atom(zip_path, entry_name):
    zip_path = Path(zip_path)
    with zipfile.ZipFile(zip_path) as archive:
        stored_name = entry_name if entry_name in archive.namelist() else f"/{entry_name.lstrip('/')}"
        with archive.open(stored_name) as source:
            payload = json.load(source)

    dataset = payload["dataSet"]
    info = dataset["info"]
    answer = dataset["answer"]
    intents = answer.get("intent") or []
    atom_name = Path(entry_name).stem
    return {
        "atomId": f"aih-71592-{atom_name}",
        "source": {
            "dataset": "AIHUB-71592",
            "zip": zip_path.name,
            "entry": Path(entry_name).name,
        },
        "occupation": info["occupation"],
        "experienceLevel": info["experience"],
        "intentCategory": next((item.get("category", "") for item in intents if item.get("category")), ""),
        "question": _clip(dataset["question"]["raw"]["text"], 150),
        "summary": _clip(answer["summary"]["text"], 300),
        "quote": _clip(answer["raw"]["text"], 200),
    }


def load_seed_categories(seed_path):
    payload = json.loads(Path(seed_path).read_text(encoding="utf-8"))
    for seed in payload:
        if seed.get("collection") == "career_categories":
            return seed["documents"]
    raise ValueError("career category seeds are missing")


def prepare_generation_inputs(manifest, zip_root, output_dir, seed_categories=None):
    zip_root = Path(zip_root)
    output_dir = Path(output_dir)
    seed_categories = seed_categories or load_seed_categories(DEFAULT_SEEDS_PATH)
    allowed_category_properties = {
        category["key"]: {
            key: definition["type"]
            for key, definition in category["propertySchema"].items()
        }
        for category in seed_categories
    }
    provenance_dir = output_dir.parent / "provenance"
    output_dir.mkdir(parents=True, exist_ok=True)
    provenance_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for profile in manifest["profiles"]:
        source_evidence = [
            extract_evidence_atom(zip_root / source["zip"], source["entry"])
            for source in profile["sources"]
        ]
        evidence = []
        evidence_id_map = {}
        for index, atom in enumerate(source_evidence, start=1):
            evidence_id = f"e{index}"
            evidence_id_map[evidence_id] = atom["atomId"]
            evidence.append({
                "evidenceId": evidence_id,
                "occupation": atom["occupation"],
                "experienceLevel": atom["experienceLevel"],
                "intentCategory": atom["intentCategory"],
                "question": atom["question"],
                "summary": atom["summary"],
                "quote": atom["quote"],
            })
        payload = {
            "spec": {
                "profileSeed": profile["profileSeed"],
                "targetRoles": profile["targetRoles"],
                "experienceYears": profile["experienceYears"],
                "primaryGoal": profile["primaryGoal"],
                "recordCount": {"min": 0, "max": 6},
            },
            "evidence": evidence,
            "allowedCategoryKeys": CATEGORY_KEYS,
            "allowedCategoryProperties": allowed_category_properties,
        }
        output_path = output_dir / f"{profile['profileSeed']}.json"
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        provenance_path = provenance_dir / f"{profile['profileSeed']}.json"
        provenance_path.write_text(json.dumps({
            "profileSeed": profile["profileSeed"],
            "evidenceIdMap": evidence_id_map,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        paths.append(output_path)
    return paths


def load_evidence_id_map(evidence_input):
    evidence_input = Path(evidence_input)
    provenance_path = evidence_input.parent.parent / "provenance" / evidence_input.name
    payload = json.loads(provenance_path.read_text(encoding="utf-8"))
    return payload["evidenceIdMap"]


def find_evidence_input(draft_path, draft):
    if draft.get("evidenceInput"):
        return Path(draft["evidenceInput"])
    candidate = Path(draft_path).parent.parent / "inputs" / Path(draft_path).name
    return candidate if candidate.exists() else None


def _stable_uuid(*parts):
    return str(uuid.uuid5(UUID_NAMESPACE, ":".join(parts)))


def _validate_persona(persona):
    roles = persona["targetRoles"]
    if len(roles) > 8 or any(role not in TARGET_ROLES for role in roles):
        raise ValueError("invalid target role")
    years = persona["experienceYears"]
    if not isinstance(years, int) or not 0 <= years <= 12:
        raise ValueError("invalid experience years")
    if persona["primaryGoal"] not in CAREER_GOALS:
        raise ValueError("invalid career goal")


def assemble_profile(
    draft,
    seed_categories,
    created_at=None,
    source_dataset="AIHUB-71592",
    allowed_atom_ids=None,
    evidence_id_map=None,
    evidence_input=None,
):
    created_at = created_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if draft.get("status") == "rejected":
        raise ValueError(draft.get("rejectionReason") or "synthetic profile generation rejected")
    profile_seed = draft["profileSeed"]
    persona = draft["persona"]
    _validate_persona(persona)
    if not 0 <= len(draft["records"]) <= 6:
        raise ValueError("synthetic profile requires 0 to 6 records")

    category_by_key = {category["key"]: category for category in seed_categories}
    if set(category_by_key) != set(CATEGORY_KEYS):
        raise ValueError("exactly seven system career categories are required")

    record_ids = {}
    record_counts = Counter()
    records = []
    source_atom_ids = set()
    record_lineage = []
    record_evidence = {}
    if evidence_id_map is not None:
        for item in draft.get("recordEvidence", []):
            draft_id = item["draftId"]
            if draft_id in record_evidence:
                raise ValueError(f"duplicate record evidence: {draft_id}")
            record_evidence[draft_id] = item["evidenceIds"]

    for item in draft["records"]:
        draft_id = item["draftId"]
        if draft_id in record_ids:
            raise ValueError(f"duplicate draft id: {draft_id}")
        category_key = item["categoryKey"]
        if category_key not in category_by_key:
            raise ValueError(f"unknown category: {category_key}")
        category = category_by_key[category_key]
        properties = item.get("properties", {})
        if not 40 <= len(item["bodyMd"]) <= 450:
            raise ValueError("record body must contain 40 to 450 characters")
        if any(marker in item["bodyMd"] for marker in DISALLOWED_RECORD_MARKERS):
            raise ValueError("record body contains aspirational or hypothetical content")
        unknown_properties = set(properties) - set(category["propertySchema"])
        if unknown_properties:
            raise ValueError(f"unknown category properties: {sorted(unknown_properties)}")

        record_id = _stable_uuid(profile_seed, "record", draft_id)
        record_ids[draft_id] = record_id
        record = {
            "id": record_id,
            "categoryId": category["_id"],
            "title": item["title"],
            "status": "organized",
            "origin": "ai",
            "properties": properties,
            "bodyMd": item["bodyMd"],
            "version": 1,
            "updatedAt": created_at,
        }
        records.append(record)
        record_counts[category_key] += 1
        if evidence_id_map is None:
            atoms = list(dict.fromkeys(item["sourceAtomIds"]))
        else:
            if draft_id not in record_evidence:
                raise ValueError(f"record evidence is missing: {draft_id}")
            evidence_ids = list(dict.fromkeys(record_evidence[draft_id]))
            unknown_evidence_ids = [item for item in evidence_ids if item not in evidence_id_map]
            if unknown_evidence_ids:
                raise ValueError(f"record contains an unknown evidence id: {unknown_evidence_ids}")
            atoms = [evidence_id_map[item] for item in evidence_ids]
        if not atoms:
            raise ValueError("every record requires source atoms")
        if allowed_atom_ids is not None and any(atom not in allowed_atom_ids for atom in atoms):
            raise ValueError("record contains an unknown source atom")
        source_atom_ids.update(atoms)
        record_lineage.append({"recordId": record_id, "sourceAtomIds": atoms})

    categories = []
    for category in sorted(seed_categories, key=lambda item: item["sortOrder"]):
        categories.append({
            "id": category["_id"],
            "key": category["key"],
            "name": category["name"],
            "icon": category["icon"],
            "defaultView": category["defaultView"],
            "isSystem": category["isSystem"],
            "propertySchema": category["propertySchema"],
            "sortOrder": category["sortOrder"],
            "recordCount": record_counts[category["key"]],
            "version": category["version"],
        })

    record_coverage = "empty" if not records else "sparse" if len(records) <= 2 else "adequate"

    return {
        "schemaVersion": 1,
        "syntheticProfileId": _stable_uuid(profile_seed, "profile"),
        "datasetMeta": {
            "sourceDataset": source_dataset,
            "profileSeed": profile_seed,
            "generatorModel": "gpt-5.6-luna",
            "promptVersion": PROMPT_VERSION,
            "promptSha256": hashlib.sha256(PROMPT_PATH.read_bytes()).hexdigest(),
            "evidenceInput": str(evidence_input) if evidence_input else draft.get("evidenceInput"),
            "sourceAtomIds": sorted(source_atom_ids),
            "recordCoverage": record_coverage,
            "usableEvidenceCount": len(source_atom_ids),
            "createdAt": created_at,
        },
        "careerProfile": {**persona, "updatedAt": created_at},
        "categories": categories,
        "records": records,
        "recordLinks": [],
        "skills": [],
        "skillEvidenceBySkillId": {},
        "provenance": {"recordLineage": record_lineage},
        "humanReview": {
            "status": "pending",
            "reviewer": None,
            "reviewedAt": None,
            "decision": None,
            "notes": None,
        },
    }


def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("manifest", type=Path)
    prepare_parser.add_argument("zip_root", type=Path)
    prepare_parser.add_argument("output_dir", type=Path)
    assemble_parser = subparsers.add_parser("assemble")
    assemble_parser.add_argument("draft", type=Path)
    assemble_parser.add_argument("output", type=Path)
    assemble_parser.add_argument(
        "--seeds",
        type=Path,
        default=Path("packages/database/src/mongodb-migrations/0001/seeds.json"),
    )
    args = parser.parse_args()
    if args.command == "prepare":
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        prepare_generation_inputs(manifest, args.zip_root, args.output_dir)
        return
    draft = json.loads(args.draft.read_text(encoding="utf-8"))
    evidence_input = find_evidence_input(args.draft, draft)
    allowed_atom_ids = None
    evidence_id_map = None
    if evidence_input:
        evidence = json.loads(Path(evidence_input).read_text(encoding="utf-8"))["evidence"]
        if evidence and "evidenceId" in evidence[0]:
            evidence_id_map = load_evidence_id_map(evidence_input)
            allowed_atom_ids = set(evidence_id_map.values())
        else:
            allowed_atom_ids = {item["atomId"] for item in evidence}
    profile = assemble_profile(
        draft,
        load_seed_categories(args.seeds),
        allowed_atom_ids=allowed_atom_ids,
        evidence_id_map=evidence_id_map,
        evidence_input=evidence_input,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
