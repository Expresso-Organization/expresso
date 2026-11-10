import type { AgentMessage } from "@expresso/contracts";
import { AgentExecutionError } from "../../platform/agent/execution-policy.js";

/** 예산 오류는 공개용 안내를 반환하고, 임의의 내부 예외 본문은 공개하지 않습니다. */
export function finishAgentFailure(message: AgentMessage, error: unknown): string {
  const reason = error instanceof AgentExecutionError
    ? error.message : "응답을 완료하지 못했습니다. 설정을 확인하고 다시 보내 주세요.";
  for (const tool of message.tools) if (tool.status === "running") {
    tool.status = "failed";
    tool.summary = error instanceof AgentExecutionError ? reason : "실행이 중단되었습니다.";
  }
  return reason;
}
