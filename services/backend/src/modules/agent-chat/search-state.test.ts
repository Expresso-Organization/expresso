import { describe, expect, it } from "vitest";
import { mergeSearch, searchConditions, searchLocations } from "./search-state.js";

describe("대화 검색 조건", () => {
  it("추가 조건에도 국내 범위와 경력·기술을 유지한다", () => {
    const first = mergeSearch(undefined, { families: ["데이터"], locations: ["판교"], locationMode: "prefer", experience: 0, technology: "Python", limit: 5 });
    const expanded = mergeSearch(first, { families: ["데이터", "ML"], locations: ["판교", "강남", "성수"], limit: 5 });
    expect(expanded).toMatchObject({ country: "한국", experience: 0, technology: "Python", locationMode: "prefer", families: ["데이터", "ML"], locations: ["판교", "강남", "성수"] });
    expect(searchConditions(expanded)).toContain("판교 · 강남 · 성수 우선");
  });
  it("모델이 대한민국을 보내도 한국 검색을 유지한다", () => {
    expect(mergeSearch(undefined, { country: "대한민국", locations: ["판교"], locationMode: "prefer", limit: 5 }).country).toBe("한국");
    expect(mergeSearch({ country: "대한민국", locations: ["판교"], limit: 5 }, { locations: ["판교", "강남", "성수"], limit: 5 }).country).toBe("한국");
  });
  it("예전 복합 지역 문자열을 개별 장소로 해석한다", () => {
    expect(new Set(searchLocations({ location: "강남 성수 판교", limit: 5 }))).toEqual(new Set(["강남", "성수", "판교"]));
  });
  it("명시적 새 검색은 이전 지역과 기술을 버린다", () => {
    expect(mergeSearch({ locations: ["판교"], technology: "Python", limit: 5 }, { reset: true, country: "미국", limit: 5 })).toEqual({ country: "미국", limit: 5 });
  });
});
