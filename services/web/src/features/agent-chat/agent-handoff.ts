import { AgentContextSchema, type AgentContext } from "@expresso/contracts";

/**
 * 홈의 입력창에서 대화 화면으로 넘기는 말.
 *
 * 홈은 대화를 만들지 않는다 — 보낼 말과 연결할 자료를 여기에 적어 두고 대화 화면으로 간다.
 * 대화 화면이 한 번 꺼내 쓰고 지운다. 주소에 싣지 않는 이유는 보낸 말이 주소 기록에 남기 때문이다.
 */
const KEY = "ex-agent-handoff";

/** 홈에서 대화를 시작하는 이동의 전환 타입. 이 타입이 달린 이동에서만 홈 → 대화 전환이 돈다. */
export const AGENT_CHAT_OPEN = "agent-chat-open";

/** 대화 화면의 「새 대화」로 홈에 돌아가는 이동의 전환 타입. 홈 → 대화 전환의 반대로 돈다. */
export const AGENT_CHAT_CLOSE = "agent-chat-close";

/**
 * `deliver`는 홈이 아는 범위에서 이 말을 바로 보낼 수 있는지다. 거짓이면 대화 화면은 말풍선을 그리지 않고
 * 입력창에 글을 둔다. 홈이 아직 모르면 참으로 두고, 대화 화면이 확인해 보낼 수 없으면 말풍선을 거둔다.
 */
export type AgentHandoff = { text: string; contexts: AgentContext[]; deliver?: boolean };

/**
 * 같은 문서 안에서 넘긴 말. 대화 화면이 첫 렌더에 보낸 말을 그리려면 효과(effect)보다 먼저 읽어야 한다.
 * 브라우저에서만 쓰므로 서버 렌더와 새로고침에서는 늘 비어 있다 — 하이드레이션이 어긋나지 않는다.
 */
let inFlight: AgentHandoff | null = null;

export function putAgentHandoff(handoff: AgentHandoff) {
  inFlight = handoff;
  sessionStorage.setItem(KEY, JSON.stringify(handoff));
}

/** 지우지 않고 본다. 대화 화면의 첫 렌더가 쓴다. */
export function peekAgentHandoff(): AgentHandoff | null {
  return inFlight;
}

export function takeAgentHandoff(): AgentHandoff | null {
  inFlight = null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    const value = JSON.parse(raw) as { text?: unknown; contexts?: unknown; deliver?: unknown };
    if (typeof value.text !== "string" || !value.text.trim()) return null;
    const contexts = AgentContextSchema.array().max(10).safeParse(value.contexts);
    return { text: value.text, contexts: contexts.success ? contexts.data : [], deliver: value.deliver !== false };
  } catch {
    return null;
  }
}

/**
 * 대화 화면이 대화 목록을 알릴 때 쓰는 창 이벤트 이름. `detail`은 `{ id, title }[]`(최근 수정순)이다.
 * 사이드바는 레이아웃에 있어 대화 화면과 상태를 나눌 수 없으므로 이벤트로 받는다.
 */
export const AGENT_CONVERSATIONS_EVENT = "ex-agent-conversations";

/**
 * 홈의 입력창에 초점을 달라는 창 이벤트 이름. 대화 전 홈에서 사이드바의 「새 대화」를 누르면 옮겨 갈 곳이 없으므로
 * 이동 대신 이 이벤트를 보내고, 홈(`HomeStart`)이 들어 입력창에 초점을 준다.
 */
export const AGENT_COMPOSER_FOCUS = "ex-agent-composer-focus";
