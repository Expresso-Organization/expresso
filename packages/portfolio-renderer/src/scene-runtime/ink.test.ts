import { describe, expect, it } from "vitest";
import { cssColor, inkMix, parseHex, unitColor } from "./ink.js";
import { pixelRatioFor } from "./host.js";

describe("장면 색", () => {
  it("모든 색이 바탕과 잉크 사이에 있고, 비율은 0–1로 자른다", () => {
    const background = parseHex("#0b1220")!;
    const ink = parseHex("#3d5a7a")!;
    for (const amount of [-1, 0, 0.13, 0.5, 0.99, 1, 3, Number.NaN]) {
      const color = inkMix(background, ink, amount);
      for (const channel of [0, 1, 2]) {
        expect(color[channel]).toBeGreaterThanOrEqual(Math.min(background[channel]!, ink[channel]!));
        expect(color[channel]).toBeLessThanOrEqual(Math.max(background[channel]!, ink[channel]!));
      }
    }
    expect(inkMix(background, ink, 0)).toEqual(background);
    expect(inkMix(background, ink, 5)).toEqual(ink);
    expect(cssColor(parseHex("#ff0080")!)).toBe("rgb(255,0,128)");
    expect(unitColor(parseHex("#ff0000")!)).toEqual([1, 0, 0]);
    expect(parseHex("var(--x)")).toBeNull();
  });

  it("휴대폰 폭에서는 픽셀 배율을 1.5, 넓은 화면에서는 2로 자른다", () => {
    expect(pixelRatioFor(390, 3)).toBe(1.5);
    expect(pixelRatioFor(1440, 3)).toBe(2);
    expect(pixelRatioFor(1440, 1)).toBe(1);
  });
});
