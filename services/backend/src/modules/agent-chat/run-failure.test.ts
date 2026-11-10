import { expect, it } from "vitest";
import type { AgentMessage } from "@expresso/contracts";
import { AgentExecutionError } from "../../platform/agent/execution-policy.js";
import { finishAgentFailure } from "./run-failure.js";
function message(): AgentMessage {
  return { id: "answer", role: "assistant", text: "", createdAt: "2026-11-11T00:00:00Z", tools: [
    { id: "read", name: "기록 목록 확인", status: "complete", summary: "기록 1개를 확인했습니다." },
    { id: "blocked", name: "기록 본문 확인", status: "running", summary: "요청 확인 중" },
  ] };
}
it("도구 카드와 실행 오류에 동일한 한도 안내를 남긴다", () => {
  const answer = message(), notice = "이번 요청의 도구 실행 한도에 도달했습니다. 질문을 나누어 다시 요청해 주세요.";
  const reason = finishAgentFailure(answer, new AgentExecutionError("TOOL_BUDGET", notice));
  expect(reason).toBe(notice); expect(answer.tools[1]).toMatchObject({ status: "failed", summary: notice });
  expect(answer.tools[0]).toMatchObject({ status: "complete", summary: "기록 1개를 확인했습니다." });
});
it("임의의 내부 예외를 도구 카드에 노출하지 않는다", () => {
  const answer = message(); const reason = finishAgentFailure(answer, new Error("private credentials"));
  expect(reason).not.toContain("private"); expect(answer.tools[1]!.summary).toBe("실행이 중단되었습니다.");
});
it("이미 완료·실패한 도구 결과는 덮어쓰지 않는다", () => {
  const answer = message(); answer.tools[1]!.status = "failed"; answer.tools[1]!.summary = "기존 검증 안내";
  finishAgentFailure(answer, new AgentExecutionError("MODEL_BUDGET", "모델 한도"));
  expect(answer.tools[1]!.summary).toBe("기존 검증 안내");
});
