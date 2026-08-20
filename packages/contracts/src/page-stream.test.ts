import { describe, expect, it } from "vitest";

import { partialFields, renderableHtml } from "./page-stream.js";

/**
 * 부분 JSON 읽기.
 *
 * 여기서 다루는 입력은 전부 **실제로 오는 모양**이다 — 조각이 어디서 끊기는지는
 * 우리가 못 고른다. 이스케이프 한가운데서 끊긴 버퍼가 화면을 깨뜨리는 것이
 * 이 경로의 유일하게 무서운 실패라 그 자리를 먼저 적는다.
 */
describe("partialFields", () => {
  it("완성된 JSON은 그대로 읽는다", () => {
    expect(partialFields('{"css":"body{margin:0}","html":"<p>안녕</p>","rationale":"짧게"}'))
      .toEqual({ css: "body{margin:0}", html: "<p>안녕</p>", rationale: "짧게" });
  });

  it("값 한가운데서 끊겨도 거기까지 준다", () => {
    expect(partialFields('{"css":"body{margin:0}","html":"<section class='))
      .toEqual({ css: "body{margin:0}", html: "<section class=" });
  });

  it("이스케이프를 글자로 되돌린다", () => {
    expect(partialFields('{"html":"<p class=\\"a\\">\\n줄"}'))
      .toEqual({ html: '<p class="a">\n줄' });
  });

  it("역슬래시 바로 뒤에서 끊기면 그 이스케이프를 버린다", () => {
    // `\` 하나만 온 상태 — 다음 글자가 `n`인지 `"`인지 아직 모른다.
    expect(partialFields('{"html":"<p>줄\\')).toEqual({ html: "<p>줄" });
  });

  it("유니코드 이스케이프가 모자라면 버린다", () => {
    expect(partialFields('{"html":"a\\u00')).toEqual({ html: "a" });
    expect(partialFields('{"html":"a\\u0041"}')).toEqual({ html: "aA" });
  });

  it("값 안에 적힌 키 이름에 속지 않는다", () => {
    // CSS가 `content:"html"`을 쓰는 것은 얼마든지 있는 일이다.
    expect(partialFields('{"css":"a::after{content:\\"html\\"}","html":"<p>진짜"}'))
      .toEqual({ css: 'a::after{content:"html"}', html: "<p>진짜" });
  });

  it("키가 끊긴 채 끝나면 그 필드는 없는 것이다", () => {
    expect(partialFields('{"css":"x","ht')).toEqual({ css: "x" });
  });

  it("아직 아무것도 안 왔으면 빈 것을 준다", () => {
    expect(partialFields("")).toEqual({});
    expect(partialFields("{")).toEqual({});
    expect(partialFields('{"')).toEqual({});
  });

  it("조각을 어디서 끊어도 같은 지점까지 읽는다", () => {
    const whole = '{"css":"body{margin:0}\\n.hero{padding:4rem}","html":"<section class=\\"hero\\"><h1>박민재</h1></section>","rationale":"수치를 앞세웠다"}';
    for (let cut = 1; cut <= whole.length; cut += 1) {
      const partial = partialFields(whole.slice(0, cut));
      const full = partialFields(whole);
      for (const [key, value] of Object.entries(partial)) {
        expect(full[key]?.startsWith(value), `${key} at ${cut}: ${JSON.stringify(value)}`).toBe(true);
      }
    }
    expect(partialFields(whole).rationale).toBe("수치를 앞세웠다");
  });
});

describe("renderableHtml", () => {
  it("태그 한가운데면 그 앞까지만 남긴다", () => {
    expect(renderableHtml('<section><h1>박민재</h1><div class="me'))
      .toBe("<section><h1>박민재</h1>");
  });

  it("태그가 닫혀 있으면 그대로 둔다", () => {
    expect(renderableHtml("<section><h1>박민재</h1>")).toBe("<section><h1>박민재</h1>");
  });

  it("태그 밖의 글자는 자르지 않는다", () => {
    expect(renderableHtml("<p>쓰는 중인 문장")).toBe("<p>쓰는 중인 문장");
  });

  it("빈 것은 빈 것이다", () => {
    expect(renderableHtml("")).toBe("");
  });
});
