// @vitest-environment jsdom
import type { CareerCategory, CareerRecordListItem } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/career-editor/editor/CareerDocumentEditor", () => ({
  CareerDocumentEditor: ({ recordId }: { recordId: string }) => <div>편집기 {recordId}</div>,
}));
vi.mock("@/features/career-editor/ai/AiProposalPanel", () => ({ AiProposalPanel: () => <div>AI</div> }));
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
    expect(separator.getAttribute("aria-valuenow")).toBe("452");
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator.getAttribute("aria-valuenow")).toBe("476");
    expect(drawer.getAttribute("style")).toContain("--career-drawer-width: 476px");
    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator.getAttribute("aria-valuenow")).toBe("360");
  });

  it("tracks pointer resizing across the whole window", () => {
    render(<DocumentPanel record={record} category={category} onClose={() => undefined} />);
    const drawer = screen.getByLabelText("문서 패널");
    const separator = screen.getByRole("separator", { name: "문서 패널 너비 조절" });
    fireEvent.pointerDown(separator, { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 400 });
    expect(separator.getAttribute("aria-valuenow")).toBe("552");
    expect(drawer.getAttribute("style")).toContain("--career-drawer-width: 552px");
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 400 });
    expect(drawer.getAttribute("data-resizing")).toBe("false");
  });
});
