// @vitest-environment jsdom

import { createEmptyCareerDocument, parseCareerDocument } from "@expresso/editor";
import type { CareerCategory, CareerRecord, CareerRecordListItem } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 채팅의 네트워크·스크롤은 별도 테스트와 실제 브라우저에서 검증합니다.
vi.mock("@/features/agent-chat/AgentChat", () => ({ AgentChat: () => null }));
const mocks = vi.hoisted(() => ({ useSession: vi.fn(), updateDocument: vi.fn() }));
vi.mock("../session/useCareerEditorSession", () => ({
  useCareerEditorSession: (recordId: string) => mocks.useSession(recordId),
}));

import { CareerDocumentEditor } from "./CareerDocumentEditor";
import { careerDocumentToTiptap, tiptapToCareerDocument } from "./extensions";

describe("CareerDocumentEditor", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  beforeEach(() => {
    mocks.updateDocument.mockReset();
    mocks.useSession.mockReturnValue({
      snapshot: { status: "saved", documentVersion: 1, lastAckSequence: 1, proposal: null },
      document: createEmptyCareerDocument(),
      updateDocument: mocks.updateDocument,
    });
  });

  it("preserves nested and unknown neutral blocks through the Tiptap boundary", () => {
    const unknown = { id: crypto.randomUUID(), type: "futureWidget", attrs: { version: 2 }, text: [{ text: "future" }] };
    const document = parseCareerDocument({
      schemaVersion: 1,
      type: "doc",
      content: [
        { id: crypto.randomUUID(), type: "bulletList", attrs: {}, content: [{ id: crypto.randomUUID(), type: "listItem", attrs: {}, text: [{ text: "항목" }] }] },
        unknown,
      ],
    });
    const result = tiptapToCareerDocument(careerDocumentToTiptap(document));
    expect(result.content[0]?.type).toBe("bulletList");
    expect(result.content[1]).toEqual(unknown);
  });

  it("repairs duplicated career IDs created by split or paste before serialization", () => {
    const duplicate = crypto.randomUUID();
    const result = tiptapToCareerDocument({ type: "doc", content: [
      { type: "paragraph", attrs: { careerId: duplicate }, content: [{ type: "text", text: "첫째" }] },
      { type: "paragraph", attrs: { careerId: duplicate }, content: [{ type: "text", text: "둘째" }] },
    ] });
    expect(result.content[0]?.id).toBe(duplicate);
    expect(result.content[1]?.id).not.toBe(duplicate);
  });

  it("opens the keyboard slash menu and restores focus on escape", async () => {
    render(<CareerDocumentEditor recordId="11111111-1111-4111-8111-111111111111" mode="peek" />);
    const editor = await screen.findByLabelText("커리어 기록 본문");
    fireEvent.keyDown(editor, { key: "/" });
    expect(await screen.findByRole("menu", { name: "블록 명령" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /본문/ }));
    fireEvent.keyDown(screen.getByRole("menu", { name: "블록 명령" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "블록 명령" })).toBeNull());
  });

  it("keeps document editing available while property mutation pauses business fields", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const record = { id, categoryId: id, categoryKey: "test", title: "기록", status: "draft" as const, origin: "manual" as const, properties: {}, propertyValues: [], pendingPropertyMutation: { jobId: id, status: "running" as const, retryable: false, sourceProperty: null }, bodyMd: "", version: 1, updatedAt: "2026-09-01T00:00:00Z", isEmpty: false, periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0 };
    const category = { id, key: "test", name: "테스트", icon: "file", defaultView: "table" as const, isSystem: false, propertySchema: {}, propertySchemaV2: [], sortOrder: 0, recordCount: 1, version: 1 };
    render(<CareerDocumentEditor recordId={id} mode="page" record={record} category={category} />);
    const editor = await screen.findByLabelText("커리어 기록 본문");
    expect(editor.getAttribute("contenteditable")).toBe("true");
    expect((screen.getByLabelText("제목") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "굵게" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([false, true])("resumes with injected action %s and refreshes business fields while retaining the live document", async (injected) => {
    const id = "00000000-0000-4000-8000-000000000001";
    const propertyId = "00000000-0000-4000-8000-000000000002";
    const mutationId = "00000000-0000-4000-8000-000000000003";
    const base: CareerRecord = { id, categoryId: id, title: "기록", status: "draft", origin: "manual", properties: {}, propertyValues: [{ propertyDefinitionId: propertyId, type: "number", value: "123.4500" }], bodyMd: "서버의 이전 본문", version: 1, updatedAt: "2026-09-01T00:00:00Z" };
    const pending: CareerRecordListItem = { ...base, categoryKey: "test", isEmpty: false, periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0, pendingPropertyMutation: { jobId: mutationId, status: "failed", retryable: true, sourceProperty: null } };
    const category: CareerCategory = { id, key: "test", name: "테스트", icon: "file", defaultView: "table", isSystem: false, propertySchema: {}, propertySchemaV2: [{ id: propertyId, key: "score", name: "점수", type: "number", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }], sortOrder: 0, recordCount: 1, version: 1 };
    mocks.useSession.mockReturnValue({ snapshot: { status: "saving", documentVersion: 1, lastAckSequence: 0, proposal: null }, document: parseCareerDocument({ schemaVersion: 1, type: "doc", content: [{ id: propertyId, type: "paragraph", attrs: {}, text: [{ text: "라이브 문서 본문" }] }] }), updateDocument: mocks.updateDocument });
    const calls: string[] = [];
    const resume = vi.fn(async (_jobId: string) => undefined);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith("/resume")) return Response.json({ data: { id: mutationId, categoryId: id, propertyId, status: "running", active: true, processedCount: 0, totalCount: 1, retryable: false, updatedAt: base.updatedAt, completedAt: null } });
      if (url === "/api/career/property-mutations/" + mutationId) return Response.json({ data: { id: mutationId, categoryId: id, propertyId, status: "completed", active: false, processedCount: 1, totalCount: 1, retryable: false, updatedAt: base.updatedAt, completedAt: base.updatedAt } });
      if (url === "/api/career/categories") return Response.json({ data: [category] });
      return Response.json({ data: { ...base, version: 2 }, resource: { version: 2, updatedAt: base.updatedAt } });
    }));
    render(<CareerDocumentEditor recordId={id} mode="page" record={pending} category={category} {...(injected ? { onResumePropertyMutation: resume } : {})} />);
    const editor = await screen.findByLabelText("커리어 기록 본문");
    expect(editor.textContent).toContain("라이브 문서 본문");
    expect(screen.queryByLabelText("점수")).toHaveProperty("tagName", "OUTPUT");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "속성 변경 다시 시작" }));
    await waitFor(() => expect(screen.getByLabelText("점수")).toHaveProperty("tagName", "INPUT"));
    expect((screen.getByLabelText("점수") as HTMLInputElement).value).toBe("123.4500");
    expect(screen.getByLabelText("커리어 기록 본문")).toBe(editor);
    expect(editor.textContent).toContain("라이브 문서 본문");
    expect(editor.textContent).not.toContain("서버의 이전 본문");
    expect(mocks.updateDocument).not.toHaveBeenCalled();
    expect(calls).toContain("/api/career/records/" + id);
    if (injected) { expect(resume).toHaveBeenCalledExactlyOnceWith(mutationId); expect(calls.some((url) => url.endsWith("/resume"))).toBe(false); }
    else expect(calls[0]).toBe("/api/career/property-mutations/" + mutationId + "/resume");
  });
  it("registers exact tags through the default BFF callback and scopes local options to each record", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const propertyId = "00000000-0000-4000-8000-000000000002";
    const originalId = "00000000-0000-4000-8000-000000000003";
    const firstOptionId = "00000000-0000-4000-8000-000000000004";
    const secondOptionId = "00000000-0000-4000-8000-000000000005";
    const nextRecordId = "00000000-0000-4000-8000-000000000006";
    const record: CareerRecordListItem = { id, categoryId: id, categoryKey: "test", title: "기록", status: "draft", origin: "manual", properties: {}, propertyValues: [{ propertyDefinitionId: propertyId, type: "multi_select", value: [originalId] }], bodyMd: "", version: 1, updatedAt: "2026-09-01T00:00:00Z", isEmpty: false, periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0 };
    const category: CareerCategory = { id, key: "test", name: "테스트", icon: "file", defaultView: "table", isSystem: false, propertySchema: {}, propertySchemaV2: [{ id: propertyId, key: "tags", name: "태그", type: "multi_select", required: false, system: false, config: { legacyFreeformTags: true, options: [{ id: originalId, label: "  Original  " }] }, order: 0, version: 1, deletedAt: null }], sortOrder: 0, recordCount: 1, version: 1 };
    const requests: Array<{ url: string; body: unknown }> = [];
    let activeRecord = record;
    let registrations = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push({ url, body });
      if (url.endsWith("/options")) return Response.json({ data: { id: ++registrations === 1 ? firstOptionId : secondOptionId, name: "  C++  " }, version: 1 });
      return Response.json({ data: { ...activeRecord, version: 2, propertyValues: body.propertyValues.set } });
    }));
    const rendered = render(<CareerDocumentEditor recordId={id} mode="page" record={record} category={category} />);
    expect(await screen.findByRole("button", { name: "Original 태그 삭제" })).toBeTruthy();
    const add = () => {
      const input = screen.getByLabelText("태그 태그 추가");
      fireEvent.change(input, { target: { value: "  C++  " } });
      fireEvent.keyDown(input, { key: "Enter" });
    };
    add();
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]).toEqual({ url: "/api/career/categories/" + id + "/property-schema/" + propertyId + "/options", body: { label: "  C++  " } });
    expect(requests[1]?.body).toEqual({ propertyValues: { set: [{ propertyDefinitionId: propertyId, type: "multi_select", value: [originalId, firstOptionId] }], unsetPropertyIds: [] } });
    expect(await screen.findByRole("button", { name: "C++ 태그 삭제" })).toBeTruthy();
    activeRecord = { ...record, id: nextRecordId };
    rendered.rerender(<CareerDocumentEditor recordId={nextRecordId} mode="page" record={activeRecord} category={{ ...category }} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "C++ 태그 삭제" })).toBeNull());
    add();
    await waitFor(() => expect(requests).toHaveLength(4));
    expect(requests[2]).toEqual(requests[0]);
    expect(requests[3]?.body).toEqual({ propertyValues: { set: [{ propertyDefinitionId: propertyId, type: "multi_select", value: [originalId, secondOptionId] }], unsetPropertyIds: [] } });
  });
  it("removes the redundant body status bar and keeps accessible formatting controls", async () => {
    render(<CareerDocumentEditor recordId="11111111-1111-4111-8111-111111111111" mode="page" />);
    expect(screen.queryByText("본문 편집")).toBeNull();
    expect(screen.getByRole("toolbar", { name: "텍스트 서식" })).toBeTruthy();
    const bold = screen.getByRole("button", { name: "굵게" });
    expect(bold.getAttribute("aria-pressed")).toBe("false");
    expect(bold.textContent).toBe("");
    expect(bold.querySelector(".ph-text-b")).toBeTruthy();
  });
});
