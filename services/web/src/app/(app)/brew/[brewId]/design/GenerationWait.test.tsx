// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { GenerationWait, type WaitReading } from "./GenerationWait";
import { FEED_MOVE_MS, FEED_STEP_MS } from "./feed-steps";
import { BREWING_MS, brewingLeftMs, fakeProgress, RECIPE_WAIT_MS } from "./wait-timing";

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

/** 지면 위의 구역. */
const visible = () => screen.queryAllByRole("region");

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom에는 없다. 동작 줄이기 쪽으로 두면 전환과 흐름을 건너뛴다.
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  window.ResizeObserver = class { observe() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("생성 기다림 화면", () => {
  it("처음 10초는 브루잉만 서고, 그 뒤 아래에 입력 묶음이 올라온다", () => {
    render(<GenerationWait reading={reading} waitedMs={0} brewingLeftMs={BREWING_MS} actions={null} />);
    expect(visible()).toHaveLength(0);

    act(() => vi.advanceTimersByTime(BREWING_MS - 1));
    expect(visible()).toHaveLength(0);

    act(() => vi.advanceTimersByTime(1));
    expect(visible().map((group) => group.getAttribute("aria-label"))).toEqual(["채용 공고", "디자인", "섹션", "기록"]);
    expect(screen.getByText("React 실무 3년 이상")).toBeTruthy();
    expect(screen.getByText("필수")).toBeTruthy();
  });

  it("10초가 지난 뒤 다시 열면 처음부터 입력 묶음이 서 있다", () => {
    render(<GenerationWait reading={reading} waitedMs={0} brewingLeftMs={0} actions={null} />);
    expect(visible()).toHaveLength(4);
  });

  it("처음 10초는 잔 아래에서 읽는 입력을 짚고, 입력 묶음이 뜬 뒤에는 만드는 일을 적는다", () => {
    render(<GenerationWait reading={reading} waitedMs={0} brewingLeftMs={BREWING_MS} actions={null} />);
    expect(screen.getByText("사용자 기록 정리 중...")).toBeTruthy();
    expect(screen.getByText("채용 공고 분석 중...")).toBeTruthy();
    expect(screen.queryByText("포트폴리오 생성 중...")).toBeNull();

    act(() => vi.advanceTimersByTime(BREWING_MS));
    expect(screen.getByText("포트폴리오 생성 중...")).toBeTruthy();
    expect(screen.queryByText("사용자 기록 정리 중...")).toBeNull();
  });

  it("공고 없이 시작한 제작에서는 공고를 분석한다고 적지 않는다", () => {
    render(<GenerationWait reading={{ ...reading, posting: null }} waitedMs={0} brewingLeftMs={BREWING_MS} actions={null} />);
    expect(screen.queryByText("채용 공고 분석 중...")).toBeNull();
  });

  it("구성을 기다리는 동안에는 10초가 지나도 브루잉에 머물고 구성 문장을 돌린다", () => {
    const waiting = { ...reading, sections: [] };
    const { rerender } = render(<GenerationWait reading={waiting} waitedMs={0} brewingLeftMs={0} recipePending actions={null} />);
    expect(visible()).toHaveLength(0);
    expect(screen.getByText("고른 기록 읽는 중...")).toBeTruthy();
    act(() => vi.advanceTimersByTime(BREWING_MS * 3));
    expect(visible()).toHaveLength(0);

    // 구성이 끝나 다시 읽으면 지금처럼 지면으로 넘어간다.
    rerender(<GenerationWait reading={reading} waitedMs={0} brewingLeftMs={0} recipePending={false} actions={null} />);
    act(() => vi.advanceTimersByTime(0));
    expect(visible().map((group) => group.getAttribute("aria-label"))).toEqual(["채용 공고", "디자인", "섹션", "기록"]);
  });

  it("공고 없이 시작했거나 디자인을 못 찾았으면 그 구역만 빠진다", () => {
    render(<GenerationWait reading={{ ...reading, posting: null, design: null }} waitedMs={0} brewingLeftMs={0} actions={null} />);
    expect(visible().map((group) => group.getAttribute("aria-label"))).toEqual(["섹션", "기록"]);
  });

  /** 막대가 지금 찬 비율. */
  const filled = () => {
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    return Number(/scaleX\(([\d.]+)\)/.exec(fill.style.transform)?.[1]);
  };

  it("구성을 기다리는 동안 잔 아래 막대가 차오르되 끝에 닿지 않고, 다시 열면 지난 시간만큼 찬 자리에서 시작한다", () => {
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    const waiting = { ...reading, sections: [] };
    const { rerender } = render(<GenerationWait reading={waiting} waitedMs={60_000} brewingLeftMs={0} recipePending actions={null} />);
    const start = filled();
    expect(start).toBe(fakeProgress(60_000, RECIPE_WAIT_MS));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBeNull();

    act(() => vi.advanceTimersByTime(30_000));
    expect(filled()).toBeGreaterThan(start);
    act(() => vi.advanceTimersByTime(300_000));
    expect(filled()).toBeLessThan(1);

    // 구성이 끝나 섹션 정보가 뜨면 끝까지 차고 접힌다.
    rerender(<GenerationWait reading={reading} waitedMs={390_000} brewingLeftMs={0} recipePending={false} actions={null} />);
    act(() => vi.advanceTimersByTime(0));
    expect(filled()).toBe(1);
    expect(screen.getByRole("progressbar").hasAttribute("data-done")).toBe(true);
  });

  it("지면에 마지막 구역까지 올라오면 멈추고 비우지 않는다", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    render(<GenerationWait reading={reading} waitedMs={BREWING_MS} brewingLeftMs={0} actions={null} />);
    const feed = screen.getByLabelText("지면 설계에 들어가는 입력");
    const shown = () => feed.querySelectorAll("[data-feed-group][data-shown]").length;

    act(() => vi.advanceTimersByTime(0));
    expect(shown()).toBe(1);
    act(() => vi.advanceTimersByTime(FEED_STEP_MS * 3));
    expect(shown()).toBe(4);
    act(() => vi.advanceTimersByTime(FEED_STEP_MS));
    expect(feed.hasAttribute("data-settled")).toBe(true);

    act(() => vi.advanceTimersByTime(FEED_STEP_MS * 6 + FEED_MOVE_MS));
    expect(shown()).toBe(4);
  });

  it("쌓는 도중 사람이 스크롤하면 남은 구역을 모두 보이고 멈춘다", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    render(<GenerationWait reading={reading} waitedMs={BREWING_MS} brewingLeftMs={0} actions={null} />);
    const feed = screen.getByLabelText("지면 설계에 들어가는 입력");
    act(() => vi.advanceTimersByTime(0));

    act(() => {
      feed.scrollTop = 120;
      feed.dispatchEvent(new Event("scroll"));
    });
    expect(feed.querySelectorAll("[data-feed-group][data-shown]")).toHaveLength(4);
    expect(feed.hasAttribute("data-settled")).toBe(true);
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
