import { describe, expect, it } from "vitest";

import { PageSanitizeError, sanitizeCss, sanitizePage } from "./sanitize.js";

/**
 * 소독기의 시험.
 *
 * 여기 적힌 공격 모양은 **모델이 악의로 쓰는 것**을 가정하지 않는다. 근거에
 * 섞여 들어온 것을 모델이 성실히 옮기는 경우를 가정한다 — 그쪽이 훨씬 흔하고,
 * 막아야 하는 것은 결과가 같다.
 */

const clean = (html: string, css = "") => sanitizePage({ html, css });

describe("실행되는 것을 남기지 않는다", () => {
  it("script 태그가 사라진다", () => {
    const { html } = clean(`<p>안녕</p><script>alert(1)</script>`);
    expect(html).not.toContain("script");
    expect(html).toContain("안녕");
  });

  it("이벤트 속성이 사라진다", () => {
    const { html } = clean(`<div onclick="steal()" onmouseover="x()">글</div>`);
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onmouseover");
    expect(html).toContain("글");
  });

  it("깨진 img로 코드를 실행하려는 시도가 막힌다", () => {
    const { html } = clean(`<img src=x onerror="alert(1)">`);
    expect(html).not.toContain("onerror");
  });

  it("iframe · object · form이 사라진다", () => {
    const { html } = clean(`<iframe src="https://x"></iframe><object data="x"></object><form action="/y"><input name="pw"></form>`);
    for (const tag of ["iframe", "object", "form", "input"]) expect(html).not.toContain(`<${tag}`);
  });

  it("켜고 끄는 입력만 남고 글자를 받는 칸은 사라진다", () => {
    // `:has(:checked)`로 탭·필터·테마를 만들려면 토글이 필요하다. 코드가 아니라
    // 상태라 실행되는 것이 없다.
    const toggles = clean(
      `<input type="checkbox" id="d"><label for="d">다크</label>`
      + `<details><summary>더</summary><p>내용</p></details>`,
    );
    expect(toggles.html).toContain('type="checkbox"');
    expect(toggles.html).toContain("<details>");

    // 값을 받는 칸은 안 된다. 우리 도메인에 걸린 가짜 입력창이 더 잘 통한다.
    const entry = clean(`<input type="text" name="id"><input type="password" name="pw">`);
    expect(entry.html).not.toContain("<input");
    expect(entry.removed).toContain("input type=text");
    expect(entry.removed).toContain("input type=password");
  });

  it("javascript: 링크가 떨어진다", () => {
    const { html } = clean(`<a href="javascript:alert(1)">눌러</a>`);
    expect(html).not.toContain("javascript:");
    // 글은 남는다 — 링크만 죽는다.
    expect(html).toContain("눌러");
  });

  it("SVG 안의 script와 foreignObject가 사라진다", () => {
    const { html } = clean(
      `<svg viewBox="0 0 10 10"><script>alert(1)</script><foreignObject><div onclick="x()">x</div></foreignObject><circle cx="5" cy="5" r="4"/></svg>`,
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("foreignObject");
    expect(html).not.toContain("onclick");
    // 그림은 살아 있어야 한다.
    expect(html).toContain("<circle");
  });
});

describe("바깥을 부르지 않는다", () => {
  it("바깥 이미지 주소가 떨어진다", () => {
    const { html, removed } = clean(`<img src="https://tracker.example/pixel.gif" alt="x">`);
    expect(html).not.toContain("tracker.example");
    expect(removed.some((entry) => entry.includes("tracker.example"))).toBe(true);
  });

  it("우리 자산 주소는 그대로 남는다", () => {
    const { html, removed } = clean(
      `<img src="/v1/media/abc?w=640" srcset="/v1/media/abc?w=640 640w, /v1/media/abc?w=1280 1280w" alt="화면">`,
    );
    expect(html).toContain("/v1/media/abc?w=640");
    expect(html).toContain("srcset");
    expect(removed).toEqual([]);
  });

  it("srcset에 바깥이 하나라도 섞이면 통째로 떨어진다", () => {
    const { html } = clean(`<img src="/v1/media/a" srcset="/v1/media/a 640w, https://x/b 1280w">`);
    expect(html).not.toContain("srcset");
    // src는 우리 것이라 살아 있다.
    expect(html).toContain("/v1/media/a");
  });

  it("CSS의 바깥 url()이 none이 된다", () => {
    const { css, removed } = sanitizeCss(`.hero{background:url("https://evil.example/x.png") center}`);
    expect(css).toContain("none");
    expect(css).not.toContain("evil.example");
    expect(removed).toHaveLength(1);
  });

  it("인라인 style의 바깥 url()도 같이 막힌다", () => {
    const { html } = clean(`<div style="background:url(https://evil.example/x.png)">글</div>`);
    expect(html).not.toContain("evil.example");
    expect(html).toContain("글");
  });

  it("서체 스타일시트는 목록에 있는 호스트만 통과한다", () => {
    const ok = clean(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">`);
    expect(ok.html).toContain("fonts.googleapis.com");
    expect(ok.removed).toEqual([]);

    // 아무 호스트나 열면 스타일시트가 바깥으로 나가는 통로가 된다.
    const bad = clean(`<link rel="stylesheet" href="https://evil.example/x.css">`);
    expect(bad.html).not.toContain("evil.example");

    // 목록에 있는 호스트라도 rel이 다르면 문서를 끌어올 수 있다.
    const wrongRel = clean(`<link rel="import" href="https://fonts.googleapis.com/x">`);
    expect(wrongRel.html).not.toContain("fonts.googleapis.com");
  });

  it("@import는 거절한다", () => {
    expect(() => sanitizeCss(`@import url("https://fonts.googleapis.com/x");body{color:red}`))
      .toThrow(PageSanitizeError);
  });

  it("expression()은 거절한다", () => {
    expect(() => sanitizeCss(`.x{width:expression(alert(1))}`)).toThrow(PageSanitizeError);
  });

  it("옛 IE behavior 속성만 거절하고 표준 scroll-behavior는 허용한다", () => {
    expect(() => sanitizeCss(`.x{behavior:url(/v1/media/unsafe.htc)}`))
      .toThrow(PageSanitizeError);
    expect(sanitizeCss(`html{scroll-behavior:smooth}`).css)
      .toBe(`html{scroll-behavior:smooth}`);
    expect(clean(`<main style="scroll-behavior:smooth">글</main>`).html)
      .toContain(`style="scroll-behavior:smooth"`);
  });

  it("style을 닫고 나가려는 시도는 거절한다", () => {
    expect(() => sanitizeCss(`.x{}</style><script>alert(1)</script>`)).toThrow(PageSanitizeError);
  });
});

describe("지면은 살아남는다", () => {
  it("멀쩡한 지면은 한 글자도 안 지워진다", () => {
    const html = `
      <header class="nav"><span class="mark">결제 백엔드</span>
        <nav><a href="#work">한 일</a><a href="https://github.com/x" target="_blank">GitHub</a></nav>
      </header>
      <section id="work" class="grid">
        <p class="idx">01</p><h2>정산 배치 재설계</h2>
        <p>220분에서 <strong>24분</strong>으로 줄였습니다.</p>
        <ul><li><span>기간</span><span>2022.03–2026.02</span></li></ul>
        <svg viewBox="0 0 100 20"><rect x="0" y="0" width="80" height="8" rx="4" fill="#3182F6"/></svg>
        <table><tr><th scope="row">팀</th><td>6명</td></tr></table>
      </section>
      <footer><time datetime="2026-02">2026.02</time></footer>`;
    const css = `:root{--a:#3182F6}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:24px}
      .mark{font-family:var(--page-display)}@media (max-width:768px){.grid{grid-template-columns:1fr}}
      @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1}}`;
    const result = sanitizePage({ html, css });

    expect(result.removed).toEqual([]);
    expect(result.css).toBe(css);
    for (const keep of ["220분", "<strong>", "viewBox", "<rect", "scope=\"row\"", "datetime", "#work"]) {
      expect(result.html).toContain(keep);
    }
    // 바깥 링크에는 안전한 rel이 붙는다.
    expect(result.html).toContain("noopener");
  });

  it("허용 목록이 떨군 속성도 보고된다", () => {
    // 이게 안 되면 `removed`가 "없음"이라 말하는 동안 모델이 쓴 것이 사라진다.
    const { html, removed } = clean(`<p onclick="x()" data-ok="1" bogus="y">글</p>`, "p{color:red}");
    expect(html).toContain("data-ok");
    expect(removed).toContain("속성 onclick");
    expect(removed).toContain("속성 bogus");
  });

  it("모르는 태그를 써도 글은 남는다", () => {
    const { html } = clean(`<marquee><p>사라지면 안 되는 문장</p></marquee>`);
    expect(html).toContain("사라지면 안 되는 문장");
  });
});
