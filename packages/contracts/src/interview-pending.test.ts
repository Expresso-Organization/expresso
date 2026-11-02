import { describe, expect, it } from "vitest";
import { InterviewQuestionSchema } from "./interview.js";
const id = "00000000-0000-4000-8000-000000000001";
const question = { id, order: 0, text: "어떻게 개선했나요?", basis: { type: "record_gap", recordId: id, gap: "metric", evidence: "경험" }, rationale: null, replacedFromId: null, skipped: false, answered: false };
const pending = { operationId: id, producer: "interview", state: "retry", recordId: null, owners: { business: "pending", document: "pending" }, statusUrl: "/v1/career/write-operations/" + id, retryable: true, updatedAt: "2026-10-09T00:00:00Z" };
describe("Interview pending question compatibility", () => {
  it("preserves old questions and accepts safe pending owner metadata", () => {
    expect(InterviewQuestionSchema.parse(question)).toEqual(question);
    expect(InterviewQuestionSchema.parse({ ...question, pendingOperation: pending }).pendingOperation).toEqual(pending);
  });
  it("rejects private source payloads and another producer on an Interview question", () => {
    expect(InterviewQuestionSchema.safeParse({ ...question, pendingOperation: { ...pending, fingerprint: "a".repeat(64) } }).success).toBe(false);
    expect(InterviewQuestionSchema.safeParse({ ...question, pendingOperation: { ...pending, producer: "ai-proposal" } }).success).toBe(false);
  });
});