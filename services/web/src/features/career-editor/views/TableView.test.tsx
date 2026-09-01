// @vitest-environment jsdom

import type { CareerCategory, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
const view: CareerViewConfiguration = { id: categoryId, categoryId, name: "기본", type: "table", version: 1, order: 0, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], visiblePropertyIds: [titleId, roleId, outcomeId, technologiesId, scoreId], propertyOrder: [titleId, technologiesId, outcomeId, roleId, scoreId], columnWidths: {}, gallery: null, board: null, timeline: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
const records: CareerRecord[] = [
  { id: ids[0]!, categoryId, title: "두 번째", status: "draft", origin: "manual", bodyMd: "", properties: { role: { type: "text", value: "개발" }, outcome: { type: "text", value: "20% 개선" }, technologies: { type: "multi_select", value: ["React", "Go"] }, score: { type: "number", value: 2 } }, version: 1, updatedAt: "2026-09-01T00:00:00.000Z" },
  { id: ids[1]!, categoryId, title: "첫 번째", status: "verified", origin: "manual", bodyMd: "", properties: {}, version: 1, updatedAt: "2026-09-01T00:00:00.000Z" },
];

describe("TableView", () => {
  afterEach(cleanup);
  it("renders every ordered property with tags, summaries, sorting and accessible resizing", () => {
    const onViewChange = vi.fn();
    render(<TableView records={records} view={view} category={category} activeId={records[0]!.id} openId={null} selectedIds={new Set()} onActivate={() => undefined} onCreate={() => undefined} onFillMissing={() => undefined} onToggle={() => undefined} onViewChange={onViewChange} />);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["선택", "제목", "기술", "성과", "역할", "점수"]);
    expect(screen.getByText("React")).toBeTruthy();
    expect(screen.getByText("Go")).toBeTruthy();
    expect(screen.getByText("2개 기록")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "성과" }));
    expect(onViewChange).toHaveBeenLastCalledWith(expect.objectContaining({ sorts: [{ propertyId: outcomeId, direction: "asc", nulls: "last" }] }));
    fireEvent.keyDown(screen.getByRole("separator", { name: "기술 열 너비 조절" }), { key: "ArrowRight" });
    expect(onViewChange).toHaveBeenLastCalledWith(expect.objectContaining({ columnWidths: expect.objectContaining({ [technologiesId]: 176 }) }));
  });
});
