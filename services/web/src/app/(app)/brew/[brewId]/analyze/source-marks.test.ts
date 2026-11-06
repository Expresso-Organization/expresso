import { describe, expect, it } from "vitest";

import { sourceLines, sourceSegments } from "./source-marks";

const joined = (text: string, spans: Parameters<typeof sourceSegments>[1]) =>
  sourceSegments(text, spans).map(({ text: part, id }) => [part, id]);

describe("sourceSegments", () => {
  it("표시 구간과 나머지를 순서대로 나눈다", () => {
    expect(joined("가나다라마", [{ id: "a", start: 1, end: 3 }])).toEqual([["가", null], ["나다", "a"], ["라마", null]]);
  });

  it("입력 순서와 상관없이 위치 순서로 놓는다", () => {
    expect(joined("abcdef", [{ id: "b", start: 4, end: 5 }, { id: "a", start: 0, end: 2 }]))
      .toEqual([["ab", "a"], ["cd", null], ["e", "b"], ["f", null]]);
  });

  it("겹치면 앞 구간이 이기고 완전히 덮인 구간은 사라진다", () => {
    expect(joined("abcdef", [{ id: "a", start: 0, end: 3 }, { id: "b", start: 2, end: 5 }, { id: "c", start: 1, end: 2 }]))
      .toEqual([["abc", "a"], ["de", "b"], ["f", null]]);
  });

  it("이모지가 있어도 코드 포인트로 자른다", () => {
    expect(joined("😀가나", [{ id: "a", start: 1, end: 2 }])).toEqual([["😀", null], ["가", "a"], ["나", null]]);
  });

  it("원문 밖으로 나간 구간은 원문 끝에서 멈춘다", () => {
    expect(joined("abc", [{ id: "a", start: 1, end: 9 }, { id: "b", start: 7, end: 9 }])).toEqual([["a", null], ["bc", "a"]]);
  });
});

describe("sourceLines", () => {
  const lines = (text: string, spans: Parameters<typeof sourceSegments>[1] = []) => sourceLines(sourceSegments(text, spans));

  it("Markdown 표시를 지우고 줄의 구조를 읽는다", () => {
    const result = lines("**자격** **요건**\n\n-   Python 경험\n    -   세부 항목\n1.  첫째\n본문 [링크](https://a.example) \\[참고\\]");
    expect(result.map(({ kind, depth, ordinal }) => [kind, depth, ordinal])).toEqual([
      ["heading", 0, null], ["blank", 0, null], ["item", 0, null], ["item", 1, null], ["item", 0, "1"], ["text", 0, null],
    ]);
    expect(result.map(({ parts }) => parts.map(({ text }) => text).join(""))).toEqual([
      "자격 요건", "", "Python 경험", "세부 항목", "첫째", "본문 링크 [참고]",
    ]);
  });

  it("지운 글자가 있어도 표시 구간은 그 문장에 남는다", () => {
    const text = "**제목**\n-   Python 경험";
    const start = Array.from(text).indexOf("P");
    const [, item] = lines(text, [{ id: "a", start, end: start + 6 }]);
    expect(item?.parts).toEqual([
      expect.objectContaining({ text: "Python", id: "a" }),
      expect.objectContaining({ text: " 경험", id: null }),
    ]);
  });

  it("구간이 목록 표시부터 시작해도 표시 글자만 남긴다", () => {
    const text = "-   Python 경험";
    const [item] = lines(text, [{ id: "a", start: 0, end: text.length }]);
    expect(item?.parts).toEqual([expect.objectContaining({ text: "Python 경험", id: "a" })]);
  });
});
