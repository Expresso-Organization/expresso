// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Next의 `useRouter`처럼 렌더마다 같은 객체를 준다.
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
const refresh = router.refresh;
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { REFRESH_MS } from "../use-refresh-while";
import { LivePreview } from "./LivePreview";

/** 브라우저의 EventSource 대신 — 연결 상태와 서버가 보낸 이벤트를 테스트가 정한다. */
class FakeSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static all: FakeSource[] = [];
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  onerror: (() => void) | null = null;
  readyState = FakeSource.CONNECTING;
  constructor(readonly url: string) { FakeSource.all.push(this); }
  addEventListener(name: string, listener: (event: MessageEvent<string>) => void) { this.listeners.set(name, listener); }
  close() { this.readyState = FakeSource.CLOSED; }
  emit(name: string, data: unknown = {}) { this.listeners.get(name)?.({ data: JSON.stringify(data) } as MessageEvent<string>); }
  /** 연결이 끊겼다. `retrying`이면 브라우저가 스스로 다시 붙는 중이다. */
  fail(retrying: boolean) {
    this.readyState = retrying ? FakeSource.CONNECTING : FakeSource.CLOSED;
    this.onerror?.();
  }
}

const jobId = "4de06ed4-e1e2-4025-a0db-a7d7e2911926";
const last = () => FakeSource.all.at(-1)!;

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockReset();
  FakeSource.all = [];
  vi.stubGlobal("EventSource", FakeSource);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("브라우저가 스트림을 닫아 버리면 잠시 뒤 같은 잡의 스트림을 다시 연다", () => {
  render(<LivePreview jobId={jobId} title="포트폴리오">기다림</LivePreview>);
  expect(FakeSource.all).toHaveLength(1);
  expect(last().url).toBe(`/api/generation-jobs/${jobId}/page-stream`);

  act(() => last().fail(false));
  act(() => { vi.advanceTimersByTime(REFRESH_MS - 1); });
  expect(FakeSource.all).toHaveLength(1);
  act(() => { vi.advanceTimersByTime(1); });
  expect(FakeSource.all).toHaveLength(2);
  expect(last().url).toBe(`/api/generation-jobs/${jobId}/page-stream`);
});

it("브라우저가 스스로 다시 붙는 중이면 새로 열지 않는다", () => {
  render(<LivePreview jobId={jobId} title="포트폴리오">기다림</LivePreview>);
  act(() => last().fail(true));
  act(() => { vi.advanceTimersByTime(REFRESH_MS * 3); });
  expect(FakeSource.all).toHaveLength(1);
});

it("화면으로 돌아왔을 때 연결이 닫혀 있으면 바로 다시 연다", () => {
  render(<LivePreview jobId={jobId} title="포트폴리오">기다림</LivePreview>);
  act(() => last().fail(false));
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(FakeSource.all).toHaveLength(2);
  // 기다리던 다시 열기는 지운다 — 연결이 둘이 되지 않는다.
  act(() => { vi.advanceTimersByTime(REFRESH_MS * 2); });
  expect(FakeSource.all).toHaveLength(2);
});

it("완성을 받으면 다시 열지 않고, 이 화면이 남아 있는 동안 서버 상태를 다시 읽는다", () => {
  render(<LivePreview jobId={jobId} title="포트폴리오">기다림</LivePreview>);
  const source = last();
  act(() => source.emit("done", { pageId: "p1" }));
  expect(source.readyState).toBe(FakeSource.CLOSED);
  expect(refresh).toHaveBeenCalledTimes(1);

  // 워커가 잡 상태를 아직 안 바꿔 서버가 생성 화면을 다시 그렸다. 다시 읽기를 이어 간다.
  act(() => { vi.advanceTimersByTime(REFRESH_MS * 2); });
  expect(refresh).toHaveBeenCalledTimes(3);
  act(() => source.fail(false));
  act(() => { vi.advanceTimersByTime(REFRESH_MS); });
  expect(FakeSource.all).toHaveLength(1);
});

it("실패를 받아도 서버가 실패 안내로 보낼 때까지 다시 읽는다", () => {
  render(<LivePreview jobId={jobId} title="포트폴리오">기다림</LivePreview>);
  act(() => last().emit("failed", { code: "PAGE_GENERATION_FAILED" }));
  act(() => { vi.advanceTimersByTime(REFRESH_MS); });
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("화면이 떠나면 연결과 기다리던 다시 열기를 모두 거둔다", () => {
  const { unmount } = render(<LivePreview jobId={jobId} title="포트폴리오">기다림</LivePreview>);
  act(() => last().fail(false));
  unmount();
  act(() => { vi.advanceTimersByTime(REFRESH_MS * 2); });
  expect(FakeSource.all).toHaveLength(1);
});
