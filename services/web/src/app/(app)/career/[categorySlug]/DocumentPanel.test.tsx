// @vitest-environment jsdom
import type { CareerCategory, CareerRecordListItem } from "@expresso/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type SaveStatus = "loading" | "saving" | "offline" | "conflict" | "saved";
const saveCallbacks = vi.hoisted(() => new Map<string, (status: SaveStatus) => void>());
afterEach(() => { cleanup(); saveCallbacks.clear(); });

const requestCallbacks = vi.hoisted(() => new Map<string, () => void>());

vi.mock("@/features/career-editor/editor/CareerDocumentEditor", () => ({
  CareerDocumentEditor: ({ recordId, onAiRequest, onSaveStatusChange }: { recordId: string; onSaveStatusChange?: (status: SaveStatus) => void; onAiRequest?: (request: { id: string; recordId: string; prompt: string; blockIds: string[] }) => void }) => { if (onSaveStatusChange) saveCallbacks.set(recordId, onSaveStatusChange); return <div>편집기 {recordId}<button type="button" onClick={() => onAiRequest?.({ id: "selection-request", recordId, prompt: "선택한 문장을 짧게", blockIds: ["00000000-0000-4000-8000-000000000003"] })}>선택 AI 요청</button><button type="button" onClick={() => onAiRequest?.({ id: "selection-request-B", recordId, prompt: "다음 요청 B", blockIds: ["00000000-0000-4000-8000-000000000003"] })}>다음 선택 AI 요청</button></div>; },
}));
vi.mock("@/features/career-editor/ai/AiProposalPanel", () => ({ AiProposalPanel: ({ requestedPrompt, onRequestHandled }: { requestedPrompt?: { id: string; prompt: string } | null; onRequestHandled?: () => void }) => { if (requestedPrompt && onRequestHandled) requestCallbacks.set(requestedPrompt.id, onRequestHandled); return <div>AI {requestedPrompt?.prompt}</div>; } }));
vi.mock("@/features/career-editor/session/useCareerEditorSession", () => ({
  useCareerEditorSession: () => ({ snapshot: { documentVersion: 1, proposal: null }, document: { content: [] } }),
}));

import { DocumentPanel } from "./DocumentPanel";

const category = {
  id: "00000000-0000-4000-8000-000000000001", key: "project", name: "프로젝트", icon: "briefcase", defaultView: "gallery",
  isSystem: true, propertySchema: {}, propertySchemaV2: [], schemaVersion: 1, sortOrder: 0, recordCount: 1, version: 1,
} satisfies CareerCategory;
const record = {
  id: "00000000-0000-4000-8000-000000000002", categoryId: category.id, categoryKey: category.key, title: "드로워 기록",
  status: "draft", origin: "manual", properties: {}, bodyMd: "", version: 1, updatedAt: "2026-09-01T00:00:00.000Z",
  isEmpty: false, periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0,
} satisfies CareerRecordListItem;

describe("DocumentPanel", () => {
  afterEach(cleanup);

  it("stays outside the page until a record opens it", () => {
    const close = vi.fn();
    const view = render(<DocumentPanel record={null} category={category} onClose={close} />);
    const drawer = screen.getByLabelText("문서 패널");
    expect(drawer.getAttribute("data-open")).toBe("false");
    expect(drawer.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("separator", { hidden: true }).getAttribute("tabindex")).toBe("-1");

    view.rerender(<DocumentPanel record={record} category={category} onClose={close} />);
    expect(drawer.getAttribute("data-open")).toBe("true");
    expect(drawer.getAttribute("aria-hidden")).toBeNull();
    expect(screen.getByText(`편집기 ${record.id}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("resizes with an accessible keyboard separator", () => {
    render(<DocumentPanel record={record} category={category} onClose={() => undefined} />);
    const drawer = screen.getByLabelText("문서 패널");
    const separator = screen.getByRole("separator", { name: "문서 패널 너비 조절" });
    expect(separator.getAttribute("aria-valuenow")).toBe("680");
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator.getAttribute("aria-valuenow")).toBe("704");
    expect(drawer.getAttribute("style")).toContain("--career-drawer-width: 704px");
    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator.getAttribute("aria-valuenow")).toBe("360");
  });

  it("tracks pointer resizing across the whole window", () => {
    render(<DocumentPanel record={record} category={category} onClose={() => undefined} />);
    const drawer = screen.getByLabelText("문서 패널");
    const separator = screen.getByRole("separator", { name: "문서 패널 너비 조절" });
    fireEvent.pointerDown(separator, { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 400 });
    expect(separator.getAttribute("aria-valuenow")).toBe("780");
    expect(drawer.getAttribute("style")).toContain("--career-drawer-width: 780px");
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 400 });
    expect(drawer.getAttribute("data-resizing")).toBe("false");
  });

  it("routes editor selection actions into the drawer AI review dock", () => {
    render(<DocumentPanel record={record} category={category} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "선택 AI 요청" }));
    expect(screen.getByText(/AI 선택한 문장을 짧게/)).toBeTruthy();
  });
});

it("keeps editor request B when the captured completion for request A arrives", () => {
  render(<DocumentPanel record={record} category={category} onClose={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: "선택 AI 요청" }));
  const completeA = requestCallbacks.get("selection-request")!;
  fireEvent.click(screen.getByRole("button", { name: "다음 선택 AI 요청" }));
  act(() => completeA());
  expect(screen.getByText("AI 다음 요청 B")).toBeTruthy();
  act(() => requestCallbacks.get("selection-request-B")!());
  expect(screen.queryByText("AI 다음 요청 B")).toBeNull();
});

it.each([
  ["loading", "불러오는 중"], ["saving", "저장 중"], ["offline", "오프라인"], ["conflict", "충돌"], ["saved", "저장됨"],
] as const)("shows the live body session status %s", (status, label) => {
  render(<DocumentPanel record={record} category={category} onClose={() => undefined} />);
  expect(screen.queryByText("저장됨")).toBeNull();
  act(() => saveCallbacks.get(record.id)?.(status));
  expect(screen.getByRole("status", { name: "본문 저장 상태" }).textContent).toBe(label);
});

it("ignores a stale save callback after switching records", () => {
  const view = render(<DocumentPanel record={record} category={category} onClose={() => undefined} />);
  const completePrevious = saveCallbacks.get(record.id);
  act(() => completePrevious?.("saved"));
  expect(screen.getByRole("status", { name: "본문 저장 상태" }).textContent).toBe("저장됨");
  const nextRecord = { ...record, id: "00000000-0000-4000-8000-000000000004" };
  view.rerender(<DocumentPanel record={nextRecord} category={category} onClose={() => undefined} />);
  expect(screen.getByRole("status", { name: "본문 저장 상태" }).textContent).toBe("불러오는 중");
  act(() => saveCallbacks.get(nextRecord.id)?.("saving"));
  act(() => completePrevious?.("saved"));
  expect(screen.getByRole("status", { name: "본문 저장 상태" }).textContent).toBe("저장 중");
});
