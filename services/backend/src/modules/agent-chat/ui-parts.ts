import type { AgentChoiceInput, AgentChoicePart, AgentMessage, AgentUiReply } from "@expresso/contracts";

/**
 * 대화 속 화면의 부품을 만들고, 사용자가 부품에 한 답을 확인한다. 순수 함수만 둔다.
 *
 * 부품과 선택지의 id는 서버가 붙인다 — 모델이 쓴 id를 믿으면 겹치거나 다음 실행에서 달라진다.
 */

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** 선택지 입력에서 어긋난 항목. 모델이 고쳐 다시 부를 수 있도록 무엇이 어긋났는지 적는다. */
export function choiceIssues(input: AgentChoiceInput) {
  const issues: string[] = [];
  const seen = new Map<string, number>();
  input.options.forEach((option, index) => {
    const key = normalize(option.label);
    const first = seen.get(key);
    if (first !== undefined) issues.push(`${index + 1}번 선택지: ${first + 1}번과 글이 같습니다. 서로 다른 글로 쓰십시오.`);
    else seen.set(key, index);
  });
  return issues;
}

export function buildChoice(input: AgentChoiceInput, partId: string): AgentChoicePart {
  return {
    kind: "choice", partId, prompt: input.prompt, multiple: input.multiple,
    options: input.options.map((option, index) => ({ id: `o${index + 1}`, label: option.label, ...(option.description ? { description: option.description } : {}) })),
    answer: null,
  };
}

export type ReplyCheck =
  | { ok: true; messageIndex: number; toolIndex: number; text: string }
  | { ok: false; message: string };

/**
 * 답이 지금 받을 수 있는 부품을 가리키는지 본다.
 *
 * 받을 수 있는 부품은 마지막 답변에 있고 아직 답이 없는 것뿐이다 — 지난 질문에 뒤늦게 온 답은
 * 지금 대화와 맞지 않는다. 지나가면 대화에 남길 글(고른 선택지의 글)을 함께 돌려준다.
 */
export function checkReply(messages: readonly AgentMessage[], reply: AgentUiReply): ReplyCheck {
  const messageIndex = messages.length - 1;
  const last = messages[messageIndex];
  const toolIndex = last?.role === "assistant" ? last.tools.findIndex(tool => tool.ui?.partId === reply.partId) : -1;
  if (!last || toolIndex < 0) return { ok: false, message: "지난 질문에는 답할 수 없습니다. 새로 말을 보내 주세요." };
  const part = last.tools[toolIndex]!.ui!;
  if (part.answer) return { ok: false, message: "이미 답한 질문입니다." };
  if (new Set(reply.optionIds).size !== reply.optionIds.length) return { ok: false, message: "같은 선택지를 두 번 고를 수 없습니다." };
  const chosen = reply.optionIds.map(id => part.options.find(option => option.id === id));
  if (chosen.some(option => !option)) return { ok: false, message: "질문에 없는 선택지입니다." };
  if (!part.multiple && chosen.length !== 1) return { ok: false, message: "하나만 고를 수 있는 질문입니다." };
  // 고른 순서가 아니라 질문에 적힌 순서로 남긴다 — 같은 답이 누른 순서에 따라 다른 글이 되지 않게.
  const ordered = part.options.filter(option => reply.optionIds.includes(option.id));
  return { ok: true, messageIndex, toolIndex, text: ordered.map(option => option.label).join(", ") };
}
