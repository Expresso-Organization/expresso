"""긴 기록의 뒤쪽 회수, 원문 위치, 기록 중복 제거와 동일 후보 검증을 시험한다."""

from pathlib import Path
import tempfile
import unittest

import numpy as np
from tokenizers import Tokenizer, models, pre_tokenizers

from passages import record_passages
from evidence_search import retrieve, detail
from record_search import verify_requirement


def tokenizer():
    tok = Tokenizer(models.WordLevel({"[UNK]": 0}, unk_token="[UNK]"))
    tok.pre_tokenizer = pre_tokenizers.Whitespace()
    return tok


class PassageSearchTest(unittest.TestCase):
    def test_long_paragraph_offsets_and_no_tail_loss(self):
        body = "🙂 " + "오래된 기록 " * 900 + "\n\n## 운영\nPython 배포를 자동화했다."
        record = {
            "recordId": "r",
            "title": "프로젝트",
            "bodyMd": body,
            "properties": {"기술": ["Python", "SQL"]},
        }
        tok = tokenizer()
        chunks = record_passages([record], tok)
        self.assertTrue(any("자동화했다" in c["quote"]["text"] for c in chunks))
        self.assertTrue(any(c["quote"]["source"] == "property" for c in chunks))
        for chunk in chunks:
            q = chunk["quote"]
            if q["source"] == "bodyMd":
                self.assertEqual(body[q["start"] : q["end"]], q["text"])
            self.assertLessEqual(len(tok.encode("query: " + chunk["text"]).ids), 384)
        self.assertEqual(chunks, record_passages([record], tok))
        self.assertEqual(record_passages([], tok), [])

    def test_records_are_unique_and_late_paragraph_is_quoted(self):
        class Head:
            def get_inputs(self):
                return [
                    type("I", (), {"name": k})() for k in ("records", "requirements")
                ]

            def run(self, outputs, feed):
                return [feed["requirements"] @ feed["records"].T]

        class Engine:
            tokenizer = tokenizer()
            heads = Head()
            settings = {"threshold": 0.5}
            jobs = {"j": (None, np.array([1.0, 0.0]), np.array([[1.0, 0.0]]))}

            def prepare_jobs(self, jobs):
                pass

            def embed(self, texts, prefix):
                return {
                    text: np.array([1.0, 0.0])
                    if "Python" in text
                    else np.array([0.0, 1.0])
                    for text in texts
                }

        body = "무관한 내용 " * 900 + "\n\nPython 배포 자동화"
        profile = {
            "profileId": "u",
            "records": [
                {"recordId": "r1", "title": "운영", "bodyMd": body},
                {"recordId": "r2", "title": "디자인", "bodyMd": "그림"},
            ],
        }
        jobs = [
            {
                "jobId": "j",
                "requirementsFixed": [
                    {"id": "q", "kind": "must", "criterion": "Python 배포"}
                ],
            }
        ]
        row = retrieve(Engine(), profile, jobs)[0]
        self.assertEqual(row["localTop"][0], "r1")
        self.assertEqual(len(row["candidates"]), len(set(row["candidates"])))
        quote = detail(row)["records"][0]["quote"]
        self.assertIn("Python 배포", quote["text"])
        self.assertEqual(body[quote["start"] : quote["end"]], quote["text"])

    def test_verifier_returns_the_passage_it_actually_scored(self):
        from match_api_scorer import PROVIDERS
        from unittest.mock import patch

        first = {"text": "첫 문단", "quote": {"text": "첫 문단"}}
        second = {"text": "둘째 문단", "quote": {"text": "둘째 문단"}}
        row = {
            "criterion": "요건",
            "candidates": ["r"],
            "candidatePassages": {"r": [first, second]},
        }

        class Client:
            provider = PROVIDERS["decisions"]

            def call(self, body):
                return {"model": self.provider.model}

        with patch(
            "record_search.parse_answers",
            return_value={"p0": {"score": 10}, "p1": {"score": 80}},
        ):
            result = verify_requirement(
                row,
                {"records": [{"recordId": "r"}]},
                {"fields": {"title": "공고"}},
                Client(),
            )
        self.assertEqual(
            result["verified"],
            [{"recordId": "r", "score": 80, "quote": second["quote"]}],
        )



if __name__ == "__main__":
    unittest.main()
