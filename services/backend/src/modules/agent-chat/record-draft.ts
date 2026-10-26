import type { AgentMessage, AgentRecordDraft, AgentRecordDraftInput } from "@expresso/contracts";
import { normalize } from "./requirement-review.js";

/**
 * 새 기록 초안의 출처 검증.
 *
 * 출처는 이 대화에서 사용자가 한 말이어야 한다 — 에이전트의 답이나 다른 대화의 말은 출처가
 * 아니다. 인용은 그 메시지 안에 그대로 있어야 하고, 공백 차이만 무시한다.
 */
export function draftIssues(input: AgentRecordDraftInput, messages: readonly AgentMessage[], categoryIds: ReadonlySet<string>) {
  const issues: string[] = [];
  input.sources.forEach((source, index) => {
    const message = messages.find(item => item.id === source.messageId);
    if (!message || message.role !== "user") { issues.push(`${index + 1}번 출처: 이 대화의 사용자 메시지가 아닙니다. 사용자 메시지의 id를 쓰십시오.`); return; }
    if (!normalize(message.text).includes(normalize(source.quote))) issues.push(`${index + 1}번 출처: 인용 "${source.quote}"이 그 메시지에 없습니다. 사용자가 한 말을 그대로 옮기십시오.`);
  });
  if (input.categoryId && !categoryIds.has(input.categoryId)) issues.push("categoryId가 사용자의 카테고리가 아닙니다. 모르면 비워 두십시오.");
  return issues;
}

export function buildDraft(input: AgentRecordDraftInput, draftId: string, categories: readonly { id: string; name: string }[]): AgentRecordDraft {
  return { draftId, title: input.title, categoryId: input.categoryId ?? null, bodyMd: input.bodyMd, sources: input.sources, categories: categories.slice(0, 50).map(({ id, name }) => ({ id, name })), status: "ready", recordId: null };
}
