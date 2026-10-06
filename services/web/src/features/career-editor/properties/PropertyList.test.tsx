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

  it("reads canonical values and delegates changes without writing independently", async () => {
    const onRecordCommit = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PropertyList record={record} definitions={definitions} categoryId={categoryId} onRecordCommit={onRecordCommit} />);

    const input = screen.getByLabelText("역할");
    expect((input as HTMLInputElement).value).toBe("canonical");
    fireEvent.change(input, { target: { value: "수정" } });
    fireEvent.blur(input);

    await waitFor(() => expect(onRecordCommit).toHaveBeenCalledWith(record.id, definitions[0], { type: "text", value: "수정" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fall back to stale legacy values when the canonical snapshot is empty", () => {
    render(<PropertyList record={{ ...record, propertyValues: [] }} definitions={definitions} categoryId={categoryId} />);
    expect((screen.getByLabelText("역할") as HTMLInputElement).value).toBe("");
  });

  it("renders a newer controlled record instead of keeping an authoritative local copy", async () => {
    const onRecordCommit = vi.fn().mockResolvedValue(undefined);
    const rendered = render(<PropertyList record={record} definitions={definitions} categoryId={categoryId} onRecordCommit={onRecordCommit} />);
    const latest = { ...record, title: "서버 제목", propertyValues: [
      { propertyDefinitionId: textId, type: "text" as const, value: "서버 역할" },
      record.propertyValues![1]!,
    ], version: 2 };

    rendered.rerender(<PropertyList record={latest} definitions={definitions} categoryId={categoryId} onRecordCommit={onRecordCommit} />);

    await waitFor(() => expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("서버 제목"));
    expect((screen.getByLabelText("역할") as HTMLInputElement).value).toBe("서버 역할");
  });
});
