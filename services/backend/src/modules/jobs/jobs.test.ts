import { describe, expect, it } from "vitest";

import { calculateExplainableMatch } from "./match-score.js";

// 자연어 검색 해석은 이제 AI 계약(search-interpreter.ts)만 쓴다 — 규칙 기반
// interpretSearchQuery에 대한 테스트는 그 로직이 활성 경로에서 걷어나가며
// 함께 지웠다. AI 경로는 실제 프로바이더가 있어야 돌기 때문에 여기(단위
// 테스트)에서 재현하지 않는다.

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
