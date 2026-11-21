import { describe, expect, it } from "vitest";

import { optionKey } from "./select-options.js";

describe("선택지 이름 비교 키", () => {
  it("표기만 다른 이름은 같은 키다", () => {
    expect(optionKey("재시도·타임아웃 정책 설계")).toBe(optionKey("재시도/타임아웃 정책 설계"));
    expect(optionKey("API 설계 (REST)")).toBe(optionKey("api 설계 rest"));
    expect(optionKey("로그-기반 추적")).toBe(optionKey("로그 기반 추적"));
  });

  it("글자가 다르면 다른 키다", () => {
    expect(optionKey("API 설계")).not.toBe(optionKey("API 구현"));
    expect(optionKey("동시성 제어")).not.toBe(optionKey("동시성 문제 이해"));
  });

  it("기호만 있는 이름은 빈 키다", () => {
    expect(optionKey(" · / ")).toBe("");
  });
});
