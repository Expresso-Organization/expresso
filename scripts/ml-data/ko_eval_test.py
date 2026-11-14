"""한국어 평가 세트 구성 · Sonnet 교사 러너 시험. 네트워크와 Claude Code를 쓰지 않는다."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest


sys.path.insert(0, str(Path(__file__).parent))

import ko_eval_dataset as dataset  # noqa: E402
import ko_teacher_labels as teacher  # noqa: E402
from ko_eval_fixture import FakeClaude, write_ko_inputs  # noqa: E402


class FamilyTest(unittest.TestCase):
    def test_roles_map_to_posting_families(self) -> None:
        self.assertEqual(dataset.family_sets(["DevOps"]), ({"인프라 · 플랫폼"}, {"백엔드", "데이터"}))
        same, adjacent = dataset.family_sets(["백엔드", "데이터"])
        self.assertEqual(same, {"백엔드", "데이터"})
        self.assertNotIn("백엔드", adjacent)
        self.assertEqual(dataset.family_sets(["기획 · PM", "디자인"])[0], set())


class BuildTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.fit, self.run_root, self.jobs = write_ko_inputs(self.root)
        self.output = self.root / "ko"

    def tearDown(self) -> None:
        self.directory.cleanup()

    def test_build_writes_fit_format_with_pilot_quotas(self) -> None:
        manifest = dataset.build(self.fit, self.run_root, self.jobs, self.output)
        # 검증 · 평가 프로필 3명 중 기획 · PM 한 명은 대응 공고가 없어 빠진다. 학습 분할 프로필은 쓰지 않는다.
        self.assertEqual(manifest["profiles"], 2)
        self.assertEqual(manifest["excludedProfiles"], {"noMatchingFamily": 1})
        pairs = [json.loads(line) for line in (self.output / "candidate-manifest.jsonl").read_text(encoding="utf-8").splitlines()]
        jobs = {row["jobId"]: row for row in map(json.loads, (self.output / "jobs.jsonl").read_text(encoding="utf-8").splitlines())}
        for profile_id in {pair["profileId"] for pair in pairs}:
            mine = [pair for pair in pairs if pair["profileId"] == profile_id]
            self.assertEqual(len(mine), 10)
            self.assertEqual(sorted(pair["candidateBucket"] for pair in mine).count("role"), 5)
            self.assertTrue(all(jobs[pair["jobId"]]["split"] == pair["split"] for pair in mine))
        job = next(iter(jobs.values()))
        self.assertEqual(set(job["fields"]), {"title", "job_category", "description"})
        self.assertIsNotNone(job["requirements"])

    def test_render_job_puts_title_family_then_posting(self) -> None:
        from llm_suitability_train import render_job

        text = render_job({"fields": {"title": "백엔드 개발자", "job_category": "백엔드", "description": "원문"}})
        self.assertEqual(text.splitlines(), ["공고 제목: 백엔드 개발자", "직무: 백엔드", "공고 원문: 원문"])


class TeacherTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        fit, run_root, jobs = write_ko_inputs(self.root)
        self.data = self.root / "ko"
        dataset.build(fit, run_root, jobs, self.data)
        self.labels = self.root / "labels"

    def tearDown(self) -> None:
        self.directory.cleanup()

    def arguments(self):
        return teacher.build_parser().parse_args(["--data", str(self.data), "--output", str(self.labels), "--workers", "1"])

    def test_syntax_error_and_violation_are_fixed_in_the_same_session(self) -> None:
        fake = FakeClaude(mode="fix")
        summary = teacher.run(self.arguments(), invoke=fake, prefix=["claude"])
        self.assertEqual((summary["done"], summary["failedProfiles"]), (2, []))
        # 프로필마다 첫 호출 1번 + 문법 고치기 1번 + 칸 고치기 1번. 처음부터 다시 쓰는 호출은 없다.
        self.assertEqual(len(fake.calls), 6)
        self.assertEqual(summary["fixTurns"], 4)
        first, *fixes = [command for command, _ in fake.calls[:3]]
        session = first[first.index("--session-id") + 1]
        self.assertTrue(all(command[command.index("--resume") + 1] == session for command in fixes))
        self.assertTrue(all("--json-schema" not in command for command, _ in fake.calls))
        self.assertTrue(all(command[command.index("--model") + 1] == "claude-sonnet-5-5" for command, _ in fake.calls))
        labels = [json.loads(line) for line in (self.labels / "suitability-labels.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(len(labels), 20)
        backend = [label for label in labels if label["jobId"].startswith("백엔드")]
        # must strong(100)만 있는 축 · preferred not_evidenced(0) 축: (100×0.45 + 0×0.15) ÷ 0.60 = 75
        self.assertTrue(all(label["matchScore"] == 75 for label in backend))
        self.assertTrue(all(label["labelSource"] == "claude-code-claude-sonnet-5-5" for label in labels))
        self.assertTrue(all(label["requirementAssessments"][1]["evidenceRecordIds"] == [] for label in labels))

    def test_cached_profiles_are_not_sent_again(self) -> None:
        teacher.run(self.arguments(), invoke=FakeClaude(), prefix=["claude"])
        again = FakeClaude()
        summary = teacher.run(self.arguments(), invoke=again, prefix=["claude"])
        self.assertEqual((summary["cached"], len(again.calls)), (2, 0))

    def test_no_progress_marks_profile_failed_without_rewriting(self) -> None:
        fake = FakeClaude(mode="stuck")
        summary = teacher.run(self.arguments(), invoke=fake, prefix=["claude"])
        self.assertEqual(len(summary["failedProfiles"]), 2)
        self.assertFalse((self.labels / "suitability-labels.jsonl").exists())
        self.assertEqual(sum("[평가 입력]" in prompt for _, prompt in fake.calls), 2)


if __name__ == "__main__":
    unittest.main()
