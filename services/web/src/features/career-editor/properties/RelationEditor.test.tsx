// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RelationEditor, type CareerRelationTarget } from "./RelationEditor";

const relation = { targetCategoryId: "00000000-0000-4000-8000-000000000001", inversePropertyId: null, cardinality: "multiple" as const, deletePolicy: "nullify" as const };

describe("RelationEditor", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("debounces server search, supports keyboard completion, inverse text and chip removal", async () => {
    vi.useFakeTimers();
    const search = vi.fn(async () => [{ recordId: "00000000-0000-4000-8000-000000000002", title: "검색 결과" }]);
    const commit = vi.fn(async () => undefined);
    render(<RelationEditor recordId="record" propertyId="property" hydrate={async () => [{ recordId: "old", title: "기존" }]} definition={relation} value={[{ recordId: "old", title: "기존" }]} inverseLabel="관련 경험" search={search} onCommit={commit} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "검색" } });
    // debounce 자체의 시간 계약만 가상 시계로 검증합니다.
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(search).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    vi.useRealTimers();
    const option = await screen.findByRole("option", { name: "검색 결과" });
    expect((within(option).getByRole("button", { name: "검색 결과" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    await waitFor(() => expect(commit).toHaveBeenCalledWith(["old", "00000000-0000-4000-8000-000000000002"]));
    fireEvent.click(screen.getByRole("button", { name: "기존 ×" }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith(["00000000-0000-4000-8000-000000000002"]));
    expect(screen.getByText(/관련 경험/)).toBeTruthy();
  });

  it("omits inaccessible results and refreshes on conflict", async () => {
    let finishSearch!: (targets: CareerRelationTarget[]) => void;
    const search = vi.fn(async (query: string) => query === "없음" ? [] : new Promise<CareerRelationTarget[]>(resolve => { finishSearch = resolve; }));
    const conflict = vi.fn();
    const commit = vi.fn(async () => { throw new Error("409 다른 곳에서 바뀌었습니다."); });
    render(<RelationEditor recordId="record" propertyId="property" hydrate={async () => []} definition={{ ...relation, cardinality: "single" }} value={[]} search={search} onCommit={commit} onConflict={conflict} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "없음" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith("없음"));
    expect(screen.queryByRole("option")).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "대상" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith("대상"));
    // debounce가 끝나도 응답은 아직 없을 수 있습니다. 선택 가능한 결과를 기다립니다.
    expect(screen.queryByRole("option")).toBeNull();
    expect(commit).not.toHaveBeenCalled();
    await act(async () => { finishSearch([{ recordId: "target", title: "대상" }]); });
    const option = await screen.findByRole("option", { name: "대상" });
    expect((within(option).getByRole("button", { name: "대상" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    await waitFor(() => expect(conflict).toHaveBeenCalledOnce());
    expect(commit).toHaveBeenCalledWith(["target"]);
    expect(screen.getByRole("alert").textContent).toContain("409 다른 곳에서 바뀌었습니다.");
  });
});
