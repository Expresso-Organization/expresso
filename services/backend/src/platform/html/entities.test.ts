import { describe, expect, it } from "vitest";

import { decodeHtmlEntities } from "./entities.js";

describe("HTML 문자 표기 풀기", () => {
  it("이름 표기를 푼다", () => {
    expect(decodeHtmlEntities("a&nbsp;b &lt;p&gt; &quot;x&quot; &apos;y&apos; R&amp;D")).toBe(`a b <p> "x" 'y' R&D`);
  });

  it("10진 · 16진 숫자 표기를 푼다 — 렌더러는 작은따옴표를 &#x27;로 낸다", () => {
    expect(decodeHtmlEntities("&#x27;모아 UI&#x27; &#39;a&#39; &#X41;")).toBe("'모아 UI' 'a' A");
  });

  it("한 번만 훑는다 — &amp;lt;는 &lt;까지만 풀린다", () => {
    expect(decodeHtmlEntities("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });

  it("모르는 이름과 범위를 벗어난 숫자 표기는 그대로 둔다", () => {
    expect(decodeHtmlEntities("&copy; &#xFFFFFFF; &#99999999; & 27")).toBe("&copy; &#xFFFFFFF; &#99999999; & 27");
  });
});
