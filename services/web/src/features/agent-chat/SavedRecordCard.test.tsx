// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentSavedRecord } from "@expresso/contracts";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { SavedRecordCard, SavedRecordPending } from "./SavedRecordCard";

afterEach(cleanup);

const saved = (overrides: Partial<AgentSavedRecord> = {}): AgentSavedRecord => ({
  recordId: "00000000-0000-4000-8000-000000000030", title: "EKS 위 Airflow 운영", categoryName: "경험",
  bodyMd: "## 상황\n인턴 때 배치 작업이 자주 밀렸다\n\n## 행동\nEKS 위에 Airflow를 올려 운영했다",
  sources: [{ messageId: "00000000-0000-4000-8000-000000000031", quote: "EKS 위에 Airflow를 올려서" }], undone: false, ...overrides,
});

describe("저장한 커리어 기록 카드", () => {
  it("제목 · 서랍 · 본문 앞부분을 보이고 그 기록으로 가는 링크를 둔다", () => {
    const { container } = render(<SavedRecordCard saved={saved()} disabled={false} onUndo={vi.fn(async () => undefined)} />);
    expect(container.firstElementChild?.getAttribute("data-state")).toBe("saved");
    expect(screen.getByText("커리어 기록으로 저장했습니다")).toBeTruthy();
    expect(screen.getByText("EKS 위 Airflow 운영")).toBeTruthy();
    expect(screen.getByText("경험")).toBeTruthy();
    expect(screen.getByText("상황")).toBeTruthy();
    expect(screen.getByText("EKS 위에 Airflow를 올려 운영했다")).toBeTruthy();
    expect(screen.getByRole("link", { name: "기록 열기" }).getAttribute("href")).toBe("/career/records/00000000-0000-4000-8000-000000000030");
  });
  it("되돌리기를 누르면 되돌리고, 실행 중에는 눌리지 않는다", () => {
    const onUndo = vi.fn(async () => undefined);
    const { rerender } = render(<SavedRecordCard saved={saved()} disabled onUndo={onUndo} />);
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(onUndo).not.toHaveBeenCalled();
    rerender(<SavedRecordCard saved={saved()} disabled={false} onUndo={onUndo} />);
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
  it("되돌린 뒤에는 휴지통에 있다고 알리고 단추를 거둔다", () => {
    const { container } = render(<SavedRecordCard saved={saved({ undone: true })} disabled={false} onUndo={vi.fn(async () => undefined)} />);
    expect(container.firstElementChild?.getAttribute("data-state")).toBe("undone");
    expect(screen.getByText("저장을 되돌렸습니다")).toBeTruthy();
    expect(screen.getByText(/휴지통에 있습니다/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "되돌리기" })).toBeNull();
    expect(screen.queryByRole("link", { name: "기록 열기" })).toBeNull();
  });
  it("되돌리지 못하면 이유를 알린다", async () => {
    render(<SavedRecordCard saved={saved()} disabled={false} onUndo={vi.fn().mockRejectedValue(new Error("응답이 끝난 뒤 되돌려 주세요."))} />);
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect((await screen.findByRole("alert")).textContent).toBe("응답이 끝난 뒤 되돌려 주세요.");
  });
  it("정리하는 동안에는 준비 중을, 저장하지 못했을 때는 아무것도 그리지 않는다", () => {
    const { container, rerender } = render(<SavedRecordPending failed={false} />);
    expect(screen.getByRole("status").textContent).toBe("기록으로 정리하고 있습니다.");
    rerender(<SavedRecordPending failed />);
    expect(container.firstChild).toBeNull();
  });
});
