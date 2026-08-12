import { describe, expect, it } from "vitest";

import { calculateExplainableMatch } from "./match-score.js";
import { interpretSearchQuery } from "./search-parser.js";

describe("job search interpretation", () => {
  it("preserves editable high-confidence and low-confidence conditions", () => {
    expect(
      interpretSearchQuery("서울 3년 TypeScript 백엔드 remote 연봉 6000"),
    ).toEqual(expect.arrayContaining([
      { field: "role", value: "백엔드", enabled: true, confidence: 0.95 },
      { field: "experience", value: 3, enabled: true, confidence: 0.95 },
      { field: "work_type", value: "remote", enabled: true, confidence: 0.95 },
      { field: "location", value: "서울", enabled: true, confidence: 0.9 },
      { field: "technology", value: "typescript", enabled: true, confidence: 0.98 },
      { field: "salary", value: 6000, enabled: false, confidence: 0.65 },
    ]));
    expect(interpretSearchQuery("좋은 곳")).toEqual([]);
  });

  it("화면 정의서가 던지는 한국어 문장을 읽는다", () => {
    expect(
      interpretSearchQuery("리모트 되고 데이터 파이프라인 다루는 백엔드, 연봉 8천 이상"),
    ).toEqual(expect.arrayContaining([
      { field: "role", value: "백엔드", enabled: true, confidence: 0.95 },
      { field: "work_type", value: "remote", enabled: true, confidence: 0.95 },
      { field: "salary", value: 8_000, enabled: false, confidence: 0.65 },
    ]));
    // 짧은 이름이 다른 낱말 안에서 잡히면 안 된다 — django에는 go가 없다.
    expect(interpretSearchQuery("django 백엔드").map((c) => c.value))
      .not.toContain("go");
    expect(interpretSearchQuery("Airflow와 dbt 쓰는 팀")).toEqual(
      expect.arrayContaining([
        { field: "technology", value: "airflow", enabled: true, confidence: 0.98 },
        { field: "technology", value: "dbt", enabled: true, confidence: 0.98 },
      ]),
    );
  });
});

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
