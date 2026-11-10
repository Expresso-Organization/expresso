"""한국어 평가 세트 시험이 함께 쓰는 가짜 데이터와 가짜 Claude Code CLI. torch 없이 읽힌다."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Sequence


FAMILIES = ("백엔드", "데이터", "인프라 · 플랫폼", "프론트엔드", "보안")
JOBS_PER_FAMILY = 24
# 프로필 희망 직무. 마지막은 대응 공고가 없는 직무라 세트에서 빠져야 한다.
ROLES = (["백엔드"], ["데이터"], ["DevOps"], ["백엔드"], ["기획 · PM"])
FIT_SPLITS = ("train", "train", "valid", "test", "test")


def write_ko_inputs(root: Path) -> tuple[Path, Path, Path]:
    """(fit-v1 data, 원본 프로필 run-root, 한국어 공고 JSONL)."""
    fit = root / "fit"
    run_root = root / "run"
    fit.mkdir(parents=True)
    profiles = []
    for index, (roles, split) in enumerate(zip(ROLES, FIT_SPLITS)):
        profile_id = f"p{index}"
        records = [
            {"recordId": f"{profile_id}-r{position}", "title": f"{skill} 프로젝트", "properties": {}, "bodyMd": f"{skill} 업무를 맡아 지표를 개선했다"}
            for position, skill in enumerate(("Spring", "Airflow", "Kubernetes"))
        ]
        profiles.append({"profileId": profile_id, "split": split, "experienceYears": 2 + index, "records": records})
        source = run_root / "profiles" / split / f"{profile_id}.json"
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_text(json.dumps({"syntheticProfileId": profile_id, "careerProfile": {"targetRoles": roles}}, ensure_ascii=False), encoding="utf-8")
    (fit / "profiles.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in profiles), encoding="utf-8")
    jobs = []
    for family in FAMILIES:
        for number in range(JOBS_PER_FAMILY):
            jobs.append(
                {
                    "jobId": f"{family}-{number}",
                    "title": f"{family} 개발자 {number}",
                    "sourceBoard": "테스트",
                    "jobFamily": family,
                    "descriptionRaw": f"[자격 요건] {family} 실무 경험, Spring 또는 Airflow 사용 경험\n[우대 사항] Kubernetes 운영 경험",
                    "requirements": {"technologies": ["Spring", "Airflow"], "impacts": [], "roles": ["2 years"], "conditions": []},
                }
            )
    jobs_path = root / "ko-jobs.jsonl"
    jobs_path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in jobs), encoding="utf-8")
    return fit, run_root, jobs_path


def _prompt_payload(prompt: str) -> dict[str, Any]:
    return json.loads(prompt.split("[평가 입력]\n", 1)[1])


class FakeClaude:
    """Claude Code `-p --output-format json`의 응답 봉투를 흉내 낸다.

    mode="fix": 첫 응답에 JSON 문법 오류(끝의 쉼표)와 규칙 위반(n인데 근거 연결)을 넣고, 이어지는 고치기 요청에
    edits · fixes로 답한다. mode="stuck": 고치기 요청에 아무것도 고치지 않는 답을 준다.
    """

    def __init__(self, mode: str = "clean") -> None:
        self.mode = mode
        self.calls: list[tuple[list[str], str]] = []

    def __call__(self, command: Sequence[str], prompt: str) -> str:
        self.calls.append((list(command), prompt))
        if "[평가 입력]" in prompt:
            payload = _prompt_payload(prompt)
            labels = []
            for index, job in enumerate(payload["jobs"]):
                strong = job["jobFamily"] == "백엔드"
                labels.append({"j": job["jobId"], "a": [{"q": "Spring 실무", "k": "m", "c": "s" if strong else "t", "e": ["e0"]}, {"q": "Kubernetes 운영", "k": "p", "c": "n", "e": ["e2"] if (self.mode != "clean" and index == 0) else []}], "r": "근거가 있다", "f": 80})
            text = json.dumps({"labels": labels}, ensure_ascii=False)
            if self.mode != "clean":
                text = text[:-2] + ",]}"
            return json.dumps({"result": text, "stop_reason": "end_turn", "is_error": False, "usage": {"input_tokens": 10, "output_tokens": 5}})
        if "문법 오류" in prompt:
            reply = {"edits": [{"find": ",]}", "replace": "]}"}]}
        elif self.mode == "stuck":
            reply = {"fixes": []}
        else:
            reply = {"fixes": [{"path": "/labels/0/a/1/e", "value": []}]}
        return json.dumps({"result": json.dumps(reply), "stop_reason": "end_turn", "is_error": False})
