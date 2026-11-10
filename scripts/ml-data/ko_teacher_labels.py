"""한국어 공고 평가 세트의 교사 라벨을 Claude Sonnet 5.5(Claude Code CLI)로 매긴다.

루브릭은 파일럿과 같은 `job-profile-fit-v1`이다. 모델은 요구사항별 종류 · 충족 수준 · 근거 기록만 판단하고,
점수는 `llm_suitability_rubric.validate_labels`가 계산한다. 프롬프트는 파일럿 것을 수집 공고 원문용으로
옮겼다. JTH 구조화 필드에만 있던 규칙(false 필드, `_rare_skill_` 등)을 빼고 원문 공고 규칙을 넣었다.

출력을 거절하고 처음부터 다시 쓰게 하지 않는다(저장소 지침 · AGENTS.md 「지키는 선」).
- `--json-schema`를 쓰지 않는다. 모델은 JSON을 글로 쓰고 이 스크립트가 읽는다.
- 문법 오류는 같은 대화(`--resume`)에서 `{"edits":[{"find","replace"}]}`로 고쳐 받는다.
- 규칙 위반(빠진 공고, 근거와 충족 수준이 맞지 않는 칸 등)은 `{"fixes":[{"path","value"}]}`로 그 칸만 고쳐 받는다.
- 출력이 길이 한도에서 끊겼을 때(`stop_reason == "max_tokens"`)만 이어 쓰기를 요청한다.
- 고치기 횟수 상한은 없다. 문법 오류 위치가 바뀌거나 위반 수가 줄어드는 동안 계속하고, 진전이 없으면 그 프로필을
  실패로 남긴다. 실패한 프로필은 다시 실행하면 새 대화로 시작한다.

    python ko_teacher_labels.py --data <평가 세트 data> --output <labels 폴더> [--workers 2]
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
from typing import Any, Callable, Mapping, Sequence
import uuid


sys.path.insert(0, str(Path(__file__).parent))

from llm_suitability_labels import _default_command_prefix, _session_limit_message  # noqa: E402
from llm_suitability_rubric import COVERAGE_CODES, KIND_CODES, RUBRIC_VERSION, validate_labels  # noqa: E402


# 사용자 결정(2026-10-25 · 2026-11-10): 교사는 Claude Sonnet 5.5 하나. 별칭 `sonnet`은 실행 시점에 다른 모델로
# 옮겨 갈 수 있어 ID를 고정한다(본 학습 계획 1절).
TEACHER_MODEL = "claude-sonnet-5-5"
LABEL_SOURCE = "claude-code-claude-sonnet-5-5"
PROMPT_VERSION = "ko-posting-v1"
# 파일럿 라벨러 기본값과 같다(`llm_suitability_labels.run_labels`).
DEFAULT_EFFORT = "low"
SYSTEM = "You are a deterministic bilingual evidence grader. Follow the user rubric exactly. Reply with the JSON object only. Do not use tools."

Invoke = Callable[[Sequence[str], str], str]


class SessionLimitError(RuntimeError):
    pass


def build_prompt(profile: Mapping[str, Any], jobs: Sequence[Mapping[str, Any]]) -> str:
    records = [
        {"evidenceId": f"e{index}", "title": record.get("title", ""), "properties": record.get("properties", {}), "bodyMd": record.get("bodyMd", "")}
        for index, record in enumerate(profile.get("records", []))
    ]
    payload = {
        "profile": {"experienceYears": profile.get("experienceYears"), "records": records},
        "jobs": [{"jobId": job["jobId"], "title": job["fields"].get("title"), "jobFamily": job["fields"].get("job_category"), "posting": job["fields"].get("description")} for job in jobs],
    }
    return f"""당신은 채용 합격 가능성이 아니라 '현재 프로필에 기록된 경력 근거의 공고 부합도'를 평가한다.
이 점수는 합격 확률이 아니다. 각 공고를 서로 독립적으로 평가하라.

[절대 원칙]
- 프로필에 적힌 제목, properties, bodyMd, experienceYears만 근거로 사용한다.
- 희망 직무나 직무명 유사성만으로 요구사항 충족을 만들지 않는다.
- 공고 원문(posting)에 적힌 자격 요건, 담당 업무, 우대 사항만 요구사항으로 쓴다. 원문에 없는 요구사항은 만들지 않는다.
- 회사 소개, 복지, 채용 절차, 근무지, 고용형태, 원격 여부, 급여는 요구사항으로 만들지 않고 평가하지 않는다.
- 기록이 짧거나 적은 사실 자체를 벌점으로 주지 않는다. 확인 불가능한 요구만 not_evidenced로 둔다.
- 필수요건 불충족에 탈락, 거절, 최종 점수 상한을 적용하지 않는다. 해당 요구만 낮게 평가한다.
- 한 공고에서 중복을 제거한 핵심 요구사항을 총 1~8개로 추린다.

[요구사항 종류]
- must: 원문이 자격 요건 · 필수로 적은 기술, 경력, 학력, 자격, 언어
- responsibility: 원문이 담당 업무로 적은 핵심 업무
- preferred: 원문이 우대 · plus로 명시한 사항만. 일반적인 soft skill이나 회사 가치를 임의로 preferred로 올리지 않는다.

[근거 판정]
- strong=100: 구체적인 행동, 범위, 결과가 있는 강한 직접 근거
- adequate=75: 해당 요구를 수행했다고 볼 수 있는 직접 근거
- partial=50: 일부만 충족하거나 깊이·범위가 부족한 직접 근거
- transferable=25: 인접 경험은 있으나 해당 요구의 직접 경험은 아님
- not_evidenced=0: 현재 프로필에서 확인할 수 없거나 명시적으로 부족함
not_evidenced이면 근거 배열은 비운다. 나머지 판정은 입력의 evidenceId를 하나 이상 연결한다.

[출력]
요구사항별 kind와 coverage만 판단하고 점수는 계산하지 않는다. 점수는 후처리 코드가 계산한다.
아래 모양의 JSON 객체 하나만 출력한다. 설명 문장이나 코드 블록 표시를 붙이지 않는다.
{{"labels":[{{"j":"<jobId>","a":[{{"q":"<요구사항, 240자 이내>","k":"m|r|p","c":"s|a|x|t|n","e":["e0"]}}],"r":"<한국어 한 문장 이유>","f":<0~100 확신도 정수>}}]}}
k는 m=must, r=responsibility, p=preferred이고 c는 s=strong, a=adequate, x=partial, t=transferable, n=not_evidenced이다.
모든 공고를 정확히 한 번 출력한다.

[평가 입력]
{json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))}
"""


def read_json_text(text: str) -> Any:
    """모델이 글로 쓴 JSON을 읽는다. 앞뒤 설명과 코드 블록 표시는 걷어 낸다."""
    stripped = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", stripped, re.DOTALL)
    if fenced:
        stripped = fenced.group(1).strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start < 0 or end < start:
        raise json.JSONDecodeError("JSON 객체가 없다", stripped, 0)
    return json.loads(stripped[start : end + 1])


def label_violations(profile: Mapping[str, Any], jobs: Sequence[Mapping[str, Any]], payload: Any) -> list[dict[str, str]]:
    """`validate_labels`가 거절할 칸을 JSON 포인터 경로로 낸다. 같은 대화에서 그 칸만 고쳐 받기 위해서다."""
    if not isinstance(payload, dict) or not isinstance(payload.get("labels"), list):
        return [{"path": "/labels", "problem": "labels 배열이 있어야 한다"}]
    expected = [str(job["jobId"]) for job in jobs]
    evidence = {f"e{index}" for index in range(len(profile.get("records", [])))}
    problems: list[dict[str, str]] = []
    seen: dict[str, int] = {}
    for index, label in enumerate(payload["labels"]):
        base = f"/labels/{index}"
        if not isinstance(label, dict):
            problems.append({"path": base, "problem": "객체여야 한다"})
            continue
        job_id = str(label.get("j"))
        if job_id not in expected:
            problems.append({"path": f"{base}/j", "problem": f"입력에 없는 jobId다. 다음 중 하나여야 한다: {', '.join(expected)}"})
        elif job_id in seen:
            problems.append({"path": f"{base}/j", "problem": f"{job_id}가 {seen[job_id]}번째 label과 겹친다. 빠진 공고로 바꾼다"})
        else:
            seen[job_id] = index
        items = label.get("a")
        if not isinstance(items, list) or not 1 <= len(items) <= 8:
            problems.append({"path": f"{base}/a", "problem": "요구사항은 1~8개여야 한다"})
            items = items if isinstance(items, list) else []
        for position, item in enumerate(items):
            path = f"{base}/a/{position}"
            if not isinstance(item, dict):
                problems.append({"path": path, "problem": "객체여야 한다"})
                continue
            if not str(item.get("q") or "").strip():
                problems.append({"path": f"{path}/q", "problem": "요구사항 문장이 비어 있다"})
            if item.get("k") not in KIND_CODES:
                problems.append({"path": f"{path}/k", "problem": "k는 m, r, p 중 하나다"})
            coverage = item.get("c")
            if coverage not in COVERAGE_CODES:
                problems.append({"path": f"{path}/c", "problem": "c는 s, a, x, t, n 중 하나다"})
            refs = item.get("e")
            if not isinstance(refs, list) or any(not isinstance(ref, str) for ref in refs):
                problems.append({"path": f"{path}/e", "problem": "e는 evidenceId 문자열 배열이다"})
                continue
            unknown = [ref for ref in refs if ref not in evidence]
            if unknown or len(refs) != len(set(refs)):
                problems.append({"path": f"{path}/e", "problem": f"입력에 있는 evidenceId만 한 번씩 쓴다: {', '.join(sorted(evidence))}"})
            elif coverage == "n" and refs:
                problems.append({"path": f"{path}/e", "problem": "c가 n이면 근거 배열은 비운다"})
            elif coverage in COVERAGE_CODES and coverage != "n" and not refs:
                problems.append({"path": f"{path}/e", "problem": "c가 n이 아니면 근거 evidenceId를 하나 이상 연결한다"})
        if not isinstance(label.get("r"), str) or not label["r"].strip():
            problems.append({"path": f"{base}/r", "problem": "이유 한 문장이 있어야 한다"})
        confidence = label.get("f")
        if isinstance(confidence, bool) or not isinstance(confidence, int) or not 0 <= confidence <= 100:
            problems.append({"path": f"{base}/f", "problem": "f는 0~100 정수다"})
    for job_id in expected:
        if job_id not in seen and not any(problem["path"].endswith("/j") for problem in problems):
            problems.append({"path": "/labels/-", "problem": f"{job_id} 공고의 label이 빠졌다. 이 경로에 label 객체 하나를 값으로 준다"})
    return problems


def _pointer_set(document: Any, path: str, value: Any) -> None:
    parts = [part.replace("~1", "/").replace("~0", "~") for part in path.lstrip("/").split("/")]
    target = document
    for part in parts[:-1]:
        target = target[int(part)] if isinstance(target, list) else target[part]
    last = parts[-1]
    if isinstance(target, list):
        if last == "-":
            target.append(value)
        else:
            target[int(last)] = value
    else:
        target[last] = value


def _cli(prefix: Sequence[str], *, model: str, effort: str, session: tuple[str, str]) -> list[str]:
    # 파일럿 라벨러와 같은 옵션에서 --json-schema와 --no-session-persistence만 뺐다. 뒤의 것은 --resume에 필요하다.
    return [*prefix, "-p", "--model", model, "--effort", effort, "--system-prompt", SYSTEM, "--safe-mode", "--tools", "", "--disable-slash-commands", "--output-format", "json", *session]


def subprocess_invoke() -> Invoke:
    # 호출 전체에 시간 상한을 두지 않는다(저장소 지침). 긴 프로필은 출력이 길 뿐 멈춘 것이 아니다.
    def invoke(command: Sequence[str], prompt: str) -> str:
        result = subprocess.run(list(command), input=prompt, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
        limit = _session_limit_message(result.stdout, result.stderr)
        if limit:
            raise SessionLimitError(limit)
        if result.returncode != 0:
            raise RuntimeError(f"Claude Code exited {result.returncode}: {(result.stderr or result.stdout).strip()[-800:]}")
        return result.stdout

    return invoke


class Conversation:
    """한 프로필의 대화. 첫 호출은 우리가 정한 세션 ID로 시작하고, 고치기는 같은 세션을 이어 간다."""

    def __init__(self, prefix: Sequence[str], invoke: Invoke, *, model: str, effort: str) -> None:
        self.prefix = prefix
        self.invoke = invoke
        self.model = model
        self.effort = effort
        self.session_id = str(uuid.uuid4())
        self.turns: list[dict[str, Any]] = []

    def send(self, prompt: str) -> dict[str, Any]:
        session = ("--session-id", self.session_id) if not self.turns else ("--resume", self.session_id)
        started = time.perf_counter()
        envelope = json.loads(self.invoke(_cli(self.prefix, model=self.model, effort=self.effort, session=session), prompt))
        if envelope.get("is_error"):
            raise RuntimeError(f"Claude Code error: {str(envelope.get('result'))[:500]}")
        self.turns.append({"kind": "first" if not self.turns else "fix", "seconds": round(time.perf_counter() - started, 3), "stopReason": envelope.get("stop_reason"), "usage": envelope.get("usage")})
        return envelope


def label_profile(profile: Mapping[str, Any], jobs: Sequence[Mapping[str, Any]], conversation: Conversation) -> dict[str, Any]:
    envelope = conversation.send(build_prompt(profile, jobs))
    text = str(envelope.get("result") or "")
    while envelope.get("stop_reason") == "max_tokens":
        envelope = conversation.send("출력이 길이 한도에서 끊겼다. 앞 내용을 반복하지 말고 끊긴 글자 바로 다음부터 이어서 써라.")
        text += str(envelope.get("result") or "")
    last_error: str | None = None
    while True:
        try:
            payload = read_json_text(text)
            break
        except json.JSONDecodeError as error:
            signature = f"{error.msg}@{error.pos}"
            if signature == last_error:
                return {"status": "failed", "reason": f"JSON 문법 오류가 고쳐지지 않는다: {signature}", "text": text}
            last_error = signature
            reply = conversation.send(
                f"방금 출력의 JSON 문법 오류: {error.msg} (줄 {error.lineno}, 열 {error.colno}). 출력 전체를 다시 쓰지 말고 "
                '고칠 부분만 {"edits":[{"find":"<지금 출력에 그대로 있는 짧은 문자열>","replace":"<바꿀 문자열>"}]} 모양으로 답하라.'
            )
            try:
                for edit in read_json_text(str(reply.get("result") or "")).get("edits", []):
                    if edit.get("find") and edit["find"] in text:
                        text = text.replace(edit["find"], str(edit.get("replace", "")), 1)
            except (json.JSONDecodeError, AttributeError):
                pass
    problems = label_violations(profile, jobs, payload)
    while problems:
        reply = conversation.send(
            "아래 칸이 규칙에 맞지 않는다. 출력 전체를 다시 쓰지 말고 이 칸들만 고쳐 "
            '{"fixes":[{"path":"<JSON 포인터>","value":<그 칸의 새 값>}]} 모양으로 답하라.\n'
            + "\n".join(f"- {problem['path']}: {problem['problem']}" for problem in problems)
        )
        try:
            for fix in read_json_text(str(reply.get("result") or "")).get("fixes", []):
                _pointer_set(payload, str(fix["path"]), fix.get("value"))
        except (json.JSONDecodeError, AttributeError, KeyError, IndexError, ValueError, TypeError):
            pass
        remaining = label_violations(profile, jobs, payload)
        if len(remaining) >= len(problems):
            return {"status": "failed", "reason": "고친 뒤에도 위반 수가 줄지 않는다", "violations": remaining, "payload": payload}
        problems = remaining
    labels = validate_labels(profile, jobs, {"profileId": profile["profileId"], **payload}, label_source=LABEL_SOURCE)
    return {"status": "done", "labels": labels, "payload": payload}


def run(arguments: argparse.Namespace, *, invoke: Invoke | None = None, prefix: Sequence[str] | None = None) -> dict[str, Any]:
    data = arguments.data
    profiles = {row["profileId"]: row for row in _read_jsonl(data / "profiles.jsonl")}
    jobs = {row["jobId"]: row for row in _read_jsonl(data / "jobs.jsonl")}
    pairs = _read_jsonl(data / "candidate-manifest.jsonl")
    by_profile: dict[str, list[dict[str, Any]]] = {}
    for pair in pairs:
        by_profile.setdefault(pair["profileId"], []).append(pair)
    raw_dir = arguments.output / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    invoke = invoke or subprocess_invoke()
    prefix = list(prefix) if prefix is not None else _default_command_prefix()
    lock = threading.Lock()
    stop = threading.Event()
    counts = {"done": 0, "cached": 0, "failed": 0}

    def work(profile_id: str) -> None:
        if stop.is_set():
            return
        profile = profiles[profile_id]
        members = sorted(by_profile[profile_id], key=lambda pair: pair["jobId"])
        profile_jobs = [jobs[pair["jobId"]] for pair in members]
        prompt_hash = hashlib.sha256(build_prompt(profile, profile_jobs).encode("utf-8")).hexdigest()
        path = raw_dir / f"{profile_id}.json"
        if path.exists():
            cached = json.loads(path.read_text(encoding="utf-8"))
            if cached.get("status") == "done" and cached.get("promptHash") == prompt_hash and cached.get("model") == arguments.model:
                with lock:
                    counts["cached"] += 1
                return
        conversation = Conversation(prefix, invoke, model=arguments.model, effort=arguments.effort)
        try:
            result = label_profile(profile, profile_jobs, conversation)
        except SessionLimitError:
            stop.set()
            raise
        except (RuntimeError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as error:
            result = {"status": "failed", "reason": f"{type(error).__name__}: {error}"}
        bucket = {pair["jobId"]: pair["candidateBucket"] for pair in members}
        if result["status"] == "done":
            result["labels"] = [{**label, "split": profile["split"], "candidateBucket": bucket[label["jobId"]]} for label in result["labels"]]
        record = {**result, "profileId": profile_id, "promptHash": prompt_hash, "promptVersion": PROMPT_VERSION, "model": arguments.model, "sessionId": conversation.session_id, "turns": conversation.turns}
        temporary = path.with_name(f"{path.stem}.{threading.get_ident()}.tmp")
        temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)
        with lock:
            counts["done" if result["status"] == "done" else "failed"] += 1

    with ThreadPoolExecutor(max_workers=arguments.workers) as pool:
        for future in [pool.submit(work, profile_id) for profile_id in sorted(by_profile)]:
            future.result()
    labels: list[dict[str, Any]] = []
    failed: list[str] = []
    turns = 0
    for profile_id in sorted(by_profile):
        path = raw_dir / f"{profile_id}.json"
        record = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"status": "missing"}
        turns += len(record.get("turns", []))
        if record.get("status") == "done":
            labels.extend(record["labels"])
        else:
            failed.append(profile_id)
    summary = {
        **counts,
        "profiles": len(by_profile),
        "labeledPairs": len(labels),
        "failedProfiles": failed,
        "fixTurns": turns - (counts["done"] + counts["failed"]),
        "model": arguments.model,
        "rubricVersion": RUBRIC_VERSION,
        "promptVersion": PROMPT_VERSION,
    }
    if not failed:
        _write_jsonl(arguments.output / "suitability-labels.jsonl", sorted(labels, key=lambda row: (row["profileId"], row["jobId"])))
    (arguments.output / "label-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return summary


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _write_jsonl(path: Path, rows: Sequence[dict[str, Any]]) -> None:
    path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default=TEACHER_MODEL)
    parser.add_argument("--effort", default=DEFAULT_EFFORT)
    parser.add_argument("--workers", type=int, default=2, help="동시 대화 수. 구독 한도에 걸리면 줄인다")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    print(json.dumps(run(build_parser().parse_args(argv)), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
