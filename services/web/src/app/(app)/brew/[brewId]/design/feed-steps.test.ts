import { describe, expect, it } from "vitest";

import { cubicBezier, feedSnaps, nextSnap, parseCubicBezier } from "./feed-steps";

describe("입력 묶음이 멈출 자리", () => {
  it("구역마다 한 번 멈춘다", () => {
    const groups = [
      { top: 0, rows: [{ top: 30, bottom: 200 }] },
      { top: 240, rows: [{ top: 270, bottom: 420 }] },
    ];
    expect(feedSnaps(groups, 500)).toEqual([0, 240]);
  });

  it("구역이 칸보다 길면 끝까지 안 보이던 줄에서 한 번 더 멈춘다", () => {
    const groups = [
      { top: 0, rows: [{ top: 30, bottom: 280 }, { top: 290, bottom: 540 }, { top: 550, bottom: 800 }] },
      { top: 840, rows: [{ top: 870, bottom: 1000 }] },
    ];
    // 칸 400px: 0에서는 280까지 보인다. 290 줄은 540까지라 290에서 멈추고, 그러면 690까지 보여 550 줄이 다시 걸린다.
    expect(feedSnaps(groups, 400)).toEqual([0, 290, 550, 840]);
  });

  it("마지막 자리를 지나면 다음 벌의 처음으로 간다", () => {
    expect(nextSnap([0, 240, 600], 0, 900)).toBe(240);
    expect(nextSnap([0, 240, 600], 600, 900)).toBe(900);
  });
});

describe("한 칸 움직이는 곡선", () => {
  it("토큰에서 곡선을 꺼낸다", () => {
    expect(parseCubicBezier("200ms cubic-bezier(0.34, 1.4, 0.64, 1)")).toEqual([0.34, 1.4, 0.64, 1]);
    expect(parseCubicBezier("ease")).toBeNull();
  });

  it("끝에서 목표를 조금 지나쳤다가 1에 앉는다", () => {
    const ease = cubicBezier(0.34, 1.4, 0.64, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map(ease))).toBeGreaterThan(1);
  });

  it("직선 곡선은 시간과 같은 비율로 간다", () => {
    expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 5);
  });
});
