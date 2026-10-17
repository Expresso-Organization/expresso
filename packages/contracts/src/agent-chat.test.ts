import { describe, expect, it } from "vitest";
import { RequirementReviewDraftSchema } from "./agent-chat.js";

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
