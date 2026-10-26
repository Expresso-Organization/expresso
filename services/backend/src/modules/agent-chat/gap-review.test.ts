import { describe, expect, it } from "vitest";
import type { AgentMessage, GapReviewDraft, RequirementReview } from "@expresso/contracts";
import { buildGapReview, gapIssues, latestReview } from "./gap-review.js";

const recordId = "00000000-0000-4000-8000-000000000002";
const userMessage = "00000000-0000-4000-8000-000000000003";
const at = "2026-10-15T00:00:00.000Z";
const review: RequirementReview = {
  jobPostingId: "00000000-0000-4000-8000-000000000001", summary: "요약", createdAt: at, snapshot: { jobContentHash: "a".repeat(64), records: [] },
  items: [{ requirement: "Kubernetes 운영", jobQuote: "Kubernetes 환경 운영 경험", kind: "must", assessment: "unconfirmed", explanation: "설명", recommendation: "", evidence: [] }],
};
const records = new Map([[recordId, { title: "배치 장애 추적", text: "배치 적재 장애의 원인을 추적했다" }]]);
const messages: AgentMessage[] = [
  { id: userMessage, role: "user", text: "Kubernetes는 써 본 적이 없어요.", tools: [], createdAt: at },
  { id: "00000000-0000-4000-8000-000000000004", role: "assistant", text: "대조했습니다", tools: [{ id: "t", name: "요건 대조", status: "complete", summary: "", review }], createdAt: at },
];
const draft = (item: Partial<GapReviewDraft["items"][number]>): GapReviewDraft => ({ summary: "요약", items: [{ requirementIndex: 0, type: "skill", status: "needs_confirmation", priority: "high", explanation: "설명", suggestedAction: "확인", evidence: [], ...item }] });

describe("보완점 검증", () => {
  it("가장 최근 요건 대조를 찾는다", () => {
    expect(latestReview(messages)).toBe(review);
    expect(latestReview(messages.slice(0, 1))).toBeNull();
  });
  it("사용자 발언 근거가 있으면 보완 필요를 받고, 공고 인용은 대조에서 채운다", () => {
    const input = draft({ status: "needs_improvement", evidence: [{ sourceType: "user_message", sourceId: userMessage, quote: "써 본 적이 없어요" }] });
    expect(gapIssues(input, review, records, messages)).toEqual([]);
    const built = buildGapReview(input, review, records);
    expect(built.items[0]).toMatchObject({ requirement: "Kubernetes 운영", jobQuote: "Kubernetes 환경 운영 경험", evidence: [{ label: "내 답변" }] });
  });
  it("기록에 없다는 것만으로는 보완 필요가 될 수 없다", () => {
    expect(gapIssues(draft({ status: "needs_improvement" }), review, records, messages)[0]).toContain("needs_confirmation");
  });
  it("없는 요건 번호 · 중복 · 원문에 없는 인용 · 근거 없는 포트폴리오를 짚는다", () => {
    expect(gapIssues(draft({ requirementIndex: 3 }), review, records, messages)[0]).toContain("요건 대조에 없습니다");
    const twice = draft({}); twice.items.push({ ...twice.items[0]! });
    expect(gapIssues(twice, review, records, messages)[0]).toContain("두 번");
    expect(gapIssues(draft({ evidence: [{ sourceType: "record", sourceId: recordId, quote: "없는 문장" }] }), review, records, messages)[0]).toContain("배치 장애 추적");
    expect(gapIssues(draft({ type: "portfolio" }), review, records, messages)[0]).toContain("포트폴리오");
  });
});
