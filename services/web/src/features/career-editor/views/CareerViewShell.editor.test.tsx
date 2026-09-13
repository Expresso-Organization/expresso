// @vitest-environment jsdom

import type { CareerCategory, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";
import { createEmptyCareerDocument } from "@expresso/editor";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), updateDocument: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../session/useCareerEditorSession", () => ({
  useCareerEditorSession: () => ({
    snapshot: { status: "saved", documentVersion: 1, lastAckSequence: 1, proposal: null },
    document: createEmptyCareerDocument(),
    updateDocument: mocks.updateDocument,
  }),
}));
vi.mock("../ai/AiProposalPanel", () => ({ AiProposalPanel: () => null }));

import { CareerViewShell } from "./CareerViewShell";

const categoryId = "00000000-0000-4000-8000-000000000001";
const roleId = "00000000-0000-4000-8000-000000000003";
const recordId = "00000000-0000-4000-8000-000000000004";

const category: CareerCategory = {
  id: categoryId,
  key: "project",
  name: "프로젝트",
  icon: "briefcase",
  defaultView: "table",
  isSystem: false,
  propertySchema: {},
  propertySchemaV2: [
    { id: roleId, key: "role", name: "역할", type: "text", required: false, system: false, config: {}, order: 1, version: 1, deletedAt: null },
  ],
  schemaVersion: 1,
  sortOrder: 0,
  recordCount: 1,
  version: 1,
};

const record: CareerRecord = {
  id: recordId,
  categoryId,
  title: "초기 제목",
  status: "draft",
  origin: "manual",
  properties: {},
  propertyValues: [{ propertyDefinitionId: roleId, type: "text", value: "초기 역할" }],
  bodyMd: "",
  version: 1,
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const view: CareerViewConfiguration = {
  id: `local-${categoryId}`,
  categoryId,
  name: "기본 뷰",
  type: "table",
  version: 1,
  order: 0,
  filter: null,
  sorts: [],
  groupPropertyId: null,
  groupOrder: [],
  recordOrder: [],
  visiblePropertyIds: [roleId],
  propertyOrder: [roleId],
  columnWidths: {},
  gallery: null,
  board: null,
  timeline: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function response(data: CareerRecord, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
}

function renderShell() {
  return render(<CareerViewShell category={category} initialView={view} initialPage={{ data: [record], page: { hasNextPage: false, nextCursor: null } }} />);
}

describe("CareerViewShell editor save authority", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.updateDocument.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("serializes panel title and property writes through one record queue and reopens with the server version", async () => {
    let finishTitle!: (value: Response) => void;
    const titleResponse = new Promise<Response>((resolve) => { finishTitle = resolve; });
    const afterTitle = { ...record, title: "서버 제목", version: 2 };
    const afterProperty = { ...afterTitle, propertyValues: [{ propertyDefinitionId: roleId, type: "text" as const, value: "새 역할" }], version: 3 };
    const fetchMock = vi.fn()
      .mockReturnValueOnce(titleResponse)
      .mockResolvedValueOnce(response(afterProperty))
      .mockResolvedValueOnce(response({ ...afterProperty, title: "다시 연 제목", version: 4 }));
    vi.stubGlobal("fetch", fetchMock);

    renderShell();
    fireEvent.click(screen.getByRole("gridcell", { name: "초기 제목" }));
    const title = await screen.findByLabelText("제목");
    const role = screen.getByLabelText("역할");
    fireEvent.change(title, { target: { value: "사용자 제목" } });
    fireEvent.blur(title);
    fireEvent.change(role, { target: { value: "새 역할" } });
    fireEvent.blur(role);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: "PATCH",
      headers: expect.objectContaining({ "if-match": '"v1"' }),
      body: JSON.stringify({ title: "사용자 제목" }),
    }));

    finishTitle(response(afterTitle));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      method: "PATCH",
      headers: expect.objectContaining({ "if-match": '"v2"' }),
      body: JSON.stringify({ propertyValues: afterProperty.propertyValues }),
    }));
    await waitFor(() => expect((title as HTMLInputElement).value).toBe("서버 제목"));

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "서버 제목" }));
    const reopenedTitle = await screen.findByLabelText("제목");
    expect((reopenedTitle as HTMLInputElement).value).toBe("서버 제목");
    fireEvent.change(reopenedTitle, { target: { value: "다시 연 제목" } });
    fireEvent.blur(reopenedTitle);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ "if-match": '"v3"' }) }));
  });

  it("keeps the 412 GET record in the shell even when retry and fallback GET fail", async () => {
    const latest = { ...record, title: "외부 최신 제목", propertyValues: [{ propertyDefinitionId: roleId, type: "text" as const, value: "외부 최신 역할" }], version: 2 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 412 }))
      .mockResolvedValueOnce(response(latest))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(response({ ...latest, title: "후속 제목", version: 3 }));
    vi.stubGlobal("fetch", fetchMock);

    renderShell();
    fireEvent.click(screen.getByRole("gridcell", { name: "초기 제목" }));
    const role = await screen.findByLabelText("역할");
    fireEvent.change(role, { target: { value: "내 역할" } });
    fireEvent.blur(role);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    expect(screen.getByRole("gridcell", { name: "외부 최신 제목" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "외부 최신 제목" }));
    const title = await screen.findByLabelText("제목");
    expect((title as HTMLInputElement).value).toBe("외부 최신 제목");
    fireEvent.change(title, { target: { value: "후속 제목" } });
    fireEvent.blur(title);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls[4]?.[1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ "if-match": '"v2"' }) }));
  });
});
