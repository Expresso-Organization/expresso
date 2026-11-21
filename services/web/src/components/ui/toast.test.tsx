// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster, showToast } from "./toast";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("알림", () => {
  it("부른 글을 띄우고, 같은 글은 겹쳐 쌓지 않으며, 닫거나 시간이 지나면 내린다", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => { showToast("서버에 연결하지 못했습니다.", "danger"); showToast("서버에 연결하지 못했습니다.", "danger"); });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "알림 닫기" }));
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => { showToast("저장했습니다."); });
    expect(screen.getByRole("status").textContent).toContain("저장했습니다.");
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
