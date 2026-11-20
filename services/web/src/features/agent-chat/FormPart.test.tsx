// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentFormPart } from "@expresso/contracts";
import { FormPart } from "./FormPart";

afterEach(cleanup);

const part = (overrides: Partial<AgentFormPart> = {}): AgentFormPart => ({
  kind: "form", partId: "00000000-0000-4000-8000-000000000020", prompt: "기간과 규모를 알려 주세요.",
  fields: [{ id: "f1", label: "기간", placeholder: "예: 3개월", optional: false }, { id: "f2", label: "팀 인원", optional: false }, { id: "f3", label: "처리량", optional: true }],
  answer: null, ...overrides,
});

describe("입력 칸 묶음 부품", () => {
  it("필수 칸을 모두 채워야 보낼 수 있고, 적은 칸의 값만 보낸다", async () => {
    const onAnswer = vi.fn(async () => undefined);
    render(<FormPart part={part()} interactive onAnswer={onAnswer} />);
    const send = screen.getByRole("button", { name: "보내기" }) as HTMLButtonElement;
    expect(screen.getByText("기간과 규모를 알려 주세요.")).toBeTruthy();
    expect((screen.getByLabelText("기간") as HTMLInputElement).placeholder).toBe("예: 3개월");
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("기간"), { target: { value: " 3개월 " } });
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("팀 인원"), { target: { value: "4명" } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith([{ id: "f1", text: "3개월" }, { id: "f2", text: "4명" }]));
  });
  it("답한 묶음은 적은 값을 보이고 고칠 수 없다", () => {
    const { container } = render(<FormPart part={part({ answer: { values: [{ id: "f1", text: "3개월" }, { id: "f2", text: "4명" }], messageId: "00000000-0000-4000-8000-000000000021" } })} interactive onAnswer={vi.fn(async () => undefined)} />);
    expect(container.firstElementChild?.getAttribute("data-state")).toBe("answered");
    expect((screen.getByLabelText("기간") as HTMLInputElement).value).toBe("3개월");
    expect((screen.getByLabelText("기간") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/처리량/) as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "보내기" })).toBeNull();
  });
  it("지나간 묶음은 고칠 수 없고 지나갔다고 알린다", () => {
    render(<FormPart part={part()} interactive={false} onAnswer={vi.fn(async () => undefined)} />);
    expect((screen.getByLabelText("기간") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("지나간 질문입니다.")).toBeTruthy();
  });
  it("답을 보내지 못하면 이유를 알린다", async () => {
    render(<FormPart part={part({ fields: [{ id: "f1", label: "기간", optional: false }] })} interactive onAnswer={vi.fn().mockRejectedValue(new Error("이미 답한 질문입니다."))} />);
    fireEvent.change(screen.getByLabelText("기간"), { target: { value: "3개월" } });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect((await screen.findByRole("alert")).textContent).toBe("이미 답한 질문입니다.");
  });
  it("날짜 칸은 날짜를 고르는 칸으로 서고, 고른 날짜를 그대로 보낸다", async () => {
    const onAnswer = vi.fn(async () => undefined);
    render(<FormPart part={part({ prompt: "언제까지 할까요?", fields: [{ id: "f1", label: "날짜", optional: false, type: "date" }, { id: "f2", label: "메모", optional: true }] })} interactive onAnswer={onAnswer} />);
    const date = screen.getByLabelText("날짜") as HTMLInputElement;
    expect(date.type).toBe("date");
    expect((screen.getByLabelText(/^메모/) as HTMLInputElement).type).toBe("text");
    fireEvent.change(date, { target: { value: "2026-11-27" } });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith([{ id: "f1", text: "2026-11-27" }]));
  });
});
