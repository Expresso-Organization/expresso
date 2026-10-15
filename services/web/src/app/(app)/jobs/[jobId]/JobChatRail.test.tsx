// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEFT_MIN_WIDTH, MIN_WIDTH, useJobChatRail } from "./JobChatRail";

const media = (matches: boolean) => vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
const body = (width: number) => { const element = document.createElement("div"); Object.defineProperty(element, "clientWidth", { value: width }); return () => element; };
beforeEach(() => {
  // 이 실행 환경의 jsdom에는 localStorage가 없어, 기존 사이드바 테스트처럼 Map으로 대신한다.
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("공고 채팅 레일", () => {
  it("본문 옆에 설 때 저장한 접힘과 너비를 되살리고, 너비는 본문 폭 − 왼쪽 열 700px까지다", () => {
    vi.stubGlobal("matchMedia", media(true));
    localStorage.setItem("ex.jobChat.collapsed", "true");
    localStorage.setItem("ex.jobChat.width", "900");
    const { result } = renderHook(() => useJobChatRail(body(1200)));
    expect(result.current.docked).toBe(true);
    expect(result.current.collapsed).toBe(true);
    expect(result.current.max).toBe(1200 - LEFT_MIN_WIDTH);
    expect(result.current.width).toBe(500);
  });
  it("316px보다 좁힐 수 없고, 손을 뗄 때만 너비를 저장한다", () => {
    vi.stubGlobal("matchMedia", media(true));
    const { result } = renderHook(() => useJobChatRail(body(1400)));
    act(() => result.current.resize(200));
    expect(result.current.width).toBe(MIN_WIDTH);
    expect(localStorage.getItem("ex.jobChat.width")).toBeNull();
    act(() => result.current.commit(420));
    expect(result.current.width).toBe(420);
    expect(localStorage.getItem("ex.jobChat.width")).toBe("420");
    act(() => result.current.setCollapsed(true));
    expect(localStorage.getItem("ex.jobChat.collapsed")).toBe("true");
  });
  it("본문이 좁아 왼쪽 열을 지킬 수 없으면 316px에 머문다", () => {
    vi.stubGlobal("matchMedia", media(true));
    const { result } = renderHook(() => useJobChatRail(body(900)));
    expect(result.current.max).toBe(MIN_WIDTH);
    act(() => result.current.commit(600));
    expect(result.current.width).toBe(MIN_WIDTH);
  });
  it("본문 아래로 쌓이는 폭에서는 저장값을 적용하지 않는다", () => {
    vi.stubGlobal("matchMedia", media(false));
    localStorage.setItem("ex.jobChat.collapsed", "true");
    const { result } = renderHook(() => useJobChatRail(body(1000)));
    expect(result.current.docked).toBe(false);
    expect(result.current.collapsed).toBe(false);
  });
});
