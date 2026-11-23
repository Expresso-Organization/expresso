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

describe("충족한 요건과 수치 있는 기록의 질문", () => {
  it("요건이 모두 충족이고 기록에 수치가 있어도 맥락을 묻는 근거로 질문을 만든다", () => {
    const drafts = generateQuestionDrafts(
      [{ id: "11111111-1111-4111-8111-111111111111", label: "React 경험", coverage: "covered", evidence: "React 경험" }],
      [{ id: "22222222-2222-4222-8222-222222222222", title: "주문 대시보드", text: "응답 시간을 30% 줄였다" }],
    );
    expect(drafts.length).toBeGreaterThanOrEqual(3);
    expect(drafts.some(({ basis }) => basis.type === "requirement" && basis.coverage === "covered")).toBe(true);
    expect(drafts.some(({ basis }) => basis.type === "record_gap" && basis.gap === "context")).toBe(true);
  });
});
