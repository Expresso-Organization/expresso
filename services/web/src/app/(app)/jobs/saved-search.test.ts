import { describe, expect, it } from "vitest";

import { conditionsKey, isSavedSearch, savedSearchQuery } from "./saved-search";

const typescript = { field: "technology" as const, value: "TypeScript", enabled: true, confidence: 0.9 };
const seoul = { field: "location" as const, value: "서울", enabled: true, confidence: 1 };
const saved = {
  id: "8d6f6e0e-9a1c-4c0f-8f43-6a0f6d8f3b11",
  name: "서울 TypeScript",
  originalQuery: "서울 TypeScript",
  conditions: [typescript, seoul],
  notify: false,
  createdAt: "2026-11-14T00:00:00.000Z",
};

describe("저장한 검색", () => {
  it("순서와 확신도가 달라도 같은 조건이면 같은 검색이다", () => {
    expect(conditionsKey([seoul, { ...typescript, confidence: 1 }])).toBe(conditionsKey([typescript, seoul]));
    expect(isSavedSearch([saved], "서울 TypeScript", [seoul, typescript])).toBe(true);
  });

  it("태그를 바꾸거나 끄면 저장하지 않은 검색이다", () => {
    // Discord #issue 11-12: 태그를 바꿔도 「저장한 검색」으로 남아 바꾸기 전 조건만 저장돼 있었다.
    expect(isSavedSearch([saved], "서울 TypeScript", [typescript, { ...seoul, value: "부산" }])).toBe(false);
    expect(isSavedSearch([saved], "서울 TypeScript", [typescript, { ...seoul, enabled: false }])).toBe(false);
  });

  it("다시 여는 주소는 켠 조건의 값과 끈 조건의 off를 칩 파라미터로 적는다", () => {
    expect(savedSearchQuery({
      originalQuery: "서울 백엔드",
      conditions: [
        { field: "role", value: "backend", enabled: true, confidence: 1 },
        { field: "location", value: "서울", enabled: false, confidence: 1 },
        { field: "salary", value: 5000, enabled: true, confidence: 1 },
      ],
    })).toEqual({ q: "서울 백엔드", family: "backend", location: "off" });
  });
});
