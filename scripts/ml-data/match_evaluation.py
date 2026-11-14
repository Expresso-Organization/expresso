"""적합도 모델 평가의 순수 함수. torch 없이 돈다.

설계서 9.2가 정한 지표 중 파일럿이 산출하지 않은 것(ROC · AUC, 5점 기준 공고쌍
순서 일치율, 스크리닝 Recall@K, 모델 B 기록 NDCG@10)과 규칙 baseline 입력,
설계서 4.4의 산출물 버전 · 메타데이터를 만든다.
"""

from __future__ import annotations

from collections import Counter, defaultdict
import math
from pathlib import Path
import re
from typing import Any, Iterable, Mapping, Sequence

from llm_suitability_rubric import COVERAGE_POINTS


# 설계서 9.2: ROC 양성 · MAP@10 · MRR@10 · Recall@k의 적합 기준이 모두 60점 이상이다.
RELEVANCE_THRESHOLD = 60.0
# 설계서 9.2 평가 조건: 공고쌍은 같은 프로필 안에서 정답 차가 5점 이상인 쌍이다.
PAIRWISE_MIN_GAP = 5.0
# 설계서 9.2: 모델 A · B의 주요 지표는 NDCG@10이다.
NDCG_K = 10


def _dcg(relevances: Sequence[float], k: int) -> float:
    return sum(value / math.log2(index + 2) for index, value in enumerate(relevances[:k]))


def _mean(values: Iterable[float]) -> float | None:
    collected = list(values)
    return sum(collected) / len(collected) if collected else None


def roc_curve(
    targets: Sequence[float], scores: Sequence[float], *, threshold: float = RELEVANCE_THRESHOLD
) -> dict[str, Any]:
    """정답이 threshold 이상인 쌍을 양성으로 두고, 점수 임계값을 내리며 ROC를 그린다.

    같은 점수는 한 점으로 묶는다. 묶음 안에서 양성과 음성이 함께 넘어가므로 그 구간은
    대각선이 되고, 사다리꼴 넓이가 동점을 0.5로 세는 AUC와 같아진다.
    """
    if len(targets) != len(scores):
        raise ValueError("targets and scores must have equal length")
    positives = sum(float(value) >= threshold for value in targets)
    negatives = len(targets) - positives
    result: dict[str, Any] = {
        "threshold": threshold,
        "positives": positives,
        "negatives": negatives,
        "auc": None,
        "points": [],
    }
    if positives == 0 or negatives == 0:
        return result
    by_score: dict[float, list[int]] = defaultdict(lambda: [0, 0])
    for target, score in zip(targets, scores):
        if not math.isfinite(float(score)):
            raise ValueError("scores must be finite")
        by_score[float(score)][0 if float(target) >= threshold else 1] += 1
    true_positive = false_positive = 0
    points = [{"scoreThreshold": None, "fpr": 0.0, "tpr": 0.0}]
    area = 0.0
    for score in sorted(by_score, reverse=True):
        positive_count, negative_count = by_score[score]
        previous_fpr = false_positive / negatives
        previous_tpr = true_positive / positives
        true_positive += positive_count
        false_positive += negative_count
        fpr = false_positive / negatives
        tpr = true_positive / positives
        area += (fpr - previous_fpr) * (tpr + previous_tpr) / 2
        points.append({"scoreThreshold": score, "fpr": fpr, "tpr": tpr})
    result["auc"] = area
    result["points"] = points
    return result


def pairwise_accuracy(
    rows: Sequence[Mapping[str, Any]], *, min_gap: float = PAIRWISE_MIN_GAP
) -> dict[str, Any]:
    """같은 프로필 안에서 정답 차가 min_gap 이상인 공고쌍의 순서가 맞는 비율.

    예측이 같은 쌍은 0.5로 센다(파일럿 `ranking_metrics`와 같다).
    """
    if min_gap <= 0:
        raise ValueError("min_gap must be positive")
    grouped: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["profileId"])].append((float(row["target"]), float(row["prediction"])))
    credit = 0.0
    total = 0
    for values in grouped.values():
        for left in range(len(values)):
            for right in range(left + 1, len(values)):
                target_delta = values[left][0] - values[right][0]
                if abs(target_delta) < min_gap:
                    continue
                prediction_delta = values[left][1] - values[right][1]
                total += 1
                credit += 1.0 if target_delta * prediction_delta > 0 else 0.5 if prediction_delta == 0 else 0.0
    return {"minGap": min_gap, "accuracy": credit / total if total else None, "comparisons": total}


def profile_ndcg(rows: Sequence[Mapping[str, Any]], *, k: int = NDCG_K) -> dict[str, float]:
    """프로필별 NDCG@k. 부트스트랩이 프로필 단위로 표본을 뽑으므로 평균 전 값을 낸다.

    동점은 입력 순서대로 둔다(파일럿 `ranking_metrics`와 같다).
    """
    grouped: dict[str, list[tuple[float, float, int]]] = defaultdict(list)
    for index, row in enumerate(rows):
        grouped[str(row["profileId"])].append((float(row["target"]), float(row["prediction"]), index))
    result: dict[str, float] = {}
    for profile_id, values in grouped.items():
        ranked = sorted(values, key=lambda item: (-item[1], item[2]))
        ideal = _dcg(sorted((item[0] for item in values), reverse=True), k)
        result[profile_id] = _dcg([item[0] for item in ranked], k) / ideal if ideal else 1.0
    return result


def profile_mae(rows: Sequence[Mapping[str, Any]]) -> dict[str, float]:
    grouped: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        grouped[str(row["profileId"])].append(abs(float(row["target"]) - float(row["prediction"])))
    return {profile_id: sum(values) / len(values) for profile_id, values in grouped.items()}


def screening_recall_curve(
    scores_by_profile: Mapping[str, Sequence[tuple[str, float]]],
    relevant_by_profile: Mapping[str, set[str]],
) -> dict[str, Any]:
    """평가 공고 전체 풀을 채점한 순위에서 적합 공고가 상위 K 안에 드는 비율을 K마다 낸다.

    적합 공고가 하나도 없는 프로필은 분모가 0이라 뺀다. 풀의 공고 대부분은 그 프로필에
    라벨이 없고 부적합으로 센다. 그래서 이 값은 실제보다 낮은 쪽으로 치우친다.
    `kForFullRecall`은 모든 프로필의 적합 공고가 다 들어오는 가장 작은 K다.
    """
    pool_sizes = {len(rows) for rows in scores_by_profile.values()}
    if len(pool_sizes) > 1:
        raise ValueError("every profile must be scored against the same pool")
    pool_size = pool_sizes.pop() if pool_sizes else 0
    ranks: list[list[int]] = []
    for profile_id, rows in sorted(scores_by_profile.items()):
        relevant = relevant_by_profile.get(profile_id, set())
        if not relevant:
            continue
        ranked = sorted(rows, key=lambda item: (-float(item[1]), str(item[0])))
        positions = [index + 1 for index, (job_id, _) in enumerate(ranked) if job_id in relevant]
        if len(positions) != len(relevant):
            raise ValueError(f"relevant jobs missing from pool: {profile_id}")
        ranks.append(positions)
    curve: list[float] = []
    for k in range(1, pool_size + 1):
        curve.append(sum(sum(rank <= k for rank in positions) / len(positions) for positions in ranks) / len(ranks) if ranks else 0.0)
    return {
        "poolSize": pool_size,
        "profiles": len(scores_by_profile),
        "profilesWithRelevant": len(ranks),
        "relevantPairs": sum(len(positions) for positions in ranks),
        "recallAtK": curve,
        "kForFullRecall": max((max(positions) for positions in ranks), default=None),
    }


def record_relevance(label: Mapping[str, Any], record_ids: Sequence[str]) -> dict[str, float]:
    """설계서 9.2 모델 B 정답: 교사가 그 기록을 연결한 요건 충족 점수의 최댓값, 없으면 0."""
    relevance = {str(record_id): 0.0 for record_id in record_ids}
    for assessment in label.get("requirementAssessments", []):
        points = float(COVERAGE_POINTS[str(assessment["coverage"])])
        for record_id in assessment.get("evidenceRecordIds", []):
            key = str(record_id)
            if key not in relevance:
                raise ValueError(f"evidence record is not in the profile: {key}")
            relevance[key] = max(relevance[key], points)
    return relevance


def record_ndcg(groups: Sequence[Mapping[str, Any]], *, k: int = NDCG_K) -> dict[str, Any]:
    """(공고, 프로필) 쌍마다 기록 순위의 NDCG@k를 내고 평균한다.

    groups의 각 항목은 `relevance`와 `scores`(둘 다 기록 ID → 값)를 가진다. 동점은 기록
    ID 순서로 정한다. 정답이 모두 0인 쌍은 어떤 순서도 같은 값이라 빼고 수를 남긴다.
    """
    values: list[float] = []
    skipped = 0
    for group in groups:
        relevance = {str(key): float(value) for key, value in group["relevance"].items()}
        scores = {str(key): float(value) for key, value in group["scores"].items()}
        if relevance.keys() != scores.keys():
            raise ValueError("relevance and scores must cover the same records")
        ideal = _dcg(sorted(relevance.values(), reverse=True), k)
        if ideal == 0:
            skipped += 1
            continue
        ranked = sorted(scores, key=lambda record_id: (-scores[record_id], record_id))
        values.append(_dcg([relevance[record_id] for record_id in ranked], k) / ideal)
    return {"k": k, "ndcg": _mean(values), "pairs": len(values), "skippedAllZero": skipped}


_SPLIT = re.compile(r"\s*;\s*")

# 규칙 baseline 입력. JTH 공고는 서비스처럼 AI가 분해한 요건이 없고 구조화 필드가 있다.
# 교사가 요건으로 읽은 필드를 서비스 계약(`JobRequirements`)의 축에 옮긴다. 축은 묶음일 뿐
# 점수는 전체 요건 중 닿은 비율이므로(`match-score.ts`), 어느 축에 두는지는 점수를 바꾸지 않는다.
# 근무 조건(계약 형태 · 원격 · 지역 · 급여)은 루브릭이 평가에서 빼므로 넣지 않는다.
_TECHNOLOGY_FIELDS = ("skills", "llm_hard_skills", "llm_programming_languages", "llm_tools_technologies")
_ROLE_FIELDS = ("llm_soft_skills", "llm_certifications", "llm_required_languages_spoken", "llm_required_lowest_diploma")
_YEARS_FIELD = "llm_required_years_of_work_experience"


def _pieces(value: Any) -> list[str]:
    return [piece for piece in _SPLIT.split(str(value or "").strip()) if piece]


def _unique(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = value.casefold()
        if key not in seen:
            seen.add(key)
            result.append(value)
    return result


def rule_requirements(job: Mapping[str, Any]) -> dict[str, list[str]]:
    """JTH 공고 필드를 `calculateExplainableMatch()`의 요건으로 옮긴다.

    필요 연차는 「N years」로 쓴다. `match-score.ts`의 `keywordMet`이 이 형식을 글이 아니라
    경력 연차로 판정한다. 소수 연차는 올린다 — 경력 연차가 정수이므로 3.5년 요구를 3년이
    채우지 못한다.
    """
    service = job.get("requirements")
    if isinstance(service, dict):
        # 수집 공고는 서비스 요건 추출기가 분해한 값을 그대로 쓴다(job_postings.requirements와 같은 값).
        return {axis: [str(item) for item in service.get(axis) or []] for axis in ("technologies", "impacts", "roles", "conditions")}
    fields = job.get("fields") or {}
    roles = [piece for field in _ROLE_FIELDS for piece in _pieces(fields.get(field))]
    years = str(fields.get(_YEARS_FIELD, "")).strip()
    try:
        wanted = float(years)
    except ValueError:
        wanted = 0.0
    if math.isfinite(wanted) and wanted > 0:
        roles.append(f"{math.ceil(wanted)} years")
    return {
        "technologies": _unique(piece for field in _TECHNOLOGY_FIELDS for piece in _pieces(fields.get(field))),
        "impacts": [],
        "roles": _unique(roles),
        "conditions": [],
    }


def rule_requirement_labels(job: Mapping[str, Any]) -> list[str]:
    """`rankMaterials()`에 넘길 요건 문구. 서비스는 분해한 요건의 문구를 그대로 넘긴다."""
    if isinstance(job.get("requirementLabels"), list):
        return [str(label) for label in job["requirementLabels"]]
    requirements = rule_requirements(job)
    return [*requirements["technologies"], *requirements["roles"]]


def next_version(root: Path, kind: str, dataset: str) -> str:
    """설계서 4.4 버전 형식 `{kind}-{dataset}-{일련번호}`의 다음 번호."""
    if kind not in {"bi", "cross"}:
        raise ValueError("kind must be bi or cross")
    pattern = re.compile(rf"^{kind}-{re.escape(dataset)}-(\d{{3}})$")
    numbers = [int(match.group(1)) for path in root.glob(f"{kind}-{dataset}-*") if (match := pattern.match(path.name))] if root.exists() else []
    return f"{kind}-{dataset}-{max(numbers, default=0) + 1:03d}"


def build_metadata(
    *,
    version: str,
    dataset_version: str,
    encoder: str,
    labels: Sequence[Mapping[str, Any]],
    hashes: Mapping[str, str],
    trained_at: str,
    code_commit: str | None,
    extra: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """설계서 4.4 `metadata.json`: 데이터세트 버전 · 인코더 · 루브릭 · 교사 · 학습 시각 · 코드 커밋."""
    rubric_versions = sorted({str(row.get("rubricVersion")) for row in labels})
    return {
        "version": version,
        "datasetVersion": dataset_version,
        "encoder": encoder,
        "rubricVersion": rubric_versions[0] if len(rubric_versions) == 1 else rubric_versions,
        "teacherModels": dict(sorted(Counter(str(row.get("labelSource")) for row in labels).items())),
        "trainedAt": trained_at,
        "codeCommit": code_commit,
        "dataHashes": dict(sorted(hashes.items())),
        **(extra or {}),
    }
