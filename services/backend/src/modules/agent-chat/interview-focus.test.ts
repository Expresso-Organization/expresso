import { expect, it } from "vitest";
import { interviewFocus } from "./interview-focus.js";
it("답한 근거를 제외하고 확인할 항목 하나를 정한다", () => {
  const bases = [0, 1].map(index => ({ index, kind: "requirement" as const, coverage: "partial" as const, label: `근거 ${index}`, evidence: "공고 요건" }));
  expect(interviewFocus(bases, [])).toMatchObject({ basis: 0, topic: "근거 0" });
  expect(interviewFocus(bases, [{ basis: 0, question: "맡은 작업은 무엇인가요?" }])).toMatchObject({ basis: 1 });
  expect(interviewFocus(bases, bases.map(item => ({ basis: item.index, question: "질문" })))).toBeNull();
});
