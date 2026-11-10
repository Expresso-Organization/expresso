import { describe, expect, it } from "vitest";

import { BREWING_MS, fakeProgress, RECIPE_WAIT_MS } from "./wait-timing";

describe("브루잉 진행 막대 값", () => {
  it("시간이 지나도 줄지 않고 끝에 닿지 않는다", () => {
    let previous = 0;
    for (let at = 0; at <= 600_000; at += 50) {
      const value = fakeProgress(at, RECIPE_WAIT_MS);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThan(1);
      previous = value;
    }
  });

  it("기준 시간쯤 0.8 언저리에 있다", () => {
    expect(fakeProgress(RECIPE_WAIT_MS, RECIPE_WAIT_MS)).toBeGreaterThan(0.78);
    expect(fakeProgress(RECIPE_WAIT_MS, RECIPE_WAIT_MS)).toBeLessThanOrEqual(0.8);
    expect(fakeProgress(BREWING_MS, BREWING_MS)).toBeGreaterThan(0.6);
  });

  it("구간마다 멈췄다가 차고, 구간 길이가 고르지 않다", () => {
    const changes: number[] = [];
    let previous = fakeProgress(0, RECIPE_WAIT_MS);
    for (let at = 0; at <= 30_000; at += 10) {
      const value = fakeProgress(at, RECIPE_WAIT_MS);
      if (value !== previous) changes.push(at);
      previous = value;
    }
    const gaps = changes.slice(1).map((at, index) => at - changes[index]!);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(300);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(800);
  });

  it("시각을 못 읽어 무한대여도 끝에 닿지 않고 끝난다", () => {
    expect(fakeProgress(Number.POSITIVE_INFINITY, RECIPE_WAIT_MS)).toBeLessThan(1);
  });

  it("같은 시각이면 같은 값이다", () => {
    expect(fakeProgress(42_000, RECIPE_WAIT_MS)).toBe(fakeProgress(42_000, RECIPE_WAIT_MS));
  });
});
