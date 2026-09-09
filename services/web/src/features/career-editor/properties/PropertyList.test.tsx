// @vitest-environment jsdom

import type { CareerPropertyDefinitionV2, CareerRecordListItem } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PropertyList } from "./PropertyList";

const textId = "00000000-0000-4000-8000-000000000001";
const numberId = "00000000-0000-4000-8000-000000000002";
const categoryId = "00000000-0000-4000-8000-000000000003";
const definitions: CareerPropertyDefinitionV2[] = [
  { id: textId, key: "role", name: "역할", type: "text", required: false, system: true, config: {}, order: 1, version: 1, deletedAt: null },
  { id: numberId, key: "salary", name: "급여", type: "number", required: false, system: true, config: {}, order: 2, version: 1, deletedAt: null },
];
const record: CareerRecordListItem = {
  id: "00000000-0000-4000-8000-000000000004",
  categoryId,
  categoryKey: "experience",
  title: "기록",
  status: "draft",
  origin: "manual",
  properties: { role: { type: "text", value: "stale legacy" } },
  propertyValues: [
    { propertyDefinitionId: textId, type: "text", value: "canonical" },
    { propertyDefinitionId: numberId, type: "number", value: "123.4500" },
  ],
  bodyMd: "",
  version: 1,
  updatedAt: "2026-09-09T00:00:00.000Z",
  isEmpty: false,
  periodFrom: null,
  periodTo: null,
  linkCount: 0,
  usedInCount: 0,
};

describe("PropertyList canonical propertyValues", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("reads canonical values and sends the complete snapshot when one value changes", async () => {
    const updated = { ...record, propertyValues: [
      { propertyDefinitionId: textId, type: "text" as const, value: "수정" },
      record.propertyValues![1]!,
    ], version: 2 };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: updated }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PropertyList record={record} definitions={definitions} categoryId={categoryId} />);

    const input = screen.getByLabelText("역할");
    expect((input as HTMLInputElement).value).toBe("canonical");
    fireEvent.change(input, { target: { value: "수정" } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/career/records/${record.id}`, expect.objectContaining({
      method: "PATCH",
      headers: expect.objectContaining({ "if-match": '"v1"' }),
      body: JSON.stringify({ propertyValues: updated.propertyValues }),
    })));
  });

  it("does not fall back to stale legacy values when the canonical snapshot is empty", () => {
    render(<PropertyList record={{ ...record, propertyValues: [] }} definitions={definitions} categoryId={categoryId} />);
    expect((screen.getByLabelText("역할") as HTMLInputElement).value).toBe("");
  });
});
