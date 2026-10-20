import { describe, expect, it } from "vitest";
import type { RequirementReviewDraft } from "@expresso/contracts";
import { buildReview, hash, reviewIssues } from "./requirement-review.js";

const jobPostingId = "00000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000002";
const jobText = "자격 요건\n\nKafka 기반   실시간 파이프라인 운영 경험\nSQL 숙련";
const records = new Map([[recordId, { title: "주문 이벤트 집계", text: "주문 이벤트 집계\n\nKafka로 주문 이벤트를\n실시간으로 집계했습니다." }]]);
const draft = (overrides: Partial<RequirementReviewDraft["items"][number]> = {}): RequirementReviewDraft => ({
  jobPostingId, summary: "요약",
  items: [{ requirement: "Kafka 스트리밍", jobQuote: "Kafka 기반 실시간 파이프라인", kind: "must", assessment: "strong", explanation: "설명", recommendation: "", evidence: [{ recordId, quote: "Kafka로 주문 이벤트를 실시간으로" }], ...overrides }],
});

describe("요건 대조 검증", () => {
  it("줄바꿈 · 연속 공백 차이는 같은 인용으로 본다", () => {
    expect(reviewIssues(draft(), jobText, records)).toEqual([]);
  });
  it("원문에 없는 공고 인용과 기록 인용을 각각 짚는다", () => {
    const issues = reviewIssues(draft({ jobQuote: "Flink 운영", evidence: [{ recordId, quote: "Flink로 집계" }] }), jobText, records);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain("공고 원문에 없습니다");
    expect(issues[1]).toContain("주문 이벤트 집계");
  });
  it("읽지 않은 기록이나 남의 기록은 근거가 될 수 없다", () => {
    const issues = reviewIssues(draft({ evidence: [{ recordId: "00000000-0000-4000-8000-000000000003", quote: "Kafka" }] }), jobText, records);
    expect(issues[0]).toContain("찾을 수 없습니다");
  });
  it("같은 요건을 두 번 쓰면 거절한다", () => {
    const base = draft();
    expect(reviewIssues({ ...base, items: [base.items[0]!, { ...base.items[0]!, requirement: " kafka  스트리밍" }] }, jobText, records)[0]).toContain("두 번");
  });
  it("저장형에 기록 제목과 원문 해시를 남긴다", () => {
    const review = buildReview(draft(), jobText, records, new Date("2026-10-15T00:00:00.000Z"));
    expect(review.items[0]!.evidence[0]!.recordTitle).toBe("주문 이벤트 집계");
    expect(review.snapshot).toEqual({ jobContentHash: hash(jobText), records: [{ recordId, textHash: hash(records.get(recordId)!.text) }] });
    expect(hash("a\n\n b")).toBe(hash("a b"));
  });
});
