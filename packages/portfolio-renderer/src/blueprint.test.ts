import { describe, expect, it } from "vitest";

import { blueprintHtml, blueprintToken } from "./blueprint.js";

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
