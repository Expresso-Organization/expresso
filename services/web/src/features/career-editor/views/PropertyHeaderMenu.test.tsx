// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PropertyHeaderMenu } from "./PropertyHeaderMenu";

const propertyId = "00000000-0000-4000-8000-000000000001";
const category = {
  id: "00000000-0000-4000-8000-000000000002",
  key: "custom",
  name: "사용자 카테고리",
  icon: "folder",
  defaultView: "table" as const,
  isSystem: false,
  propertySchema: {},
  propertySchemaV2: [{ id: propertyId, key: "role", name: "역할", type: "text" as const, required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }],
  schemaVersion: 1,
  sortOrder: 0,
  recordCount: 0,
  version: 1,
};
const view = {
  id: "00000000-0000-4000-8000-000000000003",
  categoryId: category.id,
  name: "표",
  type: "table" as const,
  version: 1,
  order: 0,
  filter: null,
  sorts: [],
  groupPropertyId: null,
  groupOrder: [],
  recordOrder: [],
  visiblePropertyIds: [propertyId],
  propertyOrder: [propertyId],
  columnWidths: {},
  gallery: null,
  board: null,
  timeline: null,
  createdAt: "2026-09-28T00:00:00.000Z",
  updatedAt: "2026-09-28T00:00:00.000Z",
};

afterEach(cleanup);

describe("PropertyHeaderMenu MVP schema actions", () => {
  it("keeps rename and create entrypoints while hiding type change and delete", () => {
    render(<PropertyHeaderMenu category={category} definition={category.propertySchemaV2[0]!} view={view} sortDirection={null} onViewChange={() => undefined} onCategoryChange={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: /역할/ }));

    expect(screen.getByLabelText("속성 이름")).toBeTruthy();
    expect(screen.getByRole("button", { name: "왼쪽에 삽입" })).toBeTruthy();
    expect(screen.queryByLabelText("속성 유형")).toBeNull();
    expect(screen.queryByRole("button", { name: "속성 삭제" })).toBeNull();
  });
});
