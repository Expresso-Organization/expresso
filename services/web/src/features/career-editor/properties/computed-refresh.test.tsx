// @vitest-environment jsdom

import type { CareerPropertyDefinitionV2, CareerRecord } from "@expresso/contracts";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COMPUTED_REFRESH_DEADLINE_MS, COMPUTED_REFRESH_INTERVAL_MS, useComputedRefresh } from "./computed-refresh";

const recordId = "00000000-0000-4000-8000-000000000020";
const categoryId = "00000000-0000-4000-8000-000000000021";
const formula: CareerPropertyDefinitionV2 = { id: "00000000-0000-4000-8000-000000000022", key: "double", name: "두 배", type: "formula", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null };
const score: CareerPropertyDefinitionV2 = { ...formula, id: "00000000-0000-4000-8000-000000000023", key: "score", name: "점수", type: "number" };

function record(version: number, computed?: number, scoreValue = 3, title = "기록"): CareerRecord {
  return {
    id: recordId, categoryId, title, status: "draft", origin: "manual", properties: { score: { type: "number", value: scoreValue } },
    ...(computed === undefined ? {} : { computedProperties: { double: { type: "formula", value: computed, diagnostics: [] } } }),
    bodyMd: "", version, createdAt: "2026-10-28T00:00:00.000Z", updatedAt: "2026-10-28T00:00:00.000Z",
  };
}

function respond(next: CareerRecord) {
  return new Response(JSON.stringify({ data: next, resource: { id: next.id, version: next.version } }), { status: 200, headers: { "content-type": "application/json" } });
}

function mount(initial: CareerRecord, definitions: readonly CareerPropertyDefinitionV2[]) {
  return renderHook(() => {
    const [current, setCurrent] = useState(initial);
    const pending = useComputedRefresh(current, definitions, setCurrent);
    return { current, setCurrent, pending };
  });
}

async function tick(ms = COMPUTED_REFRESH_INTERVAL_MS) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe("useComputedRefresh", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("does not read again for a record that already has every computed value", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const view = mount(record(2, 6), [score, formula]);
    await tick(COMPUTED_REFRESH_DEADLINE_MS);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(view.result.current.pending).toBe(false);
  });

  it("waits until a new computed key appears", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(record(2))).mockResolvedValueOnce(respond(record(3, 6)));
    vi.stubGlobal("fetch", fetchMock);
    const view = mount(record(2), [score, formula]);
    expect(view.result.current.pending).toBe(true);
    await tick();
    expect(view.result.current.current.computedProperties).toBeUndefined();
    await tick();
    expect(view.result.current.current).toMatchObject({ version: 3, computedProperties: { double: { value: 6 } } });
    expect(view.result.current.pending).toBe(false);
    await tick(COMPUTED_REFRESH_DEADLINE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("waits for the Worker version after a save and ignores its own update", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(record(3, 6, 4))).mockResolvedValueOnce(respond(record(4, 8, 4)));
    vi.stubGlobal("fetch", fetchMock);
    const view = mount(record(2, 6), [score, formula]);
    act(() => view.result.current.setCurrent(record(3, 6, 4)));
    await tick();
    expect(view.result.current.current.version).toBe(3);
    await tick();
    expect(view.result.current.current).toMatchObject({ version: 4, computedProperties: { double: { value: 8 } } });
    await tick(COMPUTED_REFRESH_DEADLINE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops at the deadline when the Worker does not answer", async () => {
    const fetchMock = vi.fn(async () => respond(record(3, 6, 4)));
    vi.stubGlobal("fetch", fetchMock);
    const view = mount(record(2, 6), [score, formula]);
    act(() => view.result.current.setCurrent(record(3, 6, 4)));
    await tick(COMPUTED_REFRESH_DEADLINE_MS + COMPUTED_REFRESH_INTERVAL_MS);
    expect(view.result.current.pending).toBe(false);
    const calls = fetchMock.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(COMPUTED_REFRESH_DEADLINE_MS / COMPUTED_REFRESH_INTERVAL_MS);
    await tick(COMPUTED_REFRESH_DEADLINE_MS);
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(view.result.current.current.version).toBe(3);
  });

  it("does not wait when the save enqueued no computation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const view = mount(record(2, 6), [score, formula]);
    // 제목 정의가 없는 카테고리의 제목 저장은 updateRecord가 계산 작업을 넣지 않는다.
    act(() => view.result.current.setCurrent(record(3, 6, 3, "새 제목")));
    expect(view.result.current.pending).toBe(false);
    await tick(COMPUTED_REFRESH_DEADLINE_MS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("waits after a relation save, which only raises the version", async () => {
    const relation: CareerPropertyDefinitionV2 = { ...score, id: "00000000-0000-4000-8000-000000000024", key: "projects", name: "프로젝트", type: "relation" };
    const fetchMock = vi.fn(async () => respond(record(4, 9)));
    vi.stubGlobal("fetch", fetchMock);
    const view = mount(record(2, 6), [score, relation, formula]);
    act(() => view.result.current.setCurrent(record(3, 6)));
    expect(view.result.current.pending).toBe(true);
    await tick();
    expect(view.result.current.current).toMatchObject({ version: 4, computedProperties: { double: { value: 9 } } });
  });

  it("does nothing in a category without formulas or rollups", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const view = mount(record(2), [score]);
    act(() => view.result.current.setCurrent(record(3)));
    await tick(COMPUTED_REFRESH_DEADLINE_MS);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


it("refreshes formula values after a canonical write even when physical typed projections have not changed", async () => {
  vi.useFakeTimers();
  const initial = { ...record(2, 6), propertyValues: [{ propertyDefinitionId: score.id, type: "number" as const, value: "3.0000" }] };
  const saved = { ...initial, version: 3, propertyValues: [{ propertyDefinitionId: score.id, type: "number" as const, value: "9007199254740993.0000" }] };
  const computed = { ...saved, version: 4, computedProperties: { double: { type: "formula" as const, value: 18014398509481986, diagnostics: [] } } };
  const fetcher = vi.fn(async () => respond(computed)); vi.stubGlobal("fetch", fetcher);
  const view = mount(initial, [score, formula]);
  act(() => view.result.current.setCurrent(saved));
  await tick();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(view.result.current.current.version).toBe(4);
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals();
});
