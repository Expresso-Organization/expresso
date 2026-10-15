import { describe, expect, it } from "vitest";
import { PlanProposalInputSchema, PreparationTaskSchema, GapReviewDraftSchema, AgentRecordDraftDecisionSchema, AgentRecordDraftInputSchema, RequirementReviewDraftSchema } from "./agent-chat.js";

const jobPostingId = "00000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000002";
const item = (assessment: "strong" | "partial" | "unconfirmed", evidence: { recordId: string; quote: string }[]) => ({
  requirement: "Kafka 기반 스트리밍 경험", jobQuote: "Kafka 기반 실시간 파이프라인", kind: "must" as const,
  assessment, explanation: "설명", recommendation: "", evidence,
});

describe("요건 대조 초안", () => {
  it("강함 · 일부는 근거가 있어야 하고 미확인은 근거가 없어야 한다", () => {
    const quote = [{ recordId, quote: "Kafka로 주문 이벤트를 집계" }];
    expect(RequirementReviewDraftSchema.safeParse({ jobPostingId, summary: "요약", items: [item("strong", quote), item("unconfirmed", [])] }).success).toBe(true);
    expect(RequirementReviewDraftSchema.safeParse({ jobPostingId, summary: "요약", items: [item("partial", [])] }).success).toBe(false);
    expect(RequirementReviewDraftSchema.safeParse({ jobPostingId, summary: "요약", items: [item("unconfirmed", quote)] }).success).toBe(false);
  });
  it("요건은 1개 이상 12개 이하다", () => {
    expect(RequirementReviewDraftSchema.safeParse({ jobPostingId, summary: "요약", items: [] }).success).toBe(false);
    expect(RequirementReviewDraftSchema.safeParse({ jobPostingId, summary: "요약", items: Array.from({ length: 13 }, () => item("unconfirmed", [])) }).success).toBe(false);
  });
});

describe("새 기록 초안", () => {
  it("출처 발언이 1개 이상 있어야 한다", () => {
    const base = { title: "EKS 위 Airflow 운영", bodyMd: "## 상황\n인턴", sources: [{ messageId: recordId, quote: "EKS 위에 Airflow" }] };
    expect(AgentRecordDraftInputSchema.safeParse(base).success).toBe(true);
    expect(AgentRecordDraftInputSchema.safeParse({ ...base, sources: [] }).success).toBe(false);
  });
  it("승인에는 제목 · 본문 · 카테고리가 필요하고 거절에는 없다", () => {
    expect(AgentRecordDraftDecisionSchema.safeParse({ action: "approve", title: "제목", bodyMd: "본문" }).success).toBe(false);
    expect(AgentRecordDraftDecisionSchema.safeParse({ action: "approve", title: "제목", bodyMd: "본문", categoryId: recordId }).success).toBe(true);
    expect(AgentRecordDraftDecisionSchema.safeParse({ action: "reject" }).success).toBe(true);
  });
});

describe("보완점 정리", () => {
  it("요건 번호는 대조의 요건 수(최대 12) 안이다", () => {
    const item = { requirementIndex: 0, type: "skill" as const, status: "needs_confirmation" as const, priority: "high" as const, explanation: "설명", suggestedAction: "확인", evidence: [] };
    expect(GapReviewDraftSchema.safeParse({ summary: "요약", items: [item] }).success).toBe(true);
    expect(GapReviewDraftSchema.safeParse({ summary: "요약", items: [{ ...item, requirementIndex: 12 }] }).success).toBe(false);
  });
});

describe("준비 계획", () => {
  const settings = { weeklyHours: 5, weeks: 4, startDate: "2026-10-19" };
  it("같은 보완점을 두 번 고를 수 없고, 기간은 12주까지다", () => {
    expect(PlanProposalInputSchema.safeParse({ title: "계획", summary: "요약", gapIndexes: [0, 1], settings }).success).toBe(true);
    expect(PlanProposalInputSchema.safeParse({ title: "계획", summary: "요약", gapIndexes: [0, 0], settings }).success).toBe(false);
    expect(PlanProposalInputSchema.safeParse({ title: "계획", summary: "요약", gapIndexes: [0], settings: { ...settings, weeks: 13 } }).success).toBe(false);
  });
  it("결과 링크는 http(s)만 받는다", () => {
    const task = { id: recordId, gapId: recordId, requirement: "요건", kind: "learn", week: 1, date: "2026-10-19", minutes: 60, title: "실습", action: "구현", deliverable: "예제", status: "completed", note: "", outcome: "", spentMinutes: 0, updatedAt: "2026-10-15T00:00:00.000Z" };
    expect(PreparationTaskSchema.safeParse({ ...task, outcomeUrl: "https://example.com/result" }).success).toBe(true);
    expect(PreparationTaskSchema.safeParse({ ...task, outcomeUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});
