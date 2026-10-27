import { describe, expect, it } from "vitest";

import { pageOutline } from "./outline.js";

describe("pageOutline", () => {
  it("takes top-level sections in document order with their first heading", () => {
    const outline = pageOutline(`<!doctype html><html><head><style>section{}</style></head><body>
      <header><h1>김지원</h1></header>
      <section><div><h2>협업과 <em>리드</em></h2><h3>무시</h3></div><section><h2>안쪽</h2></section></section>
      <section><p>제목 없음</p></section>
      <main><section><h3>  정산   파이프라인 &amp; 배치 </h3></section></main>
    </body></html>`);

    expect(outline.map(({ title }) => title)).toEqual(["협업과 리드", null, "정산 파이프라인 & 배치"]);
    expect(new Set(outline.map(({ id }) => id)).size).toBe(3);
  });

  it("names a section by the first heading anywhere inside it", () => {
    const outline = pageOutline("<section><section><h2>안쪽 제목</h2></section></section>");
    expect(outline).toHaveLength(1);
    expect(outline[0]!.title).toBe("안쪽 제목");
  });

  it("returns nothing for a page without sections and trims long titles", () => {
    expect(pageOutline("<main><h1>제목</h1></main>")).toEqual([]);
    expect(pageOutline(`<section><h2>${"가".repeat(120)}</h2></section>`)[0]!.title).toHaveLength(80);
  });
});
