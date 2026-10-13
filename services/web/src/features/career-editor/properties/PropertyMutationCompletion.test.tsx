// @vitest-environment jsdom
import type { CareerCategory, CareerRecordListItem, CareerViewConfiguration } from "@expresso/contracts";
import { parseCareerDocument } from "@expresso/editor";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 채팅의 네트워크·스크롤은 별도 테스트와 실제 브라우저에서 검증합니다.
vi.mock("@/features/agent-chat/AgentChat", () => ({ AgentChat: () => null }));
const update = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../session/useCareerEditorSession", () => ({ useCareerEditorSession: () => ({ snapshot: { status: "saving", documentVersion: 1, lastAckSequence: 0, proposal: null }, document: parseCareerDocument({ schemaVersion: 1, type: "doc", content: [{ id: "00000000-0000-4000-8000-000000000004", type: "paragraph", attrs: {}, text: [{ text: "Live document retained" }] }] }), updateDocument: update }) }));
import { CareerViewShell } from "../views/CareerViewShell";
import { CareerDocumentEditor } from "../editor/CareerDocumentEditor";
const id = "00000000-0000-4000-8000-000000000001", propertyId = "00000000-0000-4000-8000-000000000002", jobId = "00000000-0000-4000-8000-000000000003", updatedAt = "2026-10-09T00:00:00Z";
const category: CareerCategory = { id, key: "test", name: "Test", icon: "file", defaultView: "table", isSystem: false, propertySchema: {}, propertySchemaV2: [{ id: propertyId, key: "amount", name: "Amount", type: "number", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }], sortOrder: 0, recordCount: 1, version: 1 };
const record: CareerRecordListItem = { id, categoryId: id, title: "Record", status: "draft", origin: "manual", properties: {}, propertyValues: [{ propertyDefinitionId: propertyId, type: "number", value: "10.0000" }], bodyMd: "Old physical body", version: 1, updatedAt, categoryKey: "test", isEmpty: false, periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0 };
const pending = { ...record, pendingPropertyMutation: { jobId, status: "failed" as const, retryable: true, sourceProperty: null } };
const running = { id: jobId, categoryId: id, propertyId, status: "running", active: true, processedCount: 0, totalCount: 1, retryable: false, updatedAt, completedAt: null };
const view: CareerViewConfiguration = { id: "local-" + id, categoryId: id, name: "기본", type: "table", version: 1, order: 0, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], recordOrder: [], visiblePropertyIds: [propertyId], propertyOrder: [propertyId], columnWidths: {}, gallery: null, board: null, timeline: null, createdAt: updatedAt, updatedAt };
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); sessionStorage.clear(); update.mockClear(); });
describe("resumed property owner completion", () => {
  it.each(["shell", "editor"] as const)("polls running to terminal completion and unlocks the %s with owned fresh values", async surface => {
    let finish!: (response: Response) => void;
    let reads = 0;
    const requests: Array<{ url: string; method?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, ...(init?.method ? { method: init.method } : {}) });
      if (url.endsWith("/resume")) return Response.json({ data: running });
      if (url === "/api/career/property-mutations/" + jobId) {
        if (++reads === 1) return Response.json({ data: running });
        return new Promise<Response>(resolve => { finish = resolve; });
      }
      if (url === "/api/career/categories") return Response.json({ data: [{ ...category, version: 2, propertySchemaV2: [{ ...category.propertySchemaV2![0]!, name: "Latest amount" }] }] });
      return Response.json({ data: { id, categoryId: id, title: record.title, status: record.status, origin: record.origin, properties: {}, bodyMd: record.bodyMd, updatedAt, propertyValues: [{ propertyDefinitionId: propertyId, type: "number", value: "9007199254740993123456789012345678" }], version: 2 }, resource: { version: 2, updatedAt } });
    }));
    if (surface === "shell") render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [pending], page: { hasNextPage: false, nextCursor: null } }} />);
    else render(<CareerDocumentEditor recordId={id} mode="page" record={pending} category={category} />);
    const live = surface === "editor" ? await screen.findByLabelText("커리어 기록 본문") : null;
    fireEvent.click(screen.getByRole("button", { name: "속성 변경 다시 시작" }));
    await waitFor(() => expect(screen.getByLabelText("속성 변경 상태").textContent).toContain("변경하고 있습니다"));
    await waitFor(() => expect(finish).toBeTypeOf("function"), { timeout: 3_000 });
    if (surface === "shell") expect(screen.getByRole("gridcell", { name: "10.0000" }).getAttribute("aria-readonly")).toBe("true");
    else expect(screen.getByLabelText("Amount").tagName).toBe("OUTPUT");
    expect(requests.filter(request => request.url === "/api/career/records/" + id)).toEqual([]);
    finish(Response.json({ data: { ...running, status: "completed", active: false, processedCount: 1, completedAt: updatedAt } }));
    if (surface === "shell") await waitFor(() => expect(screen.getByRole("gridcell", { name: "9007199254740993123456789012345678" }).getAttribute("aria-readonly")).toBe("false"));
    else {
      await waitFor(() => expect((screen.getByLabelText("Latest amount") as HTMLInputElement).value).toBe("9007199254740993123456789012345678"));
      expect(screen.getByLabelText("커리어 기록 본문")).toBe(live);
      expect(live!.textContent).toContain("Live document retained");
      expect(update).not.toHaveBeenCalled();
    }
    expect(screen.queryByLabelText("속성 변경 상태")).toBeNull();
    expect(requests.filter(request => request.method === "POST")).toEqual([{ url: "/api/career/property-mutations/" + jobId + "/resume", method: "POST" }]);
    expect(reads).toBe(2);
  });
  it("cancels an old record's status result instead of refreshing or unlocking the next editor", async () => {
    let finish!: (response: Response) => void;
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requests.push(url);
      if (url.endsWith("/resume")) return Response.json({ data: running });
      if (url.includes("/property-mutations/")) return new Promise<Response>(resolve => { finish = resolve; });
      throw new Error("Old record should not be refreshed");
    }));
    const rendered = render(<CareerDocumentEditor recordId={id} mode="page" record={pending} category={category} />);
    fireEvent.click(await screen.findByRole("button", { name: "속성 변경 다시 시작" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"), { timeout: 3_000 });
    const next = { ...record, id: propertyId, title: "Next record" };
    rendered.rerender(<CareerDocumentEditor recordId={propertyId} mode="page" record={next} category={category} />);
    finish(Response.json({ data: { ...running, status: "completed", active: false, processedCount: 1, completedAt: updatedAt } }));
    await waitFor(() => expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("Next record"));
    expect(requests.filter(url => url.startsWith("/api/career/records/"))).toEqual([]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});


it.each(["shell", "editor"] as const)("stops a terminal failed job in the %s and retains the business guard", async surface => {
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    requests.push(url);
    if (url.endsWith("/resume")) return Response.json({ data: running });
    if (url === "/api/career/property-mutations/" + jobId) return Response.json({ data: { ...running, status: "failed", retryable: true } });
    if (url === "/api/career/categories") return Response.json({ data: [category] });
    return Response.json({ data: { id, categoryId: id, title: record.title, status: record.status, origin: record.origin, properties: {}, propertyValues: record.propertyValues, bodyMd: record.bodyMd, version: 1, updatedAt, pendingPropertyMutation: pending.pendingPropertyMutation }, resource: { version: 1, updatedAt } });
  }));
  if (surface === "shell") render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [pending], page: { hasNextPage: false, nextCursor: null } }} />);
  else render(<CareerDocumentEditor recordId={id} mode="page" record={pending} category={category} />);
  fireEvent.click(await screen.findByRole("button", { name: "속성 변경 다시 시작" }));
  expect((await screen.findByRole("alert")).textContent).toContain("다시 중단");
  if (surface === "shell") expect(screen.getByRole("gridcell", { name: "10.0000" }).getAttribute("aria-readonly")).toBe("true");
  else expect(screen.getByLabelText("Amount").tagName).toBe("OUTPUT");
  expect((screen.getByRole("button", { name: "속성 변경 다시 시작" }) as HTMLButtonElement).disabled).toBe(false);
  expect(requests.filter(url => url === "/api/career/property-mutations/" + jobId)).toHaveLength(1);
  expect(requests.filter(url => url.endsWith("/resume"))).toHaveLength(1);
});
it.each(["shell", "editor"] as const)("surfaces a status transport error and stops reads in the %s", async surface => {
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    requests.push(url);
    if (url.endsWith("/resume")) return Response.json({ data: running });
    return new Response(null, { status: 503 });
  }));
  if (surface === "shell") render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [pending], page: { hasNextPage: false, nextCursor: null } }} />);
  else render(<CareerDocumentEditor recordId={id} mode="page" record={pending} category={category} />);
  fireEvent.click(await screen.findByRole("button", { name: "속성 변경 다시 시작" }));
  expect((await screen.findByRole("alert")).textContent).toContain("(503)");
  expect(requests).toEqual(["/api/career/property-mutations/" + jobId + "/resume", "/api/career/property-mutations/" + jobId]);
});

it.each(["shell", "editor"] as const)("reconfirms running after an interrupted observer in the %s without another resume", async surface => {
  let reads = 0;
  const requests: Array<{ url: string; method?: string }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    requests.push({ url, ...(init?.method ? { method: init.method } : {}) });
    if (url.endsWith("/resume")) return Response.json({ data: running });
    if (url === "/api/career/property-mutations/" + jobId) {
      reads++;
      if (reads === 1) return Response.json({ data: running });
      if (reads === 2) return new Response(null, { status: 503 });
      return Response.json({ data: { ...running, status: "completed", active: false, processedCount: 1, completedAt: updatedAt } });
    }
    if (url === "/api/career/categories") return Response.json({ data: [{ ...category, version: 2, propertySchemaV2: [{ ...category.propertySchemaV2![0]!, name: "Fresh amount" }] }] });
    return Response.json({ data: { id, categoryId: id, title: record.title, status: record.status, origin: record.origin, properties: {}, bodyMd: record.bodyMd, updatedAt, propertyValues: [{ propertyDefinitionId: propertyId, type: "number", value: "20.0000" }], version: 2 }, resource: { version: 2, updatedAt } });
  });
  if (surface === "shell") render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [pending], page: { hasNextPage: false, nextCursor: null } }} />);
  else render(<CareerDocumentEditor recordId={id} mode="page" record={pending} category={category} />);
  const live = surface === "editor" ? await screen.findByLabelText("커리어 기록 본문") : null;
  fireEvent.click(screen.getByRole("button", { name: "속성 변경 다시 시작" }));
  expect((await screen.findByRole("alert", {}, { timeout: 3_000 })).textContent).toContain("(503)");
  if (surface === "shell") expect(screen.getByRole("gridcell", { name: "10.0000" }).getAttribute("aria-readonly")).toBe("true");
  else expect(screen.getByLabelText("Amount").tagName).toBe("OUTPUT");
  fireEvent.click(screen.getByRole("button", { name: "속성 변경 상태 다시 확인" }));
  if (surface === "shell") await waitFor(() => expect(screen.getByRole("gridcell", { name: "20.0000" }).getAttribute("aria-readonly")).toBe("false"));
  else {
    await waitFor(() => expect((screen.getByLabelText("Fresh amount") as HTMLInputElement).value).toBe("20.0000"));
    expect(screen.getByLabelText("커리어 기록 본문")).toBe(live);
    expect(update).not.toHaveBeenCalled();
  }
  expect(screen.queryByLabelText("속성 변경 상태")).toBeNull();
  expect(requests.filter(request => request.method === "POST")).toEqual([{ url: "/api/career/property-mutations/" + jobId + "/resume", method: "POST" }]);
  expect(reads).toBe(3);
});
it.each(["shell", "editor"] as const)("observes an initially running job in the %s using only GET", async surface => {
  const requests: Array<{ url: string; method?: string }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    requests.push({ url, ...(init?.method ? { method: init.method } : {}) });
    return new Response(null, { status: 503 });
  });
  const active = { ...record, pendingPropertyMutation: { ...pending.pendingPropertyMutation, status: "running" as const, retryable: false } };
  if (surface === "shell") render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [active], page: { hasNextPage: false, nextCursor: null } }} />);
  else render(<CareerDocumentEditor recordId={id} mode="page" record={active} category={category} />);
  fireEvent.click(await screen.findByRole("button", { name: "속성 변경 상태 다시 확인" }));
  expect((await screen.findByRole("alert")).textContent).toContain("(503)");
  expect(requests).toEqual([{ url: "/api/career/property-mutations/" + jobId }]);
});
it.each(["shell", "editor"] as const)("aborts the %s resume request on unmount before observing or refreshing", async surface => {
  let finish!: (response: Response) => void;
  let requestSignal: AbortSignal | null | undefined;
  const requests: string[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    requests.push(url); requestSignal = init?.signal;
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  const rendered = surface === "shell" ? render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [pending], page: { hasNextPage: false, nextCursor: null } }} />) : render(<CareerDocumentEditor recordId={id} mode="page" record={pending} category={category} />);
  fireEvent.click(await screen.findByRole("button", { name: "속성 변경 다시 시작" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  rendered.unmount();
  expect(requestSignal?.aborted).toBe(true);
  finish(Response.json({ data: running }));
  await Promise.resolve();
  expect(requests).toEqual(["/api/career/property-mutations/" + jobId + "/resume"]);
});
it.each(["shell", "editor"] as const)("aborts the %s GET observer on unmount without applying its late completion", async surface => {
  let finish!: (response: Response) => void;
  let requestSignal: AbortSignal | null | undefined;
  const requests: string[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    requests.push(url);
    if (url.endsWith("/resume")) return Promise.resolve(Response.json({ data: running }));
    requestSignal = init?.signal;
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  const rendered = surface === "shell" ? render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [pending], page: { hasNextPage: false, nextCursor: null } }} />) : render(<CareerDocumentEditor recordId={id} mode="page" record={pending} category={category} />);
  fireEvent.click(await screen.findByRole("button", { name: "속성 변경 다시 시작" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  rendered.unmount();
  expect(requestSignal?.aborted).toBe(true);
  finish(Response.json({ data: { ...running, status: "completed", active: false, completedAt: updatedAt } }));
  await Promise.resolve();
  expect(requests).toEqual(["/api/career/property-mutations/" + jobId + "/resume", "/api/career/property-mutations/" + jobId]);
});
it.each([ ["shell", "record"], ["shell", "category"], ["editor", "record"], ["editor", "category"] ] as const)("bounds the %s latest %s body and allows GET-only reconfirmation", async (surface, stage) => {
  let finish!: (response: Response) => void;
  let reads = 0, interrupted = false;
  let requestSignal!: AbortSignal;
  const posts: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") posts.push(url);
    if (url.endsWith("/resume")) return Response.json({ data: running });
    if (url === "/api/career/property-mutations/" + jobId) {
      if (++reads === 1) return new Promise<Response>(resolve => { finish = resolve; });
      return Response.json({ data: { ...running, status: "completed", active: false, processedCount: 1, completedAt: updatedAt } });
    }
    if (!interrupted && url === (stage === "record" ? "/api/career/records/" + id : "/api/career/categories")) {
      interrupted = true; requestSignal = init?.signal as AbortSignal;
      return { ok: true, json: () => new Promise(() => {}) } as Response;
    }
    if (url === "/api/career/categories") return Response.json({ data: [{ ...category, version: 2, propertySchemaV2: [{ ...category.propertySchemaV2![0]!, name: "Fresh amount" }] }] });
    return Response.json({ data: { id, categoryId: id, title: record.title, status: record.status, origin: record.origin, properties: {}, bodyMd: record.bodyMd, updatedAt, propertyValues: [{ propertyDefinitionId: propertyId, type: "number", value: "20.0000" }], version: 2 }, resource: { version: 2, updatedAt } });
  });
  if (surface === "shell") render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [pending], page: { hasNextPage: false, nextCursor: null } }} />);
  else render(<CareerDocumentEditor recordId={id} mode="page" record={pending} category={category} />);
  fireEvent.click(await screen.findByRole("button", { name: "속성 변경 다시 시작" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  vi.useFakeTimers();
  await act(async () => { finish(Response.json({ data: { ...running, status: "completed", active: false, completedAt: updatedAt } })); });
  expect(interrupted).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(screen.getByRole("alert").textContent).toContain("시간");
  expect(requestSignal.aborted).toBe(true);
  if (surface === "shell") expect(screen.getByRole("gridcell", { name: "10.0000" }).getAttribute("aria-readonly")).toBe("true");
  else expect(screen.getByLabelText("Amount").tagName).toBe("OUTPUT");
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  fireEvent.click(screen.getByRole("button", { name: "속성 변경 상태 다시 확인" }));
  if (surface === "shell") await waitFor(() => expect(screen.getByRole("gridcell", { name: "20.0000" }).getAttribute("aria-readonly")).toBe("false"));
  else await waitFor(() => expect((screen.getByLabelText("Fresh amount") as HTMLInputElement).value).toBe("20.0000"));
  expect(posts).toEqual(["/api/career/property-mutations/" + jobId + "/resume"]);
});
it.each(["shell", "editor"] as const)("restarts a timed out running GET in the %s without resuming the job", async surface => {
  let reads = 0, requestSignal!: AbortSignal;
  let finish!: (response: Response) => void;
  const posts: string[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (init?.method === "POST") posts.push(url);
    if (url === "/api/career/property-mutations/" + jobId) {
      reads++;
      if (reads === 1) { requestSignal = init?.signal as AbortSignal; return new Promise<Response>(resolve => { finish = resolve; }); }
      return Promise.resolve(Response.json({ data: { ...running, status: "completed", active: false, completedAt: updatedAt } }));
    }
    if (url === "/api/career/categories") return Promise.resolve(Response.json({ data: [category] }));
    return Promise.resolve(Response.json({ data: { id, categoryId: id, title: record.title, status: record.status, origin: record.origin, properties: {}, bodyMd: record.bodyMd, propertyValues: record.propertyValues, version: 1, updatedAt }, resource: { version: 1, updatedAt } }));
  });
  const active = { ...record, pendingPropertyMutation: { ...pending.pendingPropertyMutation, status: "running" as const, retryable: false } };
  if (surface === "shell") render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [active], page: { hasNextPage: false, nextCursor: null } }} />);
  else render(<CareerDocumentEditor recordId={id} mode="page" record={active} category={category} />);
  const button = await screen.findByRole("button", { name: "속성 변경 상태 다시 확인" });
  vi.useFakeTimers();
  fireEvent.click(button);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(screen.getByRole("alert").textContent).toContain("시간");
  expect(requestSignal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  if (surface === "shell") expect(screen.getByRole("gridcell", { name: "10.0000" }).getAttribute("aria-readonly")).toBe("true");
  else expect(screen.getByLabelText("Amount").tagName).toBe("OUTPUT");
  await act(async () => { finish(Response.json({ data: { ...running, status: "completed", active: false, completedAt: updatedAt } })); });
  expect(screen.getByLabelText("속성 변경 상태")).toBeTruthy();
  expect(reads).toBe(1);
  vi.useRealTimers();
  fireEvent.click(screen.getByRole("button", { name: "속성 변경 상태 다시 확인" }));
  await waitFor(() => expect(screen.queryByLabelText("속성 변경 상태")).toBeNull());
  expect(posts).toEqual([]);
  expect(reads).toBe(2);
});
it.each([ ["shell", "record"], ["shell", "category"], ["editor", "record"], ["editor", "category"] ] as const)("aborts %s latest %s reads on unmount and keeps late completions outside the old observer", async (surface, stage) => {
  let finish!: (response: Response) => void, requestSignal!: AbortSignal;
  const requests: string[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    requests.push(url);
    if (url.endsWith("/resume")) return Promise.resolve(Response.json({ data: running }));
    if (url === "/api/career/property-mutations/" + jobId) return Promise.resolve(Response.json({ data: { ...running, status: "completed", active: false, completedAt: updatedAt } }));
    if (url === (stage === "record" ? "/api/career/records/" + id : "/api/career/categories")) {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>(resolve => { finish = resolve; });
    }
    if (url === "/api/career/categories") return Promise.resolve(Response.json({ data: [category] }));
    return Promise.resolve(Response.json({ data: { id, categoryId: id, title: record.title, status: record.status, origin: record.origin, properties: {}, bodyMd: record.bodyMd, propertyValues: record.propertyValues, version: 1, updatedAt }, resource: { version: 1, updatedAt } }));
  });
  const rendered = surface === "shell" ? render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [pending], page: { hasNextPage: false, nextCursor: null } }} />) : render(<CareerDocumentEditor recordId={id} mode="page" record={pending} category={category} />);
  fireEvent.click(await screen.findByRole("button", { name: "속성 변경 다시 시작" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  rendered.unmount();
  expect(requestSignal.aborted).toBe(true);
  const dispatched = [...requests];
  finish(stage === "category" ? Response.json({ data: [category] }) : Response.json({ data: record, resource: { version: 1, updatedAt } }));
  await act(async () => { await Promise.resolve(); });
  expect(requests).toEqual(dispatched);
});