import { describe, expect, it } from "vitest";
import { GapReviewDraftSchema, AgentRecordDraftDecisionSchema, AgentRecordDraftInputSchema, RequirementReviewDraftSchema } from "./agent-chat.js";

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
