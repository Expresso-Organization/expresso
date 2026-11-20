import { describe, expect, it } from "vitest";

import { similarSearches } from "./similar-searches";

const search = (query: string, resultCount: number) => ({
  id: crypto.randomUUID(), query, resultCount, createdAt: "2026-11-14T00:00:00.000Z",
});

describe("비슷한 검색", () => {
  it("조합하다 만 글자와 0건 검색, 지금 검색은 권하지 않는다", () => {
    const recent = [search("ㄹ옹로", 3), search("서울 백엔드 신입", 12), search("없는검색", 0), search("지금", 5), search("판교 프론트엔드", 4)];
    expect(similarSearches(recent as never, "지금").map(({ query }) => query)).toEqual(["서울 백엔드 신입", "판교 프론트엔드"]);
  });
});
