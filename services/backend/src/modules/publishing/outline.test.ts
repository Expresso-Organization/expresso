import { describe, expect, it } from "vitest";

import { pageOutline } from "./outline.js";

const PORTFOLIO = "8a1c5b52-5d7e-4a8f-9c1d-2b3e4f5a6b7c";

describe("pageOutline", () => {
  it("takes top-level sections in document order with their first heading", () => {
    const outline = pageOutline(`<!doctype html><html><head><style>section{}</style></head><body>
      <header><h1>김지원</h1></header>
      <section><div><h2>협업과 <em>리드</em></h2><h3>무시</h3></div><section><h2>안쪽</h2></section></section>
      <section><p>제목 없음</p></section>
      <main><section><h3>  정산   파이프라인 &amp; 배치 </h3></section></main>
    </body></html>`, PORTFOLIO);

    expect(outline.map(({ title }) => title)).toEqual(["협업과 리드", null, "정산 파이프라인 & 배치"]);
    expect(new Set(outline.map(({ id }) => id)).size).toBe(3);
  });

  it("names a section by the first heading anywhere inside it", () => {
    const outline = pageOutline("<section><section><h2>안쪽 제목</h2></section></section>", PORTFOLIO);
    expect(outline).toHaveLength(1);
    expect(outline[0]!.title).toBe("안쪽 제목");
  });

  it("returns nothing for a page without sections and trims long titles", () => {
    expect(pageOutline("<main><h1>제목</h1></main>", PORTFOLIO)).toEqual([]);
    expect(pageOutline(`<section><h2>${"가".repeat(120)}</h2></section>`, PORTFOLIO)[0]!.title).toHaveLength(80);
  });

  it("keeps a section's id across deployments while its place and title stay", () => {
    const before = pageOutline("<section><h2>경력</h2></section><section><h2>근거</h2></section>", PORTFOLIO);
    const after = pageOutline("<section><h2>경력</h2></section><section><h2>근거 자료</h2></section>", PORTFOLIO);
    expect(after[0]!.id).toBe(before[0]!.id);
    expect(after[1]!.id).not.toBe(before[1]!.id);
    expect(pageOutline("<section><h2>경력</h2></section>", "0b9f3a3e-1111-4222-8333-944455556666")[0]!.id).not.toBe(before[0]!.id);
    expect(before[0]!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
