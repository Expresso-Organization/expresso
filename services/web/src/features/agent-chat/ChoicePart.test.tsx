// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentChoicePart } from "@expresso/contracts";
import { ChoicePart, ChoicePartPending } from "./ChoicePart";

afterEach(cleanup);

const part = (overrides: Partial<AgentChoicePart> = {}): AgentChoicePart => ({
  kind: "choice", partId: "00000000-0000-4000-8000-000000000010", prompt: "주당 몇 시간을 쓸 수 있나요?", multiple: false,
  options: [{ id: "o1", label: "5시간" }, { id: "o2", label: "10시간", description: "평일 저녁마다" }, { id: "o3", label: "15시간" }],
  answer: null, ...overrides,
});

describe("선택지 부품", () => {
  it("하나만 고르는 질문은 누르는 즉시 그 선택지를 보내고, 보내는 동안 다시 눌리지 않는다", async () => {
    let finish!: () => void;
    const onAnswer = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<ChoicePart part={part()} interactive onAnswer={onAnswer} />);
    expect(screen.getByText("주당 몇 시간을 쓸 수 있나요?")).toBeTruthy();
    expect(screen.getByText("평일 저녁마다")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /^10시간/ }));
    expect(onAnswer).toHaveBeenCalledWith(["o2"]);
    expect((screen.getByRole("radio", { name: /^5시간/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /^5시간/ }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect((screen.getByRole("radio", { name: /^5시간/ }) as HTMLButtonElement).disabled).toBe(false));
  });
  it("여럿을 고르는 질문은 고른 뒤 보내기를 눌러야 보내고, 질문에 적힌 순서로 보낸다", () => {
    const onAnswer = vi.fn(async () => undefined);
    render(<ChoicePart part={part({ multiple: true })} interactive onAnswer={onAnswer} />);
    const send = screen.getByRole("button", { name: "보내기" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /^15시간/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^5시간/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^10시간/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^10시간/ }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /^15시간/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: /^10시간/ }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(send);
    expect(onAnswer).toHaveBeenCalledWith(["o1", "o3"]);
  });
  it("답한 부품은 고른 것을 표시하고 눌리지 않는다", () => {
    const onAnswer = vi.fn(async () => undefined);
    const { container } = render(<ChoicePart part={part({ answer: { optionIds: ["o2"], messageId: "00000000-0000-4000-8000-000000000011" } })} interactive onAnswer={onAnswer} />);
    expect(container.firstElementChild?.getAttribute("data-state")).toBe("answered");
    expect(screen.getByRole("radio", { name: /^10시간/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: /^5시간/ }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.queryByText("지나간 질문입니다.")).toBeNull();
  });
  it("지나간 부품은 눌리지 않고 지나갔다고 알린다", () => {
    const onAnswer = vi.fn(async () => undefined);
    const { container } = render(<ChoicePart part={part()} interactive={false} onAnswer={onAnswer} />);
    expect(container.firstElementChild?.getAttribute("data-state")).toBe("closed");
    fireEvent.click(screen.getByRole("radio", { name: /^5시간/ }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByText("지나간 질문입니다.")).toBeTruthy();
  });
  it("답을 보내지 못하면 이유를 보여 주고 다시 누를 수 있다", async () => {
    const onAnswer = vi.fn().mockRejectedValueOnce(new Error("이미 답한 질문입니다.")).mockResolvedValue(undefined);
    render(<ChoicePart part={part()} interactive onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("radio", { name: /^5시간/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("이미 답한 질문입니다.");
    fireEvent.click(screen.getByRole("radio", { name: /^15시간/ }));
    expect(onAnswer).toHaveBeenLastCalledWith(["o3"]);
  });
  it("준비하는 동안에는 준비 중을, 내지 못했을 때는 아무것도 그리지 않는다", () => {
    const { container, rerender } = render(<ChoicePartPending failed={false} />);
    expect(screen.getByRole("status").textContent).toBe("선택지를 준비하고 있습니다.");
    rerender(<ChoicePartPending failed />);
    expect(container.firstChild).toBeNull();
  });
});
