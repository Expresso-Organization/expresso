// @vitest-environment jsdom

import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FormulaEditor } from "./FormulaEditor";
import { RollupEditor } from "./RollupEditor";

const propertyId = "00000000-0000-4000-8000-000000000001";
const relationId = "00000000-0000-4000-8000-000000000002";
function property(id: string, name: string, type: CareerPropertyDefinitionV2["type"]): CareerPropertyDefinitionV2 { return { id, key: name, name, type, required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null }; }

describe("formula and rollup editors", () => {
  afterEach(cleanup);
  it("shows a property name token, sends the stable property ID and moves diagnostics onto the shown source", async () => {
    // 서버 진단은 저장 원문(UUID) 기준이다. `+ x`의 x는 저장 원문의 마지막 글자다.
    const stored = `prop("${propertyId}") + x`;
    const preview = vi.fn(async () => ({ diagnostics: [{ code: "TYPE_MISMATCH", message: "숫자가 필요합니다.", severity: "error" as const, start: stored.length - 1, end: stored.length }], value: null, dependencies: [propertyId] }));
    const commit = vi.fn(async () => undefined);
    const { container } = render(<FormulaEditor source="" properties={[property(propertyId, "성과", "number")]} preview={preview} onCommit={commit} />);
    fireEvent.click(screen.getByRole("button", { name: "성과" }));
    const textarea = screen.getByLabelText("수식") as HTMLTextAreaElement;
    expect(textarea.value).toBe('prop("성과")');
    expect(container.querySelector("mark")?.textContent).toBe('prop("성과")');
    fireEvent.change(textarea, { target: { value: 'prop("성과") + x' } });
    fireEvent.click(screen.getByRole("button", { name: "수식 저장" }));
    await waitFor(() => expect(screen.getByText("TYPE_MISMATCH")).toBeTruthy());
    expect(preview).toHaveBeenCalledWith(stored);
    expect(screen.getByText("14–15")).toBeTruthy();
    expect(commit).not.toHaveBeenCalled();
    expect(textarea.value).toBe('prop("성과") + x');
  });

  it("shows stored formulas by name, reports unknown names without asking the server and commits UUIDs", async () => {
    const preview = vi.fn(async () => ({ diagnostics: [], value: null, dependencies: [propertyId] }));
    const commit = vi.fn(async () => undefined);
    render(<FormulaEditor source={`prop("${propertyId}") * 2`} properties={[property(propertyId, "매출", "number")]} preview={preview} onCommit={commit} />);
    const textarea = screen.getByLabelText("수식") as HTMLTextAreaElement;
    expect(textarea.value).toBe('prop("매출") * 2');
    fireEvent.change(textarea, { target: { value: 'prop("없는 속성") * 2' } });
    fireEvent.click(screen.getByRole("button", { name: "미리 보기" }));
    await waitFor(() => expect(screen.getByText("unknown_property")).toBeTruthy());
    expect(preview).not.toHaveBeenCalled();
    fireEvent.change(textarea, { target: { value: 'prop("매출") * 3' } });
    fireEvent.click(screen.getByRole("button", { name: "수식 저장" }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith(`prop("${propertyId}") * 3`));
  });

  it("shows cycle diagnostics and saves a valid formula", async () => {
    const preview = vi.fn(async () => ({ diagnostics: [], value: { type: "formula" as const, value: 3, diagnostics: [] }, dependencies: [] }));
    const commit = vi.fn(async () => undefined);
    render(<FormulaEditor source="1" properties={[]} preview={preview} onCommit={commit} diagnostics={[{ code: "FORMULA_CYCLE", message: "순환 참조입니다.", severity: "error", start: 0, end: 1 }]} />);
    expect(screen.getByText(/순환 참조/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("수식"), { target: { value: "1 + 2" } });
    fireEvent.click(screen.getByRole("button", { name: "수식 저장" }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith("1 + 2"));
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("selects relation, target property and every rollup aggregation while keeping the result read-only", async () => {
    const preview = vi.fn(async () => ({ diagnostics: [], value: { type: "rollup" as const, value: 2, diagnostics: [] } }));
    const commit = vi.fn(async () => undefined);
    render(<RollupEditor configuration={null} properties={[property(relationId, "프로젝트", "relation")]} targetProperties={[property(propertyId, "매출", "number")]} preview={preview} onCommit={commit} />);
    fireEvent.click(screen.getByRole("button", { name: "집계" }));
    expect(screen.getAllByRole("option").filter((option) => ["개수", "고유 값 개수", "합계", "평균", "최솟값", "최댓값", "가장 이른 날짜", "가장 늦은 날짜", "체크 비율", "고유 값 표시"].includes(option.textContent ?? ""))).toHaveLength(10);
    fireEvent.click(screen.getByRole("option", { name: "합계" }));
    fireEvent.click(screen.getByRole("button", { name: "롤업 저장" }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith({ relationPropertyId: relationId, targetPropertyId: propertyId, aggregation: "sum" }));
    expect(screen.getByText("2")).toBeTruthy();
  });
});
