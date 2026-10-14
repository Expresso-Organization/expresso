// @vitest-environment jsdom
import { parseCareerDocument } from "@expresso/editor";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

// 채팅의 네트워크·스크롤은 별도 테스트와 실제 브라우저에서 검증합니다.
vi.mock("@/features/agent-chat/AgentChat", () => ({ AgentChat: () => null }));
const update = vi.hoisted(() => vi.fn());
vi.mock("../session/useCareerEditorSession", () => ({ useCareerEditorSession: () => ({ snapshot: { status: "saving", documentVersion: 1, lastAckSequence: 0, proposal: null }, document: parseCareerDocument({ schemaVersion: 1, type: "doc", content: [{ id: "00000000-0000-4000-8000-000000000002", type: "paragraph", attrs: {}, text: [{ text: "Unsent live document" }] }] }), updateDocument: update }) }));
vi.mock("../ai/AiProposalPanel", () => ({ AiProposalPanel: ({ onApplied }: { onApplied: () => Promise<void> }) => <button type="button" onClick={() => void onApplied()}>Owner completed</button> }));
import { CareerDocumentEditor } from "./CareerDocumentEditor";
const id = "00000000-0000-4000-8000-000000000001", propertyId = "00000000-0000-4000-8000-000000000002";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); update.mockClear(); });
it("refreshes precise canonical properties after AI completion without replacing the live document", async () => {
  const record = { id, categoryId: id, title: "Record", status: "draft" as const, origin: "manual" as const, properties: {}, propertyValues: [{ propertyDefinitionId: propertyId, type: "number" as const, value: "123.4500" }], bodyMd: "Old physical body", version: 1, updatedAt: "2026-10-09T00:00:00Z", categoryKey: "test", isEmpty: false, periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0 };
  const category = { id, key: "test", name: "Test", icon: "file", defaultView: "table" as const, isSystem: false, propertySchema: {}, propertySchemaV2: [{ id: propertyId, key: "amount", name: "Amount", type: "number" as const, required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }], sortOrder: 0, recordCount: 1, version: 1 };
  const fetcher = vi.fn(async (url: string) => url === "/api/career/categories" ? Response.json({ data: [category] }) : Response.json({ data: { id, categoryId: id, title: record.title, status: record.status, origin: record.origin, properties: record.properties, bodyMd: record.bodyMd, updatedAt: record.updatedAt, version: 2, propertyValues: [{ propertyDefinitionId: propertyId, type: "number", value: "9007199254740993123456789012345678" }] }, resource: { version: 2, updatedAt: record.updatedAt } }));
  vi.stubGlobal("fetch", fetcher);
  render(<CareerDocumentEditor recordId={id} mode="page" record={record} category={category} />);
  const editor = await screen.findByLabelText("커리어 기록 본문");
  fireEvent.click(screen.getByRole("button", { name: "Owner completed" }));
  await waitFor(() => expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("9007199254740993123456789012345678"));
  expect(screen.getByLabelText("커리어 기록 본문")).toBe(editor);
  expect(editor.textContent).toContain("Unsent live document");
  expect(update).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/api/career/records/" + id, "/api/career/categories"]);
});