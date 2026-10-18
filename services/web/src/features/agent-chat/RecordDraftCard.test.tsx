// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRecordDraft } from "@expresso/contracts";
import { RecordDraftCard } from "./RecordDraftCard";

const category = "00000000-0000-4000-8000-000000000003";
const draft: AgentRecordDraft = {
  draftId: "00000000-0000-4000-8000-000000000001", title: "EKS 위 Airflow 운영", categoryId: null, bodyMd: "## 행동\nEKS 위에 Airflow를 올려 운영",
  sources: [{ messageId: "00000000-0000-4000-8000-000000000002", quote: "EKS 위에 Airflow를 올려서" }],
  categories: [{ id: category, name: "경험" }], status: "ready", recordId: null,
};
afterEach(cleanup);

describe("새 기록 초안 카드", () => {
  it("카테고리를 고르기 전에는 승인할 수 없고, 고친 제목으로 승인한다", async () => {
    const onDecide = vi.fn(async () => undefined);
    render(<RecordDraftCard draft={draft} disabled={false} onDecide={onDecide} />);
    expect(screen.getByText("EKS 위에 Airflow를 올려서")).toBeTruthy();
    const approve = screen.getByRole("button", { name: "승인하고 저장" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("카테고리"), { target: { value: category } });
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "EKS 위 Airflow 운영 경험" } });
    fireEvent.click(approve);
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith({ action: "approve", title: "EKS 위 Airflow 운영 경험", bodyMd: draft.bodyMd, categoryId: category }));
  });
  it("저장이 거절되면 이유를 보이고 초안을 그대로 둔다", async () => {
    render(<RecordDraftCard draft={{ ...draft, categoryId: category }} disabled={false} onDecide={async () => { throw new Error("필수 속성을 채워 주세요."); }} />);
    fireEvent.click(screen.getByRole("button", { name: "승인하고 저장" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("필수 속성을 채워 주세요."));
    expect(screen.getByRole("button", { name: "승인하고 저장" })).toBeTruthy();
  });
  it("처리한 초안은 상태와 기록 링크만 보인다", () => {
    render(<RecordDraftCard draft={{ ...draft, status: "approved", recordId: category }} disabled={false} onDecide={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "기록 열기" }).getAttribute("href")).toBe(`/career/records/${category}`);
  });
});
