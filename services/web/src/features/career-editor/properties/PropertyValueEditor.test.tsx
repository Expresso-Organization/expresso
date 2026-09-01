// @vitest-environment jsdom

import type { CareerPropertyDefinitionV2, CareerPropertyValueV2 } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropertyValueEditor } from "./PropertyValueEditor";

const id = "00000000-0000-4000-8000-000000000001";
const option = "00000000-0000-4000-8000-000000000002";
function definition(type: CareerPropertyDefinitionV2["type"], config: Record<string, unknown> = {}, system = false): CareerPropertyDefinitionV2 { return { id, key: "field", name: "테스트 속성", type, required: false, system, config, order: 0, version: 1, deletedAt: null }; }
function setup(type: CareerPropertyDefinitionV2["type"], value: CareerPropertyValueV2 | null = null, config: Record<string, unknown> = {}, system = false) { const onCommit = vi.fn(async () => undefined); render(<PropertyValueEditor definition={definition(type, config, system)} value={value} onCommit={onCommit} />); return onCommit; }

describe("PropertyValueEditor", () => {
  afterEach(cleanup);
  it.each(["title", "text", "url", "email", "phone"] as const)("commits %s on Enter", async (type) => { const commit = setup(type); const input = screen.getByLabelText("테스트 속성"); fireEvent.change(input, { target: { value: "새 값" } }); fireEvent.keyDown(input, { key: "Enter" }); await waitFor(() => expect(commit).toHaveBeenCalledWith({ type, value: "새 값" })); });
  it("preserves an invalid number draft and explains the issue", () => { const commit = setup("number"); const input = screen.getByLabelText("테스트 속성"); fireEvent.change(input, { target: { value: "not-a-number" } }); fireEvent.blur(input); expect(commit).not.toHaveBeenCalled(); expect(screen.getByRole("alert").textContent).toContain("숫자"); expect((input as HTMLInputElement).value).toBe("not-a-number"); });
  it("commits select, multiselect and checkbox choices", async () => { const options = { options: [{ id: option, name: "선택 A" }] }; let commit = setup("select", null, options); fireEvent.change(screen.getByLabelText("테스트 속성"), { target: { value: option } }); await waitFor(() => expect(commit).toHaveBeenCalledWith({ type: "select", value: option })); cleanup(); commit = setup("multi_select", { type: "multi_select", value: [] }, options); fireEvent.click(screen.getByLabelText("선택 A")); await waitFor(() => expect(commit).toHaveBeenCalledWith({ type: "multi_select", value: [option] })); cleanup(); commit = setup("checkbox", { type: "checkbox", value: false }); fireEvent.click(screen.getByLabelText("테스트 속성")); await waitFor(() => expect(commit).toHaveBeenCalledWith({ type: "checkbox", value: true })); });
  it("commits a date range", async () => { const commit = setup("date"); fireEvent.change(screen.getByLabelText("테스트 속성 시작"), { target: { value: "2026-09-01" } }); fireEvent.change(screen.getByLabelText("테스트 속성 종료"), { target: { value: "2026-09-30" } }); fireEvent.blur(screen.getByLabelText("테스트 속성 종료")); await waitFor(() => expect(commit).toHaveBeenCalledWith({ type: "date", value: { start: "2026-09-01", end: "2026-09-30", timezone: null } })); });
  it.each(["file", "media"] as const)("validates and commits %s IDs", async (type) => { const commit = setup(type, { type, value: [] }); const input = screen.getByLabelText("테스트 속성 ID 추가"); fireEvent.change(input, { target: { value: option } }); fireEvent.keyDown(input, { key: "Enter" }); await waitFor(() => expect(commit).toHaveBeenCalledWith({ type, value: [option] })); });
  it.each(["formula", "rollup"] as const)("renders %s as read-only", (type) => { setup(type, { type, value: 3, diagnostics: [] }); expect(screen.getByRole("status", { hidden: true }).textContent).toBe("3"); });
  it.each(["created_time", "updated_time"] as const)("protects the system %s value", (type) => { setup(type, { type, value: "2026-09-01T00:00:00.000Z" }, {}, true); expect(screen.getByRole("status", { hidden: true }).textContent).toBe("2026-09-01T00:00:00.000Z"); });
  it.each(["created_time", "updated_time"] as const)("edits a user-defined %s value", async (type) => { const commit = setup(type); const input = screen.getByLabelText("테스트 속성"); fireEvent.change(input, { target: { value: "2026-09-02 14:30" } }); await waitFor(() => expect(commit).toHaveBeenCalledWith({ type, value: new Date("2026-09-02T14:30").toISOString() })); });
});
