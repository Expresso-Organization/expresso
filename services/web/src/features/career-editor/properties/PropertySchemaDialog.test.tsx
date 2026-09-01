// @vitest-environment jsdom

import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertySchemaDialog } from "./PropertySchemaDialog";

const categoryId = "00000000-0000-4000-8000-000000000010";
const propertyId = "00000000-0000-4000-8000-000000000011";
const definition: CareerPropertyDefinitionV2 = { id: propertyId, key: "note", name: "메모", type: "text", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null };
const preview = (change: unknown) => ({ data: { categoryId, categoryVersion: 1, change, impact: { affectedRecordCount: 2, convertibleCount: 2, lossyExamples: [{ recordId: "00000000-0000-4000-8000-000000000012", before: "A", after: 1 }], dependentViews: ["00000000-0000-4000-8000-000000000013"], dependentFormulas: [], dependentRollups: [] }, previewToken: "x".repeat(40) } });

describe("PropertySchemaDialog", () => {
  const onConflict = vi.fn(); const onChange = vi.fn();
  beforeEach(() => { vi.restoreAllMocks(); onConflict.mockReset(); onChange.mockReset(); });
  afterEach(cleanup);

  it("previews type loss, requires the exact phrase, and applies", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => new Response(JSON.stringify(preview(JSON.parse(String(init.body)))), { status: 200, headers: { "content-type": "application/json" } }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { propertySchemaV2: [{ ...definition, type: "number", version: 2 }], version: 2 } }), { status: 200, headers: { "content-type": "application/json" } }));
    render(<PropertySchemaDialog open categoryId={categoryId} version={1} definitions={[definition]} onClose={() => undefined} onDefinitionsChange={onChange} onVersionConflict={onConflict} />);
    fireEvent.change(screen.getByLabelText("타입"), { target: { value: "number" } });
    fireEvent.click(screen.getByRole("button", { name: "타입·선택지 변경 확인" }));
    expect(await screen.findByText(/값 2개/)).toBeTruthy();
    const apply = screen.getByRole("button", { name: "변경 적용" }); expect((apply as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("손실 확인 문구"), { target: { value: "2개 값 변경" } });
    expect((apply as HTMLButtonElement).disabled).toBe(false); fireEvent.click(apply);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("previews keyboard reorder and refreshes after a version conflict", async () => {
    const second = { ...definition, id: "00000000-0000-4000-8000-000000000014", key: "second", name: "둘째", order: 1 };
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => new Response(JSON.stringify(preview(JSON.parse(String(init.body)))), { status: 200, headers: { "content-type": "application/json" } }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));
    render(<PropertySchemaDialog open categoryId={categoryId} version={1} definitions={[definition, second]} onClose={() => undefined} onDefinitionsChange={onChange} onVersionConflict={onConflict} />);
    fireEvent.keyDown(screen.getByText("둘째").closest("div")!, { key: "ArrowUp" });
    expect(await screen.findByText(/영향 확인/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("손실 확인 문구"), { target: { value: "2개 값 변경" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 적용" }));
    await waitFor(() => expect(onConflict).toHaveBeenCalled());
  });

  it("keeps a formula draft while a validated configuration waits for schema approval", async () => {
    const formula = { ...definition, type: "formula" as const, config: { source: "1", ast: null, diagnostics: [] } };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/formulas/preview")) return new Response(JSON.stringify({ data: { source: "1 + 2", ast: { version: 1 }, diagnostics: [], value: { type: "formula", value: 3, diagnostics: [] }, dependencies: [] } }), { status: 200, headers: { "content-type": "application/json" } });
      const change = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(preview(change)), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PropertySchemaDialog open categoryId={categoryId} version={1} definitions={[formula]} onClose={() => undefined} onDefinitionsChange={onChange} onVersionConflict={onConflict} />);
    fireEvent.change(screen.getByLabelText("수식"), { target: { value: "1 + 2" } });
    fireEvent.click(screen.getByRole("button", { name: "수식 저장" }));
    expect(await screen.findByText(/영향 확인/)).toBeTruthy();
    expect((screen.getByLabelText("수식") as HTMLTextAreaElement).value).toBe("1 + 2");
    const schemaPreview = fetchMock.mock.calls.find(([url]) => String(url).includes("property-schema/preview"));
    expect(JSON.parse(String(schemaPreview?.[1]?.body))).toEqual(expect.objectContaining({ kind: "configure", propertyId }));
  });
});
