"""가짜 HTTP 응답으로 Decisions API · Jev 채점기를 시험한다. 네트워크와 키를 쓰지 않는다."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).parent))

import match_api_scorer as api  # noqa: E402
from match_fixture import SKILLS, SPLITS, write_dataset  # noqa: E402


def fake_score(instructions: str) -> int:
    return 4 if "python" in instructions else 1


class FakeTransport:
    """두 공급자의 응답 모양을 문서 그대로 흉내 낸다. statuses를 주면 앞에서부터 그 상태를 돌려준다."""

    def __init__(self, *, statuses: list[int] | None = None, refuse: str | None = None) -> None:
        self.calls: list[dict] = []
        self.statuses = list(statuses or [])
        self.refuse = refuse

    def __call__(self, url, headers, body, timeout):
        payload = json.loads(body)
        self.calls.append({"url": url, "headers": dict(headers), "body": payload})
        if self.statuses:
            status = self.statuses.pop(0)
            if status != 200:
                return status, {"retry-after": "0"}, b'{"error": "fake"}'
        if url.endswith("/v1/decisions"):
            answers = []
            for question in payload["questions"]:
                if question["name"] == self.refuse:
                    answers.append({"type": "refusal", "name": question["name"]})
                else:
                    answers.append({"type": "score", "name": question["name"], "score": fake_score(question["instructions"]), "confidence": 0.8, "probabilities": []})
            response = {"model": "gpt-6-luna", "answers": answers, "usage": {"input_tokens": 100, "input_tokens_details": {"cached_tokens": 40}, "output_tokens": 0}}
        else:
            answers = {name: {"type": "score", "score": fake_score(question["instructions"]), "confidence": 0.7, "probabilities": {}, "legend": {}} for name, question in payload["questions"].items()}
            response = {"model": "jev-1.14.0", "answers": answers, "usage": {"input_tokens": 50, "output_tokens": 0}}
        return 200, {}, json.dumps(response).encode("utf-8")


class BodyTest(unittest.TestCase):
    def test_levels_follow_rubric_order_and_points(self) -> None:
        self.assertEqual([key for key, _ in api.LEVELS], ["not_evidenced", "transferable", "partial", "adequate", "strong"])
        self.assertEqual([api.to_match_score(index) for index in range(5)], [0.0, 25.0, 50.0, 75.0, 100.0])

    def test_decisions_body_matches_reference(self) -> None:
        body = api.build_body(api.PROVIDERS["decisions"], "프로필", [("job_0", "공고 A")])
        self.assertEqual(body["model"], "gpt-6-luna")
        self.assertEqual(body["input"], "프로필")
        question = body["questions"][0]
        self.assertEqual((question["type"], question["name"], question["instructions"]), ("score", "job_0", "공고 A"))
        self.assertEqual([level["label"] for level in question["levels"]], [key for key, _ in api.LEVELS])

    def test_jev_body_matches_reference(self) -> None:
        body = api.build_body(api.PROVIDERS["jev"], "프로필", [("job_0", "공고 A")])
        self.assertEqual(body["model"], "jev-1.14.0")
        self.assertEqual(body["state"], "프로필")
        self.assertEqual(body["questions"]["job_0"]["criteria"], [description for _, description in api.LEVELS])


class RunTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        self.data, self.labels, self.pairs = write_dataset(root)
        self.output = root / "runs"
        env = patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "TYPESAFE_API_KEY": "test-key"})
        env.start()
        self.addCleanup(env.stop)

    def tearDown(self) -> None:
        self.directory.cleanup()

    def arguments(self, provider: str, *extra: str):
        return api.build_parser().parse_args(["--provider", provider, "--data", str(self.data), "--labels", str(self.labels), "--output", str(self.output), "--workers", "2", *extra])

    def evaluated_pairs(self) -> int:
        return (SPLITS["valid"] + SPLITS["test"]) * len(SKILLS)

    def test_decisions_writes_pair_and_record_scores_then_reuses_cache(self) -> None:
        transport = FakeTransport()
        summary = api.run(self.arguments("decisions"), transport=transport, sleep=lambda _: None)
        profiles = SPLITS["valid"] + SPLITS["test"]
        # 내용이 같은 요청은 캐시에서 읽는다. 동시에 보낸 같은 요청은 둘 다 나갈 수 있다.
        self.assertEqual(summary["requests"] + summary["cachedResponses"], profiles + self.evaluated_pairs())
        self.assertEqual(summary["inputTokens"], 100 * summary["requests"])
        self.assertEqual(transport.calls[0]["headers"]["Authorization"], "Bearer test-key")
        rows = [json.loads(line) for line in (self.output / "api-decisions" / "scores.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(len(rows), self.evaluated_pairs())
        self.assertEqual({row["split"] for row in rows}, {"valid", "test"})
        self.assertEqual({row["model"] for row in rows}, {"decisions-gpt-6-luna"})
        python_rows = [row for row in rows if row["jobId"].endswith("-0")]
        self.assertTrue(all(row["prediction"] == 100.0 for row in python_rows))
        records = (self.output / "api-decisions" / "record-scores.jsonl").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(records), self.evaluated_pairs() * len(SKILLS))
        again = api.run(self.arguments("decisions"), transport=FakeTransport(), sleep=lambda _: None)
        self.assertEqual((again["requests"], again["cachedResponses"]), (0, profiles + self.evaluated_pairs()))

    def test_jev_answers_map_by_question_name(self) -> None:
        api.run(self.arguments("jev", "--models", "a"), transport=FakeTransport(), sleep=lambda _: None)
        rows = [json.loads(line) for line in (self.output / "api-jev" / "scores.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual({row["model"] for row in rows}, {"jev-1.14.0"})
        self.assertEqual(sorted({row["prediction"] for row in rows}), [25.0, 100.0])
        self.assertFalse((self.output / "api-jev" / "record-scores.jsonl").exists())

    def test_refusal_becomes_missing_score(self) -> None:
        summary = api.run(self.arguments("decisions", "--models", "a"), transport=FakeTransport(refuse="job_1"), sleep=lambda _: None)
        self.assertEqual(summary["refusals"], SPLITS["valid"] + SPLITS["test"])
        rows = [json.loads(line) for line in (self.output / "api-decisions" / "scores.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(sum(row["prediction"] is None for row in rows), summary["refusals"])

    def test_rate_limit_is_retried_and_bad_request_is_not(self) -> None:
        waits: list[float] = []
        summary = api.run(self.arguments("jev", "--models", "a", "--limit", "1", "--workers", "1"), transport=FakeTransport(statuses=[429, 529, 200]), sleep=waits.append)
        self.assertEqual((summary["requests"], summary["retries"]), (1, 2))
        self.assertEqual(waits, [0.0, 0.0])
        bad = FakeTransport(statuses=[401])
        with self.assertRaisesRegex(RuntimeError, "HTTP 401"):
            api.run(self.arguments("decisions", "--models", "a", "--limit", "1", "--workers", "1"), transport=bad, sleep=waits.append)
        self.assertEqual(len(bad.calls), 1)

    def test_dry_run_sends_nothing(self) -> None:
        transport = FakeTransport()
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            plan = api.run(self.arguments("decisions", "--dry-run"), transport=transport)
        self.assertTrue(plan["dryRun"])
        self.assertEqual(plan["modelAQuestions"], self.evaluated_pairs())
        self.assertEqual(transport.calls, [])


if __name__ == "__main__":
    unittest.main()
