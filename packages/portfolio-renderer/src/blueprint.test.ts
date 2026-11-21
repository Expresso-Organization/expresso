import { describe, expect, it } from "vitest";

import { BLUEPRINT_CSS, blueprintHtml, blueprintToken, snippetEditingCss, snippetRevisedCss } from "./blueprint.js";

describe("청사진 글 자리", () => {
  const slots = [
    { path: "/profile/headline", chars: 8 },
    { path: "/sections/a/title", chars: 5 },
  ];

  it("글 속 표지는 자리 요소가 되고 속성값 속 표지는 지워진다", () => {
    const html = `<header><p class="xp-headline">${blueprintToken(0)}.</p><img alt="${blueprintToken(1)}" src="/a.png"><h2>${blueprintToken(1)}</h2></header>`;
    expect(blueprintHtml(html, slots)).toBe(
      '<header><p class="xp-headline"><span class="xp-slot" data-slot="/profile/headline" data-slot-state="empty">가나다 가나다</span></p>'
        + '<img alt="" src="/a.png"><h2><span class="xp-slot" data-slot="/sections/a/title" data-slot-state="empty">가나다 가</span></h2></header>',
    );
  });

  it("모르는 번호의 표지는 지운다", () => {
    expect(blueprintHtml(`<p>${blueprintToken(9)}</p>`, slots)).toBe("<p></p>");
  });
});

describe("고치는 중인 첫 화면의 청사진", () => {
  const colors = { accent: "#6B2FB5", text: "#1B2433" };

  it("바뀌는 자리가 없으면 아무것도 더하지 않는다", () => {
    expect(snippetEditingCss([], colors)).toBe("");
    expect(snippetRevisedCss([], colors, 1)).toBe("");
  });

  it("자리가 SVG 도형이면 그 도형이 든 svg를 블록으로 잡는다", () => {
    const css = snippetEditingCss([".ds-svg rect", ".ds-name h1"], colors);
    expect(css).toContain(":is(:is(.ds-svg rect,.ds-name h1):not(svg *),svg:has(:is(.ds-svg rect,.ds-name h1)))");
  });

  it("생성 미리보기의 청사진과 같은 값을 쓴다", () => {
    const css = snippetEditingCss([".a"], colors);
    // 선 색 · 점선 · 격자 · 띠의 비율과 크기, 띠가 지나는 시간이 같다.
    for (const [mine, theirs] of [
      ["color-mix(in srgb,#6B2FB5 70%,#1B2433)", "color-mix(in srgb,var(--accent) 70%,var(--text))"],
      ["color-mix(in srgb,#6B2FB5 40%,transparent)", "color-mix(in srgb,var(--accent) 40%,transparent)"],
      ["color-mix(in srgb,#6B2FB5 10%,transparent)", "color-mix(in srgb,var(--accent) 10%,transparent)"],
      ["color-mix(in srgb,#1B2433 20%,transparent)", "color-mix(in srgb,var(--text) 20%,transparent)"],
      ["outline-offset:6px", "outline-offset:6px"],
      ["24px 24px", "background-size:24px 24px"],
      ["1.6s linear infinite", "1.6s linear infinite"],
    ] as const) {
      expect(css).toContain(mine);
      expect(BLUEPRINT_CSS).toContain(theirs);
    }
    const revised = snippetRevisedCss([".a"], colors, 1.08);
    expect(revised).toContain("--xp-edit-rise:0.15;--xp-edit-wash:28%");
    expect(BLUEPRINT_CSS).toContain("opacity:.15;background-color:color-mix(in srgb,var(--accent) 28%,transparent)");
  });

  it("요소의 animation을 덮어쓰지 않고 문서 루트에서만 움직인다", () => {
    for (const css of [snippetEditingCss([".a"], colors), snippetRevisedCss([".a"], colors, 1.08)]) {
      const animated = [...css.matchAll(/([^{}]+)\{[^{}]*\banimation:/g)].map((match) => match[1]!.trim());
      expect(animated.every((selector) => selector === ":root")).toBe(true);
      expect(css).toContain("prefers-reduced-motion:reduce");
    }
  });
});
