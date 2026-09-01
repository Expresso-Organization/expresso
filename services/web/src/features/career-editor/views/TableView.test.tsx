// @vitest-environment jsdom

import type { CareerCategory, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TableView } from "./TableView";

const ids = Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const [categoryId, titleId, roleId, outcomeId, technologiesId, scoreId] = ids as [string, string, string, string, string, string];
const category: CareerCategory = {
  id: categoryId, key: "project", name: "프로젝트", icon: "briefcase", defaultView: "table", isSystem: true, propertySchema: {}, schemaVersion: 1, sortOrder: 0, recordCount: 2, version: 1,
  propertySchemaV2: [
    { id: titleId, key: "title", name: "제목", type: "title", required: true, system: true, config: {}, order: 0, version: 1, deletedAt: null },
    { id: roleId, key: "role", name: "역할", type: "text", required: false, system: false, config: {}, order: 1, version: 1, deletedAt: null },
    { id: outcomeId, key: "outcome", name: "성과", type: "text", required: false, system: false, config: {}, order: 2, version: 1, deletedAt: null },
    { id: technologiesId, key: "technologies", name: "기술", type: "multi_select", required: false, system: false, config: { options: [] }, order: 3, version: 1, deletedAt: null },
    { id: scoreId, key: "score", name: "점수", type: "number", required: false, system: false, config: {}, order: 4, version: 1, deletedAt: null },
  ],
};
const view: CareerViewConfiguration = { id: categoryId, categoryId, name: "기본", type: "table", version: 1, order: 0, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], recordOrder: [], visiblePropertyIds: [titleId, roleId, outcomeId, technologiesId, scoreId], propertyOrder: [titleId, technologiesId, outcomeId, roleId, scoreId], columnWidths: {}, gallery: null, board: null, timeline: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
const records: CareerRecord[] = [
  { id: ids[0]!, categoryId, title: "두 번째", status: "draft", origin: "manual", bodyMd: "", properties: { role: { type: "text", value: "개발" }, outcome: { type: "text", value: "20% 개선" }, technologies: { type: "multi_select", value: ["React", "Go"] }, score: { type: "number", value: 2 } }, version: 1, updatedAt: "2026-09-01T00:00:00.000Z" },
  { id: ids[1]!, categoryId, title: "첫 번째", status: "verified", origin: "manual", bodyMd: "", properties: {}, version: 1, updatedAt: "2026-09-01T00:00:00.000Z" },
];

describe("TableView", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("renders every ordered property with tags, summaries, sorting and accessible resizing", () => {
    const onViewChange = vi.fn();
    render(<TableView records={records} view={view} category={category} activeId={records[0]!.id} openId={null} selectedIds={new Set()} onActivate={() => undefined} onCreate={() => undefined} onFillMissing={() => undefined} onToggle={() => undefined} onViewChange={onViewChange} onCategoryChange={() => undefined} />);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["", "제목", "기술", "성과", "역할", "점수"]);
    expect(screen.getByText("React")).toBeTruthy();
    expect(screen.getByText("Go")).toBeTruthy();
    expect(screen.getByText("2개 기록")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "성과" }));
    expect(screen.getByRole("dialog", { name: "성과 속성 편집" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "오름차순 정렬" }));
    expect(onViewChange).toHaveBeenLastCalledWith(expect.objectContaining({ sorts: [{ propertyId: outcomeId, direction: "asc", nulls: "last" }] }));
    fireEvent.keyDown(screen.getByRole("separator", { name: "기술 열 너비 조절" }), { key: "ArrowRight" });
    expect(onViewChange).toHaveBeenLastCalledWith(expect.objectContaining({ columnWidths: expect.objectContaining({ [technologiesId]: 176 }) }));
  });

  it("reorders rows from the Notion-style drag handle and keeps the custom selection control accessible", () => {
    const onViewChange = vi.fn();
    const { rerender } = render(<TableView records={records} view={{ ...view, sorts: [{ propertyId: scoreId, direction: "asc", nulls: "last" }] }} category={category} activeId={records[0]!.id} openId={null} selectedIds={new Set()} onActivate={() => undefined} onCreate={() => undefined} onFillMissing={() => undefined} onToggle={() => undefined} onViewChange={onViewChange} onCategoryChange={() => undefined} />);
    const dataTransfer = { effectAllowed: "none", dropEffect: "none", setData: vi.fn() };
    fireEvent.dragStart(screen.getByRole("button", { name: "첫 번째 순서 변경" }), { dataTransfer });
    const targetRow = screen.getByRole("row", { name: /두 번째 선택/ });
    targetRow.getBoundingClientRect = () => ({ top: 0, height: 42 } as DOMRect);
    fireEvent.dragOver(targetRow, { dataTransfer, clientY: 32 });
    fireEvent.drop(targetRow, { dataTransfer, clientY: 32 });
    expect(onViewChange).toHaveBeenCalledWith(expect.objectContaining({ sorts: [], recordOrder: [records[1]!.id, records[0]!.id] }));
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", records[1]!.id);

    fireEvent.keyDown(screen.getByRole("button", { name: "두 번째 순서 변경" }), { key: "ArrowDown" });
    expect(onViewChange).toHaveBeenLastCalledWith(expect.objectContaining({ sorts: [], recordOrder: [records[1]!.id, records[0]!.id] }));

    rerender(<TableView records={records} view={view} category={category} activeId={records[0]!.id} openId={null} selectedIds={new Set([records[0]!.id])} onActivate={() => undefined} onCreate={() => undefined} onFillMissing={() => undefined} onToggle={() => undefined} onViewChange={onViewChange} onCategoryChange={() => undefined} />);
    expect(screen.getByRole("checkbox", { name: "두 번째 선택" }).parentElement?.dataset.checked).toBe("true");
  });

  it("renames a custom property through preview and apply", async () => {
    const editableCategory = { ...category, isSystem: false };
    const renamed = { ...editableCategory, version: 2, propertySchemaV2: editableCategory.propertySchemaV2?.map((item) => item.id === roleId ? { ...item, name: "담당 역할", version: 2 } : item) };
    const onCategoryChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { categoryId, categoryVersion: 1, change: { kind: "rename", propertyId: roleId, name: "담당 역할" }, impact: { affectedRecordCount: 0, convertibleCount: 0, lossyExamples: [], dependentViews: [], dependentFormulas: [], dependentRollups: [] }, previewToken: "x".repeat(40) } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: renamed }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<TableView records={records} view={view} category={editableCategory} activeId={records[0]!.id} openId={null} selectedIds={new Set()} onActivate={() => undefined} onCreate={() => undefined} onFillMissing={() => undefined} onToggle={() => undefined} onViewChange={() => undefined} onCategoryChange={onCategoryChange} />);
    fireEvent.click(screen.getByRole("button", { name: "역할" }));
    const input = screen.getByRole("textbox", { name: "속성 이름" });
    fireEvent.change(input, { target: { value: "담당 역할" } });
    fireEvent.blur(input);
    await waitFor(() => expect(onCategoryChange).toHaveBeenCalledWith(renamed, undefined));
  });

  it("resizes the implicit title column in a custom category", () => {
    const onViewChange = vi.fn();
    const customCategory = { ...category, isSystem: false, propertySchemaV2: category.propertySchemaV2?.filter((item) => item.id !== titleId) };
    const customView = { ...view, visiblePropertyIds: view.visiblePropertyIds.filter((id) => id !== titleId), propertyOrder: view.propertyOrder.filter((id) => id !== titleId) };
    render(<TableView records={records} view={customView} category={customCategory} activeId={records[0]!.id} openId={null} selectedIds={new Set()} onActivate={() => undefined} onCreate={() => undefined} onFillMissing={() => undefined} onToggle={() => undefined} onViewChange={onViewChange} onCategoryChange={() => undefined} />);
    fireEvent.keyDown(screen.getByRole("separator", { name: "제목 열 너비 조절" }), { key: "ArrowLeft" });
    expect(onViewChange).toHaveBeenCalledWith(expect.objectContaining({ columnWidths: expect.objectContaining({ [categoryId]: 244 }) }));
  });

  it("renders collapsible table sections for grouped multi-select values", () => {
    const groupedView = { ...view, groupPropertyId: technologiesId };
    const onCreate = vi.fn();
    render(<TableView records={records} view={groupedView} category={category} activeId={records[0]!.id} openId={null} selectedIds={new Set()} onActivate={() => undefined} onCreate={onCreate} onFillMissing={() => undefined} onToggle={() => undefined} onViewChange={() => undefined} onCategoryChange={() => undefined} />);
    expect(screen.getByRole("region", { name: "기술 없음 그룹" })).toBeTruthy();
    expect(screen.getByRole("grid", { name: "React 그룹 테이블" })).toBeTruthy();
    expect(screen.getByRole("grid", { name: "Go 그룹 테이블" })).toBeTruthy();
    expect(screen.getAllByRole("gridcell", { name: "두 번째" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "React 그룹에 새 기록" }));
    expect(onCreate).toHaveBeenCalledWith({ technologies: { type: "multi_select", value: ["React"] } });
    fireEvent.click(screen.getByRole("button", { name: "React 그룹 접기" }));
    expect(screen.queryByRole("grid", { name: "React 그룹 테이블" })).toBeNull();
    expect(screen.getByRole("button", { name: "React 그룹 펼치기" })).toBeTruthy();
  });
});
