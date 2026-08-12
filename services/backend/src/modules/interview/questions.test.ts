import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { generateQuestionDrafts, questionTextForBasis } from "./questions.js";

describe("grounded interview questions", () => {
  it("allocates questions only from requirement and selected-record evidence", () => {
    const requirementId = randomUUID();
    const recordId = randomUUID();
    const drafts = generateQuestionDrafts([{
      id: requirementId,
      label: "PostgreSQL 장애 대응",
      coverage: "missing",
      evidence: "PostgreSQL 장애 대응 경험이 필요합니다.",
    }], [{
      id: recordId,
      title: "API migration",
      text: "Led a safe API migration without a recorded metric.",
    }]);

    expect(drafts).toHaveLength(3);
    expect(drafts.every(({ basis }) =>
      basis.type === "requirement"
        ? basis.requirementId === requirementId
        : basis.recordId === recordId)).toBe(true);
    expect(new Set(drafts.map(({ text }) => text)).size).toBe(3);
    const first = drafts[0]!;
    expect(questionTextForBasis(first.basis, first.variant + 1)).not.toBe(first.text);
  });

  it("does not invent a question when no evidence exists", () => {
    expect(generateQuestionDrafts([], [])).toEqual([]);
  });
});
