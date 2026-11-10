// @vitest-environment jsdom
import type { BrewJobStatus } from "@expresso/contracts";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { useRefreshOnJobChange } from "./use-refresh-on-job-change";

/** 브라우저의 EventSource 대신 — 서버가 보낸 이벤트를 테스트가 직접 흘린다. */
class FakeSource {
  static last: FakeSource | null = null;
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) { FakeSource.last = this; }
  addEventListener(name: string, listener: (event: MessageEvent<string>) => void) { this.listeners.set(name, listener); }
  close() { this.closed = true; }
  emit(status: BrewJobStatus) { this.listeners.get("status")?.({ data: JSON.stringify({ data: status }) } as MessageEvent<string>); }
}

const jobId = "8f0c4a52-6a43-4b9e-9d2a-1f7a0c2b3e41";
const job = (status: BrewJobStatus["status"], stage: string): BrewJobStatus =>
  ({ jobId, type: "interview", status, stage, attempts: 1, resultId: null, failure: null });

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal("EventSource", FakeSource);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("서버가 그린 것과 같은 상태는 지나치고, 바뀐 상태가 오면 바로 다시 읽는다", () => {
  renderHook(() => useRefreshOnJobChange(job("queued", "queued")));
  const source = FakeSource.last!;
  expect(source.url).toBe(`/api/brew-jobs/${jobId}/events`);
  act(() => source.emit(job("queued", "queued")));
  expect(refresh).not.toHaveBeenCalled();
  act(() => source.emit(job("succeeded", "done")));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(source.closed).toBe(true);
});

it("흐름이 끊기면 1.5초마다 다시 읽는 폴링으로 돌아간다", () => {
  vi.useFakeTimers();
  renderHook(() => useRefreshOnJobChange(job("running", "drafting")));
  act(() => FakeSource.last!.onerror?.());
  act(() => { vi.advanceTimersByTime(1_500); });
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("기다릴 잡이 없으면 듣지도 다시 읽지도 않는다", () => {
  vi.useFakeTimers();
  FakeSource.last = null;
  renderHook(() => useRefreshOnJobChange(null));
  act(() => { vi.advanceTimersByTime(3_000); });
  expect(FakeSource.last).toBeNull();
  expect(refresh).not.toHaveBeenCalled();
});
