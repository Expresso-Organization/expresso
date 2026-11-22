"""기록의 제목·문단·속성을 원문 위치를 보존하며 검색 입력으로 나눈다."""

import hashlib
import json
import re

from tokenizers import Tokenizer


CHUNK_VERSION = "record-passages-v2"


def property_text(value):
    return (
        value
        if isinstance(value, str)
        else json.dumps(
            value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
    )


def record_passages(records, tokenizer=None, budget=384, overlap=32, prepared=False):
    """위치는 Unicode 코드 포인트 기준이며 text는 원문 slice와 항상 같다."""
    if budget < 16 or budget <= overlap or overlap < 0:
        raise ValueError("문단 토큰 예산은 겹침보다 커야 함")
    tok = (
        (tokenizer if prepared else Tokenizer.from_str(tokenizer.to_str()))
        if tokenizer is not None
        else None
    )
    if tok and not prepared:
        tok.no_truncation()
        tok.no_padding()
    result = []
    for record in records:
        title = record.get("title", "")
        sources = [("title", None, title), ("bodyMd", None, record.get("bodyMd", ""))]
        sources.extend(
            ("property", key, property_text(value))
            for key, value in sorted((record.get("properties") or {}).items())
            if value not in (None, "", [])
        )
        for source, key, text in sources:
            heading = ""
            # 제목과 Markdown 절 경계, 빈 줄을 유지한다. 긴 문단만 토큰 창으로 나눈다.
            boundaries = sorted(
                {
                    0,
                    len(text),
                    *(m.start() for m in re.finditer(r"\n\s*\n|(?m:^#{1,6}\s)", text)),
                }
            )
            for left, right in zip(boundaries, boundaries[1:]):
                while left < right and text[left].isspace():
                    left += 1
                while right > left and text[right - 1].isspace():
                    right -= 1
                if left == right:
                    continue
                block = text[left:right]
                if block.startswith("#"):
                    heading = block.splitlines()[0].lstrip("# ")
                # 문맥도 예산에 포함한다. 토큰 절단은 문자열을 복원하지 않고 원문 offset으로 한다.
                context = title[:120] + (
                    "\n" + heading[:120] if source == "bodyMd" and heading else ""
                )
                if key:
                    context += "\n" + key[:120]
                prefix = context + "\n"
                if tok:
                    context_offsets = tok.encode(
                        prefix, add_special_tokens=False
                    ).offsets
                    prefix_limit = min(80, budget // 4)
                    if len(context_offsets) > prefix_limit:
                        prefix = prefix[: context_offsets[prefix_limit - 1][1]] + "\n"
                prefix_cost = (
                    len(tok.encode("query: " + prefix).ids) if tok else len(prefix)
                )
                available = max(1, budget - prefix_cost)
                offsets = (
                    [
                        (a, b)
                        for a, b in tok.encode(block, add_special_tokens=False).offsets
                        if b > a
                    ]
                    if tok
                    else [(i, i + 1) for i in range(len(block))]
                )
                start = 0
                while start < len(offsets):
                    stop = min(len(offsets), start + available)
                    a, b = left + offsets[start][0], left + offsets[stop - 1][1]
                    quote = {"source": source, "start": a, "end": b, "text": text[a:b]}
                    if key is not None:
                        quote["propertyKey"] = key
                    identity = json.dumps(
                        [record["recordId"], source, key, a, b, quote["text"]],
                        ensure_ascii=False,
                    )
                    result.append(
                        {
                            "id": hashlib.sha256(identity.encode()).hexdigest(),
                            "recordId": record["recordId"],
                            "text": prefix + quote["text"],
                            "quote": quote,
                        }
                    )
                    if stop == len(offsets):
                        break
                    start = max(start + 1, stop - min(overlap, available // 4))
    return result
