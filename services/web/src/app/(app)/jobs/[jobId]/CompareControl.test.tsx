// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const compareWithRecordsAction = vi.hoisted(() => vi.fn());
vi.mock("./compare-actions", () => ({ compareWithRecordsAction }));

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CompareControl } from "./CompareControl";

const JOB_ID = "6f1c2f8e-2d7a-4b8e-9a51-0c3d6e9b7a10";

afterEach(() => {
  cleanup();
  compareWithRecordsAction.mockReset();
  refresh.mockReset();
  vi.useRealTimers();
});

it("대조 전에는 누를 것을 주고, 누르면 이 공고를 보낸다", async () => {
  compareWithRecordsAction.mockResolvedValue({ error: null });
  render(<CompareControl jobPostingId={JOB_ID} view={{ kind: "idle" }} />);

  fireEvent.click(screen.getByRole("button", { name: "내 기록과 대조" }));

  await waitFor(() => expect(compareWithRecordsAction).toHaveBeenCalledTimes(1));
  const formData = compareWithRecordsAction.mock.calls[0]?.[0] as FormData;
  expect(formData.get("jobPostingId")).toBe(JOB_ID);
});

it("대조가 끝나면 충족 수를 보이고 누를 것을 주지 않는다", () => {
  render(<CompareControl jobPostingId={JOB_ID} view={{ kind: "done", total: 6, covered: 3 }} />);

  expect(screen.getByText("6개 중 3개 충족")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it("도는 동안 진행을 보이고 1.5초마다 화면을 다시 받아 온다", () => {
  vi.useFakeTimers();
  render(<CompareControl jobPostingId={JOB_ID} view={{ kind: "running", stage: "extracting" }} />);

  expect(screen.getByRole("progressbar", { name: "대조 진행률" }).getAttribute("aria-valuenow")).toBe("38");
  expect(screen.getByText("요건을 뽑는 중")).toBeTruthy();
  vi.advanceTimersByTime(3_100);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("끝난 뒤에는 화면을 다시 받아 오지 않는다", () => {
  vi.useFakeTimers();
  render(<CompareControl jobPostingId={JOB_ID} view={{ kind: "done", total: 6, covered: 3 }} />);

  vi.advanceTimersByTime(5_000);
  expect(refresh).not.toHaveBeenCalled();
});

it("다시 해 볼 수 있는 실패는 이유와 함께 다시 시도를 준다", () => {
  render(
    <CompareControl
      jobPostingId={JOB_ID}
      view={{ kind: "failed", code: "EXTRACTION_FAILED", retryable: true }}
    />,
  );

  expect(screen.getByText("대조하지 못했습니다")).toBeTruthy();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
});

it("같은 자리에서 다시 멈출 실패는 이유만 말하고 누를 것을 주지 않는다", () => {
  render(
    <CompareControl
      jobPostingId={JOB_ID}
      view={{ kind: "failed", code: "EXTRACTOR_UNAVAILABLE", retryable: false }}
    />,
  );

  expect(screen.getByText("요건을 읽지 못했습니다")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});
