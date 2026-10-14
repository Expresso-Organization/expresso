// @vitest-environment jsdom
import type { CareerCategory, CareerRecord, CareerViewConfiguration, CareerWriteOperation } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 채팅의 네트워크·스크롤은 별도 테스트와 실제 브라우저에서 검증합니다.
vi.mock("@/features/agent-chat/AgentChat", () => ({ AgentChat: () => null }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CareerViewShell } from "./CareerViewShell";

const categoryId = "00000000-0000-4000-8000-000000000001";
const scoreId = "00000000-0000-4000-8000-000000000002";
const proposalId = "00000000-0000-4000-8000-000000000003";
const operationId = "00000000-0000-4000-8000-000000000004";
const blockId = "00000000-0000-4000-8000-000000000005";
const latestValue = "9007199254740993123456789012345678";
const updatedAt = "2026-10-09T00:00:00Z";
const category: CareerCategory = { id: categoryId, key: "test", name: "테스트", icon: "table", defaultView: "table", isSystem: false, propertySchema: {}, propertySchemaV2: [{ id: scoreId, key: "score", name: "점수", type: "number", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }], sortOrder: 0, recordCount: 1, version: 1 };
const freshCategory: CareerCategory = { ...category, version: 2, propertySchemaV2: [{ ...category.propertySchemaV2![0]!, name: "AI 점수" }] };
const view: CareerViewConfiguration = { id: "local-" + categoryId, categoryId, name: "기본", type: "table", version: 1, order: 0, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], recordOrder: [], visiblePropertyIds: [scoreId], propertyOrder: [scoreId], columnWidths: {}, gallery: null, board: null, timeline: null, createdAt: updatedAt, updatedAt };

class OfflineSocket {
  readyState = 0;
  close() {}
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("Drawer AI owner completion", () => {
  it.each([[200, false, false], [202, false, false], [200, true, false], [202, false, true]] as const)("refreshes the actual Drawer and list before immediate duplication after HTTP %s (first refresh fails: %s; proposal response held: %s)", async (status, refreshFails, holdProposal) => {
    const recordId = refreshFails ? "00000000-0000-4000-8000-000000000009" : status === 200 ? "00000000-0000-4000-8000-000000000006" : "00000000-0000-4000-8000-000000000007";
    const record: CareerRecord = { id: recordId, categoryId, title: "원본 기록", status: "draft", origin: "manual", properties: {}, propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: "123.4500" }], bodyMd: "Old physical body", version: 1, updatedAt };
    const fresh: CareerRecord = { ...record, version: 2, bodyMd: "Applied physical body", propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: latestValue }] };
    const proposal = { proposalId, recordId, baseDocumentVersion: 1, selection: { blockIds: [blockId] }, summary: "점수 정밀값 적용", commands: [], propertyChanges: [{ propertyId: scoreId, canonicalPreviousValue: { propertyDefinitionId: scoreId, type: "number", value: "123.4500" }, canonicalNextValue: { propertyDefinitionId: scoreId, type: "number", value: latestValue } }], createdAt: updatedAt, expiresAt: "2026-10-10T00:00:00Z", status: "ready", progress: null, appliedDocumentVersion: null, revisionId: null };
    const applied = { ...proposal, status: "applied", undoScope: "none", businessChangesRetained: true };
    const operation: CareerWriteOperation = { operationId, producer: "ai-proposal", state: "pending", recordId, owners: { business: "pending", document: "not-required" }, statusUrl: "/v1/career/write-operations/" + operationId, retryable: true, updatedAt };
    let completeOwner!: (response: Response) => void;
    let refreshCategory!: (response: Response) => void;
    let refreshProposal!: (response: Response) => void;
    let proposalReleased = false;
    const requests: Array<{ url: string; method?: string; headers?: HeadersInit; body?: unknown }> = [];
    vi.stubGlobal("WebSocket", OfflineSocket);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, ...(init?.method ? { method: init.method } : {}), ...(init?.headers ? { headers: init.headers } : {}), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
      if (url.endsWith("/document")) return Response.json({ record, document: { schemaVersion: 1, type: "doc", content: [{ id: blockId, type: "paragraph", attrs: {}, text: [{ text: "Live document retained" }] }] }, snapshotVersion: 1, documentVersion: 1, stateVectorBase64: "", pendingUpdateCount: 0, sessionToken: "x".repeat(32) });
      if (url.endsWith("/ai-proposals")) return Response.json({ data: proposal });
      if (url.endsWith("/apply")) return Response.json({ data: status === 202 ? operation : applied }, { status });
      if (url.includes("/write-operations/")) return new Promise<Response>(resolve => { completeOwner = resolve; });
      if (url.endsWith("/ai-proposals/" + proposalId)) return holdProposal ? new Promise<Response>(resolve => { refreshProposal = resolve; }) : Response.json({ data: applied });
      if (url === "/api/career/categories") return new Promise<Response>(resolve => { refreshCategory = resolve; });
      if (url === "/api/career/records" && init?.method === "POST") return Response.json({ data: { ...fresh, id: "00000000-0000-4000-8000-000000000008", title: "원본 기록 복제" } });
      if (url === "/api/career/records/" + recordId) return Response.json({ data: fresh, resource: { version: 2, updatedAt } });
      throw new Error("Unexpected request: " + url);
    }));
    render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [record], page: { hasNextPage: false, nextCursor: null } }} />);
    fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^원본 기록(?: 열기)?$/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "기록 열기" }));
    const editor = await screen.findByLabelText("커리어 기록 본문");
    const drawer = screen.getByLabelText("문서 패널");
    fireEvent.change(within(drawer).getByLabelText("AI에게 편집 요청"), { target: { value: "점수 개선" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "제안 만들기" }));
    await within(drawer).findByText(proposal.summary);
    fireEvent.click(within(drawer).getByRole("button", { name: /개 변경 적용/ }));
    if (status === 202) {
      await waitFor(() => expect(completeOwner).toBeTypeOf("function"));
      expect((within(drawer).getByLabelText("점수") as HTMLInputElement).value).toBe("123.4500");
      expect(screen.getByRole("gridcell", { name: "123.4500" })).toBeTruthy();
      expect(requests.filter(request => request.url === "/api/career/records/" + recordId)).toEqual([]);
      completeOwner(Response.json({ data: { ...operation, state: "completed", owners: { business: "completed", document: "not-required" }, retryable: false } }));
    }
    if (holdProposal) {
      await waitFor(() => expect(typeof refreshProposal === "function" || typeof refreshCategory === "function").toBe(true));
      fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^원본 기록(?: 열기)?$/ }));
      fireEvent.click(screen.getByRole("menuitem", { name: "기록 복제" }));
      expect(requests.filter(request => request.url === "/api/career/records" && request.method === "POST")).toEqual([]);
      if (typeof refreshProposal === "function") {
        refreshProposal(Response.json({ data: applied }));
        proposalReleased = true;
      }
    }
    await waitFor(() => expect(refreshCategory).toBeTypeOf("function"));
    fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^원본 기록(?: 열기)?$/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "기록 복제" }));
    expect(await screen.findByText("변경 적용 중입니다. 완료 후 다시 편집할 수 있습니다.")).toBeTruthy();
    expect(requests.filter(request => request.url === "/api/career/records" && request.method === "POST")).toEqual([]);
    if (refreshFails) {
      refreshCategory(new Response(null, { status: 503 }));
      expect(await within(drawer).findByText("최신 카테고리를 불러오지 못했습니다.")).toBeTruthy();
      fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^원본 기록(?: 열기)?$/ }));
      fireEvent.click(screen.getByRole("menuitem", { name: "기록 복제" }));
      await waitFor(() => expect(requests.filter(request => request.url === "/api/career/categories")).toHaveLength(2));
      expect(requests.filter(request => request.url === "/api/career/records" && request.method === "POST")).toEqual([]);
    }
    refreshCategory(Response.json({ data: [freshCategory] }));
    if (holdProposal && !proposalReleased) {
      await waitFor(() => expect(refreshProposal).toBeTypeOf("function"));
      refreshProposal(Response.json({ data: applied }));
    }
    await waitFor(() => expect((within(drawer).getByLabelText("AI 점수") as HTMLInputElement).value).toBe(latestValue));
    expect(within(screen.getByRole("gridcell", { name: /^원본 기록(?: 열기)?$/ }).closest('[role="row"]') as HTMLElement).getByRole("gridcell", { name: latestValue })).toBeTruthy();
    expect(within(drawer).getByLabelText("커리어 기록 본문")).toBe(editor);
    expect(editor.textContent).toContain("Live document retained");
    await within(drawer).findByText("문서 복원 대상이 없습니다. 속성 변경은 적용된 상태입니다.");
    if (!refreshFails) {
      fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^원본 기록(?: 열기)?$/ }));
      fireEvent.click(screen.getByRole("menuitem", { name: "기록 복제" }));
    }
    await waitFor(() => expect(requests.find(request => request.url === "/api/career/records" && request.method === "POST")?.body).toEqual({ categoryId, title: "원본 기록 복제", bodyMd: "Applied physical body", propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: latestValue }] }));
    const originalRow = screen.getByRole("gridcell", { name: /^원본 기록(?: 열기)?$/ }).closest('[role="row"]')!;
    const scoreCell = within(originalRow as HTMLElement).getByRole("gridcell", { name: latestValue });
    fireEvent.focus(scoreCell); fireEvent.keyDown(scoreCell, { key: "F2" });
    const input = screen.getByLabelText("AI 점수 셀 편집");
    fireEvent.change(input, { target: { value: "42.0000" } }); fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(new Headers(requests.find(request => request.method === "PATCH")?.headers).get("if-match")).toBe('"v2"'));
  });
});


it.each(["closed", "B"] as const)("refreshes A after its pending Drawer is %s and duplicates A latest values", async nextDrawer => {
  const recordAId = "00000000-0000-4000-8000-000000000016", recordBId = "00000000-0000-4000-8000-000000000017";
  const recordA: CareerRecord = { id: recordAId, categoryId, title: "기록 A", status: "draft", origin: "manual", properties: {}, propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: "123.4500" }], bodyMd: "A old body", version: 1, updatedAt };
  const recordB: CareerRecord = { ...recordA, id: recordBId, title: "기록 B", bodyMd: "B body", propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: "7.0000" }] };
  const freshA: CareerRecord = { ...recordA, version: 2, bodyMd: "A owner completed body", propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: latestValue }] };
  const proposalA = { proposalId, recordId: recordAId, baseDocumentVersion: 1, selection: { blockIds: [blockId] }, summary: "A 점수 적용", commands: [], propertyChanges: [{ propertyId: scoreId, canonicalPreviousValue: { propertyDefinitionId: scoreId, type: "number", value: "123.4500" }, canonicalNextValue: { propertyDefinitionId: scoreId, type: "number", value: latestValue } }], createdAt: updatedAt, expiresAt: "2026-10-10T00:00:00Z", status: "ready", progress: null, appliedDocumentVersion: null, revisionId: null };
  const operationA: CareerWriteOperation = { operationId, producer: "ai-proposal", state: "pending", recordId: recordAId, owners: { business: "pending", document: "not-required" }, statusUrl: "/v1/career/write-operations/" + operationId, retryable: true, updatedAt };
  let finishOwner!: (response: Response) => void;
  let ownerSignal: AbortSignal | null | undefined;
  const requests: Array<{ url: string; method?: string | undefined; body?: unknown }> = [];
  vi.stubGlobal("WebSocket", OfflineSocket);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, method: init?.method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    if (url.endsWith("/document")) { const record = url.includes(recordAId) ? recordA : recordB; return Response.json({ record, document: { schemaVersion: 1, type: "doc", content: [{ id: blockId, type: "paragraph", attrs: {}, text: [{ text: record.title }] }] }, snapshotVersion: 1, documentVersion: 1, stateVectorBase64: "", pendingUpdateCount: 0, sessionToken: "x".repeat(32) }); }
    if (url.endsWith("/ai-proposals")) return Response.json({ data: proposalA });
    if (url.endsWith("/apply")) return Response.json({ data: operationA }, { status: 202 });
    if (url.includes("/write-operations/")) { ownerSignal = init?.signal; return new Promise<Response>(resolve => { finishOwner = resolve; }); }
    if (url.endsWith("/ai-proposals/" + proposalId)) return Response.json({ data: { ...proposalA, status: "applied", undoScope: "none", businessChangesRetained: true } });
    if (url === "/api/career/records/" + recordAId) return Response.json({ data: freshA, resource: { version: 2, updatedAt } });
    if (url === "/api/career/records/" + recordBId) return Response.json({ data: recordB, resource: { version: 1, updatedAt } });
    if (url === "/api/career/categories") return Response.json({ data: [category] });
    if (url === "/api/career/records" && init?.method === "POST") return Response.json({ data: { ...freshA, id: "00000000-0000-4000-8000-000000000018", title: "기록 A 복제" } });
    throw new Error("Unexpected request: " + url);
  }));
  render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [recordA, recordB], page: { hasNextPage: false, nextCursor: null } }} />);
  fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^기록 A(?: 열기)?$/ })); fireEvent.click(screen.getByRole("menuitem", { name: "기록 열기" }));
  const drawer = screen.getByLabelText("문서 패널"); await within(drawer).findByLabelText("커리어 기록 본문");
  fireEvent.change(within(drawer).getByLabelText("AI에게 편집 요청"), { target: { value: "A 점수 개선" } }); fireEvent.click(within(drawer).getByRole("button", { name: "제안 만들기" }));
  await within(drawer).findByText(proposalA.summary); fireEvent.click(within(drawer).getByRole("button", { name: /개 변경 적용/ })); await waitFor(() => expect(finishOwner).toBeTypeOf("function"));
  fireEvent.click(within(drawer).getByRole("button", { name: "닫기" }));
  if (nextDrawer === "B") { fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^기록 B(?: 열기)?$/ })); fireEvent.click(screen.getByRole("menuitem", { name: "기록 열기" })); await waitFor(() => expect((within(drawer).getByLabelText("점수") as HTMLInputElement).value).toBe("7.0000")); }
  expect(ownerSignal?.aborted).toBe(false);
  finishOwner(Response.json({ data: { ...operationA, state: "completed", owners: { business: "completed", document: "not-required" }, retryable: false } }));
  const aRow = screen.getByRole("gridcell", { name: /^기록 A(?: 열기)?$/ }).closest('[role="row"]') as HTMLElement;
  await within(aRow).findByRole("gridcell", { name: latestValue });
  if (nextDrawer === "B") expect((within(drawer).getByLabelText("점수") as HTMLInputElement).value).toBe("7.0000");
  expect(requests.filter(request => request.url === "/api/career/records/" + recordBId)).toEqual([]);
  fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^기록 A(?: 열기)?$/ })); fireEvent.click(screen.getByRole("menuitem", { name: "기록 복제" }));
  await waitFor(() => expect(requests.find(request => request.url === "/api/career/records" && request.method === "POST")?.body).toEqual({ categoryId, title: "기록 A 복제", bodyMd: "A owner completed body", propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: latestValue }] }));
  await waitFor(() => expect(sessionStorage.getItem("ex-career-write:v1:ai:" + recordAId + ":" + proposalId + ":apply:operation")).toBeNull());
});