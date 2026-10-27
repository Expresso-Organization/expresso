"""Claude Code Sonnet 적합도 라벨 실행기 테스트."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import textwrap
import unittest

from llm_suitability_labels import run_labels


def _write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


def _dataset(root: Path) -> Path:
    data = root / "data"
    profile = {
        "profileId": "profile-1",
        "split": "train",
        "experienceYears": 2,
        "records": [{"recordId": "record-1", "title": "API", "properties": {}, "bodyMd": "API를 운영했다."}],
    }
    job = {"jobId": "job-1", "split": "train", "fields": {"job_category": "backend engineer"}}
    pair = {"profileId": "profile-1", "jobId": "job-1", "split": "train", "candidateBucket": "role"}
    _write_jsonl(data / "profiles.jsonl", [profile])
    _write_jsonl(data / "jobs.jsonl", [job])
    _write_jsonl(data / "candidate-manifest.jsonl", [pair])
    return data


def _fake_claude(path: Path, fail_once: bool = False) -> Path:
    script = path / "fake_claude.py"
    script.write_text(
        textwrap.dedent(
            f"""
            import json
            from pathlib import Path
            import sys

            counter = Path(__file__).with_suffix('.count')
            count = int(counter.read_text() if counter.exists() else '0') + 1
            counter.write_text(str(count))
            if {fail_once!r} and count == 1:
                print('temporary failure', file=sys.stderr)
                raise SystemExit(1)
            payload = {{'labels': [{{
                'j': 'job-1',
                'a': [{{'q': 'API 경험', 'k': 'm', 'c': 's', 'e': ['e0']}}],
                'r': '직접 근거가 있다.', 'f': 90
            }}]}}
            print(json.dumps({{
                'type': 'result', 'subtype': 'success', 'result': '',
                'structured_output': payload, 'duration_ms': 123,
                'total_cost_usd': 0.01,
                'usage': {{'input_tokens': 100, 'output_tokens': 50}},
                'modelUsage': {{'claude-sonnet-5': {{'inputTokens': 100, 'outputTokens': 50}}}}
            }}))
            """
        ),
        encoding="utf-8",
    )
    return script


class LlmSuitabilityLabelsTest(unittest.TestCase):
    def test_uses_injected_teacher_and_selected_profile_source(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = _dataset(root)
            output = root / "labels"

            def invoke(prompt, schema, model, effort, timeout_seconds):
                self.assertIn("합격 확률이 아니다", prompt)
                return {
                    "structured_output": {"labels": [{
                        "j": "job-1",
                        "a": [{"q": "API 경험", "k": "m", "c": "a", "e": ["e0"]}],
                        "r": "직접 근거가 있다.", "f": 88,
                    }]},
                    "duration_ms": 20,
                    "usage": {"input_tokens": 10, "output_tokens": 5},
                    "modelUsage": {"gpt-5.6-luna": {}},
                }

            manifest = run_labels(
                data,
                output,
                invoke=invoke,
                label_source="gpt-5.6-luna",
                profile_ids={"profile-1"},
            )

            label = json.loads((output / "suitability-labels.jsonl").read_text(encoding="utf-8"))
            self.assertEqual(label["labelSource"], "gpt-5.6-luna")
            self.assertEqual(manifest["canonicalModels"], ["gpt-5.6-luna"])

    def test_chunked_calls_do_not_count_successful_chunks_as_retries(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            profile = {
                "profileId": "profile-1", "split": "train", "experienceYears": 2,
                "records": [{"recordId": "record-1", "title": "API", "properties": {}, "bodyMd": "API를 운영했다."}],
            }
            jobs = [
                {"jobId": "job-1", "split": "train", "fields": {"job_category": "backend"}},
                {"jobId": "job-2", "split": "train", "fields": {"job_category": "platform"}},
            ]
            pairs = [
                {"profileId": "profile-1", "jobId": job["jobId"], "split": "train", "candidateBucket": "role"}
                for job in jobs
            ]
            _write_jsonl(data / "profiles.jsonl", [profile])
            _write_jsonl(data / "jobs.jsonl", jobs)
            _write_jsonl(data / "candidate-manifest.jsonl", pairs)

            def invoke(prompt, schema, model, effort, timeout_seconds):
                job_id = schema["properties"]["labels"]["items"]["properties"]["j"]["enum"][0]
                return {"structured_output": {"labels": [{
                    "j": job_id,
                    "a": [{"q": "API 경험", "k": "m", "c": "a", "e": ["e0"]}],
                    "r": "직접 근거가 있다.", "f": 88,
                }]}}

            manifest = run_labels(data, root / "labels", invoke=invoke, jobs_per_call=1)

            self.assertEqual(manifest["labels"], 2)
            self.assertEqual(manifest["retryAttempts"], 0)

    def test_runs_retries_saves_raw_and_resumes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = _dataset(root)
            output = root / "labels"
            fake = _fake_claude(root, fail_once=True)

            manifest = run_labels(data, output, command_prefix=[sys.executable, str(fake)], max_attempts=3)

            self.assertEqual(manifest["completedProfiles"], 1)
            self.assertEqual(manifest["labels"], 1)
            self.assertEqual(manifest["retryAttempts"], 1)
            self.assertEqual(manifest["canonicalModels"], ["claude-sonnet-5"])
            self.assertTrue((output / "raw" / "profile-1.json").exists())
            label = json.loads((output / "suitability-labels.jsonl").read_text(encoding="utf-8"))
            self.assertEqual(label["candidateBucket"], "role")
            self.assertEqual(label["split"], "train")

            resumed = run_labels(data, output, command_prefix=[sys.executable, str(fake)], max_attempts=3)
            self.assertEqual(resumed["resumedProfiles"], 1)
            self.assertEqual(fake.with_suffix(".count").read_text(), "2")

    def test_rejects_persistent_contract_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = _dataset(root)
            broken = root / "broken.py"
            broken.write_text("print('{}')\n", encoding="utf-8")
            output = root / "labels"
            manifest = run_labels(data, output, command_prefix=[sys.executable, str(broken)], max_attempts=2)
            self.assertEqual(manifest["failedProfiles"], 1)
            self.assertEqual(manifest["pendingProfiles"], 1)
            self.assertEqual(manifest["labels"], 0)
            failures = json.loads((output / "failed-profiles.json").read_text(encoding="utf-8"))
            self.assertIn("failed after 2 attempts", failures[0]["error"])

    def test_stops_immediately_on_subscription_session_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = _dataset(root)
            limited = root / "limited.py"
            limited.write_text(
                "import json\nprint(json.dumps({'api_error_status':429,'result':'session limit; resets 4:30pm'}))\nraise SystemExit(1)\n",
                encoding="utf-8",
            )
            output = root / "labels"

            manifest = run_labels(data, output, command_prefix=[sys.executable, str(limited)], max_attempts=3)

            self.assertEqual(manifest["completedProfiles"], 0)
            self.assertEqual(manifest["failedProfiles"], 0)
            self.assertEqual(manifest["pendingProfiles"], 1)
            self.assertIn("resets 4:30pm", manifest["sessionLimit"])


if __name__ == "__main__":
    unittest.main()
