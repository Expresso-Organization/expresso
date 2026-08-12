import { describe, expect, it } from "vitest";

import { inlineSizedClasses, unstyledClasses } from "./unstyled.js";

describe("규칙 없는 클래스", () => {
  it("변형만 쓰고 기반 클래스를 빠뜨린 것을 잡는다", () => {
    const html = `<span class="bar-fill bar-fill--final"></span><span class="ghost"></span>`;
    const css = `.bar-fill--final{background:#25f}`;

    expect(unstyledClasses(html, css)).toEqual(["bar-fill", "ghost"]);
  });

  it("규칙이 다 있으면 아무것도 안 나온다", () => {
    const html = `<header class="nav"><a class="nav__link is-active">요약</a></header>`;
    const css = `
      .nav{position:sticky;top:0}
      .nav__link{color:#333}
      .nav__link.is-active{font-weight:600}`;

    expect(unstyledClasses(html, css)).toEqual([]);
  });

  it("미디어 쿼리 안에만 있는 규칙도 규칙으로 친다", () => {
    const html = `<div class="only-wide">x</div>`;
    const css = `@media (min-width:768px){.only-wide{display:grid}}`;

    expect(unstyledClasses(html, css)).toEqual([]);
  });

  it("틀리면 놓치는 쪽으로 틀린다 — 멀쩡한 지면을 거절하지 않는다", () => {
    // 선언 안의 글자가 클래스처럼 보여도 있는 것으로 친다. 잘못 잡아 재생성을
    // 부르는 것보다 한 번 놓치는 편이 낫다.
    const html = `<div class="tile">x</div>`;
    const css = `.a{content:".tile"}`;

    expect(unstyledClasses(html, css)).toEqual([]);
  });
});

describe("inline 요소에 준 크기", () => {
  it("실제로 막대를 지웠던 그 실수를 잡는다", () => {
    // 트랙은 그리드 자식이라 블록으로 승격되어 살고, 그 안의 채우기는 손자라
    // inline 그대로 남는다 — height도 width도 먹지 않아 화면에서 사라졌다.
    const html = `<div class="row"><span class="track"><span class="fill" style="width:60%"></span></span></div>`;
    const css = `
      .row{display:grid;grid-template-columns:1fr auto}
      .track{height:26px;background:#eef;overflow:hidden}
      .fill{height:100%;min-width:6px;background:#25f}`;

    expect(inlineSizedClasses(html, css)).toEqual(["fill(<span>)"]);
  });

  it("display를 직접 줬으면 넘어간다", () => {
    const html = `<span class="fill"></span>`;
    const css = `.fill{display:block;height:26px;background:#25f}`;

    expect(inlineSizedClasses(html, css)).toEqual([]);
  });

  it("부모가 flex면 자식은 승격되므로 넘어간다", () => {
    const html = `<div class="row"><span class="fill"></span></div>`;
    const css = `.row{display:flex}.fill{height:26px;background:#25f}`;

    expect(inlineSizedClasses(html, css)).toEqual([]);
  });

  it("블록 태그에는 상관하지 않는다", () => {
    const html = `<div class="fill"></div>`;
    const css = `.fill{height:26px;background:#25f}`;

    expect(inlineSizedClasses(html, css)).toEqual([]);
  });
});

describe("헛짚지 않는다", () => {
  it("기반 클래스가 display를, 변형이 width를 주는 짜임", () => {
    // 실제 생성물에서 나온 모양. 이걸 잡으면 멀쩡한 지면 때문에 재생성이 돈다.
    const html = `<span class="cl-fill cl-fill-1"></span>`;
    const css = `.cl-fill{display:block;height:100%;background:#25f}.cl-fill-1{width:100%}`;

    expect(inlineSizedClasses(html, css)).toEqual([]);
  });
});
