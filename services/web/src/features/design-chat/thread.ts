import type { ThreadMessageLike } from "@assistant-ui/react";
import type { DesignCard, DesignChat, DesignChatMessage } from "@expresso/contracts";

/**
 * 디자인 대화를 채팅 스레드가 그리는 메시지로 옮긴다.
 *
 * 에이전트의 답에 붙은 카드는 도구 호출 한 건으로 싣는다 — 스레드는 도구 호출 자리에 화면이 준 부품을 그리고,
 * 그 부품이 `cards`에서 같은 ID의 카드를 찾아 견본 · 첫 화면을 그린다. 만들지 못한 답은 `failed` 카드가 된다.
 */
export type ThreadCard = DesignCard | { kind: "failed"; error: string };

type UserMessage = Extract<DesignChatMessage, { role: "user" }>;

/** 카드를 눌러 한 일을 사용자의 말로 적는다. 말로 보낸 것은 그 글 그대로다. */
export function userText(message: UserMessage): string {
  if (message.action === "say") return message.text;
  // 그리기의 대상은 둘이다 — 따로 고른 스타일(또는 카탈로그의 디자인)과 레이아웃. 무엇을 골랐는지는 말풍선 위의 대상이 보인다.
  const withLayout = message.subjects.some(({ kind }) => kind === "layout");
  if (message.action === "draw_catalog") return withLayout ? "이 디자인과 레이아웃으로 첫 화면을 보여 주세요." : "이 디자인으로 첫 화면을 보여 주세요.";
  return "이 스타일과 레이아웃으로 첫 화면을 보여 주세요.";
}

export function threadOf(chat: DesignChat | null): { messages: ThreadMessageLike[]; cards: Record<string, ThreadCard>; users: Record<string, UserMessage> } {
  const cards: Record<string, ThreadCard> = {};
  const users: Record<string, UserMessage> = {};
  const failure = chat?.run?.status === "failed" || chat?.run?.status === "interrupted" ? chat.run.error : null;
  const messages = (chat?.messages ?? []).map((message, index, all): ThreadMessageLike => {
    if (message.role === "user") {
      users[message.id] = message;
      return { id: message.id, role: "user", content: [{ type: "text", text: userText(message) }] };
    }
    // 카드 없이 실패한 답은 그 자리에 다시 시도할 수 있는 카드를 둔다. 카드가 있는 답의 실패는 카드가 장마다 보인다.
    const card: ThreadCard | null = message.card ?? (message.status === "failed" ? { kind: "failed", error: (index === all.length - 1 ? failure : null) ?? "답을 만들지 못했습니다." } : null);
    if (card) cards[message.id] = card;
    return {
      id: message.id,
      role: "assistant",
      content: [
        ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
        ...(card ? [{ type: "tool-call" as const, toolCallId: message.id, toolName: card.kind, args: {}, argsText: "{}", ...(message.status === "running" ? {} : { result: {} }) }] : []),
      ],
    };
  });
  return { messages, cards, users };
}

/** 지금 답이 무엇을 하는 중인가. 에이전트 이름 옆에 적는다. */
export function workingLabel(chat: DesignChat | null): string | null {
  const last = chat?.messages.at(-1);
  if (chat?.run?.status !== "running" || last?.role !== "assistant") return null;
  if (last.card?.kind === "screens" || last.card?.kind === "revision") return "첫 화면을 그리는 중";
  return chat.messages.length === 1 ? "자료를 읽는 중" : "답을 쓰는 중";
}
