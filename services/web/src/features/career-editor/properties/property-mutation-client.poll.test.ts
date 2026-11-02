import { afterEach, expect, it, vi } from "vitest";
import { waitForCareerPropertyMutation } from "./property-mutation-client";
const id = "00000000-0000-4000-8000-000000000001", categoryId = "00000000-0000-4000-8000-000000000002", propertyId = "00000000-0000-4000-8000-000000000003";
const running = { id, categoryId, propertyId, status: "running", active: true, processedCount: 0, totalCount: 1, retryable: false, updatedAt: "2026-10-09T00:00:00Z", completedAt: null };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("returns terminal failure without posting resume or scheduling more reads", async () => {
  const fetcher = vi.fn(async () => Response.json({ data: { ...running, status: "failed", retryable: true } }));
  vi.stubGlobal("fetch", fetcher);
  expect((await waitForCareerPropertyMutation(id, categoryId, { signal: new AbortController().signal })).status).toBe("failed");
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/career/property-mutations/" + id, expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
});
it.each([["category", { ...running, categoryId: propertyId }], ["job", { ...running, id: propertyId }]])("rejects a different %s before accepting its completion", async (_kind, status) => {
  const fetcher = vi.fn(async () => Response.json({ data: { ...status, status: "completed", active: false, completedAt: running.updatedAt } }));
  vi.stubGlobal("fetch", fetcher);
  await expect(waitForCareerPropertyMutation(id, categoryId, { signal: new AbortController().signal })).rejects.toThrow("작업과 일치");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("stops on a status transport error instead of polling forever", async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(waitForCareerPropertyMutation(id, categoryId, { signal: new AbortController().signal })).rejects.toThrow("(503)");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("observes a legitimate long-running owner past sixty reads until its terminal completion", async () => {
  vi.useFakeTimers();
  let reads = 0;
  const fetcher = vi.fn(async () => Response.json({ data: ++reads > 60 ? { ...running, status: "completed", active: false, processedCount: 1, completedAt: running.updatedAt } : running }));
  vi.stubGlobal("fetch", fetcher);
  const result = waitForCareerPropertyMutation(id, categoryId, { signal: new AbortController().signal }).catch(error => error as Error);
  await vi.advanceTimersByTimeAsync(61_000);
  expect(await result).toMatchObject({ status: "completed", processedCount: 1 });
  expect(fetcher).toHaveBeenCalledTimes(61);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetcher).toHaveBeenCalledTimes(61);
});
it("cancels the delay between reads without dispatching another owner request", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => Response.json({ data: running }));
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const result = waitForCareerPropertyMutation(id, categoryId, { signal: controller.signal }).catch(error => error as Error);
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  expect(await result).toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("bounds a never-settling owner read and aborts its request", async () => {
  vi.useFakeTimers();
  let requestSignal!: AbortSignal;
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => { requestSignal = init.signal as AbortSignal; return new Promise<Response>(() => {}); });
  let error: unknown;
  const result = waitForCareerPropertyMutation(id, categoryId, { signal: new AbortController().signal }).catch(failure => { error = failure; });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("시간");
  expect(requestSignal.aborted).toBe(true);
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
it("bounds an owner response body and clears its deadline", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", async () => ({ ok: true, json: () => new Promise(() => {}) }));
  let error: unknown;
  const result = waitForCareerPropertyMutation(id, categoryId, { signal: new AbortController().signal }).catch(failure => { error = failure; });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("시간");
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
it("settles cancellation even when the owner request ignores its abort signal", async () => {
  vi.useFakeTimers();
  let finish!: (response: Response) => void;
  const status = vi.fn();
  vi.stubGlobal("fetch", () => new Promise<Response>(resolve => { finish = resolve; }));
  const controller = new AbortController();
  let error: unknown;
  const result = waitForCareerPropertyMutation(id, categoryId, { signal: controller.signal, onStatus: status }).catch(failure => { error = failure; });
  controller.abort();
  await vi.advanceTimersByTimeAsync(0);
  expect(error).toMatchObject({ name: "AbortError" });
  finish(Response.json({ data: running }));
  await result;
  expect(status).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});