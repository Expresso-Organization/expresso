import type { ThreadMessageLike } from "@assistant-ui/react";
import type { AgentMessage } from "@expresso/contracts";

/** 취소 안내는 화면용 상태입니다. 저장된 AI 답변·완료된 도구 결과는 변경하지 않습니다. */
export function toThreadMessage(message: AgentMessage, cancelled = false): ThreadMessageLike {
  const text = cancelled && message.role === "assistant"
    ? [message.text, "응답을 중지했습니다."].filter(Boolean).join("\n\n") : message.text;
  return {
    id: message.id, role: message.role,
    ...(message.selection ? { metadata: { custom: { selection: message.selection } } } : {}), createdAt: new Date(message.createdAt),
    content: [
      ...message.tools.map(tool => ({ type: "tool-call" as const, toolCallId: tool.id, toolName: tool.name, args: {}, argsText: "{}", ...(tool.status === "running" ? {} : { result: { summary: tool.summary }, isError: tool.status === "failed" }) })),
      { type: "text", text },
    ],
  };
}
