"""채용 추천 파일럿의 Luna teacher prompt와 응답 수집을 조립한다."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
from typing import Any

from match_pilot_labels import build_teacher_prompt, validate_teacher_response


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                raise ValueError(f"{path}:{line_number}: blank line")
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_number}: expected object")
            rows.append(row)
    return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def prepare_teacher_batches(
    *,
    profiles_dir: Path,
    profiles_path: Path,
    jobs_path: Path,
    candidates_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    """프로필마다 정확히 한 개의 Luna prompt와 응답 파일 계약을 만든다."""
    profile_contracts = {row["profileId"]: row for row in _load_jsonl(profiles_path)}
    jobs = {row["jobId"]: row for row in _load_jsonl(jobs_path)}
    candidates_by_profile: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in _load_jsonl(candidates_path):
        candidates_by_profile[row["profileId"]].append(row)

    source_profiles: dict[str, dict[str, Any]] = {}
    for path in sorted(profiles_dir.glob("*.json")):
        profile = json.loads(path.read_text(encoding="utf-8"))
        profile_id = profile.get("syntheticProfileId")
        if profile_id in source_profiles:
            raise ValueError(f"duplicate source profile: {profile_id}")
        source_profiles[profile_id] = profile
    if set(source_profiles) != set(profile_contracts):
        raise ValueError("source profiles and profiles.jsonl IDs differ")

    prompt_dir = output_dir / "prompts"
    prompt_dir.mkdir(parents=True, exist_ok=True)
    batches: list[dict[str, Any]] = []
    for number, profile_id in enumerate(sorted(profile_contracts), 1):
        profile_contract = profile_contracts[profile_id]
        candidates = sorted(
            candidates_by_profile.get(profile_id, []), key=lambda row: row["jobId"]
        )
        if len(candidates) != 20:
            raise ValueError(f"profile {profile_id} needs exactly 20 candidates")
        job_ids = [row["jobId"] for row in candidates]
        if any(
            row["split"] != profile_contract["split"]
            or row["jobId"] not in jobs
            or jobs[row["jobId"]]["split"] != profile_contract["split"]
            for row in candidates
        ):
            raise ValueError(f"profile {profile_id} candidate split or job differs")
        prompt_file = f"batch-{number:03d}.md"
        response_file = f"batch-{number:03d}.json"
        prompt = build_teacher_prompt(
            source_profiles[profile_id],
            [{"jobId": job_id, "text": jobs[job_id]["text"]} for job_id in job_ids],
        )
        (prompt_dir / prompt_file).write_text(prompt, encoding="utf-8")
        batches.append(
            {
                "profileId": profile_id,
                "split": profile_contract["split"],
                "jobIds": job_ids,
                "promptFile": prompt_file,
                "responseFile": response_file,
                "generatorModel": "gpt-5.6-luna",
            }
        )
    manifest = {
        "schemaVersion": "match-pilot-teacher-batches-v1",
        "batchCount": len(batches),
        "targetCallsPerProfile": 1,
        "automaticRetries": 0,
        "batches": batches,
    }
    (output_dir / "batch-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def collect_teacher_labels(
    *, batch_manifest_path: Path, responses_dir: Path, output_path: Path
) -> dict[str, int]:
    """모든 Luna 응답을 엄격히 검증한 뒤 harness label JSONL로 합친다."""
    manifest = json.loads(batch_manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != "match-pilot-teacher-batches-v1":
        raise ValueError("unexpected teacher batch manifest schema")
    labels: list[dict[str, Any]] = []
    seen_profiles: set[str] = set()
    for batch in manifest.get("batches", []):
        profile_id = batch["profileId"]
        if profile_id in seen_profiles:
            raise ValueError(f"duplicate teacher batch profile: {profile_id}")
        seen_profiles.add(profile_id)
        response_path = responses_dir / batch["responseFile"]
        response = response_path.read_text(encoding="utf-8")
        labels.extend(
            validate_teacher_response(
                response,
                profile_id=profile_id,
                split=batch["split"],
                expected_job_ids=batch["jobIds"],
            )
        )
    if len(seen_profiles) != manifest.get("batchCount"):
        raise ValueError("teacher batch count differs from manifest")
    _write_jsonl(output_path, labels)
    coverage = teacher_label_coverage(labels)
    (output_path.parent / "label-coverage.json").write_text(
        json.dumps(coverage, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return {
        "labels": len(labels),
        "profiles": len(seen_profiles),
        "evalMetricsReady": coverage["evalMetricsReady"],
    }


def teacher_label_coverage(labels: list[dict[str, Any]]) -> dict[str, Any]:
    """MRR/AUC가 모든 valid/test 프로필에서 정의될 수 있는지 기록한다."""
    label_counts = Counter(int(row["teacherLabel"]) for row in labels)
    profiles_by_split: dict[str, set[str]] = defaultdict(set)
    profiles_with_class_three: dict[str, set[str]] = defaultdict(set)
    for row in labels:
        split = row["split"]
        profile_id = row["profileId"]
        profiles_by_split[split].add(profile_id)
        if row["teacherLabel"] == 3:
            profiles_with_class_three[split].add(profile_id)
    profiles_without_class_three = {
        split: sorted(profiles_by_split[split] - profiles_with_class_three[split])
        for split in ("valid", "test")
    }
    eval_metrics_ready = all(
        profiles_by_split[split] and not profiles_without_class_three[split]
        for split in ("valid", "test")
    )
    return {
        "schemaVersion": "match-pilot-label-coverage-v1",
        "labelCounts": {str(label): label_counts.get(label, 0) for label in range(4)},
        "profilesWithoutClass3": profiles_without_class_three,
        "evalMetricsReady": bool(eval_metrics_ready),
        "undefinedWhenFalse": ["mrrAt10", "auc"],
    }


def validate_pilot_artifacts(
    *,
    profiles: list[dict[str, Any]],
    jobs: list[dict[str, Any]],
    labels: list[dict[str, Any]],
    candidate_manifest: list[dict[str, Any]],
    candidate_scores: list[dict[str, Any]],
    expected_profiles: int = 30,
    expected_pairs: int = 600,
) -> dict[str, Any]:
    """학습 후 데이터·두 모델 점수가 동일 후보군을 완전히 덮는지 확인한다."""
    from match_pilot_model import validate_candidate_manifest
    from ranking_evaluation import validate_dataset

    if len(profiles) != expected_profiles or len(labels) != expected_pairs:
        raise ValueError(
            f"pilot counts differ: profiles={len(profiles)}, pairs={len(labels)}"
        )
    validate_candidate_manifest(candidate_manifest, labels)
    validate_dataset(profiles, jobs, labels, candidate_scores)
    score_rows_by_model = Counter(row["model"] for row in candidate_scores)
    expected_models = {"frozen-e5-cosine-v1", "match-pilot-mlp-v1"}
    if set(score_rows_by_model) != expected_models or any(
        score_rows_by_model[model] != expected_pairs for model in expected_models
    ):
        raise ValueError(f"candidate score coverage differs: {dict(score_rows_by_model)}")
    return {
        "profiles": len(profiles),
        "jobs": len(jobs),
        "pairs": len(labels),
        "scoreRowsByModel": dict(sorted(score_rows_by_model.items())),
    }


def train_and_evaluate(
    *,
    jth_pairs_path: Path,
    profiles_path: Path,
    jobs_path: Path,
    labels_path: Path,
    candidate_manifest_path: Path,
    output_dir: Path,
    require_cuda: bool,
    batch_size: int = 64,
    pretrain_epochs: int = 3,
    fine_tune_epochs: int = 8,
    hidden_dimension: int = 256,
    learning_rate: float = 1e-3,
    seed: int = 42,
    expected_profiles: int = 30,
    expected_pairs: int = 600,
) -> dict[str, Any]:
    """동결 E5 학습부터 공통 하네스 평가까지 한 명령으로 실행한다."""
    from evaluate_retrieval import run_evaluation, write_results
    from match_pilot_model import build_parser as build_model_parser
    from match_pilot_model import run as run_model

    model_arguments = [
        "--jth-pairs", str(jth_pairs_path),
        "--profiles", str(profiles_path),
        "--jobs", str(jobs_path),
        "--labels", str(labels_path),
        "--candidate-manifest", str(candidate_manifest_path),
        "--output", str(output_dir / "model"),
        "--batch-size", str(batch_size),
        "--pretrain-epochs", str(pretrain_epochs),
        "--fine-tune-epochs", str(fine_tune_epochs),
        "--hidden-dimension", str(hidden_dimension),
        "--learning-rate", str(learning_rate),
        "--seed", str(seed),
    ]
    if require_cuda:
        model_arguments.append("--require-cuda")
    model_result = run_model(build_model_parser().parse_args(model_arguments))
    candidate_scores_path = model_result["candidateScores"]
    validation = validate_pilot_artifacts(
        profiles=_load_jsonl(profiles_path),
        jobs=_load_jsonl(jobs_path),
        labels=_load_jsonl(labels_path),
        candidate_manifest=_load_jsonl(candidate_manifest_path),
        candidate_scores=_load_jsonl(candidate_scores_path),
        expected_profiles=expected_profiles,
        expected_pairs=expected_pairs,
    )
    evaluation = run_evaluation(
        profiles_path=profiles_path,
        jobs_path=jobs_path,
        labels_path=labels_path,
        candidate_scores_path=candidate_scores_path,
    )
    evaluation_dir = output_dir / "evaluation"
    write_results(evaluation, evaluation_dir)
    return {
        "checkpoint": str(model_result["checkpoint"]),
        "candidateScores": str(candidate_scores_path),
        "metrics": str(evaluation_dir / "metrics.json"),
        "summary": str(evaluation_dir / "summary.md"),
        "validation": validation,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare-teacher")
    prepare.add_argument("--profile-json", type=Path, required=True)
    prepare.add_argument("--profiles", type=Path, required=True)
    prepare.add_argument("--jobs", type=Path, required=True)
    prepare.add_argument("--candidates", type=Path, required=True)
    prepare.add_argument("--output", type=Path, required=True)
    collect = commands.add_parser("collect-labels")
    collect.add_argument("--manifest", type=Path, required=True)
    collect.add_argument("--responses", type=Path, required=True)
    collect.add_argument("--output", type=Path, required=True)
    train = commands.add_parser("train-evaluate")
    train.add_argument("--jth-pairs", type=Path, required=True)
    train.add_argument("--profiles", type=Path, required=True)
    train.add_argument("--jobs", type=Path, required=True)
    train.add_argument("--labels", type=Path, required=True)
    train.add_argument("--candidate-manifest", type=Path, required=True)
    train.add_argument("--output", type=Path, required=True)
    train.add_argument("--require-cuda", action="store_true")
    train.add_argument("--batch-size", type=int, default=64)
    train.add_argument("--pretrain-epochs", type=int, default=3)
    train.add_argument("--fine-tune-epochs", type=int, default=8)
    train.add_argument("--hidden-dimension", type=int, default=256)
    train.add_argument("--learning-rate", type=float, default=1e-3)
    train.add_argument("--seed", type=int, default=42)
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    if arguments.command == "prepare-teacher":
        result = prepare_teacher_batches(
            profiles_dir=arguments.profile_json,
            profiles_path=arguments.profiles,
            jobs_path=arguments.jobs,
            candidates_path=arguments.candidates,
            output_dir=arguments.output,
        )
        output = {"batchCount": result["batchCount"]}
    elif arguments.command == "collect-labels":
        output = collect_teacher_labels(
            batch_manifest_path=arguments.manifest,
            responses_dir=arguments.responses,
            output_path=arguments.output,
        )
    else:
        output = train_and_evaluate(
            jth_pairs_path=arguments.jth_pairs,
            profiles_path=arguments.profiles,
            jobs_path=arguments.jobs,
            labels_path=arguments.labels,
            candidate_manifest_path=arguments.candidate_manifest,
            output_dir=arguments.output,
            require_cuda=arguments.require_cuda,
            batch_size=arguments.batch_size,
            pretrain_epochs=arguments.pretrain_epochs,
            fine_tune_epochs=arguments.fine_tune_epochs,
            hidden_dimension=arguments.hidden_dimension,
            learning_rate=arguments.learning_rate,
            seed=arguments.seed,
        )
    print(json.dumps(output, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
