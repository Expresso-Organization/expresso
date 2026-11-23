import { describe, expect, it } from "vitest";
import { verifiedQuote } from "./quote.js";

describe("근거 원문 검증", () => {
  const record = { recordId: "r", title: "제목", bodyMd: "🙂 배포를 자동화했다.", properties: { 기술: ["Python", "SQL"] } };
  it("Unicode 위치와 속성 원문을 검증한다", () => {
    const quote = { source: "bodyMd" as const, start: 2, end: 12, text: "배포를 자동화했다." };
    expect(verifiedQuote(record, quote)).toEqual(quote);
    const property = { source: "property" as const, propertyKey: "기술", start: 0, end: 16, text: '["Python","SQL"]' };
    expect(verifiedQuote(record, property)).toEqual(property);
  });
  it("조작된 문장과 범위 및 없는 속성은 제외한다", () => {
    expect(verifiedQuote(record, { source: "bodyMd", start: 0, end: 5, text: "거짓 근거" })).toBeUndefined();
    expect(verifiedQuote(record, { source: "property", propertyKey: "없음", start: 0, end: 1, text: "x" })).toBeUndefined();
  });
});
