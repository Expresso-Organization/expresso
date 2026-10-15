import { randomUUID } from "node:crypto";
import type { AgentMessage, GapReview, GapReviewDraft, RequirementReview } from "@expresso/contracts";
import { normalize } from "./requirement-review.js";

type Records = ReadonlyMap<string, { title: string; text: string }>;

/** 대화에서 가장 최근의 요건 대조. 보완점은 이 대조의 요건 번호를 가리킨다. */
export function latestReview(messages: readonly AgentMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const found = [...messages[index]!.tools].reverse().find(tool => tool.review);
    if (found?.review) return found.review;
  }
  return null;
}

/**
 * 보완점 검증. 규칙은 이전 경력 Gap 분석의 것을 따른다.
 *
 * - 요건 번호는 대조에 있어야 하고, (요건, 종류)는 한 번만 쓴다.
 * - 근거는 기록 원문 또는 이 대화의 사용자 발언 안에 그대로 있어야 한다.
 * - "보완 필요"는 사용자가 직접 말한 근거가 있어야 한다 — 기록에 없다는 것만으로 부족하다고
 *   단정하지 않는다.
 * - 근거 · 포트폴리오 종류는 관련 경험 근거가 있어야 한다.
 */
export function gapIssues(draft: GapReviewDraft, review: RequirementReview, records: Records, messages: readonly AgentMessage[]) {
  const issues: string[] = [];
  const seen = new Set<string>();
  draft.items.forEach((item, index) => {
    const label = `${index + 1}번 보완점`;
    if (!review.items[item.requirementIndex]) { issues.push(`${label}: 요건 번호 ${item.requirementIndex}는 요건 대조에 없습니다.`); return; }
    const key = `${item.requirementIndex}:${item.type}`;
    if (seen.has(key)) issues.push(`${label}: 같은 요건 · 종류가 두 번 있습니다.`);
    seen.add(key);
    for (const evidence of item.evidence) {
      if (evidence.sourceType === "record") {
        const record = records.get(evidence.sourceId);
        if (!record) issues.push(`${label}: 근거 기록 ${evidence.sourceId}를 찾을 수 없습니다.`);
        else if (!normalize(record.text).includes(normalize(evidence.quote))) issues.push(`${label}: "${record.title}"에 인용 "${evidence.quote}"이 없습니다.`);
      } else {
        const message = messages.find(row => row.id === evidence.sourceId);
        if (!message || message.role !== "user") issues.push(`${label}: ${evidence.sourceId}는 이 대화의 사용자 메시지가 아닙니다.`);
        else if (!normalize(message.text).includes(normalize(evidence.quote))) issues.push(`${label}: 인용 "${evidence.quote}"이 그 메시지에 없습니다.`);
      }
    }
    if (item.status === "needs_improvement" && !item.evidence.some(evidence => evidence.sourceType === "user_message")) issues.push(`${label}: 보완 필요는 사용자가 직접 말한 근거가 있어야 합니다. 확인되지 않았다면 needs_confirmation을 쓰십시오.`);
    if ((item.type === "evidence" || item.type === "portfolio") && item.evidence.length === 0) issues.push(`${label}: 근거 · 포트폴리오 종류는 관련 경험 근거가 있어야 합니다.`);
  });
  return issues;
}

export function buildGapReview(draft: GapReviewDraft, review: RequirementReview, records: Records, now = new Date()): GapReview {
  return {
    jobPostingId: review.jobPostingId,
    summary: draft.summary,
    items: draft.items.map(item => {
      const requirement = review.items[item.requirementIndex]!;
      return {
        ...item,
        id: randomUUID(),
        requirement: requirement.requirement,
        jobQuote: requirement.jobQuote,
        evidence: item.evidence.map(evidence => ({ ...evidence, label: evidence.sourceType === "record" ? records.get(evidence.sourceId)!.title.slice(0, 200) : "내 답변" })),
      };
    }),
    createdAt: now.toISOString(),
  };
}
