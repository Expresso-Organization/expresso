import { expect, it } from "vitest";
import { AGENT_EVALUATION_CASES, evaluateAgentTrace } from "./evaluation.js";
import { probabilityAnswerIssues } from "./answer-policy.js";
it.each(AGENT_EVALUATION_CASES)("평가셋 $id의 누락 도구·외부 확정·가짜 인용을 검출한다", test => {
  const trace = { caseId: test.id, answer: `확인된 근거로 안내합니다. ${(test.mustMention ?? []).join(" ")}`, tools: [...test.expectedTools], quotes: test.sources.slice(0, 1), committedActions: [] };
  expect(evaluateAgentTrace(test, trace)).toEqual([]);
  expect(evaluateAgentTrace(test, { ...trace, tools: ["deploy"], quotes: ["원문에 없는 문장"], committedActions: ["publish"] }).length).toBeGreaterThanOrEqual(3);
});
it("합격 확률과 일반 수치를 구별한다", () => {
  expect(probabilityAnswerIssues("합격 확률은?", "80%입니다.")).not.toEqual([]);
  expect(probabilityAnswerIssues("내 합격률", "숫자로 추정하기 어렵습니다.")).toEqual([]);
  expect(probabilityAnswerIssues("API 오류 코드는?", "404입니다.")).toEqual([]);
});

it("가상 경험·팀원 역할·최신 오류 코드의 맥락 누락을 검출한다", () => {
 for (const id of ["fiction", "team-role", "latest"]) {
  const test = AGENT_EVALUATION_CASES.find(row => row.id === id)!;
  expect(evaluateAgentTrace(test, { caseId: id, answer: "성공 경험입니다.", tools: test.expectedTools, quotes: [], committedActions: [] })).not.toEqual([]);
 }
});
