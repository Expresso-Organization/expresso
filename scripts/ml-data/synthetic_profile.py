import argparse
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


def prepare_generation_inputs(manifest, zip_root, output_dir):
    zip_root = Path(zip_root)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for profile in manifest["profiles"]:
        evidence = [
            extract_evidence_atom(zip_root / source["zip"], source["entry"])
            for source in profile["sources"]
        ]
        payload = {
            "spec": {
                "profileSeed": profile["profileSeed"],
                "targetRoles": profile["targetRoles"],
                "experienceYears": profile["experienceYears"],
                "primaryGoal": profile["primaryGoal"],
                "recordCount": {"min": 4, "max": 6},
            },
            "evidence": evidence,
            "allowedCategoryKeys": CATEGORY_KEYS,
        }
        output_path = output_dir / f"{profile['profileSeed']}.json"
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        paths.append(output_path)
    return paths


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
):
    created_at = created_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    profile_seed = draft["profileSeed"]
    persona = draft["persona"]
    _validate_persona(persona)
    if not 4 <= len(draft["records"]) <= 6:
        raise ValueError("synthetic profile requires 4 to 6 records")

    category_by_key = {category["key"]: category for category in seed_categories}
    if set(category_by_key) != set(CATEGORY_KEYS):
        raise ValueError("exactly seven system career categories are required")

    record_ids = {}
    record_by_draft_id = {}
    record_counts = Counter()
    records = []
    source_atom_ids = set()
    record_lineage = []

    for item in draft["records"]:
        draft_id = item["draftId"]
        if draft_id in record_ids:
            raise ValueError(f"duplicate draft id: {draft_id}")
        category_key = item["categoryKey"]
        if category_key not in category_by_key:
            raise ValueError(f"unknown category: {category_key}")
        category = category_by_key[category_key]
        properties = item.get("properties", {})
        if not 280 <= len(item["bodyMd"]) <= 600:
            raise ValueError("record body must contain 280 to 600 characters")
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
        record_by_draft_id[draft_id] = record
        record_counts[category_key] += 1
        atoms = list(dict.fromkeys(item["sourceAtomIds"]))
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

    record_links = []
    for index, link in enumerate(draft.get("links", [])):
        from_id = record_ids[link["fromDraftId"]]
        to_id = record_ids[link["toDraftId"]]
        relation = link["relation"]
        if relation not in {"related", "parent", "duplicate_of"}:
            raise ValueError(f"invalid link relation: {relation}")
        link_id = _stable_uuid(profile_seed, "link", str(index), from_id, to_id, relation)
        record_links.extend([
            {"id": link_id, "recordId": from_id, "relatedRecordId": to_id, "relation": relation, "direction": "outgoing"},
            {"id": link_id, "recordId": to_id, "relatedRecordId": from_id, "relation": relation, "direction": "incoming"},
        ])

    skills = []
    skill_evidence_by_id = {}
    for item in draft.get("skills", []):
        skill_id = _stable_uuid(profile_seed, "skill", item["name"].casefold())
        evidence_rows = []
        for evidence in item["evidence"]:
            record = record_by_draft_id[evidence["draftId"]]
            quote = evidence["quote"]
            source = "body_md"
            start = record["bodyMd"].find(quote)
            if start < 0:
                source = "title"
                start = record["title"].find(quote)
            if start < 0:
                raise ValueError(f"skill quote is absent from record: {quote}")
            evidence_rows.append({
                "recordId": record["id"],
                "recordTitle": record["title"],
                "span": {"source": source, "start": start, "end": start + len(quote), "quote": quote},
            })
        evidence_count = len(evidence_rows)
        if not evidence_count:
            raise ValueError("skill evidence is required")
        skills.append({
            "id": skill_id,
            "name": item["name"],
            "level": item["level"],
            "evidenceCount": evidence_count,
            "strength": "strong" if evidence_count >= 3 else "supported" if evidence_count == 2 else "weak",
            "lastUsedAt": created_at,
            "computedAt": created_at,
        })
        skill_evidence_by_id[skill_id] = evidence_rows

    return {
        "schemaVersion": 1,
        "syntheticProfileId": _stable_uuid(profile_seed, "profile"),
        "datasetMeta": {
            "sourceDataset": source_dataset,
            "profileSeed": profile_seed,
            "generatorModel": "gpt-5.6-luna",
            "promptVersion": "synthetic-profile-v1",
            "evidenceInput": draft.get("evidenceInput"),
            "sourceAtomIds": sorted(source_atom_ids),
            "createdAt": created_at,
        },
        "careerProfile": {**persona, "updatedAt": created_at},
        "categories": categories,
        "records": records,
        "recordLinks": record_links,
        "skills": skills,
        "skillEvidenceBySkillId": skill_evidence_by_id,
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
    evidence_input = draft.get("evidenceInput")
    allowed_atom_ids = None
    if evidence_input:
        evidence = json.loads(Path(evidence_input).read_text(encoding="utf-8"))["evidence"]
        allowed_atom_ids = {item["atomId"] for item in evidence}
    profile = assemble_profile(
        draft,
        load_seed_categories(args.seeds),
        allowed_atom_ids=allowed_atom_ids,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
