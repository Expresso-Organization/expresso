"""한국어 공고를 분할하고 원문에서 가져온 요건을 프로필 채점 전에 고정한다."""

from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import llm_suitability_train as pilot
from retrieval_baselines import Bm25Index


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def normalized(text):
    return re.sub(r"\W", "", unicodedata.normalize("NFKC", text).casefold())


SECTIONS = {
    "preferred": r"우대사항|우대요건|우대조건|이런분이면더|이런분이면좋|이런경험이있다면더",
    "must": r"자격요건|지원자격|필수요건|요구경험및역량|지원조건|이런분과함께|이런분을찾|어떤경력과역량",
    "responsibility": r"주요업무|담당업무|직무소개|이런일을해|합류하면담당|어떤업무를담당",
}


def fixed_requirements(text):
    groups = defaultdict(list)
    kind = None
    for num, raw in enumerate(text.splitlines(), 1):
        cleaned = raw.replace("\u200b", "").replace("\ufeff", "").replace("\\", "").replace("**", "").strip()
        heading = normalized(cleaned)
        section = next((key for key, expr in SECTIONS.items() if re.search(expr, heading)), None)
        if len(heading) <= 28 and section and not re.match(r"^[-•]\s", cleaned):
            kind = section
            continue
        if cleaned.startswith("#") or (
            len(heading) < 24
            and re.search(
                "전형절차|전형안내|채용절차|채용프로세스|혜택및복지|참고해주세요|근무조건|개발환경|기술스택",
                heading,
            )
        ):
            kind = None
        if not kind or not re.match(r"^(?:[-•·*–]|\d+[.)])\s*", cleaned):
            continue
        criterion = re.sub(r"^(?:[-•·*–]|\d+[.)])\s*", "", cleaned).strip()
        if not 8 <= len(criterion) <= 280 or "http" in criterion or not re.search("[가-힣]", criterion):
            continue
        if re.search("채용절차|수습기간|보훈|보호대상자|전형시우대|근무지|복리후생", normalized(criterion)):
            continue
        if criterion not in [x["criterion"] for x in groups[kind]]:
            groups[kind].append({"kind": kind, "criterion": criterion, "sourceLine": num})
    if len(groups["must"]) < 2:
        return []
    chosen = groups["must"][:4] + groups["responsibility"][:2] + groups["preferred"][:2]
    return [dict(x, id=f"q{i + 1}") for i, x in enumerate(chosen)]


def prepare(profiles, postings, old_jobs, old_sources, gold, output):
    with postings.open(encoding="utf-8") as stream:
        raw = [json.loads(line) for line in stream if line.strip()]
    past = pilot._read_jsonl(old_jobs)
    old_ids = {r["jobId"] for r in past}
    forbidden_text = {normalized(r["fields"]["description"]) for r in past}
    archive = [r for r in pilot._read_jsonl(old_sources) if r["jobId"] in old_ids]
    excluded_titles = {normalized(r["title"]) for r in archive}
    excluded_urls = {
        j["sourceUrl"].split("?")[0]
        for j in json.loads(gold.read_text())["postings"]
        if "?" not in j["sourceUrl"]
    }
    excluded_urls.update(r.get("sourceUrl") for r in raw if str(r["_id"]) in old_ids)
    jobs = []
    seen_urls, seen_text, seen_titles = set(), set(), set()
    for row in sorted(raw, key=lambda r: digest(str(r["_id"]))):
        jid = str(row["_id"])
        body = row.get("descriptionRaw") or ""
        url = row.get("sourceUrl") or ""
        title = normalized(row.get("title", ""))
        text_key = normalized(body)
        if (
            not url
            or jid in old_ids
            or text_key in forbidden_text
            or title in excluded_titles
            or url in excluded_urls
            or url in seen_urls
            or text_key in seen_text
            or title in seen_titles
        ):
            continue
        req = fixed_requirements(body)
        if not req:
            continue
        jobs.append(
            {
                "jobId": jid,
                "fields": {
                    "title": row["title"],
                    "job_category": row.get("jobFamily") or "",
                    "description": body,
                },
                "sourceUrl": url,
                "descriptionSha256": digest(body),
                "requirementsFixed": req,
            }
        )
        seen_urls.add(url)
        seen_text.add(text_key)
        seen_titles.add(title)
    # 직군 안에서 섞은 뒤 할당해 한 직군이 한 분할에 몰리는 것을 줄인다.
    families = defaultdict(list)
    for job in jobs:
        families[job["fields"]["job_category"]].append(job)
    for members in families.values():
        for i, job in enumerate(members):
            job["split"] = "valid" if i % 6 == 1 else "test" if i % 6 == 2 else "train"
    all_profiles = pilot._read_jsonl(profiles)
    selected, candidates = [], []
    for split, limit in (("train", 144), ("valid", 30), ("test", 40)):
        pool = [j for j in jobs if j["split"] == split]
        if len(pool) < 6:
            raise ValueError(f"공고 풀이 부족함: {split} {len(pool)}")
        corpus = {
            j["jobId"]: j["fields"]["title"] + " " + " ".join(q["criterion"] for q in j["requirementsFixed"])
            for j in pool
        }
        index = Bm25Index(corpus)
        users = sorted(
            (p for p in all_profiles if p["split"] == split), key=lambda p: digest("user42" + p["profileId"])
        )[:limit]
        for profile in users:
            selected.append(profile)
            pid = profile["profileId"]
            scores = index.score(pilot.render_profile(profile), sorted(corpus))
            ranked = sorted(scores, key=lambda j: (-scores[j], digest(pid + j)))
            chosen = ranked[:3]
            rest = sorted(ranked[3:], key=lambda j: digest("candidate42" + pid + j))
            for jid in chosen + rest[:3]:
                candidates.append(
                    {
                        "profileId": pid,
                        "jobId": jid,
                        "split": split,
                        "candidateBucket": "lexical" if jid in chosen else "random",
                    }
                )
    pilot._atomic_jsonl(output / "profiles.jsonl", selected)
    with (output / "jobs.jsonl").open("w", encoding="utf-8") as stream:
        for job in jobs:
            stream.write(json.dumps(job, ensure_ascii=True) + "\n")
    pilot._atomic_jsonl(output / "candidate-manifest.jsonl", candidates)
    print(
        [
            (
                s,
                sum(x["split"] == s for x in selected),
                sum(j["split"] == s for j in jobs),
                sum(r["split"] == s for r in candidates),
            )
            for s in ("train", "valid", "test")
        ]
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("profiles", "postings", "old-jobs", "old-sources", "gold", "output"):
        parser.add_argument("--" + option, type=Path, required=True)
    prepare(**vars(parser.parse_args()))
