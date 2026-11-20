import type { AgentChoiceInput, AgentChoicePart, AgentFormInput, AgentFormPart, AgentMessage, AgentUiPart, AgentUiReply } from "@expresso/contracts";

/**
 * 대화 속 화면의 부품을 만들고, 사용자가 부품에 한 답을 확인한다. 순수 함수만 둔다.
 *
 * 부품과 선택지 · 칸의 id는 서버가 붙인다 — 모델이 쓴 id를 믿으면 겹치거나 다음 실행에서 달라진다.
 */

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** 글이 서로 달라야 하는 항목(선택지의 글 · 칸의 이름)에서 겹치는 것을 찾는다. */
function duplicateIssues(labels: readonly string[], noun: string) {
  const issues: string[] = [];
  const seen = new Map<string, number>();
  labels.forEach((label, index) => {
    const key = normalize(label);
    const first = seen.get(key);
    if (first !== undefined) issues.push(`${index + 1}번 ${noun}: ${first + 1}번과 글이 같습니다. 서로 다른 글로 쓰십시오.`);
    else seen.set(key, index);
  });
  return issues;
}

/** 선택지 입력에서 어긋난 항목. 모델이 고쳐 다시 부를 수 있도록 무엇이 어긋났는지 적는다. */
export const choiceIssues = (input: AgentChoiceInput) => duplicateIssues(input.options.map(option => option.label), "선택지");

export function buildChoice(input: AgentChoiceInput, partId: string): AgentChoicePart {
  return {
    kind: "choice", partId, prompt: input.prompt, multiple: input.multiple,
    options: input.options.map((option, index) => ({ id: `o${index + 1}`, label: option.label, ...(option.description ? { description: option.description } : {}) })),
    answer: null,
  };
}

/** 입력 칸 묶음에서 어긋난 항목. 필수 칸이 하나는 있어야 한다 — 모두 비워도 되면 빈 답이 온다. */
export function formIssues(input: AgentFormInput) {
  const issues = duplicateIssues(input.fields.map(field => field.label), "칸");
  if (input.fields.every(field => field.optional)) issues.push("모든 칸이 optional입니다. 꼭 받아야 하는 칸은 optional을 빼십시오.");
  return issues;
}

export function buildForm(input: AgentFormInput, partId: string): AgentFormPart {
  return {
    kind: "form", partId, prompt: input.prompt,
    fields: input.fields.map((field, index) => ({ id: `f${index + 1}`, label: field.label, ...(field.placeholder ? { placeholder: field.placeholder } : {}), optional: field.optional ?? false })),
    answer: null,
  };
}

export type ReplyCheck =
  | { ok: true; messageIndex: number; toolIndex: number; text: string; answer: NonNullable<AgentUiPart["answer"]> extends infer A ? A extends { messageId: string } ? Omit<A, "messageId"> : never : never }
  | { ok: false; message: string };

/**
 * 답이 지금 받을 수 있는 부품을 가리키는지, 부품의 종류에 맞는 답인지 본다.
 *
 * 받을 수 있는 부품은 마지막 답변에 있고 아직 답이 없는 것뿐이다 — 지난 질문에 뒤늦게 온 답은
 * 지금 대화와 맞지 않는다. 지나가면 대화에 남길 글과 부품에 적을 답을 함께 돌려준다.
 */
export function checkReply(messages: readonly AgentMessage[], reply: AgentUiReply): ReplyCheck {
  const messageIndex = messages.length - 1;
  const last = messages[messageIndex];
  const toolIndex = last?.role === "assistant" ? last.tools.findIndex(tool => tool.ui?.partId === reply.partId) : -1;
  if (!last || toolIndex < 0) return { ok: false, message: "지난 질문에는 답할 수 없습니다. 새로 말을 보내 주세요." };
  const part = last.tools[toolIndex]!.ui!;
  if (part.answer) return { ok: false, message: "이미 답한 질문입니다." };
  if (part.kind === "choice") {
    if (!("optionIds" in reply)) return { ok: false, message: "선택지에서 골라 답하는 질문입니다." };
    if (new Set(reply.optionIds).size !== reply.optionIds.length) return { ok: false, message: "같은 선택지를 두 번 고를 수 없습니다." };
    if (reply.optionIds.some(id => !part.options.some(option => option.id === id))) return { ok: false, message: "질문에 없는 선택지입니다." };
    if (!part.multiple && reply.optionIds.length !== 1) return { ok: false, message: "하나만 고를 수 있는 질문입니다." };
    // 고른 순서가 아니라 질문에 적힌 순서로 남긴다 — 같은 답이 누른 순서에 따라 다른 글이 되지 않게.
    const ordered = part.options.filter(option => reply.optionIds.includes(option.id));
    return { ok: true, messageIndex, toolIndex, text: ordered.map(option => option.label).join(", "), answer: { optionIds: ordered.map(option => option.id) } };
  }
  if (!("values" in reply)) return { ok: false, message: "칸에 적어 답하는 질문입니다." };
  if (new Set(reply.values.map(value => value.id)).size !== reply.values.length) return { ok: false, message: "같은 칸을 두 번 보낼 수 없습니다." };
  if (reply.values.some(value => !part.fields.some(field => field.id === value.id))) return { ok: false, message: "질문에 없는 칸입니다." };
  const filled = part.fields.flatMap(field => { const text = reply.values.find(value => value.id === field.id)?.text.trim() ?? ""; return text ? [{ field, text }] : []; });
  const missing = part.fields.find(field => !field.optional && !filled.some(item => item.field.id === field.id));
  if (missing) return { ok: false, message: `「${missing.label}」 칸을 적어 주세요.` };
  // 적은 칸만 남긴다. 빈 선택 칸은 대화에도 부품에도 적지 않는다.
  return { ok: true, messageIndex, toolIndex, text: filled.map(item => `${item.field.label}: ${item.text}`).join("\n"), answer: { values: filled.map(item => ({ id: item.field.id, text: item.text })) } };
}
