import { describe, expect, it } from "vitest";

import { createPacer, HttpError } from "./adapter.js";

describe("붙는 세기 묶기", () => {
  it("요청 시작 시각을 줄 세운다 — 동시성만으로는 초당 횟수가 잡히지 않는다", async () => {
    const pace = createPacer(30);
    const started = Date.now();
    // 셋을 한꺼번에 던져도 시작은 0 · 30 · 60ms 로 갈린다.
    await Promise.all([pace(), pace(), pace()]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
  });

  it("간격이 지난 뒤의 요청은 기다리지 않는다", async () => {
    const pace = createPacer(10);
    await pace();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const started = Date.now();
    await pace();
    expect(Date.now() - started).toBeLessThan(10);
  });
});

describe("역압 구분", () => {
  it("상대가 밀어내는 응답만 역압으로 본다", () => {
    expect(new HttpError(429).isBackpressure).toBe(true);
    expect(new HttpError(503).isBackpressure).toBe(true);
    expect(new HttpError(404).isBackpressure).toBe(false);
    expect(new HttpError(500).isBackpressure).toBe(false);
  });

  it("Retry-After 를 초로 읽는다", () => {
    expect(new HttpError(429, 60_000).retryAfterMs).toBe(60_000);
  });
});
