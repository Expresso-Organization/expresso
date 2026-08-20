import { describe, expect, it } from "vitest";

import { isOrdinalLabel, numbersIn, ungroundedNumbers } from "./numbers.js";

/**
 * 지어낸 수치를 잡는 자리.
 *
 * 여기가 헐거워지면 없는 성과가 지면에 실리고, 빡빡해지면 **멀쩡한 지면이
 * 통째로 다시 쓰인다.** 2026-08-14에 뒤엣것이 났다 — 세 판을 돌렸는데 여섯 번의
 * 거절 중 다섯 번이 오탐이었고, 매번 지면 한 장을 더 만들었다.
 */
describe("글에 적힌 수", () => {
  it("자릿점을 걷어내고 같은 값으로 본다", () => {
    expect(ungroundedNumbers("3,000만 원을 아꼈다", "3000만 원")).toEqual([]);
  });

  it("근거에 없는 수는 잡는다 — 이게 이 검사의 일이다", () => {
    expect(ungroundedNumbers("매출이 47% 늘었다", "매출이 늘었다")).toEqual(["47"]);
  });

  it("이메일 안의 숫자는 성과가 아니다", () => {
    // 실측: 연락처의 `3920`이 매 판 걸려 지면을 다시 쓰게 만들었다.
    expect(numbersIn("연락 libera3920@gmail.com")).toEqual([]);
    expect(ungroundedNumbers("libera3920@gmail.com", "")).toEqual([]);
  });

  it("주소 안의 숫자도 마찬가지다", () => {
    expect(numbersIn("https://example.com/2024/report?v=3")).toEqual([]);
  });

  it("이메일 옆의 진짜 수치는 그대로 잡는다", () => {
    expect(ungroundedNumbers("a1@b.com 으로 연락. 220분을 24분으로 줄였다", "220분"))
      .toEqual(["24"]);
  });

  it("0을 앞세운 번호는 세는 수가 아니다", () => {
    expect(isOrdinalLabel("01")).toBe(true);
    expect(isOrdinalLabel("007")).toBe(true);
    // 소수는 진짜 값이다. 여기까지 빼면 검사가 헐거워진다.
    expect(isOrdinalLabel("0.5")).toBe(false);
    expect(isOrdinalLabel("24")).toBe(false);
    expect(isOrdinalLabel("220")).toBe(false);
  });
});
