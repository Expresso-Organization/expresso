import type { AgentMessage, AgentRecordDraft, AgentRecordDraftInput, AgentRecordSource } from "@expresso/contracts";
import { normalizeLink } from "./link-reader.js";
import { normalize } from "./requirement-review.js";

/**
 * 기록 출처의 검증. 에이전트가 승인 없이 저장하므로 이 검사가 유일한 문이다.
 *
 * 출처는 이 대화에서 사용자가 한 말이거나, 사용자가 준 링크를 이번 실행에서 읽은 페이지다 — 에이전트의 답이나
 * 다른 대화의 말은 출처가 아니다. 인용은 그 말이나 페이지 글 안에 그대로 있어야 하고, 공백 차이만 무시한다.
 * 읽은 페이지 글은 실행이 끝나면 버리므로, 링크 출처는 읽은 실행 안에서만 지나간다.
 */
export function sourceIssues(sources: readonly AgentRecordSource[], messages: readonly AgentMessage[], pages: ReadonlyMap<string, string> = new Map()) {
  const issues: string[] = [];
  sources.forEach((source, index) => {
    if ("url" in source) {
      const link = normalizeLink(source.url);
      const text = link ? pages.get(link) : undefined;
      if (text === undefined) { issues.push(`${index + 1}번 출처: 이번 답변에서 read_link로 읽은 주소가 아닙니다. 먼저 read_link로 읽고, 읽은 글에서 인용하십시오.`); return; }
      if (!normalize(text).includes(normalize(source.quote))) issues.push(`${index + 1}번 출처: 인용 "${source.quote}"이 그 페이지 글에 없습니다. 읽은 글을 그대로 옮기십시오.`);
      return;
    }
    const message = messages.find(item => item.id === source.messageId);
    if (!message || message.role !== "user") { issues.push(`${index + 1}번 출처: 이 대화의 사용자 메시지가 아닙니다. 사용자 메시지의 id를 쓰십시오.`); return; }
    if (!normalize(message.text).includes(normalize(source.quote))) issues.push(`${index + 1}번 출처: 인용 "${source.quote}"이 그 메시지에 없습니다. 사용자가 한 말을 그대로 옮기십시오.`);
  });
  return issues;
}
export function draftIssues(input: AgentRecordDraftInput, messages: readonly AgentMessage[], categoryIds: ReadonlySet<string>, pages?: ReadonlyMap<string, string>) {
  const issues = sourceIssues(input.sources, messages, pages);
  if (input.categoryId && !categoryIds.has(input.categoryId)) issues.push("categoryId가 사용자의 카테고리가 아닙니다. 모르면 비워 두십시오.");
  return issues;
}

/** 승인형 초안 카드. 사용자 메시지 출처만 싣는다(`AgentRecordDraftSchema`). */
export function buildDraft(input: AgentRecordDraftInput, draftId: string, categories: readonly { id: string; name: string }[]): AgentRecordDraft {
  const sources = input.sources.filter((source): source is Extract<AgentRecordSource, { messageId: string }> => "messageId" in source);
  return { draftId, title: input.title, categoryId: input.categoryId ?? null, bodyMd: input.bodyMd, sources, categories: categories.slice(0, 50).map(({ id, name }) => ({ id, name })), status: "ready", recordId: null };
}
