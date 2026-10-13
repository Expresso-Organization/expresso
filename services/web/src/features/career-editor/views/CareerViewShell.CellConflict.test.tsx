// @vitest-environment jsdom
import type { CareerCategory, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { CareerViewShell } from "./CareerViewShell";

const id = "00000000-0000-4000-8000-000000000071";
const scoreId = "00000000-0000-4000-8000-000000000072";
const updatedAt = "2026-10-09T00:00:00Z";
const category: CareerCategory = { id, key: "conflict", name: "충돌 확인", icon: "table", defaultView: "table", isSystem: false, propertySchema: {}, propertySchemaV2: [{ id: scoreId, key: "score", name: "점수", type: "number", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }], sortOrder: 0, recordCount: 1, version: 1 };
const record: CareerRecord = { id, categoryId: id, title: "동시 편집 기록", status: "draft", origin: "manual", properties: {}, propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: "10.0000" }], bodyMd: "", version: 1, updatedAt };
const view: CareerViewConfiguration = { id: "local-" + id, categoryId: id, name: "기본", type: "table", version: 1, order: 0, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], recordOrder: [], visiblePropertyIds: [scoreId], propertyOrder: [scoreId], columnWidths: {}, gallery: null, board: null, timeline: null, createdAt: updatedAt, updatedAt };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });

function editCell() {
  const cell = screen.getByRole("gridcell", { name: "10.0000" });
  fireEvent.focus(cell); fireEvent.keyDown(cell, { key: "F2" });
  const input = screen.getByLabelText("점수 셀 편집");
  fireEvent.change(input, { target: { value: "30.0000" } });
  fireEvent.keyDown(input, { key: "Enter" });
}

describe("canonical cell conflict", () => {
  it.each([409, 412])("preserves a newer value after HTTP %s and retains the original request for an explicit retry", async (status) => {
    const latest: CareerRecord = { ...record, version: 2, propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: "20.0000" }] };
    let allowLatestEdit = false;
    const writes: Array<{ version: string | null; key: string | null; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const headers = new Headers(init.headers);
        writes.push({ version: headers.get("if-match"), key: headers.get("idempotency-key"), body: JSON.parse(String(init.body)) });
        return allowLatestEdit ? Response.json({ data: { ...latest, version: 3, propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: "40.0000" }] } }) : new Response(null, { status });
      }
      return Response.json({ data: latest });
    }));
    render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [record], page: { hasNextPage: false, nextCursor: null } }} />);
    editCell();
    const latestCell = await screen.findByRole("gridcell", { name: "20.0000" });
    expect(latestCell.getAttribute("data-issue")).toBe("true");
    expect(latestCell.getAttribute("title")).toContain("충돌");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.version).toBe('"v1"');
    fireEvent.contextMenu(latestCell);
    fireEvent.click(screen.getByRole("menuitem", { name: "다시 저장" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("gridcell", { name: "20.0000" }).getAttribute("data-issue")).toBe("true"));
    expect(writes[1]).toEqual(writes[0]);
    expect(writes[0]?.body).toEqual({ propertyValues: { set: [{ propertyDefinitionId: scoreId, type: "number", value: "30.0000" }], unsetPropertyIds: [] } });
    allowLatestEdit = true;
    fireEvent.focus(latestCell); fireEvent.keyDown(latestCell, { key: "F2" });
    const input = screen.getByLabelText("점수 셀 편집");
    fireEvent.change(input, { target: { value: "40.0000" } }); fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(writes).toHaveLength(3));
    await waitFor(() => expect(screen.getByRole("gridcell", { name: "40.0000" }).getAttribute("data-issue")).toBe("false"));
    expect(writes[2]?.version).toBe('"v2"');
    expect(writes[2]?.key).not.toBe(writes[0]?.key);
    expect(writes[2]?.body).toEqual({ propertyValues: { set: [{ propertyDefinitionId: scoreId, type: "number", value: "40.0000" }], unsetPropertyIds: [] } });
  });

  it("recovers a lost successful response using the same key, version and frozen payload", async () => {
    const completed: CareerRecord = { ...record, version: 2, propertyValues: [{ propertyDefinitionId: scoreId, type: "number", value: "30.0000" }] };
    const writes: Array<{ version: string | null; key: string | null; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const headers = new Headers(init.headers);
        writes.push({ version: headers.get("if-match"), key: headers.get("idempotency-key"), body: JSON.parse(String(init.body)) });
        if (writes.length === 1) return new Response(null, { status: 503 });
      }
      return Response.json({ data: completed });
    }));
    render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [record], page: { hasNextPage: false, nextCursor: null } }} />);
    editCell();
    const cell = await screen.findByRole("gridcell", { name: "30.0000" });
    await waitFor(() => expect(cell.getAttribute("data-issue")).toBe("true"));
    fireEvent.contextMenu(cell);
    fireEvent.click(screen.getByRole("menuitem", { name: "다시 저장" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    await waitFor(() => expect(cell.getAttribute("data-issue")).toBe("false"));
    expect(writes[1]).toEqual(writes[0]);
    expect(writes[0]?.version).toBe('"v1"');
  });
});