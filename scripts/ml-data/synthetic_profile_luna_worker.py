"""생성 전용 Luna agent와 배치 저장 형식 사이의 얇은 I/O 경계."""

from __future__ import annotations

import argparse
import concurrent.futures
import copy
import json
import math
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from synthetic_profile import load_seed_categories
from synthetic_profile_v4 import assemble_profile, body_min_length_for_prompt
from synthetic_profile_v4_batch import (
    DEFAULT_SEEDS_PATH,
    PROMPT_VERSION,
    _atomic_write_json,
    _utc_now,
)
from synthetic_profile_v4_experiment import (
    compose_skeleton_bodies,
    evidence_anchor_requirements,
    validate_renderer_output,
)


LUNA_AUTHORING_REVISION = "v452-length-buffer-v3"


MIN_SENTENCE_CHARS = 25
LUNA_PROMPT_PATH = Path(__file__).parent / "prompts" / "synthetic-profile-luna-v4.5.2.md"


def _sentences(body: str) -> list[str]:
    sentences = []
    for part in re.split(r"(?<=[.!?])\s+|\n+", str(body).strip()):
        normalized = re.sub(r"\s+", " ", part).strip(" -*#\t\r\n")
        normalized = normalized.rstrip(".!?").strip()
        if len(normalized) >= MIN_SENTENCE_CHARS:
            sentences.append(normalized)
    return sentences


def _profile_seed(profile: dict[str, Any], fallback: str) -> str:
    return str(
        profile.get("profileSeed")
        or profile.get("datasetMeta", {}).get("profileSeed")
        or fallback
    )


def find_intra_profile_sentence_repetitions(profile: dict[str, Any]) -> list[dict[str, Any]]:
    counts = Counter(
        sentence
        for record in profile.get("records", [])
        for sentence in _sentences(record.get("bodyMd", ""))
    )
    return [
        {"sentence": sentence, "occurrences": count}
        for sentence, count in counts.most_common()
        if count >= 2
    ]


def find_cross_profile_sentence_repetitions(
    profiles: list[dict[str, Any]],
    *,
    threshold: int = 3,
    ignored_sentences_by_profile: dict[str, set[str]] | None = None,
) -> list[dict[str, Any]]:
    if threshold < 2:
        raise ValueError("threshold must be at least two")
    occurrences: Counter[str] = Counter()
    owners: dict[str, set[str]] = defaultdict(set)
    for index, profile in enumerate(profiles):
        seed = _profile_seed(profile, f"profile-{index + 1}")
        for record in profile.get("records", []):
            for sentence in _sentences(record.get("bodyMd", "")):
                occurrences[sentence] += 1
                owners[sentence].add(seed)
    issues = [
        {
            "sentence": sentence,
            "occurrences": occurrences[sentence],
            "profileCount": len(profile_seeds),
            "profileSeeds": sorted(profile_seeds),
        }
        for sentence, profile_seeds in owners.items()
        if len(profile_seeds) >= threshold
    ]
    return sorted(issues, key=lambda item: (-item["profileCount"], -item["occurrences"], item["sentence"]))


def _load_manifest_and_shard(manifest_path: Path, shard_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    shard = next((item for item in manifest["shards"] if item["shardId"] == shard_id), None)
    if shard is None:
        raise ValueError(f"unknown shard: {shard_id}")
    return manifest, shard


def _load_existing_profiles(output_root: Path, *, excluded_seeds: set[str]) -> list[dict[str, Any]]:
    profiles = []
    for path in (output_root / "profiles").rglob("*.json"):
        if path.stem in excluded_seeds:
            continue
        try:
            profiles.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
    return profiles


def _load_ignored_skeletons(output_root: Path, seeds: set[str]) -> dict[str, set[str]]:
    ignored: dict[str, set[str]] = {}
    for seed in seeds:
        path = output_root / "inputs" / f"{seed}.json"
        if not path.exists():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        ignored[seed] = {
            sentence
            for event in payload.get("events", [])
            if event.get("renderMode") == "fixed_skeleton"
            for sentence in _sentences(event.get("skeletonLead", ""))
        }
    return ignored


def build_luna_event_context(event: dict[str, Any]) -> dict[str, Any]:
    """Luna에는 창작에 필요한 사실과 글자 수 계약만 전달한다."""
    lead = str(event.get("skeletonLead", "")).strip()
    reserve = len(lead) + 1 if event.get("renderMode") == "fixed_skeleton" and lead else 0
    target = event.get("bodyLengthTarget", {})
    facts_text = " ".join(str(fact) for fact in event.get("facts", []))
    required_date_phrases = sorted(
        {
            f"{year}년 {int(month)}월"
            for year, month in re.findall(r"(\d{4})[-./](\d{1,2})", facts_text)
        }
    )
    detail_length = {
        key: max(1, int(target.get(key, 1)) - reserve)
        for key in ("targetChars", "minChars", "maxChars")
    }
    context = {
        "eventId": event["eventId"],
        "categoryKey": event["categoryKey"],
        "facts": event.get("facts", []),
        "propertyValues": event.get("propertyValues", {}),
        "skeletonLead": lead,
        "renderMode": event.get("renderMode"),
        "layoutMode": event.get("layoutMode", "single_paragraph"),
        "detailLength": detail_length,
        "minimumSentences": max(1, (detail_length["minChars"] + 44) // 45),
        "requiredNumbers": sorted(
            set(re.findall(r"\d+(?:[.,]\d+)?", " ".join(event.get("facts", []))))
        ),
        "numericFacts": [
            fact for fact in event.get("facts", []) if re.search(r"\d+(?:[.,]\d+)?", str(fact))
        ],
        "requiredDatePhrases": required_date_phrases,
        "requiredEvidenceAnchors": evidence_anchor_requirements(event),
    }
    if event.get("renderMode") == "rewrite_evidence":
        post_sanitize_length = detail_length
        buffered_target = max(
            post_sanitize_length["targetChars"] + 64,
            round(post_sanitize_length["targetChars"] * 1.25),
        )
        detail_length = {
            "targetChars": buffered_target,
            "minChars": post_sanitize_length["targetChars"],
            "maxChars": max(post_sanitize_length["maxChars"], buffered_target + 48),
        }
        context["postSanitizeLength"] = post_sanitize_length
        context["detailLength"] = detail_length
        context["minimumSentences"] = max(1, (buffered_target + 17) // 18)
    return context


def materialize_luna_draft(
    payload: dict[str, Any],
    authored_profile: dict[str, Any],
) -> dict[str, Any]:
    """Luna가 쓴 제목/세부 본문에 입력의 구조 필드를 결정적으로 결합한다."""
    seed = str(authored_profile.get("profileSeed", ""))
    if seed != payload["profileSeed"]:
        raise ValueError(f"profileSeed mismatch: expected={payload['profileSeed']}, actual={seed}")
    authored_records = authored_profile.get("records")
    if not isinstance(authored_records, list) or len(authored_records) != payload["targetRecordCount"]:
        raise ValueError("authored record count does not match targetRecordCount")

    records = []
    for index, (event, authored) in enumerate(zip(payload["events"], authored_records), start=1):
        if authored.get("eventId") != event["eventId"]:
            raise ValueError(f"event order mismatch at record {index}")
        lead = str(event.get("skeletonLead", "")).strip()
        detail = str(authored.get("detailMd", "")).strip()
        if event.get("renderMode") == "fixed_skeleton" and lead and detail.startswith(lead):
            detail = detail[len(lead) :].lstrip()
        record = {
            "draftId": f"r{index}",
            "eventId": event["eventId"],
            "categoryKey": event["categoryKey"],
            "title": str(authored.get("title", "")).strip(),
            "properties": event.get("propertyValues", {}),
        }
        if payload.get("renderingPolicy") in {
            "skeleton-grounded-creative-v1",
            "semantic-rewrite-creative-v2",
        }:
            record["detailMd"] = detail
        else:
            record["bodyMd"] = (
                f"{lead} {detail}".strip()
                if event.get("renderMode") == "fixed_skeleton"
                else detail
            )
        records.append(record)
    draft = {
        "status": "generated",
        "profileSeed": payload["profileSeed"],
        "persona": payload["persona"],
        "records": records,
    }
    if payload.get("renderingPolicy") in {
        "skeleton-grounded-creative-v1",
        "semantic-rewrite-creative-v2",
    }:
        return compose_skeleton_bodies(payload, draft)
    return draft


def parse_codex_bundle_jsonl(stream: str) -> dict[str, Any]:
    messages = []
    for line in stream.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        item = event.get("item", {})
        if event.get("type") == "item.completed" and item.get("type") == "agent_message":
            messages.append(str(item.get("text", "")))
    if not messages:
        raise ValueError("Codex output did not contain an agent_message bundle")
    text = messages[-1].strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE)
    bundle = json.loads(text)
    if not isinstance(bundle, dict):
        raise ValueError("Luna bundle must be a JSON object")
    return bundle


def parse_codex_bundle_attempts(
    streams: Iterable[str],
    *,
    expected_shard_id: str | None = None,
    expected_profile_seeds: list[str] | None = None,
) -> dict[str, Any]:
    last_error: ValueError | None = None
    for stream in streams:
        try:
            bundle = parse_codex_bundle_jsonl(stream)
            if expected_shard_id is not None and bundle.get("shardId") != expected_shard_id:
                raise ValueError("partial bundle shardId does not match the shard")
            if expected_profile_seeds is not None:
                profiles = bundle.get("profiles")
                if not isinstance(profiles, list):
                    raise ValueError("partial bundle profiles must be a list")
                actual_seeds = [
                    str(item.get("profileSeed", ""))
                    for item in profiles
                    if isinstance(item, dict)
                ]
                if Counter(actual_seeds) != Counter(expected_profile_seeds):
                    raise ValueError("partial bundle profileSeeds do not match the group")
            return bundle
        except (json.JSONDecodeError, ValueError) as exc:
            last_error = exc
    if last_error is not None:
        raise last_error
    raise ValueError("no Codex output attempts were provided")


def partition_luna_profiles(
    profiles: list[dict[str, Any]],
    *,
    max_target_chars: int,
) -> list[list[dict[str, Any]]]:
    if max_target_chars < 1:
        raise ValueError("max_target_chars must be positive")
    groups: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    current_chars = 0
    for profile in profiles:
        profile_chars = sum(
            int(event.get("detailLength", {}).get("targetChars", 0))
            for event in profile.get("events", [])
        )
        if current and current_chars + profile_chars > max_target_chars:
            groups.append(current)
            current = []
            current_chars = 0
        current.append(profile)
        current_chars += profile_chars
    if current:
        groups.append(current)
    return groups


def merge_luna_bundles(
    bundles: list[dict[str, Any]],
    *,
    shard_id: str,
    expected_seeds: list[str],
) -> dict[str, Any]:
    by_seed: dict[str, dict[str, Any]] = {}
    for bundle in bundles:
        if bundle.get("shardId") != shard_id:
            raise ValueError("partial bundle shardId mismatch")
        for profile in bundle.get("profiles", []):
            seed = str(profile.get("profileSeed", ""))
            if not seed or seed in by_seed:
                raise ValueError("partial bundles contain a missing or duplicate profileSeed")
            by_seed[seed] = profile
    if set(by_seed) != set(expected_seeds):
        raise ValueError("partial bundle profileSeeds do not match the shard")
    return {"shardId": shard_id, "profiles": [by_seed[seed] for seed in expected_seeds]}


def replace_luna_profiles(
    existing: dict[str, Any],
    replacements: dict[str, Any],
) -> dict[str, Any]:
    if existing.get("shardId") != replacements.get("shardId"):
        raise ValueError("replacement bundle shardId mismatch")
    replacement_by_seed = {
        str(profile.get("profileSeed", "")): profile
        for profile in replacements.get("profiles", [])
    }
    if not replacement_by_seed or "" in replacement_by_seed:
        raise ValueError("replacement bundle has no valid profiles")
    existing_seeds = {str(profile.get("profileSeed", "")) for profile in existing.get("profiles", [])}
    if not set(replacement_by_seed).issubset(existing_seeds):
        raise ValueError("replacement bundle contains an unknown profileSeed")
    return {
        "shardId": existing["shardId"],
        "profiles": [
            replacement_by_seed.get(str(profile.get("profileSeed", "")), profile)
            for profile in existing["profiles"]
        ],
    }


def sentence_boost_for_body_mean(
    *,
    actual_mean: float,
    target_mean: float,
    tolerance: float,
    band_mismatch: bool = False,
) -> int:
    difference = target_mean - actual_mean
    if abs(difference) <= tolerance:
        if band_mismatch:
            return 2 if difference >= 0 else -2
        return 0
    if difference > 0:
        return min(6, max(1, math.ceil(difference / 45)))
    return max(-6, min(-1, round(difference / 80)))


def minimum_sentences_for_repair_round(
    *,
    base: int,
    boost: int,
    round_number: int,
    maximum: int | None = None,
) -> int:
    requested = max(1, base + boost * max(1, round_number))
    return min(requested, maximum) if maximum is not None else requested


def _run_luna_group(
    *,
    codex_path: Path,
    profile: str,
    request: str,
    timeout_seconds: int,
) -> tuple[str, str]:
    process = subprocess.run(
        [
            str(codex_path),
            "-p",
            profile,
            "--strict-config",
            "exec",
            "--ephemeral",
            "--skip-git-repo-check",
            "--json",
            "-",
        ],
        cwd=Path(__file__).parents[2],
        input=request,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout_seconds,
        check=False,
    )
    if process.returncode != 0:
        raise RuntimeError(
            f"Codex profile failed with exit code {process.returncode}: {process.stderr[-1000:]}"
        )
    return process.stdout, process.stderr


def _author_luna_profiles(
    *,
    context: dict[str, Any],
    output_root: Path,
    codex_path: Path,
    profile: str,
    base_prompt: str,
    timeout_seconds: int,
    max_target_chars: int,
    max_workers: int,
    log_label: str,
) -> dict[str, Any]:
    groups = partition_luna_profiles(
        context["profiles"],
        max_target_chars=max_target_chars,
    )

    def run_group(index: int, group: list[dict[str, Any]]) -> dict[str, Any]:
        part = index + 1

        def author_segment(
            segment: list[dict[str, Any]],
            segment_label: str,
        ) -> dict[str, Any]:
            group_context = {**context, "profiles": segment}
            request = (
                base_prompt
                + "\n\n# 입력 context\n"
                + json.dumps(group_context, ensure_ascii=False)
                + "\n\nJSON 객체 하나만 출력하라.\n"
            )
            expected_profile_seeds = [
                profile_row["profileSeed"] for profile_row in segment
            ]

            def split_segment() -> dict[str, Any]:
                midpoint = len(segment) // 2
                left = author_segment(
                    segment[:midpoint],
                    f"{segment_label}-sub-01",
                )
                right = author_segment(
                    segment[midpoint:],
                    f"{segment_label}-sub-02",
                )
                return merge_luna_bundles(
                    [left, right],
                    shard_id=context["shardId"],
                    expected_seeds=expected_profile_seeds,
                )

            log_prefix = f"luna-profile-{log_label}-part-{segment_label}-attempt-"
            cached_logs = sorted(output_root.glob(f"{log_prefix}*.jsonl"))
            if cached_logs:
                try:
                    return parse_codex_bundle_attempts(
                        (path.read_text(encoding="utf-8") for path in cached_logs),
                        expected_shard_id=context["shardId"],
                        expected_profile_seeds=expected_profile_seeds,
                    )
                except (ValueError, json.JSONDecodeError):
                    if len(cached_logs) >= 3 and len(segment) > 1:
                        return split_segment()

            next_attempt = len(cached_logs) + 1

            def attempts() -> Iterable[str]:
                for attempt in range(next_attempt, next_attempt + 3):
                    stdout, stderr = _run_luna_group(
                        codex_path=codex_path,
                        profile=profile,
                        request=request,
                        timeout_seconds=timeout_seconds,
                    )
                    prefix = (
                        f"luna-profile-{log_label}-part-{segment_label}"
                        f"-attempt-{attempt:02d}"
                    )
                    (output_root / f"{prefix}.jsonl").write_text(
                        stdout,
                        encoding="utf-8",
                    )
                    (output_root / f"{prefix}.err.log").write_text(
                        stderr,
                        encoding="utf-8",
                    )
                    yield stdout

            try:
                return parse_codex_bundle_attempts(
                    attempts(),
                    expected_shard_id=context["shardId"],
                    expected_profile_seeds=expected_profile_seeds,
                )
            except (ValueError, json.JSONDecodeError):
                if len(segment) == 1:
                    raise
                return split_segment()

        return author_segment(group, f"{part:02d}")

    bundles: list[dict[str, Any] | None] = [None] * len(groups)
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(max_workers, len(groups))) as executor:
        futures = {
            executor.submit(run_group, index, group): index
            for index, group in enumerate(groups)
        }
        for future in concurrent.futures.as_completed(futures):
            bundles[futures[future]] = future.result()
    return merge_luna_bundles(
        [bundle for bundle in bundles if bundle is not None],
        shard_id=context["shardId"],
        expected_seeds=[item["profileSeed"] for item in context["profiles"]],
    )


def generate_with_luna_profile(
    manifest_path: Path,
    shard_id: str,
    *,
    codex_path: Path,
    profile: str,
    prompt_path: Path = LUNA_PROMPT_PATH,
    timeout_seconds: int = 3600,
    max_target_chars: int = 6000,
    max_workers: int = 3,
    max_repair_rounds: int = 3,
    profile_seeds: list[str] | None = None,
) -> dict[str, Any]:
    manifest_path = Path(manifest_path).resolve()
    output_root = manifest_path.parent
    context_path = prepare_context(manifest_path, shard_id, profile_seeds=profile_seeds)
    context = json.loads(context_path.read_text(encoding="utf-8"))
    base_prompt = Path(prompt_path).read_text(encoding="utf-8")
    bundle = _author_luna_profiles(
        context=context,
        output_root=output_root,
        codex_path=codex_path,
        profile=profile,
        base_prompt=base_prompt,
        timeout_seconds=timeout_seconds,
        max_target_chars=max_target_chars,
        max_workers=max_workers,
        log_label=f"{shard_id}-{LUNA_AUTHORING_REVISION}",
    )
    bundle_path = output_root / "staging" / f"{shard_id}.bundle.json"
    payloads = {
        item["profileSeed"]: json.loads(
            (output_root / "inputs" / f"{item['profileSeed']}.json").read_text(encoding="utf-8")
        )
        for item in context["profiles"]
    }
    for repair_round in range(max_repair_rounds + 1):
        _atomic_write_json(bundle_path, bundle)
        try:
            return commit_bundle(
                manifest_path,
                shard_id,
                bundle_path,
                expected_seeds=set(profile_seeds) if profile_seeds is not None else None,
                defer_cross_profile_diversity=True,
            )
        except ValueError as exc:
            if repair_round >= max_repair_rounds:
                raise
            try:
                validation_errors = json.loads(str(exc))["validationErrors"]
            except (json.JSONDecodeError, KeyError, TypeError) as parse_error:
                raise exc from parse_error
            authored_by_seed = {
                item["profileSeed"]: item for item in bundle["profiles"]
            }
            retry_profiles = []
            for profile_context in context["profiles"]:
                seed = profile_context["profileSeed"]
                if seed not in validation_errors:
                    continue
                payload = payloads[seed]
                draft = materialize_luna_draft(payload, authored_by_seed[seed])
                actual_mean = sum(len(record["bodyMd"]) for record in draft["records"]) / len(
                    draft["records"]
                )
                plan = payload["bodyLengthPlan"]
                flat_errors = [str(error) for error in validation_errors[seed]]
                boost = sentence_boost_for_body_mean(
                    actual_mean=actual_mean,
                    target_mean=plan["targetMeanChars"],
                    tolerance=plan["toleranceChars"],
                    band_mismatch=any(
                        "body_length_band" in error for error in flat_errors
                    ),
                )
                retry_profile = copy.deepcopy(profile_context)
                retry_profile["retryDirective"] = {
                    "round": repair_round + 1,
                    "errors": validation_errors[seed],
                    "previousBodyMeanChars": round(actual_mean, 1),
                    "targetBodyMeanChars": plan["targetMeanChars"],
                    "instruction": (
                        "이전 출력 전체를 다시 쓴다. 각 detailMd를 해당 event의 detailLength.minChars "
                        "이상 detailLength.maxChars 이하로 직접 세고, 조정된 minimumSentences도 지킨다. "
                        "누락된 anchor는 그 event 본문에 명시하되 입력에 없는 수치나 고유명사는 만들지 않는다."
                    ),
                }
                for event in retry_profile["events"]:
                    maximum_sentences = max(
                        event["minimumSentences"],
                        int(event["detailLength"]["maxChars"]) // 45,
                    )
                    event["minimumSentences"] = minimum_sentences_for_repair_round(
                        base=event["minimumSentences"],
                        boost=boost,
                        round_number=repair_round + 1,
                        maximum=maximum_sentences,
                    )
                retry_profiles.append(retry_profile)
            if not retry_profiles:
                raise
            retry_context = {**context, "profiles": retry_profiles}
            replacements = _author_luna_profiles(
                context=retry_context,
                output_root=output_root,
                codex_path=codex_path,
                profile=profile,
                base_prompt=base_prompt,
                timeout_seconds=timeout_seconds,
                max_target_chars=max_target_chars,
                max_workers=max_workers,
                log_label=(
                    f"{shard_id}-{LUNA_AUTHORING_REVISION}"
                    f"-auto-repair-{repair_round + 1:02d}"
                ),
            )
            bundle = replace_luna_profiles(bundle, replacements)
    raise RuntimeError("unreachable")


def repair_luna_bundle(
    manifest_path: Path,
    shard_id: str,
    bundle_path: Path,
    invalid_seeds: list[str],
    *,
    codex_path: Path,
    profile: str,
    timeout_seconds: int = 3600,
    max_target_chars: int = 6000,
    max_workers: int = 3,
    sentence_boost: int = 2,
) -> dict[str, Any]:
    manifest_path = Path(manifest_path).resolve()
    output_root = manifest_path.parent
    context_path = prepare_context(manifest_path, shard_id)
    context = json.loads(context_path.read_text(encoding="utf-8"))
    selected = set(invalid_seeds)
    if not selected:
        raise ValueError("invalid_seeds must not be empty")
    retry_profiles = []
    for profile_context in context["profiles"]:
        if profile_context["profileSeed"] not in selected:
            continue
        boosted = copy.deepcopy(profile_context)
        boosted["retryDirective"] = (
            "이전 출력은 검증을 통과하지 못했다. 각 기록을 처음부터 다시 쓰고, 짧은 문장으로 "
            "문장 수만 채우지 말고 문장마다 구체적인 맥락과 행동을 담아 detailLength의 목표 글자 수를 지켜라."
        )
        for event in boosted["events"]:
            maximum_sentences = max(
                event["minimumSentences"],
                int(event["detailLength"]["maxChars"]) // 45,
            )
            event["minimumSentences"] = minimum_sentences_for_repair_round(
                base=event["minimumSentences"],
                boost=sentence_boost,
                round_number=1,
                maximum=maximum_sentences,
            )
        retry_profiles.append(boosted)
    if {item["profileSeed"] for item in retry_profiles} != selected:
        raise ValueError("invalid_seeds contains a profile outside the shard")
    retry_context = {**context, "profiles": retry_profiles}
    replacements = _author_luna_profiles(
        context=retry_context,
        output_root=output_root,
        codex_path=codex_path,
        profile=profile,
        base_prompt=Path(LUNA_PROMPT_PATH).read_text(encoding="utf-8"),
        timeout_seconds=timeout_seconds,
        max_target_chars=max_target_chars,
        max_workers=max_workers,
        log_label=f"{shard_id}-{LUNA_AUTHORING_REVISION}-repair",
    )
    existing = json.loads(Path(bundle_path).read_text(encoding="utf-8"))
    bundle = replace_luna_profiles(existing, replacements)
    _atomic_write_json(Path(bundle_path), bundle)
    return commit_bundle(manifest_path, shard_id, Path(bundle_path))


def prepare_context(
    manifest_path: Path,
    shard_id: str,
    output_path: Path | None = None,
    *,
    profile_seeds: list[str] | None = None,
) -> Path:
    manifest_path = Path(manifest_path).resolve()
    _, shard = _load_manifest_and_shard(manifest_path, shard_id)
    output_root = manifest_path.parent
    selected_seeds = list(profile_seeds) if profile_seeds is not None else list(shard["profiles"])
    if not set(selected_seeds).issubset(set(shard["profiles"])):
        raise ValueError("profile_seeds contains a profile outside the shard")
    full_payloads = [
        json.loads((output_root / "inputs" / f"{seed}.json").read_text(encoding="utf-8"))
        for seed in selected_seeds
    ]
    payloads = [
        {
            "profileSeed": payload["profileSeed"],
            "persona": payload["persona"],
            "targetRecordCount": payload["targetRecordCount"],
            "bodyLengthPlan": payload["bodyLengthPlan"],
            "events": [build_luna_event_context(event) for event in payload["events"]],
        }
        for payload in full_payloads
    ]
    existing = _load_existing_profiles(output_root, excluded_seeds=set(selected_seeds))
    existing_seeds = {_profile_seed(profile, "") for profile in existing}
    existing_repetitions = find_cross_profile_sentence_repetitions(
        existing,
        threshold=2,
        ignored_sentences_by_profile=_load_ignored_skeletons(output_root, existing_seeds),
    )
    context = {
        "schemaVersion": 1,
        "shardId": shard_id,
        "promptVersion": PROMPT_VERSION,
        "profiles": payloads,
        "outputBundleSchema": {
            "shardId": shard_id,
            "profiles": [
                {
                    "profileSeed": "must match input profileSeed",
                    "records": [
                        {
                            "eventId": "must match the input event at the same index",
                            "title": "short noun phrase",
                            "detailMd": "newly authored details only",
                        }
                    ],
                }
            ],
        },
        "sentencePolicy": {
            "minimumComparedChars": MIN_SENTENCE_CHARS,
            "sameProfileMaximumOccurrences": 1,
            "corpusMaximumProfileCount": 2,
            "forbiddenSentencesAlreadyUsedByTwoProfiles": [
                item["sentence"] for item in existing_repetitions
            ],
        },
    }
    output_path = output_path or output_root / "tasks" / f"{shard_id}.context.json"
    _atomic_write_json(output_path, context)
    return output_path


def _authored_profiles_from_bundle(bundle: dict[str, Any]) -> dict[str, dict[str, Any]]:
    profiles: dict[str, dict[str, Any]] = {}
    for item in bundle.get("profiles", []):
        seed = str(item.get("profileSeed", ""))
        if not seed or seed in profiles:
            raise ValueError("bundle contains a missing or duplicate profileSeed")
        profiles[seed] = item
    return profiles


def commit_bundle(
    manifest_path: Path,
    shard_id: str,
    bundle_path: Path,
    *,
    expected_seeds: set[str] | None = None,
    defer_cross_profile_diversity: bool = False,
) -> dict[str, Any]:
    manifest_path = Path(manifest_path).resolve()
    _, shard = _load_manifest_and_shard(manifest_path, shard_id)
    output_root = manifest_path.parent
    bundle = json.loads(Path(bundle_path).read_text(encoding="utf-8"))
    if bundle.get("shardId") != shard_id:
        raise ValueError("bundle shardId does not match the requested shard")
    authored_profiles = _authored_profiles_from_bundle(bundle)
    expected_seeds = set(shard["profiles"]) if expected_seeds is None else set(expected_seeds)
    if not expected_seeds.issubset(set(shard["profiles"])):
        raise ValueError("expected_seeds contains a profile outside the shard")
    if set(authored_profiles) != expected_seeds:
        missing = sorted(expected_seeds - set(authored_profiles))
        extra = sorted(set(authored_profiles) - expected_seeds)
        raise ValueError(f"bundle seed mismatch: missing={missing}, extra={extra}")

    payloads = {
        seed: json.loads((output_root / "inputs" / f"{seed}.json").read_text(encoding="utf-8"))
        for seed in expected_seeds
    }
    drafts = {
        seed: materialize_luna_draft(payloads[seed], authored_profiles[seed])
        for seed in expected_seeds
    }
    validations: dict[str, dict[str, Any]] = {}
    errors: dict[str, list[Any]] = defaultdict(list)
    for seed in expected_seeds:
        draft = drafts[seed]
        validation = validate_renderer_output(
            payloads[seed],
            draft,
            enforce_skeleton=True,
            body_min_length=body_min_length_for_prompt(PROMPT_VERSION),
        )
        validations[seed] = validation
        if not validation["valid"]:
            errors[seed].extend(validation["errors"])
        intra = find_intra_profile_sentence_repetitions(draft)
        if intra:
            errors[seed].append({"intraProfileSentenceRepetitions": intra})

    seed_categories = load_seed_categories(DEFAULT_SEEDS_PATH)
    assembled = {
        seed: assemble_profile(
            payloads[seed],
            drafts[seed],
            seed_categories,
            generator_model="gpt-5.6-luna",
            prompt_version=PROMPT_VERSION,
        )
        for seed in expected_seeds
        if seed not in errors
    }
    if assembled and not defer_cross_profile_diversity:
        existing = _load_existing_profiles(output_root, excluded_seeds=expected_seeds)
        compared_profiles = existing + list(assembled.values())
        compared_seeds = {_profile_seed(profile, "") for profile in compared_profiles}
        cross = find_cross_profile_sentence_repetitions(
            compared_profiles,
            threshold=3,
        )
        for issue in cross:
            candidate_owners = set(assembled).intersection(issue["profileSeeds"])
            for seed in candidate_owners:
                errors[seed].append({"crossProfileSentenceRepetition": issue})

    state_profiles = {}
    for seed in expected_seeds:
        if seed in errors:
            error = {
                "profileSeed": seed,
                "shardId": shard_id,
                "errorType": "LunaValidationError",
                "validationErrors": errors[seed],
                "failedAt": _utc_now(),
            }
            _atomic_write_json(output_root / "errors" / f"{seed}.json", error)
            state_profiles[seed] = {"status": "failed", "error": error}
            continue
        payload = payloads[seed]
        draft = drafts[seed]
        profile = assembled[seed]
        profile_path = output_root / "profiles" / payload["split"] / f"{seed}.json"
        _atomic_write_json(output_root / "drafts" / payload["split"] / f"{seed}.json", draft)
        _atomic_write_json(profile_path, profile)
        _atomic_write_json(
            output_root / "metadata" / f"{seed}.json",
            {
                "profileSeed": seed,
                "model": "gpt-5.6-luna",
                "promptVersion": PROMPT_VERSION,
                "generationMethod": "agent-profile-direct",
                "validation": {
                    **validations[seed],
                    "intraProfileSentenceRepetitions": [],
                    "crossProfileSentenceRepetitions": [],
                },
                "actualRecordCount": len(profile["records"]),
                "targetRecordCount": payload["targetRecordCount"],
                "bodyLengthPlan": payload["bodyLengthPlan"],
            },
        )
        state_profiles[seed] = {"status": "complete", "path": str(profile_path)}
    completed = sum(item["status"] == "complete" for item in state_profiles.values())
    failed = sum(item["status"] == "failed" for item in state_profiles.values())
    state = {
        "schemaVersion": 1,
        "shardId": shard_id,
        "device": "codex-agent-profile",
        "generator": "luna",
        "updatedAt": _utc_now(),
        "completed": completed,
        "failed": failed,
        "profiles": state_profiles,
    }
    _atomic_write_json(output_root / "states" / f"{shard_id}.json", state)
    if errors:
        raise ValueError(json.dumps({"validationErrors": errors}, ensure_ascii=False))
    return {"shardId": shard_id, "completed": completed, "failed": failed}


def audit_corpus(manifest_path: Path, *, checkpoint: int) -> dict[str, Any]:
    manifest_path = Path(manifest_path).resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    output_root = manifest_path.parent
    selected = {
        item["profileSeed"]
        for item in manifest["profiles"]
        if item["sequenceIndex"] <= checkpoint
    }
    profiles = _load_existing_profiles(output_root, excluded_seeds=set())
    profiles = [profile for profile in profiles if _profile_seed(profile, "") in selected]
    intra = {
        _profile_seed(profile, ""): find_intra_profile_sentence_repetitions(profile)
        for profile in profiles
        if find_intra_profile_sentence_repetitions(profile)
    }
    cross = find_cross_profile_sentence_repetitions(
        profiles,
        threshold=3,
        ignored_sentences_by_profile=_load_ignored_skeletons(
            output_root,
            {_profile_seed(profile, "") for profile in profiles},
        ),
    )
    return {
        "checkpoint": checkpoint,
        "profileCount": len(profiles),
        "valid": not intra and not cross,
        "intraProfileRepetitions": intra,
        "crossProfileRepetitions": cross,
    }


def select_pending_luna_shards(
    manifest: dict[str, Any],
    *,
    output_root: Path,
    checkpoint: int,
) -> list[dict[str, Any]]:
    profile_specs = {
        str(item["profileSeed"]): item for item in manifest.get("profiles", [])
    }
    prompt_version = str(manifest.get("promptVersion", ""))

    def profile_complete(seed: str) -> bool:
        spec = profile_specs.get(seed)
        if not spec:
            return False
        path = Path(output_root) / "profiles" / str(spec["split"]) / f"{seed}.json"
        try:
            profile = json.loads(path.read_text(encoding="utf-8"))
            meta = profile["datasetMeta"]
        except (OSError, json.JSONDecodeError, KeyError, TypeError):
            return False
        if meta.get("profileSeed") != seed or meta.get("promptVersion") != prompt_version:
            return False
        target_count = spec.get("targetRecordCount")
        return target_count is None or (
            meta.get("actualRecordCount") == target_count
            and len(profile.get("records", [])) == target_count
        )

    return [
        shard
        for shard in manifest.get("shards", [])
        if shard.get("generator") == "luna"
        and int(shard.get("endIndex", 0)) <= checkpoint
        and not all(profile_complete(str(seed)) for seed in shard.get("profiles", []))
    ]


def select_pending_luna_profile_seeds(
    manifest: dict[str, Any],
    shard: dict[str, Any],
    *,
    output_root: Path,
) -> list[str]:
    specs = {str(item["profileSeed"]): item for item in manifest.get("profiles", [])}
    prompt_version = str(manifest.get("promptVersion", ""))
    pending = []
    for seed_value in shard.get("profiles", []):
        seed = str(seed_value)
        spec = specs.get(seed)
        if spec is None:
            pending.append(seed)
            continue
        path = Path(output_root) / "profiles" / str(spec["split"]) / f"{seed}.json"
        try:
            profile = json.loads(path.read_text(encoding="utf-8"))
            meta = profile["datasetMeta"]
        except (OSError, json.JSONDecodeError, KeyError, TypeError):
            pending.append(seed)
            continue
        target_count = spec.get("targetRecordCount")
        complete = (
            meta.get("profileSeed") == seed
            and meta.get("promptVersion") == prompt_version
            and (
                target_count is None
                or (
                    meta.get("actualRecordCount") == target_count
                    and len(profile.get("records", [])) == target_count
                )
            )
        )
        if not complete:
            pending.append(seed)
    return pending


def run_luna_checkpoint(
    manifest_path: Path,
    *,
    checkpoint: int,
    codex_path: Path,
    profile: str = "synthetic-profile-generator",
    timeout_seconds: int = 3600,
    max_target_chars: int = 6000,
    max_workers: int = 3,
    max_shard_workers: int = 1,
    max_repair_rounds: int = 3,
    generate_shard: Any = None,
    emit: Any = None,
) -> dict[str, Any]:
    manifest_path = Path(manifest_path).resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    eligible = [
        shard
        for shard in manifest.get("shards", [])
        if shard.get("generator") == "luna"
        and int(shard.get("endIndex", 0)) <= checkpoint
    ]
    pending = select_pending_luna_shards(
        manifest,
        output_root=manifest_path.parent,
        checkpoint=checkpoint,
    )
    generator = generate_shard or generate_with_luna_profile
    def run_one(shard: dict[str, Any]) -> tuple[str, int, dict[str, Any] | None, Exception | None]:
        shard_id = str(shard["shardId"])
        pending_seeds = select_pending_luna_profile_seeds(
            manifest,
            shard,
            output_root=manifest_path.parent,
        )
        try:
            result = generator(
                manifest_path,
                shard_id,
                codex_path=codex_path,
                profile=profile,
                timeout_seconds=timeout_seconds,
                max_target_chars=max_target_chars,
                max_workers=max_workers,
                max_repair_rounds=max_repair_rounds,
                profile_seeds=pending_seeds,
            )
            return shard_id, len(pending_seeds), result, None
        except Exception as exc:  # keep the overnight queue moving after a local shard failure
            return shard_id, len(pending_seeds), None, exc

    failures: dict[str, dict[str, str]] = {}
    completed = 0
    completed_profiles = 0
    if max_shard_workers <= 1:
        outcomes = (run_one(shard) for shard in pending)
        executor = None
    else:
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=max_shard_workers)
        futures = [executor.submit(run_one, shard) for shard in pending]
        outcomes = (future.result() for future in concurrent.futures.as_completed(futures))
    try:
        for shard_id, pending_count, result, error in outcomes:
            if error is None and result is not None:
                completed += 1
                completed_profiles += int(result.get("completed", pending_count))
                if emit:
                    emit({"event": "shard_complete", "shardId": shard_id, "result": result})
                continue
            assert error is not None
            failures[shard_id] = {"type": type(error).__name__, "message": str(error)}
            if emit:
                emit({"event": "shard_failed", "shardId": shard_id, "error": failures[shard_id]})
    finally:
        if executor is not None:
            executor.shutdown(wait=True)
    return {
        "checkpoint": checkpoint,
        "plannedShards": len(eligible),
        "pendingShards": len(pending),
        "skippedShards": len(eligible) - len(pending),
        "completedShards": completed,
        "completedProfiles": completed_profiles,
        "failedShards": len(failures),
        "failures": failures,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("manifest", type=Path)
    prepare.add_argument("shard_id")
    prepare.add_argument("--output", type=Path)
    commit = subparsers.add_parser("commit")
    commit.add_argument("manifest", type=Path)
    commit.add_argument("shard_id")
    commit.add_argument("bundle", type=Path)
    audit = subparsers.add_parser("audit")
    audit.add_argument("manifest", type=Path)
    audit.add_argument("--checkpoint", type=int, required=True)
    generate = subparsers.add_parser("generate")
    generate.add_argument("manifest", type=Path)
    generate.add_argument("shard_id")
    generate.add_argument("--codex", type=Path, required=True)
    generate.add_argument("--profile", default="synthetic-profile-generator")
    generate.add_argument("--timeout", type=int, default=3600)
    generate.add_argument("--max-target-chars", type=int, default=6000)
    generate.add_argument("--max-workers", type=int, default=3)
    generate.add_argument("--repair-rounds", type=int, default=3)
    run_checkpoint = subparsers.add_parser("run-checkpoint")
    run_checkpoint.add_argument("manifest", type=Path)
    run_checkpoint.add_argument("--checkpoint", type=int, required=True)
    run_checkpoint.add_argument("--codex", type=Path, required=True)
    run_checkpoint.add_argument("--profile", default="synthetic-profile-generator")
    run_checkpoint.add_argument("--timeout", type=int, default=3600)
    run_checkpoint.add_argument("--max-target-chars", type=int, default=6000)
    run_checkpoint.add_argument("--max-workers", type=int, default=3)
    run_checkpoint.add_argument("--max-shard-workers", type=int, default=1)
    run_checkpoint.add_argument("--repair-rounds", type=int, default=3)
    repair = subparsers.add_parser("repair")
    repair.add_argument("manifest", type=Path)
    repair.add_argument("shard_id")
    repair.add_argument("bundle", type=Path)
    repair.add_argument("--seeds", required=True)
    repair.add_argument("--codex", type=Path, required=True)
    repair.add_argument("--profile", default="synthetic-profile-generator")
    repair.add_argument("--timeout", type=int, default=3600)
    repair.add_argument("--max-target-chars", type=int, default=6000)
    repair.add_argument("--max-workers", type=int, default=3)
    repair.add_argument("--sentence-boost", type=int, default=2)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "prepare":
        path = prepare_context(args.manifest, args.shard_id, args.output)
        print(json.dumps({"context": str(path)}, ensure_ascii=False))
        return
    if args.command == "commit":
        print(json.dumps(commit_bundle(args.manifest, args.shard_id, args.bundle), ensure_ascii=False))
        return
    if args.command == "generate":
        print(
            json.dumps(
                generate_with_luna_profile(
                    args.manifest,
                    args.shard_id,
                    codex_path=args.codex,
                    profile=args.profile,
                    timeout_seconds=args.timeout,
                    max_target_chars=args.max_target_chars,
                    max_workers=args.max_workers,
                    max_repair_rounds=args.repair_rounds,
                ),
                ensure_ascii=False,
            )
        )
        return
    if args.command == "run-checkpoint":
        emit = lambda payload: print(json.dumps(payload, ensure_ascii=False), flush=True)
        summary = run_luna_checkpoint(
            args.manifest,
            checkpoint=args.checkpoint,
            codex_path=args.codex,
            profile=args.profile,
            timeout_seconds=args.timeout,
            max_target_chars=args.max_target_chars,
            max_workers=args.max_workers,
            max_shard_workers=args.max_shard_workers,
            max_repair_rounds=args.repair_rounds,
            emit=emit,
        )
        print(json.dumps(summary, ensure_ascii=False), flush=True)
        raise SystemExit(0 if summary["failedShards"] == 0 else 1)
    if args.command == "repair":
        print(
            json.dumps(
                repair_luna_bundle(
                    args.manifest,
                    args.shard_id,
                    args.bundle,
                    [seed for seed in args.seeds.split(",") if seed],
                    codex_path=args.codex,
                    profile=args.profile,
                    timeout_seconds=args.timeout,
                    max_target_chars=args.max_target_chars,
                    max_workers=args.max_workers,
                    sentence_boost=args.sentence_boost,
                ),
                ensure_ascii=False,
            )
        )
        return
    print(json.dumps(audit_corpus(args.manifest, checkpoint=args.checkpoint), ensure_ascii=False))


if __name__ == "__main__":
    main()
