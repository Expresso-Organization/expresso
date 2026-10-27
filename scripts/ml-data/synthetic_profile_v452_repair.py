"""v4.5.1 배치를 v4.5.2 의미 재서술 정책으로 이관하고 기록 단위 보정 대상을 계산한다."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from synthetic_profile import load_seed_categories
from synthetic_profile_v4 import (
    SEMANTIC_REWRITE_POLICY,
    _attach_record_length_targets,
    assemble_profile,
    body_min_length_for_prompt,
)
from synthetic_profile_v4_batch import DEFAULT_SEEDS_PATH, PROMPT_VERSION, _atomic_write_json
from synthetic_profile_v4_experiment import (
    _detail_length_contract,
    compose_skeleton_bodies,
    evidence_anchor_requirements,
    validate_renderer_output,
)
from synthetic_profile_luna_worker import _author_luna_profiles


BACKUP_NAME = "v4.5.1-before-v4.5.2"
MIN_SENTENCE_CHARS = 18


def _sentences(body: str) -> list[str]:
    return [
        re.sub(r"\s+", " ", part).strip(" -*#\t\r\n").rstrip(".!?。！？").strip()
        for part in re.split(r"(?<=[.!?。！？])\s+|\n+", str(body).strip())
        if len(re.sub(r"\s+", " ", part).strip(" -*#\t\r\n")) >= MIN_SENTENCE_CHARS
    ]


def _layout_matches(body: str, layout_mode: str | None) -> bool:
    if not layout_mode:
        return True
    if layout_mode == "multi_paragraph":
        return "\n\n" in body
    if layout_mode == "checklist":
        return bool(re.search(r"(^|\n)\s*[-*]\s+", body))
    if layout_mode in {"compact_note", "single_paragraph"}:
        return "\n" not in body
    return False


def format_existing_body(body: str, layout_mode: str) -> str:
    """기존 완결 문장은 바꾸지 않고 v4.5.2 노션형 레이아웃만 적용한다."""
    sentences = [
        re.sub(r"\s+", " ", part).strip(" -*#\t\r\n")
        for part in re.split(r"(?<=[.!?。！？])\s+|\n+", str(body).strip())
        if part.strip(" -*#\t\r\n")
    ]
    if not sentences:
        return str(body).strip()
    if layout_mode == "checklist" and len(sentences) >= 2:
        return "\n".join(f"- {sentence}" for sentence in sentences)
    if layout_mode == "multi_paragraph" and len(sentences) >= 2:
        if len(sentences) >= 6:
            first = max(1, len(sentences) // 3)
            second = max(first + 1, (len(sentences) * 2) // 3)
            groups = (sentences[:first], sentences[first:second], sentences[second:])
        else:
            split = max(1, len(sentences) // 2)
            groups = (sentences[:split], sentences[split:])
        return "\n\n".join(" ".join(group) for group in groups if group)
    return " ".join(sentences)


def _backup_outputs(root: Path) -> Path:
    backup_root = root / "backups" / BACKUP_NAME
    for directory in ("profiles", "drafts", "metadata"):
        source_root = root / directory
        target_root = backup_root / directory
        if not source_root.exists():
            continue
        for source in source_root.rglob("*.json"):
            target = target_root / source.relative_to(source_root)
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    return backup_root


def repair_layouts_in_place(
    manifest_path: str | Path,
    *,
    checkpoint: int,
) -> dict[str, Any]:
    """기존 기록의 문장 내용은 유지하면서 계획된 레이아웃만 기록 단위로 보정한다."""
    manifest_path = Path(manifest_path).resolve()
    root = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    backup_root = _backup_outputs(root)
    changed_records = 0
    changed_profiles = 0
    for spec in manifest.get("profiles", []):
        if int(spec.get("sequenceIndex", 0)) > checkpoint:
            continue
        seed = str(spec["profileSeed"])
        profile_path = root / "profiles" / str(spec["split"]) / f"{seed}.json"
        if not profile_path.exists():
            continue
        input_payload = json.loads((root / "inputs" / f"{seed}.json").read_text(encoding="utf-8"))
        profile = json.loads(profile_path.read_text(encoding="utf-8"))
        profile_changed = False
        for index, record in enumerate(profile.get("records", [])):
            event = input_payload.get("events", [])[index]
            formatted = format_existing_body(record.get("bodyMd", ""), event.get("layoutMode", "single_paragraph"))
            if formatted != record.get("bodyMd", ""):
                record["bodyMd"] = formatted
                changed_records += 1
                profile_changed = True
        if not profile_changed:
            continue
        changed_profiles += 1
        lengths = [len(str(record.get("bodyMd", ""))) for record in profile.get("records", [])]
        if lengths:
            profile["datasetMeta"]["actualBodyLengthMean"] = round(statistics.fmean(lengths), 2)
        _atomic_write_json(profile_path, profile)
        draft_path = root / "drafts" / str(spec["split"]) / f"{seed}.json"
        if draft_path.exists():
            draft = json.loads(draft_path.read_text(encoding="utf-8"))
            for index, record in enumerate(draft.get("records", [])):
                if index < len(profile.get("records", [])):
                    record["bodyMd"] = profile["records"][index]["bodyMd"]
            _atomic_write_json(draft_path, draft)
        metadata_path = root / "metadata" / f"{seed}.json"
        if metadata_path.exists() and lengths:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata.setdefault("validation", {})["bodyLengthMean"] = round(statistics.fmean(lengths), 2)
            _atomic_write_json(metadata_path, metadata)
    return {
        "changedProfiles": changed_profiles,
        "changedRecords": changed_records,
        "backupRoot": str(backup_root),
    }


def upgrade_batch_to_v452(manifest_path: str | Path) -> dict[str, Any]:
    """원본을 한 번 백업한 뒤 입력 계약과 manifest를 v4.5.2로 원자적으로 바꾼다."""
    manifest_path = Path(manifest_path).resolve()
    root = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    backup_root = root / "backups" / BACKUP_NAME
    backup_inputs = backup_root / "inputs"
    backup_inputs.mkdir(parents=True, exist_ok=True)
    backup_manifest = backup_root / "manifest.json"
    if not backup_manifest.exists():
        shutil.copy2(manifest_path, backup_manifest)

    upgraded = 0
    for spec in manifest.get("profiles", []):
        seed = str(spec["profileSeed"])
        input_path = root / "inputs" / f"{seed}.json"
        backup_path = backup_inputs / input_path.name
        if not backup_path.exists():
            shutil.copy2(input_path, backup_path)
        payload = json.loads(input_path.read_text(encoding="utf-8"))
        payload["renderingPolicy"] = SEMANTIC_REWRITE_POLICY
        for event in payload.get("events", []):
            event["renderMode"] = "rewrite_evidence"
            event["skeletonLead"] = ""
        _attach_record_length_targets(payload)
        _atomic_write_json(input_path, payload)
        upgraded += 1

    manifest["promptVersion"] = PROMPT_VERSION
    manifest["renderingPolicy"] = SEMANTIC_REWRITE_POLICY
    manifest["upgradedFromPromptVersion"] = "synthetic-profile-v4.5.1"
    _atomic_write_json(manifest_path, manifest)
    return {
        "promptVersion": PROMPT_VERSION,
        "upgradedInputs": upgraded,
        "backupRoot": str(backup_root),
    }


def build_repair_plan(
    profiles_by_seed: dict[str, dict[str, Any]],
    inputs_by_seed: dict[str, dict[str, Any]],
    *,
    legacy_inputs_by_seed: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """최종 사용자 텍스트를 기준으로 최소 기록 보정 집합을 계산한다."""
    sentence_owners: dict[str, set[str]] = defaultdict(set)
    title_owners: dict[str, set[str]] = defaultdict(set)
    record_sentences: dict[tuple[str, int], set[str]] = {}
    record_titles: dict[tuple[str, int], str] = {}
    layout_mismatches: set[tuple[str, int]] = set()

    for seed, profile in profiles_by_seed.items():
        events = inputs_by_seed.get(seed, {}).get("events", [])
        for index, record in enumerate(profile.get("records", [])):
            sentences = set(_sentences(record.get("bodyMd", "")))
            record_sentences[(seed, index)] = sentences
            for sentence in sentences:
                sentence_owners[sentence].add(seed)
            event = events[index] if index < len(events) else {}
            title = re.sub(r"\s+", " ", str(record.get("title", ""))).strip()
            if title and event.get("categoryKey") != "education_history":
                title_owners[title].add(seed)
                record_titles[(seed, index)] = title
            if not _layout_matches(str(record.get("bodyMd", "")), event.get("layoutMode")):
                layout_mismatches.add((seed, index))

    repeated_sentences = {
        sentence for sentence, owners in sentence_owners.items() if len(owners) >= 3
    }
    repeated_titles = {title for title, owners in title_owners.items() if len(owners) >= 3}
    targets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for seed, profile in profiles_by_seed.items():
        events = inputs_by_seed.get(seed, {}).get("events", [])
        legacy_events = (legacy_inputs_by_seed or {}).get(seed, {}).get("events", [])
        requires_legacy_rewrite = profile.get("datasetMeta", {}).get("promptVersion") != PROMPT_VERSION
        for index, _record in enumerate(profile.get("records", [])):
            reasons = []
            if (
                requires_legacy_rewrite
                and index < len(legacy_events)
                and legacy_events[index].get("renderMode") == "fixed_skeleton"
            ):
                reasons.append("legacy_fixed_skeleton")
            if record_sentences.get((seed, index), set()) & repeated_sentences:
                reasons.append("repeated_final_sentence")
            if record_titles.get((seed, index)) in repeated_titles:
                reasons.append("repeated_non_education_title")
            if (seed, index) in layout_mismatches:
                reasons.append("layout_mismatch")
            if reasons:
                event = events[index] if index < len(events) else {}
                targets[seed].append(
                    {
                        "recordIndex": index,
                        "eventId": event.get("eventId", f"ev{index + 1}"),
                        "reasons": reasons,
                    }
                )

    return {
        "summary": {
            "profiles": len(profiles_by_seed),
            "targetProfiles": len(targets),
            "targetRecords": sum(len(items) for items in targets.values()),
            "repeatedSentenceGroups": len(repeated_sentences),
            "repeatedTitleGroups": len(repeated_titles),
            "layoutMismatchRecords": len(layout_mismatches),
        },
        "forbiddenExactSentences": sorted(repeated_sentences),
        "forbiddenTitles": sorted(repeated_titles),
        "targets": dict(targets),
    }


def build_luna_repair_context(
    repair_plan: dict[str, Any],
    profiles_by_seed: dict[str, dict[str, Any]],
    inputs_by_seed: dict[str, dict[str, Any]],
    *,
    shard_id: str,
) -> dict[str, Any]:
    """Luna가 보정 대상 기록만 다시 쓰도록 최소 context를 만든다."""
    profile_rows = []
    forbidden_sentences = set(repair_plan.get("forbiddenExactSentences", []))
    forbidden_titles = set(repair_plan.get("forbiddenTitles", []))
    for seed, targets in repair_plan.get("targets", {}).items():
        profile = profiles_by_seed[seed]
        payload = inputs_by_seed[seed]
        events = []
        for target in targets:
            index = int(target["recordIndex"])
            event = payload["events"][index]
            current = profile["records"][index]
            post_sanitize_length = _detail_length_contract(event)
            # 조립기의 문장 중복·숫자 검사가 일부 문장을 덜어낼 수 있으므로 Luna에는
            # 최종 목표보다 조금 긴 원고를 요청한다. 최종 길이는 기존 계약으로 다시 검증한다.
            record_max = int(payload.get("bodyLengthPlan", {}).get("recordMaxChars", 1000))
            buffered_target = min(
                record_max,
                max(
                    post_sanitize_length["targetChars"] + 64,
                    round(post_sanitize_length["targetChars"] * 1.25),
                ),
            )
            detail_length = {
                "minChars": min(post_sanitize_length["targetChars"], buffered_target),
                "targetChars": buffered_target,
                "maxChars": min(
                    record_max,
                    max(
                        post_sanitize_length["maxChars"],
                        buffered_target + 48,
                    ),
                ),
                "minSentences": max(1, (buffered_target + 54) // 55),
            }
            events.append(
                {
                    "recordIndex": index,
                    "eventId": event["eventId"],
                    "categoryKey": event["categoryKey"],
                    "facts": event.get("facts", []),
                    "propertyValues": event.get("propertyValues", {}),
                    "renderMode": event.get("renderMode"),
                    "layoutMode": event.get("layoutMode", "single_paragraph"),
                    "detailLength": detail_length,
                    "postSanitizeLength": post_sanitize_length,
                    "minimumSentences": max(
                        detail_length["minSentences"],
                        (detail_length["targetChars"] + 17) // 18,
                    ),
                    "requiredNumbers": sorted(
                        set(re.findall(r"\d+(?:[.,]\d+)?", " ".join(event.get("facts", []))))
                    ),
                    "numericFacts": [
                        fact
                        for fact in event.get("facts", [])
                        if re.search(r"\d+(?:[.,]\d+)?", str(fact))
                    ],
                    "requiredEvidenceAnchors": evidence_anchor_requirements(event),
                    "currentTitle": current.get("title", ""),
                    "currentBodyMd": current.get("bodyMd", ""),
                    "repairReasons": target.get("reasons", []),
                    "forbiddenExactSentences": sorted(
                        set(_sentences(current.get("bodyMd", ""))) & forbidden_sentences
                    ),
                    "forbiddenTitles": (
                        [str(current.get("title", ""))]
                        if str(current.get("title", "")) in forbidden_titles
                        else []
                    ),
                }
            )
        profile_rows.append(
            {
                "profileSeed": seed,
                "persona": payload.get("persona", profile.get("careerProfile", {})),
                "events": events,
            }
        )
    return {
        "schemaVersion": 1,
        "shardId": shard_id,
        "promptVersion": PROMPT_VERSION,
        "profiles": profile_rows,
        "sentencePolicy": {
            "instruction": "각 event의 금지 문장과 금지 제목을 재사용하지 않는다.",
        },
    }


def merge_authored_repair(
    payload: dict[str, Any],
    draft: dict[str, Any],
    authored_profile: dict[str, Any],
    targets: list[dict[str, Any]],
) -> dict[str, Any]:
    """보정 bundle의 기록만 기존 draft에 합치고 나머지는 그대로 둔다."""
    if authored_profile.get("profileSeed") != payload.get("profileSeed"):
        raise ValueError("repair profileSeed mismatch")
    authored_records = authored_profile.get("records")
    if not isinstance(authored_records, list) or len(authored_records) != len(targets):
        raise ValueError("repair record count mismatch")
    merged = json.loads(json.dumps(draft, ensure_ascii=False))
    for target, authored in zip(targets, authored_records, strict=True):
        index = int(target["recordIndex"])
        event = payload["events"][index]
        if authored.get("eventId") != event.get("eventId"):
            raise ValueError("repair event order mismatch")
        candidate = {
            "draftId": f"r{index + 1}",
            "eventId": event["eventId"],
            "categoryKey": event["categoryKey"],
            "title": str(authored.get("title", "")).strip(),
            "properties": event.get("propertyValues", {}),
            "detailMd": str(authored.get("detailMd", "")).strip(),
        }
        materialized = compose_skeleton_bodies(payload, {"records": [candidate]})
        replacement = materialized["records"][0]
        if set(target.get("reasons", [])) == {"repeated_non_education_title"}:
            replacement["bodyMd"] = merged["records"][index]["bodyMd"]
        merged["records"][index] = replacement
    return merged


def repair_corpus_with_luna(
    manifest_path: str | Path,
    repair_plan_path: str | Path,
    *,
    codex_path: str | Path,
    profile: str = "synthetic-profile-generator",
    timeout_seconds: int = 3600,
    max_target_chars: int = 6000,
    max_workers: int = 3,
    limit_profiles: int | None = None,
    round_number: int = 1,
) -> dict[str, Any]:
    """Luna로 지정된 기록만 다시 쓰고 검증을 통과한 프로필만 원자적으로 교체한다."""
    manifest_path = Path(manifest_path).resolve()
    root = manifest_path.parent
    repair_plan = json.loads(Path(repair_plan_path).read_text(encoding="utf-8"))
    profiles, inputs = load_batch_for_repair(manifest_path, checkpoint=1000)
    selected_seeds = [seed for seed in repair_plan.get("targets", {}) if seed in profiles]
    if limit_profiles is not None:
        selected_seeds = selected_seeds[:limit_profiles]
    selected_plan = {
        **repair_plan,
        "targets": {seed: repair_plan["targets"][seed] for seed in selected_seeds},
    }
    shard_id = f"corpus-repair-v4.5.2-round-{round_number:02d}"
    context = build_luna_repair_context(
        selected_plan,
        {seed: profiles[seed] for seed in selected_seeds},
        {seed: inputs[seed] for seed in selected_seeds},
        shard_id=shard_id,
    )
    if not context["profiles"]:
        return {"selectedProfiles": 0, "completedProfiles": 0, "failedProfiles": 0, "failures": {}}
    prompt_path = Path(__file__).parent / "prompts" / "synthetic-profile-luna-v4.5.2-repair.md"
    bundle = _author_luna_profiles(
        context=context,
        output_root=root,
        codex_path=Path(codex_path),
        profile=profile,
        base_prompt=prompt_path.read_text(encoding="utf-8"),
        timeout_seconds=timeout_seconds,
        max_target_chars=max_target_chars,
        max_workers=max_workers,
        log_label=shard_id,
    )
    _atomic_write_json(root / "staging" / f"{shard_id}.bundle.json", bundle)
    authored_by_seed = {
        str(item.get("profileSeed", "")): item for item in bundle.get("profiles", [])
    }
    seed_categories = load_seed_categories(DEFAULT_SEEDS_PATH)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    specs_by_seed = {str(item["profileSeed"]): item for item in manifest["profiles"]}
    failures: dict[str, Any] = {}
    completed = 0
    for seed in selected_seeds:
        spec = specs_by_seed[seed]
        draft_path = root / "drafts" / str(spec["split"]) / f"{seed}.json"
        profile_path = root / "profiles" / str(spec["split"]) / f"{seed}.json"
        try:
            draft = json.loads(draft_path.read_text(encoding="utf-8"))
            existing_profile = profiles[seed]
            merged = merge_authored_repair(
                inputs[seed],
                draft,
                authored_by_seed[seed],
                selected_plan["targets"][seed],
            )
            validation = validate_renderer_output(
                inputs[seed],
                merged,
                enforce_skeleton=True,
                body_min_length=body_min_length_for_prompt(PROMPT_VERSION),
            )
            if not validation["valid"]:
                raise ValueError(json.dumps(validation["errors"], ensure_ascii=False))
            generator_model = str(existing_profile.get("datasetMeta", {}).get("generatorModel", "gpt-5.6-luna"))
            assembled = assemble_profile(
                inputs[seed],
                merged,
                seed_categories,
                generator_model=generator_model,
                prompt_version=PROMPT_VERSION,
                created_at=existing_profile.get("datasetMeta", {}).get("createdAt"),
            )
            assembled["syntheticProfileId"] = existing_profile.get("syntheticProfileId", assembled["syntheticProfileId"])
            assembled["humanReview"] = existing_profile.get("humanReview", assembled["humanReview"])
            _atomic_write_json(draft_path, merged)
            _atomic_write_json(profile_path, assembled)
            metadata_path = root / "metadata" / f"{seed}.json"
            metadata = (
                json.loads(metadata_path.read_text(encoding="utf-8"))
                if metadata_path.exists()
                else {"profileSeed": seed, "model": generator_model}
            )
            metadata.update(
                {
                    "promptVersion": PROMPT_VERSION,
                    "validation": validation,
                    "actualRecordCount": len(assembled["records"]),
                    "targetRecordCount": inputs[seed]["targetRecordCount"],
                    "bodyLengthPlan": inputs[seed]["bodyLengthPlan"],
                    "repair": {
                        "model": "gpt-5.6-luna",
                        "round": round_number,
                        "recordCount": len(selected_plan["targets"][seed]),
                    },
                }
            )
            _atomic_write_json(metadata_path, metadata)
            completed += 1
        except Exception as exc:
            failures[seed] = {"type": type(exc).__name__, "message": str(exc)}
            _atomic_write_json(
                root / "errors" / f"{seed}.v452-repair-round-{round_number:02d}.json",
                {"profileSeed": seed, **failures[seed]},
            )
    return {
        "selectedProfiles": len(selected_seeds),
        "completedProfiles": completed,
        "failedProfiles": len(failures),
        "failures": failures,
    }


def load_batch_for_repair(
    manifest_path: str | Path,
    *,
    checkpoint: int,
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    manifest_path = Path(manifest_path).resolve()
    root = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    profiles: dict[str, dict[str, Any]] = {}
    inputs: dict[str, dict[str, Any]] = {}
    for spec in manifest.get("profiles", []):
        if int(spec.get("sequenceIndex", 0)) > checkpoint:
            continue
        seed = str(spec["profileSeed"])
        input_path = root / "inputs" / f"{seed}.json"
        profile_path = root / "profiles" / str(spec["split"]) / f"{seed}.json"
        if not profile_path.exists():
            continue
        inputs[seed] = json.loads(input_path.read_text(encoding="utf-8"))
        profiles[seed] = json.loads(profile_path.read_text(encoding="utf-8"))
    return profiles, inputs


def load_legacy_inputs(manifest_path: str | Path, seeds: set[str]) -> dict[str, dict[str, Any]]:
    root = Path(manifest_path).resolve().parent
    backup_inputs = root / "backups" / BACKUP_NAME / "inputs"
    result = {}
    for seed in seeds:
        path = backup_inputs / f"{seed}.json"
        if path.exists():
            result[seed] = json.loads(path.read_text(encoding="utf-8"))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    upgrade = subparsers.add_parser("upgrade")
    upgrade.add_argument("manifest", type=Path)
    plan = subparsers.add_parser("plan")
    plan.add_argument("manifest", type=Path)
    plan.add_argument("--checkpoint", type=int, default=1000)
    plan.add_argument("--output", type=Path)
    layouts = subparsers.add_parser("repair-layouts")
    layouts.add_argument("manifest", type=Path)
    layouts.add_argument("--checkpoint", type=int, default=1000)
    repair_luna = subparsers.add_parser("repair-luna")
    repair_luna.add_argument("manifest", type=Path)
    repair_luna.add_argument("--plan", type=Path, required=True)
    repair_luna.add_argument("--codex", type=Path, required=True)
    repair_luna.add_argument("--profile", default="synthetic-profile-generator")
    repair_luna.add_argument("--timeout", type=int, default=3600)
    repair_luna.add_argument("--max-target-chars", type=int, default=6000)
    repair_luna.add_argument("--max-workers", type=int, default=3)
    repair_luna.add_argument("--limit-profiles", type=int)
    repair_luna.add_argument("--round", type=int, default=1)
    args = parser.parse_args()
    if args.command == "upgrade":
        print(json.dumps(upgrade_batch_to_v452(args.manifest), ensure_ascii=False, indent=2))
        return
    if args.command == "repair-layouts":
        print(
            json.dumps(
                repair_layouts_in_place(args.manifest, checkpoint=args.checkpoint),
                ensure_ascii=False,
                indent=2,
            )
        )
        return
    if args.command == "repair-luna":
        print(
            json.dumps(
                repair_corpus_with_luna(
                    args.manifest,
                    args.plan,
                    codex_path=args.codex,
                    profile=args.profile,
                    timeout_seconds=args.timeout,
                    max_target_chars=args.max_target_chars,
                    max_workers=args.max_workers,
                    limit_profiles=args.limit_profiles,
                    round_number=args.round,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return
    profiles, inputs = load_batch_for_repair(args.manifest, checkpoint=args.checkpoint)
    repair_plan = build_repair_plan(
        profiles,
        inputs,
        legacy_inputs_by_seed=load_legacy_inputs(args.manifest, set(profiles)),
    )
    if args.output:
        _atomic_write_json(args.output, repair_plan)
    print(json.dumps(repair_plan["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
