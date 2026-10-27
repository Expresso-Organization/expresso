// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GenerationWait, type WaitReading } from "./GenerationWait";
import { BREWING_MS, brewingLeftMs } from "./wait-timing";

const reading: WaitReading = {
  posting: {
    title: "프론트엔드 엔지니어",
    companyName: "토스",
    requirements: [{ label: "React 실무 3년 이상", kind: "must" }],
  },
  design: {
    code: "linear",
    name: "Linear",
    description: "어두운 바탕에 촘촘한 정보",
    traits: ["다크", "촘촘함"],
    preview: { canvas: "#08090A", text: "#F7F8F8", accent: "#5E6AD2", displayFamily: "Inter", displayFallback: "sans-serif", mark: null },
  },
  sections: [
    { id: "s1", title: "정산 배치 재설계", purpose: "대용량 처리 경험을 보인다", points: ["큐 단위 분할", "재시도"] },
    { id: "s2", title: "디자인 시스템", purpose: "협업 방식을 보인다", points: [] },
  ],
  records: [
    { recordId: "r1", title: "정산 스케줄러 재설계", categoryIcon: "briefcase", categoryName: "프로젝트", reason: "요건 3개와 겹칩니다" },
    { recordId: "r2", title: "사내 컴포넌트 정리", categoryIcon: "palette", categoryName: "경험", reason: "디자인 요건과 겹칩니다" },
  ],
};

/** 읽는 쪽에 보이는 첫 묶음. 끝없이 돌리려고 둔 두 번째 묶음은 읽는 쪽에서 감춘다. */
const visible = () => screen.queryAllByRole("region");

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom에는 없다. 동작 줄이기 쪽으로 두면 전환과 흐름을 건너뛴다.
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  window.ResizeObserver = class { observe() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("생성 기다림 화면", () => {
  it("처음 10초는 브루잉만 서고, 그 뒤 아래에 입력 묶음이 올라온다", () => {
    render(<GenerationWait reading={reading} brewingLeftMs={BREWING_MS} actions={null} />);
    expect(visible()).toHaveLength(0);

    act(() => vi.advanceTimersByTime(BREWING_MS - 1));
    expect(visible()).toHaveLength(0);

    act(() => vi.advanceTimersByTime(1));
    expect(visible().map((group) => group.getAttribute("aria-label"))).toEqual(["채용 공고", "디자인", "섹션", "기록"]);
    expect(screen.getAllByText("React 실무 3년 이상")).toHaveLength(2);
    expect(screen.getAllByText("필수")[0]).toBeTruthy();
  });

  it("10초가 지난 뒤 다시 열면 처음부터 입력 묶음이 서 있다", () => {
    render(<GenerationWait reading={reading} brewingLeftMs={0} actions={null} />);
    expect(visible()).toHaveLength(4);
  });

  it("처음 10초는 잔 아래에서 읽는 입력을 짚고, 입력 묶음이 뜬 뒤에는 만드는 일을 적는다", () => {
    render(<GenerationWait reading={reading} brewingLeftMs={BREWING_MS} actions={null} />);
    expect(screen.getByText("사용자 기록 정리 중...")).toBeTruthy();
    expect(screen.getByText("채용 공고 분석 중...")).toBeTruthy();
    expect(screen.queryByText("포트폴리오 생성 중...")).toBeNull();

    act(() => vi.advanceTimersByTime(BREWING_MS));
    expect(screen.getByText("포트폴리오 생성 중...")).toBeTruthy();
    expect(screen.queryByText("사용자 기록 정리 중...")).toBeNull();
  });

  it("공고 없이 시작한 제작에서는 공고를 분석한다고 적지 않는다", () => {
    render(<GenerationWait reading={{ ...reading, posting: null }} brewingLeftMs={BREWING_MS} actions={null} />);
    expect(screen.queryByText("채용 공고 분석 중...")).toBeNull();
  });

  it("공고 없이 시작했거나 디자인을 못 찾았으면 그 구역만 빠진다", () => {
    render(<GenerationWait reading={{ ...reading, posting: null, design: null }} brewingLeftMs={0} actions={null} />);
    expect(visible().map((group) => group.getAttribute("aria-label"))).toEqual(["섹션", "기록"]);
  });
});

describe("브루잉 남은 시간", () => {
  const started = "2026-10-27T03:00:00.000Z";
  const at = (seconds: number) => Date.parse(started) + seconds * 1000;

  it("잡을 만든 시각에서 잰다", () => {
    expect(brewingLeftMs(started, at(0))).toBe(BREWING_MS);
    expect(brewingLeftMs(started, at(4))).toBe(BREWING_MS - 4000);
    expect(brewingLeftMs(started, at(30))).toBe(0);
  });

  it("시계가 앞서도 10초를 넘지 않는다", () => {
    expect(brewingLeftMs(started, at(-5))).toBe(BREWING_MS);
  });
});
