// @vitest-environment jsdom
import type { CareerCategory, CareerPropertyDefinitionV2, CareerRecordListItem } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";

const titleDefinition: CareerPropertyDefinitionV2 = {
  id: "00000000-0000-4000-8000-000000000010", key: "title", name: "제목", type: "title",
  required: false, system: true, config: {}, order: 0, version: 1, deletedAt: null,
};
const textDefinition: CareerPropertyDefinitionV2 = {
  id: "00000000-0000-4000-8000-000000000011", key: "role", name: "역할", type: "text",
  required: false, system: false, config: {}, order: 1, version: 1, deletedAt: null,
};
const categoryId = "00000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000002";
const record: CareerRecordListItem = {
  id: recordId, categoryId, categoryKey: "test", title: "기존 제목", status: "draft", origin: "manual",
  properties: {}, propertyValues: [], bodyMd: "", version: 1, updatedAt: "2026-09-01T00:00:00.000Z",
  isEmpty: false, periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0,
};
const category: CareerCategory = {
  id: categoryId, key: "test", name: "테스트", icon: "table", defaultView: "table", isSystem: false,
  propertySchema: {}, propertySchemaV2: [titleDefinition, textDefinition], schemaVersion: 1,
  sortOrder: 0, recordCount: 1, version: 1,
};

vi.mock("./CareerDocumentEditor", () => ({
  CareerDocumentEditor: ({ record: current, onRecordCommit }: {
    record: CareerRecordListItem;
    onRecordCommit: (recordId: string, definition: CareerPropertyDefinitionV2,
      value: { type: "title" | "text"; value: string }) => Promise<void>;
  }) => <div>
    <output>{current.title}:{current.version}:{current.propertyValues?.length}</output>
    <button onClick={() => void onRecordCommit(current.id, titleDefinition, { type: "title", value: "새 제목" })}>제목 저장</button>
    <button onClick={() => void onRecordCommit(current.id, textDefinition, { type: "text", value: "개발자" })}>속성 저장</button>
  </div>,
}));

import { CareerRecordPageEditor } from "./CareerRecordPageEditor";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("독립 Record 화면에서 제목과 속성을 Spring PATCH로 저장하고 최신 응답을 반영한다", async () => {
  let stored = record;
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { title?: string; propertyValues?: CareerRecordListItem["propertyValues"] };
    stored = { ...stored, ...body, version: stored.version + 1 };
    return Response.json({ data: stored });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<CareerRecordPageEditor record={record} category={category} />);
  fireEvent.click(screen.getByRole("button", { name: "제목 저장" }));
  await waitFor(() => expect(screen.getByText("새 제목:2:0")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "속성 저장" }));
  await waitFor(() => expect(screen.getByText("새 제목:3:1")).toBeTruthy());
  expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/career/records/${recordId}`,
    expect.objectContaining({ headers: expect.objectContaining({ "if-match": '"v2"' }) }));
});

it("독립 Record 화면에서도 412 후 최신 version으로 재시도한다", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 412 }))
    .mockResolvedValueOnce(Response.json({ data: { ...record, title: "서버 제목", version: 2 } }))
    .mockResolvedValueOnce(Response.json({ data: { ...record, title: "새 제목", version: 3 } }));
  vi.stubGlobal("fetch", fetchMock);
  render(<CareerRecordPageEditor record={record} category={category} />);
  fireEvent.click(screen.getByRole("button", { name: "제목 저장" }));
  await waitFor(() => expect(screen.getByText("새 제목:3:0")).toBeTruthy());
  expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/career/records/${recordId}`,
    expect.objectContaining({ headers: expect.objectContaining({ "if-match": '"v2"' }) }));
});
