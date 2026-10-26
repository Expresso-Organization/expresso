// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const toggleInterestAction = vi.hoisted(() => vi.fn());
vi.mock("./interest-actions", () => ({ toggleInterestAction }));

import { InterestButton } from "./InterestButton";

const JOB_ID = "6f1c2f8e-2d7a-4b8e-9a51-0c3d6e9b7a10";

afterEach(() => {
  cleanup();
  toggleInterestAction.mockReset();
});

function sent() {
  const formData = toggleInterestAction.mock.calls[0]?.[0] as FormData;
  return { jobPostingId: formData.get("jobPostingId"), next: formData.get("next") };
}

it("담기 전이면 담기를 보내고, 서버가 답하기 전에 담긴 모양으로 바뀐다", async () => {
  let resolve: (value: { error: null }) => void = () => {};
  toggleInterestAction.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<InterestButton jobPostingId={JOB_ID} interested={false} />);

  const button = screen.getByRole("button", { name: "관심 공고에 담기" });
  expect(button.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(button);

  await waitFor(() => expect(screen.getByRole("button", { name: "관심 공고" })).toBeTruthy());
  const pressed = screen.getByRole("button", { name: "관심 공고" });
  expect(pressed.getAttribute("aria-pressed")).toBe("true");
  expect((pressed as HTMLButtonElement).disabled).toBe(true);
  expect(sent()).toEqual({ jobPostingId: JOB_ID, next: "save" });
  resolve({ error: null });
});

it("담겨 있으면 해제를 보낸다", async () => {
  toggleInterestAction.mockResolvedValue({ error: null });
  render(<InterestButton jobPostingId={JOB_ID} interested />);

  fireEvent.click(screen.getByRole("button", { name: "관심 공고" }));

  await waitFor(() => expect(toggleInterestAction).toHaveBeenCalledTimes(1));
  expect(sent()).toEqual({ jobPostingId: JOB_ID, next: "remove" });
});

it("실패하면 원래 모양으로 돌아가고 실패 문구를 보인다", async () => {
  toggleInterestAction.mockResolvedValue({ error: "관심 공고에 담지 못했습니다." });
  render(<InterestButton jobPostingId={JOB_ID} interested={false} />);

  fireEvent.click(screen.getByRole("button", { name: "관심 공고에 담기" }));

  expect((await screen.findByRole("status")).textContent).toBe("관심 공고에 담지 못했습니다.");
  const button = await screen.findByRole("button", { name: "관심 공고에 담기" });
  expect(button.getAttribute("aria-pressed")).toBe("false");
  expect((button as HTMLButtonElement).disabled).toBe(false);
});
