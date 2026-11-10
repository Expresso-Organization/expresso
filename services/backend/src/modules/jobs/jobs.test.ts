import { describe, expect, it } from "vitest";

import { mergedYears } from "../career/record-period.js";
import { calculateExplainableMatch, keywordMet } from "./match-score.js";

// 자연어 검색의 AI 응답 검증은 search-interpreter.test.ts에서 확인합니다.

describe("explainable match scoring", () => {
  it("요건 충족률로 점수를 내고 가장 약한 축에서 다음 행동을 뽑는다", () => {
    const match = calculateExplainableMatch(
      "11111111-1111-4111-8111-111111111111",
      {
        technologies: ["postgresql", "kubernetes"],
        impacts: ["scale", "conversion"],
        roles: ["backend", "leadership"],
        conditions: ["remote"],
      },
      "Backend engineer used PostgreSQL to scale a remote service.",
      new Date("2026-08-09T00:00:00Z"),
    );
    // 요건 7개 중 4개 충족 → 57.
    expect(match?.required).toBe(7);
    expect(match?.covered).toBe(4);
    expect(match?.total).toBe(57);
    expect(match?.axes.technology).toEqual({
      required: 2,
      covered: 1,
      matched: ["postgresql"],
      missing: ["kubernetes"],
    });
    expect(match?.reason).toContain("kubernetes");
    expect(match?.nextAction).toContain("기록");
  });

  it("축마다 배점을 두지 않는다 — 많이 요구한 축이 그만큼 무거워진다", () => {
    const at = new Date("2026-08-09T00:00:00Z");
    const id = "11111111-1111-4111-8111-111111111111";
    // 기술 4줄 중 3줄 충족, 근무 조건 1줄 충족 → (3+1)/5.
    const match = calculateExplainableMatch(
      id,
      {
        technologies: ["airflow", "spark", "dbt", "kafka"],
        impacts: [],
        roles: [],
        conditions: ["remote"],
      },
      "airflow spark dbt remote",
      at,
    );
    expect(match?.total).toBe(80);
    // 요구가 없는 축은 만점이 아니라 계산에서 아예 빠진다.
    expect(match?.axes.impact).toEqual({
      required: 0,
      covered: 0,
      matched: [],
      missing: [],
    });
  });

  it("연차 키워드는 글이 아니라 경력 기간으로 잰다", () => {
    const source = "고른마켓 데이터 분석가로 일했습니다";
    expect(keywordMet("데이터 분석 3년 이상", source, 4)).toBe(true);
    expect(keywordMet("데이터 분석 3년 이상", source, 2)).toBe(false);
    expect(keywordMet("백엔드 개발 3년 이상", source, 4)).toBe(false);
    expect(keywordMet("3+ years", source, 4)).toBe(true);
    expect(keywordMet("Power BI", source, 10)).toBe(false);
  });

  it("경력 기간은 겹치는 달을 한 번만 세고 끝이 없으면 오늘까지다", () => {
    const at = new Date("2026-11-01T00:00:00Z");
    expect(mergedYears([
      { start: "2022-03-01", end: "2024-12-01" },
      { start: "2024-01-01", end: "2024-06-01" },
      { start: "2025-11-01", end: null },
    ], at)).toBeCloseTo(33 / 12 + 1);
    expect(mergedYears([], at)).toBe(0);
  });

  it("요건을 하나도 못 읽은 공고는 점수를 내지 않는다", () => {
    expect(
      calculateExplainableMatch(
        "11111111-1111-4111-8111-111111111111",
        { technologies: [], impacts: [], roles: [], conditions: [] },
        "기록이 아무리 많아도 대조할 요건이 없다",
        new Date("2026-08-09T00:00:00Z"),
      ),
    ).toBeNull();
  });
});
