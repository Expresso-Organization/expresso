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
  it("inserts a stable property ID, displays positioned diagnostics and keeps an invalid draft", async () => {
    const preview = vi.fn(async () => ({ diagnostics: [{ code: "TYPE_MISMATCH", message: "숫자가 필요합니다.", severity: "error" as const, start: 0, end: 4 }], value: null, dependencies: [propertyId] }));
    const commit = vi.fn(async () => undefined);
    render(<FormulaEditor source="" properties={[property(propertyId, "성과", "number")]} preview={preview} onCommit={commit} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp("성과") }));
    expect((screen.getByLabelText("수식") as HTMLTextAreaElement).value).toBe(`prop("${propertyId}")`);
    fireEvent.click(screen.getByRole("button", { name: "수식 저장" }));
    await waitFor(() => expect(screen.getByText("TYPE_MISMATCH")).toBeTruthy());
    expect(screen.getByText("1–5")).toBeTruthy();
    expect(commit).not.toHaveBeenCalled();
    expect((screen.getByLabelText("수식") as HTMLTextAreaElement).value).toContain(propertyId);
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
    expect(screen.getAllByRole("option").filter((option) => ["개수", "고유 값 개수", "합계", "평균", "최솟값", "최댓값", "가장 이른 날짜", "가장 늦은 날짜", "체크 비율", "고유 값 표시"].includes(option.textContent ?? ""))).toHaveLength(10);
    fireEvent.change(screen.getByLabelText("집계"), { target: { value: "sum" } });
    fireEvent.click(screen.getByRole("button", { name: "롤업 저장" }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith({ relationPropertyId: relationId, targetPropertyId: propertyId, aggregation: "sum" }));
    expect(screen.getByText("2")).toBeTruthy();
  });
});
