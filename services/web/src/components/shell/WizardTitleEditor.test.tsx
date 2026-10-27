// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WizardTitleEditor, type TitleEditState } from "./WizardTitleEditor";

afterEach(cleanup);

const titleOf = (formData: FormData) => String(formData.get("title"));

describe("제작 머리말 이름 칩", () => {
  it("연필을 누르면 입력칸이 서고, 저장하면 적은 이름으로 액션을 부른 뒤 칩으로 돌아간다", async () => {
    const action = vi.fn(async (_state: TitleEditState, _formData: FormData) => ({ error: null }));
    render(<WizardTitleEditor title="정산 플랫폼 백엔드" placeholder="이름 붙이기" action={action} />);

    fireEvent.click(screen.getByRole("button", { name: "이름 바꾸기: 정산 플랫폼 백엔드" }));
    const input = screen.getByLabelText("포트폴리오 이름") as HTMLInputElement;
    expect(input.value).toBe("정산 플랫폼 백엔드");
    fireEvent.change(input, { target: { value: "토스 지원용" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(titleOf(action.mock.calls[0]![1])).toBe("토스 지원용");
    await waitFor(() => expect(screen.queryByLabelText("포트폴리오 이름")).toBeNull());
  });

  it("이름이 없으면 안내 문구가 서고 입력칸은 비어 있다", () => {
    render(<WizardTitleEditor title={null} placeholder="이름 붙이기" action={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "이름 바꾸기: 이름 붙이기" }));
    expect((screen.getByLabelText("포트폴리오 이름") as HTMLInputElement).value).toBe("");
  });

  it("저장이 거절되면 이유를 보이고, 취소한 뒤 다시 열면 지난 이유는 지운다", async () => {
    const action = vi.fn(async () => ({ error: "이름을 바꾸지 못했습니다." }));
    render(<WizardTitleEditor title="초안" placeholder="이름 붙이기" action={action} />);

    fireEvent.click(screen.getByRole("button", { name: "이름 바꾸기: 초안" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("이름을 바꾸지 못했습니다."));
    expect(screen.getByLabelText("포트폴리오 이름")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    fireEvent.click(screen.getByRole("button", { name: "이름 바꾸기: 초안" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
