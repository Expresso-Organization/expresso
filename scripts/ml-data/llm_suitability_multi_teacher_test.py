"""Luna/Qwen 병렬 적합도 라벨 실행 계획과 병합 테스트."""

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from llm_suitability_multi_teacher import (
    build_qwen_request,
    merge_label_sources,
    partition_remaining_profiles,
    parse_codex_jsonl,
    resolve_assignment_ids,
)


class LlmSuitabilityMultiTeacherTest(unittest.TestCase):
    def test_can_reassign_qwen_partition_to_luna_worker(self) -> None:
        plan = {"assignments": {"luna": ["p1"], "qwen": ["p2", "p3"]}}

        selected = resolve_assignment_ids(plan, "luna", assignment_key="qwen")

        self.assertEqual(selected, ["p2", "p3"])

    def test_partitions_only_remaining_profiles_without_overlap(self) -> None:
        profiles = [{"profileId": f"p{index:02d}"} for index in range(12)]

        plan = partition_remaining_profiles(
            profiles,
            completed_profile_ids={"p00", "p01"},
            qwen_share=0.2,
        )

        self.assertEqual(len(plan["qwen"]), 2)
        self.assertEqual(len(plan["luna"]), 8)
        self.assertFalse(set(plan["qwen"]) & set(plan["luna"]))
        self.assertEqual(set(plan["qwen"]) | set(plan["luna"]), {f"p{index:02d}" for index in range(2, 12)})

    def test_parses_last_codex_agent_message_as_structured_output(self) -> None:
        stream = "\n".join([
            json.dumps({"type": "thread.started", "thread_id": "t1"}),
            json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": '{"labels":[]}'}}),
        ])

        envelope = parse_codex_jsonl(stream)

        self.assertEqual(envelope["structured_output"], {"labels": []})

    def test_qwen_request_includes_schema_as_text_without_strict_grammar(self) -> None:
        schema = {"type": "object", "required": ["labels"], "properties": {"labels": {"type": "array"}}}

        request = build_qwen_request("rubric", schema, "qwen-test", num_ctx=16384, num_predict=4096)

        self.assertEqual(request["format"], "json")
        self.assertIn('"required":["labels"]', request["messages"][1]["content"])
        self.assertIn("프로필의 문장을 공고 요구사항으로 바꾸지 마라", request["messages"][1]["content"])
        self.assertIn("정확한 기술명", request["messages"][1]["content"])
        self.assertNotEqual(request["format"], schema)

        strict_request = build_qwen_request(
            "rubric", schema, "qwen-test", num_ctx=16384, num_predict=4096, strict_schema=True
        )
        self.assertEqual(strict_request["format"], schema)

    def test_merges_sources_and_rejects_duplicate_pairs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source_a = root / "a.jsonl"
            source_b = root / "b.jsonl"
            target = root / "merged.jsonl"
            source_a.write_text(json.dumps({"profileId": "p1", "jobId": "j1"}) + "\n", encoding="utf-8")
            source_b.write_text(json.dumps({"profileId": "p2", "jobId": "j2"}) + "\n", encoding="utf-8")

            result = merge_label_sources([source_a, source_b], target)

            self.assertEqual(result["labels"], 2)
            self.assertEqual(result["profiles"], 2)
            source_b.write_text(json.dumps({"profileId": "p1", "jobId": "j1"}) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate label pair"):
                merge_label_sources([source_a, source_b], target)


if __name__ == "__main__":
    unittest.main()
