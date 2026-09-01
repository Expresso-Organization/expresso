// @vitest-environment jsdom

import type { CareerCategory, CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PropertyCreatePopover } from "./PropertyCreatePopover";

const categoryId = "00000000-0000-4000-8000-000000000010";
const definition: CareerPropertyDefinitionV2 = { id: "00000000-0000-4000-8000-000000000011", key: "note", name: "메모", type: "text", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null };
const category: CareerCategory = { id: categoryId, key: "test", name: "테스트", icon: "folder", defaultView: "table", isSystem: false, propertySchema: {}, propertySchemaV2: [definition], schemaVersion: 1, sortOrder: 0, recordCount: 1, version: 1 };

describe("PropertyCreatePopover", () => {
  const onChange = vi.fn();
  const onConflict = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    onChange.mockReset();
    onConflict.mockReset();
  });
  afterEach(cleanup);

  it("creates a basic property directly from the type list", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/preview")) return new Response(JSON.stringify({ data: { categoryVersion: 1, previewToken: "preview-token" } }), { status: 200, headers: { "content-type": "application/json" } });
      const change = JSON.parse(String(init?.body)).change;
      return new Response(JSON.stringify({ data: { propertySchemaV2: [definition, { ...change.property, id: crypto.randomUUID(), order: 1, version: 1, deletedAt: null }] } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PropertyCreatePopover categoryId={categoryId} definitions={[definition]} disabled={false} onDefinitionsChange={onChange} onVersionConflict={onConflict} />);

    fireEvent.click(screen.getByRole("button", { name: "속성 추가" }));
    expect(screen.queryByText("속성 관리")).toBeNull();
    fireEvent.change(screen.getByLabelText("속성 이름"), { target: { value: "지원 인원" } });
    fireEvent.click(screen.getByRole("option", { name: "숫자" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    const previewBody = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).includes("/preview"))?.[1]?.body));
    expect(previewBody).toMatchObject({ kind: "create", property: { name: "지원 인원", type: "number", config: {} } });
    expect(screen.queryByLabelText("속성 유형")).toBeNull();
  });

  it("uses valid empty options for a select property", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/preview")) return new Response(JSON.stringify({ data: { categoryVersion: 1, previewToken: "preview-token" } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ data: { propertySchemaV2: [definition] } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PropertyCreatePopover categoryId={categoryId} definitions={[definition]} disabled={false} onDefinitionsChange={onChange} onVersionConflict={onConflict} />);

    fireEvent.click(screen.getByRole("button", { name: "속성 추가" }));
    fireEvent.click(screen.getByRole("option", { name: "선택" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    const previewBody = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).includes("/preview"))?.[1]?.body));
    expect(previewBody.property).toMatchObject({ name: "선택", type: "select", config: { options: [] } });
  });

  it("keeps relation setup inside the popover", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/career/categories") return new Response(JSON.stringify({ data: [category] }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/preview")) return new Response(JSON.stringify({ data: { categoryVersion: 1, previewToken: "preview-token" } }), { status: 200, headers: { "content-type": "application/json" } });
      const change = JSON.parse(String(init?.body)).change;
      return new Response(JSON.stringify({ data: { propertySchemaV2: [definition, { ...change.property, id: crypto.randomUUID(), order: 1, version: 1, deletedAt: null }] } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PropertyCreatePopover categoryId={categoryId} definitions={[definition]} disabled={false} onDefinitionsChange={onChange} onVersionConflict={onConflict} />);

    fireEvent.click(screen.getByRole("button", { name: "속성 추가" }));
    fireEvent.change(screen.getByLabelText("속성 이름"), { target: { value: "연결 기록" } });
    fireEvent.click(screen.getByRole("option", { name: "관계" }));
    await screen.findByRole("button", { name: "관계 속성 추가" });
    await waitFor(() => expect(screen.getByRole("button", { name: "대상 카테고리" }).textContent).toContain("테스트"));
    const categorySelect = screen.getByRole("button", { name: "대상 카테고리" });
    fireEvent.click(categorySelect);
    fireEvent.keyDown(categorySelect, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "속성 추가" })).toBeTruthy();
    expect(screen.queryByRole("listbox", { name: "대상 카테고리 선택" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "관계 속성 추가" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    const previewBody = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).includes("/preview"))?.[1]?.body));
    expect(previewBody.property).toMatchObject({ name: "연결 기록", type: "relation", config: { targetCategoryId: categoryId, cardinality: "multiple", inversePropertyId: null, deletePolicy: "nullify" } });
  });
});
