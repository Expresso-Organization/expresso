// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsultantCommitment } from "@expresso/contracts";
import { CommitmentCard, dayLabel } from "./CommitmentCard";

const commitment = (overrides: Partial<ConsultantCommitment> = {}): ConsultantCommitment => ({
  id: "00000000-0000-4000-8000-000000000040", title: "해커톤 지원서 내기", detail: "금요일 자정 마감", dueOn: "2099-11-27", status: "open", awaiting: false,
  conversationId: "00000000-0000-4000-8000-000000000041", createdAt: "2026-11-20T00:00:00.000Z", ...overrides,
});
const url = "/api/consultant/commitments/00000000-0000-4000-8000-000000000040";
const ok = (data: ConsultantCommitment) => ({ ok: true, json: async () => ({ data }) }) as Response;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("약속 카드", () => {
  it("무엇을 언제까지 하기로 했는지 보이고, 열릴 때 지금 상태를 읽어 닫힌 약속은 닫힌 것으로 보인다", async () => {
    fetchMock.mockResolvedValue(ok(commitment({ status: "done" })));
    const { container } = render(<CommitmentCard commitment={commitment()} refreshKey={1} />);
    expect(screen.getByText("해커톤 지원서 내기")).toBeTruthy();
    expect(screen.getByText("금요일 자정 마감")).toBeTruthy();
    expect(dayLabel("2099-11-27")).toBe("11월 27일");
    await waitFor(() => expect(container.firstElementChild?.getAttribute("data-state")).toBe("done"));
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ cache: "no-store" }));
    expect(screen.getByText("하기로 한 일을 마쳤습니다")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "날짜 바꾸기" })).toBeNull();
    expect(screen.queryByText(/까지$/)).toBeNull();
  });
  it("지금 상태를 읽지 못하면 대화에 남은 약속을 그대로 보인다", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { container } = render(<CommitmentCard commitment={commitment()} refreshKey={1} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.firstElementChild?.getAttribute("data-state")).toBe("open");
    expect(screen.getByText("11월 27일까지")).toBeTruthy();
    expect(screen.getByText("「내 진행」에 남겼습니다. 먼저 연락받기를 켜 두면 그날 홈에서 어떻게 됐는지 여쭙니다.")).toBeTruthy();
  });
  it("날짜를 바꾸면 새 날짜로 저장하고, 같은 날짜로는 저장하지 않는다", async () => {
    fetchMock.mockImplementation(async (_input, init) => ok(commitment(init?.method === "PATCH" ? { dueOn: "2099-12-04" } : {})));
    render(<CommitmentCard commitment={commitment()} refreshKey={1} />);
    fireEvent.click(screen.getByRole("button", { name: "날짜 바꾸기" }));
    const save = screen.getByRole("button", { name: "이 날짜로" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("새 날짜"), { target: { value: "2099-12-04" } });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText("12월 4일까지")).toBeTruthy());
    expect(fetchMock).toHaveBeenLastCalledWith(url, expect.objectContaining({ method: "PATCH", body: JSON.stringify({ dueOn: "2099-12-04" }) }));
    expect(screen.getByRole("button", { name: "날짜 바꾸기" })).toBeTruthy();
  });
  it("하지 않기로 하면 약속을 닫고, 저장하지 못하면 서버가 말한 이유를 보인다", async () => {
    fetchMock.mockImplementation(async (_input, init) => init?.method === "PATCH" ? { ok: false, json: async () => ({ error: { message: "이미 닫힌 약속입니다." } }) } as Response : ok(commitment()));
    const { container } = render(<CommitmentCard commitment={commitment()} refreshKey={1} />);
    fireEvent.click(screen.getByRole("button", { name: "하지 않기로" }));
    expect((await screen.findByRole("alert")).textContent).toBe("이미 닫힌 약속입니다.");
    fetchMock.mockImplementation(async () => ok(commitment({ status: "dropped" })));
    fireEvent.click(screen.getByRole("button", { name: "하지 않기로" }));
    await waitFor(() => expect(container.firstElementChild?.getAttribute("data-state")).toBe("dropped"));
    expect(fetchMock).toHaveBeenLastCalledWith(url, expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "dropped" }) }));
    expect(screen.getByText("하지 않기로 했습니다")).toBeTruthy();
  });
});
