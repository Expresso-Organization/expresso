// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentPageEdit } from "@expresso/contracts";
import { PageEditCard } from "./PageEditCard";

const edit: AgentPageEdit = {
  editId: "00000000-0000-4000-8000-000000000001", portfolioId: "00000000-0000-4000-8000-000000000002", key: "toc", label: "작업 목차",
  note: "요약을 줄였습니다.", changes: [{ label: "경로 재설계 · 요약", before: "야간 배치를 3시간에서 24분으로 줄였습니다", after: "배치 24분" }, { label: "기간", before: "2024", after: "" }],
  revision: 5, undone: false,
};
afterEach(cleanup);

describe("지면 고침 카드", () => {
  it("바뀐 곳을 전 → 후로 보이고, 비운 칸은 「없음」으로 쓴다", () => {
    render(<PageEditCard edit={edit} latest disabled={false} onUndo={vi.fn()} />);
    expect(screen.getByText("바뀐 곳 2")).toBeTruthy();
    expect(screen.getByText("배치 24분")).toBeTruthy();
    expect(screen.getByText("없음")).toBeTruthy();
  });
  it("되돌리기를 누르면 되돌리고, 실패하면 이유를 보인다", async () => {
    const onUndo = vi.fn(async () => { throw new Error("이 고침 뒤에 다른 편집이 저장되어 되돌릴 수 없습니다."); });
    render(<PageEditCard edit={edit} latest disabled={false} onUndo={onUndo} />);
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("다른 편집"));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
  it("그 뒤에 다른 판이 쌓였으면 되돌리기를 막고, 되돌린 고침은 상태만 보인다", () => {
    const { rerender } = render(<PageEditCard edit={edit} latest={false} disabled={false} onUndo={vi.fn()} />);
    expect((screen.getByRole("button", { name: "되돌리기" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<PageEditCard edit={{ ...edit, undone: true }} latest={false} disabled={false} onUndo={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("앞 판으로 되돌렸습니다.")).toBeTruthy();
  });
});
