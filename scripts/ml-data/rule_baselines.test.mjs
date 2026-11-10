import assert from "node:assert/strict";
import { test } from "node:test";

import { rankRecords, scoreMatches } from "./rule_baselines.mjs";

test("일치도는 서비스 함수가 계산한 충족률을 그대로 낸다", async () => {
  const [both, none, years] = await scoreMatches([
    { id: "both", requirements: { technologies: ["python", "sql"], impacts: [], roles: [], conditions: [] }, recordText: "Python으로 SQL 리포트를 만들었다", careerYears: 0 },
    { id: "none", requirements: { technologies: [], impacts: [], roles: [], conditions: [] }, recordText: "아무 기록", careerYears: 5 },
    { id: "years", requirements: { technologies: ["kafka"], impacts: [], roles: ["3 years"], conditions: [] }, recordText: "결제 서버", careerYears: 4 },
  ]);
  assert.deepEqual(both, { id: "both", score: 100 });
  // 요건을 하나도 읽지 못한 공고는 만점이 아니라 점수가 없다.
  assert.deepEqual(none, { id: "none", score: null });
  // 「3 years」는 글이 아니라 경력 연차로 판정한다. kafka는 닿지 않는다.
  assert.deepEqual(years, { id: "years", score: 50 });
});

test("재료 순위는 rankMaterials()의 점수와 순서를 그대로 낸다", async () => {
  const [result] = await rankRecords([
    {
      id: "pair",
      requirementLabels: ["react", "typescript"],
      records: [
        { id: "a", title: "결제", status: "organized", text: "자바 서버" },
        { id: "b", title: "화면", status: "organized", text: "React와 TypeScript로 만든 화면" },
        { id: "c", title: "검증", status: "verified", text: "React 화면" },
      ],
    },
  ]);
  assert.deepEqual(result.ranked, [
    { id: "b", score: 20 },
    { id: "c", score: 13 },
    { id: "a", score: 0 },
  ]);
});
