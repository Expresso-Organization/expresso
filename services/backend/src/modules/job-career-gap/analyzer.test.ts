import { describe, expect, it } from "vitest";
import { CareerGapAiOutputSchema, type CareerGapAiOutput } from "@expresso/contracts";
import { validateGapEvidence } from "./analyzer.js";
import type { GapInput } from "./input-loader.js";
const jobId = "a4100000-0000-4000-8000-000000000002";
const recordId = "a4100000-0000-4000-8000-000000000003";
const messageId = "a4100000-0000-4000-8000-000000000004";
const input = {
  career: { job: { id: jobId, description: "Java 개발 경험과 API 오류 처리가 필요합니다." }, records: [{ id: recordId, text: "Node.js API를 구현했다." }] },
  match: { items: [{ jobQuote: "Java 개발 경험" }] },
  answers: [{ id: messageId, text: "Java 경험은 없어. API에서 404를 반환했어." }],
} as unknown as GapInput;
function output(): CareerGapAiOutput {
  return CareerGapAiOutputSchema.parse({ summary: "기술 경험 확인", items: [{ requirementIndex: 0, type: "skill", status: "needs_confirmation", priority: "high", explanation: "Java 경험을 확인합니다.", evidence: [{ sourceType: "job", sourceId: jobId, quote: "Java 개발 경험" }], suggestedAction: "관련 경험을 확인하세요." }] });
}
describe("Gap evidence validation", () => {
  it("allows an unconfirmed skill candidate without inventing experience", () => { expect(validateGapEvidence(input, output()).items[0]?.status).toBe("needs_confirmation"); });
  it("rejects improvement status without selected user evidence", () => { const value = output(); value.items[0]!.status = "needs_improvement"; expect(() => validateGapEvidence(input, value)).toThrow("user confirmation"); });
  it("accepts an exact selected user quote", () => { const value = output(); value.items[0]!.status = "needs_improvement"; value.items[0]!.evidence.push({ sourceType: "user_message", sourceId: messageId, quote: "Java 경험은 없어." }); expect(validateGapEvidence(input, value).items).toHaveLength(1); });
  it("rejects fabricated quotes", () => { const value = output(); value.items[0]!.evidence.push({ sourceType: "record", sourceId: recordId, quote: "성과 30% 향상" }); expect(() => validateGapEvidence(input, value)).toThrow("outside"); });
  it("rejects another record ID", () => { const value = output(); value.items[0]!.evidence.push({ sourceType: "record", sourceId: messageId, quote: "Node.js API를 구현했다." }); expect(() => validateGapEvidence(input, value)).toThrow("outside"); });
  it("rejects a requirement index outside P3", () => { const value = output(); value.items[0]!.requirementIndex = 1; expect(() => validateGapEvidence(input, value)).toThrow("unknown requirement"); });
  it("requires related experience for evidence and portfolio gaps", () => { for (const type of ["evidence", "portfolio"] as const) { const value = output(); value.items[0]!.type = type; expect(() => validateGapEvidence(input, value)).toThrow("related experience"); } });
  it("rejects duplicate requirement/type pairs", () => { const value = output(); value.items.push(structuredClone(value.items[0]!)); expect(() => validateGapEvidence(input, value)).toThrow("duplicate"); });
  it("allows no gaps", () => { expect(validateGapEvidence(input, { summary: "확인된 추가 후보 없음", items: [] }).items).toEqual([]); });
});
