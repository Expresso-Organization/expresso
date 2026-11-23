"""학습 모델과 외부 API가 같은 소유자·요건·후보·인용을 평가했는지 대조한다."""

import argparse
import hashlib
import json
from pathlib import Path

from evaluation import cohorts
from inputs import pilot
from passages import property_text
from record_search import table_key


def fingerprint(row):
    payload = {
        k: row[k]
        for k in (
            "profileId",
            "jobId",
            "requirementId",
            "criterion",
            "candidates",
            "candidatePassages",
        )
    }
    return hashlib.sha256(
        json.dumps(
            payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode()
    ).hexdigest()


def audit(root, personas, output, cross_rows):
    result = {
        "checks": "same criterion, record IDs, passage text and offsets; profile ownership; decisions/cross quotes belong to candidate passages",
        "splits": {},
    }
    for split, users, _ in cohorts(root, personas):
        records = {
            p["profileId"]: {r["recordId"]: r for r in p["records"]} for p in users
        }
        local = pilot._read_jsonl(output / f"{split}-hard_24.jsonl")
        external = pilot._read_jsonl(output / f"{split}-decisions.jsonl")
        cross = pilot._read_jsonl(cross_rows / f"{split}-cross.jsonl")
        keyed = [{table_key(r): r for r in rows} for rows in (local, external, cross)]
        if any(
            len(k) != len(rows) for k, rows in zip(keyed, (local, external, cross))
        ) or not (keyed[0].keys() == keyed[1].keys() == keyed[2].keys()):
            raise ValueError("평가 행 누락 또는 중복")
        fingerprints = []
        for row in local:
            key = table_key(row)
            signature = fingerprint(row)
            if any(fingerprint(k[key]) != signature for k in keyed[1:]):
                raise ValueError("비교 후보·원문 불일치")
            fingerprints.append(signature)
            if len(set(row["candidates"])) != len(row["candidates"]):
                raise ValueError("후보 기록 중복")
            for rid, passages in row["candidatePassages"].items():
                record = records[row["profileId"]][rid]
                for passage in passages:
                    q = passage["quote"]
                    source = (
                        property_text(record["properties"][q["propertyKey"]])
                        if q["source"] == "property"
                        else record[q["source"]]
                    )
                    if (
                        source[q["start"] : q["end"]] != q["text"]
                        or passage["recordId"] != rid
                    ):
                        raise ValueError("후보 인용 원문 불일치")
            for compared in keyed[1:]:
                for scored in compared[key]["verified"]:
                    rid = scored["recordId"]
                    if rid not in row["candidates"] or not any(
                        scored.get("quote") == c["quote"]
                        for c in row["candidatePassages"][rid]
                    ):
                        raise ValueError(
                            "재정렬 결과가 후보 밖의 기록 또는 인용을 가리킴"
                        )
        result["splits"][split] = {
            "requirements": len(local),
            "matchedInputs": len(fingerprints),
            "inputsSha256": hashlib.sha256(
                "\n".join(sorted(fingerprints)).encode()
            ).hexdigest(),
        }
    pilot._atomic_json(output / "comparison-audit.json", result)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", type=Path, required=True)
    p.add_argument(
        "--personas", type=Path, default=Path("docs/assets/persona-evidence-v1")
    )
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--cross-rows", type=Path, required=True)
    audit(**vars(p.parse_args()))
