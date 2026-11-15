import { AgentContextSchema, type AgentContext } from "@expresso/contracts";

/**
 * 홈의 입력창에서 대화 화면으로 넘기는 말.
 *
 * 홈은 대화를 만들지 않는다 — 보낼 말과 연결할 자료를 여기에 적어 두고 대화 화면으로 간다.
 * 대화 화면이 한 번 꺼내 쓰고 지운다. 주소에 싣지 않는 이유는 보낸 말이 주소 기록에 남기 때문이다.
 */
const KEY = "ex-agent-handoff";

export type AgentHandoff = { text: string; contexts: AgentContext[] };

export function putAgentHandoff(handoff: AgentHandoff) {
  sessionStorage.setItem(KEY, JSON.stringify(handoff));
}

export function takeAgentHandoff(): AgentHandoff | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    const value = JSON.parse(raw) as { text?: unknown; contexts?: unknown };
    if (typeof value.text !== "string" || !value.text.trim()) return null;
    const contexts = AgentContextSchema.array().max(10).safeParse(value.contexts);
    return { text: value.text, contexts: contexts.success ? contexts.data : [] };
  } catch {
    return null;
  }
}
