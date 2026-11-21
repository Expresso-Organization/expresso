import { describe, expect, it } from "vitest";

import { DESIGN_TARGET_MAX_COUNT, DESIGN_TARGET_MAX_LENGTH, DesignCardSchema } from "@expresso/contracts";

import { closedFinds, cssRules, editingTargets, revisedTargets } from "./targets.js";

const snippet = {
  html: '<header class="ds-hero"><section class="ds-chart"><h2>지연</h2><svg class="ds-svg" viewBox="0 0 9 4"><rect x="0" rx="3"></rect><text>18ms</text><rect x="1" rx="3"></rect></svg></section><div class="ds-name"><h1>배준호</h1><p>ML 리서치 엔지니어</p></div></header>',
  css: [
    ".ds-hero{display:grid;color:#1B2433}",
    ".ds-name h1{margin:0;font-size:104px}",
    ".ds-name h1:hover,.ds-name p::before{color:#6B2FB5}",
    "@keyframes ds-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}",
    "@media (max-width:820px){.ds-name h1{font-size:72px}}",
  ].join(""),
};

describe("CSS 규칙 읽기", () => {
  it("스타일 규칙의 선택자만 읽고 @keyframes는 건너뛰며 @media 안으로 들어간다", () => {
    expect(cssRules(snippet.css).map((rule) => rule.selector)).toEqual([".ds-hero", ".ds-name h1", ".ds-name h1:hover,.ds-name p::before", ".ds-name h1"]);
  });

  it("문자열과 주석 속의 중괄호에 속지 않는다", () => {
    expect(cssRules('/* a{b} */.a::after{content:"}"}.b{color:red}').map((rule) => rule.selector)).toEqual([".a::after", ".b"]);
  });
});

describe("고치는 중의 자리", () => {
  it("CSS 조각은 그 글자가 든 규칙의 선택자가 된다", () => {
    expect(editingTargets(snippet, [{ in: "css", find: "font-size:104px" }])).toEqual([".ds-name h1"]);
  });

  it("같은 글자가 여러 규칙에 있으면 모두 잡고, 상태와 가상 요소는 떼어 낸다", () => {
    expect(editingTargets(snippet, [{ in: "css", find: "#6B2FB5" }])).toEqual([".ds-name h1", ".ds-name p"]);
    expect(editingTargets(snippet, [{ in: "css", find: "font-size" }])).toEqual([".ds-name h1"]);
  });

  it("요소를 고르지 않는 규칙 안의 글자는 자리가 없다", () => {
    expect(editingTargets(snippet, [{ in: "css", find: "scaleX(0)" }])).toEqual([]);
  });

  it("마크업 조각은 그 글자를 감싼 가장 안쪽 요소의 순서 경로가 된다", () => {
    expect(editingTargets(snippet, [{ in: "html", find: "배준호" }])).toEqual(["body > :nth-child(1) > :nth-child(2) > :nth-child(1)"]);
    // 속성 값은 그 태그의 요소다.
    expect(editingTargets(snippet, [{ in: "html", find: 'class="ds-name"' }])).toEqual(["body > :nth-child(1) > :nth-child(2)"]);
  });

  it("svg 안의 자리는 그 svg 하나로 모인다", () => {
    const chart = "body > :nth-child(1) > :nth-child(1) > :nth-child(2)";
    expect(editingTargets(snippet, [{ in: "html", find: 'rx="3"' }])).toEqual([chart]);
    expect(editingTargets(snippet, [{ in: "html", find: '<rect x="0"' }, { in: "html", find: "18ms" }, { in: "html", find: '<rect x="1"' }])).toEqual([chart]);
  });

  it("여러 요소에 걸친 글자는 그것들을 감싼 요소다", () => {
    expect(editingTargets(snippet, [{ in: "html", find: "</h1><p>ML" }])).toEqual(["body > :nth-child(1) > :nth-child(2)"]);
  });

  it("자리가 많으면 모두를 감싼 요소 하나로 묶는다", () => {
    const many = { css: "", html: `<ul>${"<li>가</li>".repeat(20)}</ul>` };
    expect(editingTargets(many, [{ in: "html", find: "가" }])).toEqual(["body > :nth-child(1)"]);
  });

  it("깊은 마크업과 많은 규칙에서도 계약의 길이와 개수 상한 안에 든다", () => {
    const deep = { css: Array.from({ length: 80 }, (_, index) => `.rule-${index}{color:red}`).join(""), html: `${"<div>".repeat(40)}가${"</div>".repeat(40)}` };
    const targets = editingTargets(deep, [{ in: "html", find: "가" }, { in: "css", find: "color:red" }]);
    // 깊은 요소는 상한에 드는 바깥 요소까지만 적는다.
    expect(targets[0]).toMatch(/^body( > :nth-child\(1\))+$/);
    expect(targets.every((target) => target.length <= DESIGN_TARGET_MAX_LENGTH)).toBe(true);
    expect(targets).toHaveLength(DESIGN_TARGET_MAX_COUNT);
    // 대화 계약으로 읽힌다.
    const item = { id: "00000000-0000-4000-8000-000000000001", name: "가", words: "", tokens: { background: "#ffffff", text: "#000000", accent: "#ff0000", font: "sans", density: "comfortable" }, layout: null, status: "drawing", snippetId: null };
    expect(DesignCardSchema.safeParse({ kind: "revision", fromSnippetId: item.id, item, targets }).success).toBe(true);
  });

  it("지금 첫 화면에 없는 글자는 건너뛴다", () => {
    expect(editingTargets(snippet, [{ in: "css", find: "없는 글자" }, { in: "html", find: "없는 글자" }])).toEqual([]);
  });

  it("규칙을 끊을 수 있는 글자가 든 선택자는 싣지 않는다", () => {
    expect(editingTargets({ html: "", css: ".a\\}b{color:red}.c{color:red}" }, [{ in: "css", find: "color:red" }])).toEqual([".c"]);
  });
});

describe("고친 뒤의 자리", () => {
  it("바꿔 넣은 글자가 놓인 규칙과 요소를 고친 첫 화면에서 잡는다", () => {
    expect(revisedTargets(snippet, [
      { in: "css", find: "font-size:104px", replace: "font-size:88px" },
      { in: "html", find: 'rx="3"', replace: 'rx="30"' },
    ])).toEqual(["body > :nth-child(1) > :nth-child(1) > :nth-child(2)", ".ds-name h1"]);
  });

  it("규칙 끝에 이어 붙인 새 규칙도 잡는다", () => {
    expect(revisedTargets(snippet, [{ in: "css", find: "font-size:104px}", replace: "font-size:104px}.ds-svg rect{rx:30px}" }])).toEqual([".ds-name h1", ".ds-svg rect"]);
  });

  it("뒤 조각이 앞을 밀어도 앞에서 바꾼 자리를 따라간다", () => {
    expect(revisedTargets(snippet, [
      { in: "html", find: "배준호", replace: "배 준 호" },
      { in: "html", find: "<h2>지연</h2>", replace: "<h2>p99 지연 시간</h2><p>목표 30ms</p>" },
    ])).toEqual(["body > :nth-child(1) > :nth-child(2) > :nth-child(1)", "body > :nth-child(1) > :nth-child(1)"]);
  });

  it("지운 자리는 그 자리를 감싼 요소다", () => {
    expect(revisedTargets(snippet, [{ in: "html", find: "<p>ML 리서치 엔지니어</p>", replace: "" }])).toEqual(["body > :nth-child(1) > :nth-child(2)"]);
  });
});

describe("쓰는 중인 출력 읽기", () => {
  const output = JSON.stringify({ name: "둥근 막대", tokens: { accent: "#6B2FB5" }, edits: [{ in: "html", find: 'rx="3"', replace: 'rx="30"' }, { in: "css", find: "font-size:104px", replace: "font-size:88px" }] });

  it("「지금 있는 글자」가 닫힌 조각만 낸다", () => {
    const first = output.indexOf('"replace"');
    expect(closedFinds(output.slice(0, first - 4))).toEqual([]);
    expect(closedFinds(output.slice(0, first))).toEqual([{ in: "html", find: 'rx="3"' }]);
    expect(closedFinds(output)).toEqual([{ in: "html", find: 'rx="3"' }, { in: "css", find: "font-size:104px" }]);
  });

  it("어느 자리에서 끊겨도 던지지 않는다", () => {
    for (let end = 0; end <= output.length; end += 1) expect(() => closedFinds(output.slice(0, end))).not.toThrow();
  });
});
