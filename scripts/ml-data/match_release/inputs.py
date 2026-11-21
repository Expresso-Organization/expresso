"""추론 입력·출력과 API 재정렬에 공통으로 쓰는 형식."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import llm_suitability_train as pilot
from match_api_scorer import ApiScorer, PROVIDERS, build_body, parse_answers, urllib_transport

KIND = {"must": 0, "responsibility": 1, "preferred": 2}


def profile_text(profile):
    text = pilot.render_profile(profile)
    return text.split("\n\n", 1)[-1] if profile.get("experienceYears") is None else text


def profile_queries(profile, records, tokenizer=None, *, passages=None):
    from passages import record_passages

    chunks = passages if passages is not None else record_passages(records, tokenizer)
    return [profile_text({**profile, "records": records}), *map(pilot.render_record, records), *[p["text"] for p in chunks]]


def job_passages(job):
    return [pilot.render_job(job), *[q["criterion"] for q in job["requirementsFixed"]]]


def usable_records(profile):
    records = profile.get("records")
    if not isinstance(records, list) or any(
        not isinstance(r, dict) or not isinstance(r.get("recordId"), str) or not r["recordId"]
        for r in records
    ):
        raise ValueError("기록 목록 및 문자열 recordId가 필요함")
    if len({r["recordId"] for r in records}) != len(records):
        raise ValueError("기록 ID 중복")
    return [r for r in records if (r.get("title") or "").strip() or (r.get("bodyMd") or "").strip()]


def detail(q, row, records, k, threshold):
    order = sorted(range(len(records)), key=lambda i: (-float(row[i]), records[i]["recordId"]))[:k]
    supported = [records[i]["recordId"] for i in order if float(row[i]) >= threshold]
    return {
        "requirementId": q["id"],
        "hasEvidence": bool(supported),
        "evidenceRecordIds": supported,
        "records": [{"recordId": records[i]["recordId"], "score": float(row[i])} for i in order],
    }


def validate_job(job):
    if (
        not job.get("jobId")
        or not job.get("fields", {}).get("title")
        or not job.get("fields", {}).get("description")
    ):
        raise ValueError("공고 ID·제목·원문이 필요함")
    qs = job.get("requirementsFixed") or []
    if (
        not qs
        or len({q["id"] for q in qs}) != len(qs)
        or any(
            not q.get("id")
            or not q.get("criterion", "").strip()
            or q["kind"] not in ("must", "preferred", "responsibility")
            for q in qs
        )
    ):
        raise ValueError(f"{job['jobId']}: 고정 요건 ID·종류·문구를 확인할 것")


def interactive_scorer(cache):
    """사용자 요청에서 공급자 오류가 나면 즉시 로컬 순위를 제공할 수 있도록 한다."""
    provider = PROVIDERS["decisions"]

    def transport(*args):
        status, headers, body = urllib_transport(*args)
        if status != 200:
            raise OSError(f"Decisions HTTP {status}")
        return status, headers, body

    return ApiScorer(
        provider, cache, api_key=os.environ.get(provider.key_env), transport=transport, timeout=12
    )


def rerank_or_local(profile, jobs, result, scorer):
    if not result["jobs"]:
        return result
    try:
        return {**rerank(profile, jobs, result, scorer), "rankingSource": "decisions"}
    except (OSError, RuntimeError, ValueError, KeyError, TypeError):
        return {**result, "rankingSource": "local", "rerankStatus": "unavailable"}


def decision_inputs(profile, jobs, ranking):
    records = {r["recordId"]: r for r in profile["records"]}
    by_job = {j["jobId"]: j for j in jobs}
    questions = []
    for i, row in enumerate(ranking):
        job = by_job[row["jobId"]]
        criteria = []
        evidence = {}
        for q, d in zip(job["requirementsFixed"], row["evidence"], strict=True):
            ids = [r["recordId"] for r in d["records"]]
            criteria.append({"kind": q["kind"], "criterion": q["criterion"], "suggestedRecords": ids})
            for rid in ids:
                evidence[rid] = pilot.render_record(records[rid])
        payload = {"title": job["fields"]["title"], "requirements": criteria, "records": evidence}
        questions.append(
            (
                f"job_{i}",
                "각 요건의 실제 수행 근거를 점검해 전체 부합도를 평가하라. 검색된 기록이 무관하면 근거가 없다. "
                + json.dumps(payload, ensure_ascii=False),
            )
        )
    state = "한 사용자의 커리어 기록을 고정 직무 요건에 대조한다. 프로필 총 연차: " + str(
        profile["experienceYears"] if profile.get("experienceYears") is not None else "미상"
    )
    return state, questions


def rerank(profile, jobs, result, scorer):
    ranking = result["jobs"]
    if not ranking:
        return result
    state, questions = decision_inputs(profile, jobs, ranking)
    raw = scorer.call(build_body(scorer.provider, state, questions))
    if raw.get("model") != scorer.provider.model:
        raise ValueError("Decisions 응답 모델 불일치")
    answers = parse_answers(scorer.provider, raw)
    revised = []
    for row, (key, _) in zip(ranking, questions, strict=True):
        value = answers[key]["score"]
        if value is not None and not (math.isfinite(value) and 0 <= value <= 100):
            raise ValueError("Decisions 점수 범위 오류")
        revised.append({**row, "decisionScore": value})
    revised.sort(key=lambda x: -(x["decisionScore"] if x["decisionScore"] is not None else -1))
    return {**result, "jobs": revised}
