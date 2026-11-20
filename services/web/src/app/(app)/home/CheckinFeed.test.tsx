// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsultantCheckins, ConsultantCommitment } from "@expresso/contracts";

const actions = vi.hoisted(() => ({ answerCheckinAction: vi.fn(), dismissQuietAction: vi.fn(), decideOutreachAction: vi.fn() }));
const nav = vi.hoisted(() => ({ push: vi.fn(), open: vi.fn() }));
vi.mock("./checkin-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock("./HomeHandoff", () => ({ useHomeHandoff: () => ({ open: nav.open, pending: false }) }));
// 카드 틀만 쓴다. 제안 피드가 끌고 오는 서버 액션과 대화 부품은 싣지 않는다.
vi.mock("./ProposalFeed", () => ({ FeedCard: ({ title, children }: { title: string; children: React.ReactNode }) => <article aria-label={title}><h3>{title}</h3>{children}</article> }));

import { CheckinFeed } from "./CheckinFeed";

const commitment: ConsultantCommitment = { id: "00000000-0000-4000-8000-000000000040", title: "해커톤 지원서 내기", detail: "", dueOn: "2026-11-19", status: "open", awaiting: true, conversationId: null, createdAt: "2026-11-12T00:00:00.000Z" };
const checkins = (overrides: Partial<ConsultantCheckins> = {}): ConsultantCheckins => ({ outreach: true, today: "2026-11-20", commitments: [commitment], quiet: false, ...overrides });
const cleared = checkins({ commitments: [] });

afterEach(cleanup);
beforeEach(() => { for (const mock of [...Object.values(actions), ...Object.values(nav)]) mock.mockReset(); });

describe("홈의 확인 구획", () => {
  it("건넬 것이 없으면 그리지 않는다", () => {
    const { container } = render(<CheckinFeed initial={cleared} proposalsEnabled />);
    expect(container.firstChild).toBeNull();
  });
  it("「했어요」는 약속을 닫고 열린 대화로 간다", async () => {
    actions.answerCheckinAction.mockResolvedValue({ checkins: cleared, conversationId: "00000000-0000-4000-8000-000000000050", error: null });
    render(<CheckinFeed initial={checkins()} proposalsEnabled />);
    expect(screen.getByText("「해커톤 지원서 내기」 어떻게 됐나요?")).toBeTruthy();
    expect(screen.getByText("11월 19일까지 하기로 한 일입니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "했어요" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/home?chat=00000000-0000-4000-8000-000000000050"));
    expect(actions.answerCheckinAction).toHaveBeenCalledWith(commitment.id, { answer: "done" });
  });
  it("대화를 열 수 없으면 닫았다는 것만 알리고 머문다", async () => {
    actions.answerCheckinAction.mockResolvedValue({ checkins: cleared, conversationId: null, error: null });
    render(<CheckinFeed initial={checkins()} proposalsEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "했어요" }));
    expect((await screen.findByRole("status")).textContent).toContain("마친 일로 남겼습니다");
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.queryByText(/어떻게 됐나요/)).toBeNull();
  });
  it("「아직이에요」는 오늘에서 7일 뒤를 먼저 놓고, 고른 날짜로 미룬 뒤 언제 다시 묻는지 알린다", async () => {
    actions.answerCheckinAction.mockResolvedValue({ checkins: cleared, conversationId: null, error: null });
    render(<CheckinFeed initial={checkins()} proposalsEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "아직이에요" }));
    const date = screen.getByLabelText("언제까지 해 볼까요?") as HTMLInputElement;
    expect(date.value).toBe("2026-11-27");
    expect(date.min).toBe("2026-11-20");
    fireEvent.change(date, { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByRole("button", { name: "이 날짜로" }));
    await waitFor(() => expect(actions.answerCheckinAction).toHaveBeenCalledWith(commitment.id, { answer: "not_yet", dueOn: "2026-12-01" }));
    expect((await screen.findByRole("status")).textContent).toBe("12월 1일에 다시 여쭙니다.");
    expect(nav.push).not.toHaveBeenCalled();
  });
  it("「안 하기로 했어요」는 닫기만 하고, 저장하지 못하면 카드를 남긴 채 이유를 보인다", async () => {
    actions.answerCheckinAction.mockResolvedValueOnce({ checkins: null, conversationId: null, error: "답을 저장하지 못했습니다. 다시 눌러 주세요." }).mockResolvedValue({ checkins: cleared, conversationId: null, error: null });
    render(<CheckinFeed initial={checkins()} proposalsEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "안 하기로 했어요" }));
    expect((await screen.findByRole("alert")).textContent).toContain("저장하지 못했습니다");
    expect(screen.getByText(/어떻게 됐나요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "안 하기로 했어요" }));
    expect((await screen.findByRole("status")).textContent).toBe("하지 않기로 한 일로 남겼습니다.");
    expect(actions.answerCheckinAction).toHaveBeenLastCalledWith(commitment.id, { answer: "dropped" });
  });
  it("대화가 없어 건넨 연락은 이야기하기로 대화를 시작하거나 닫는다", async () => {
    actions.dismissQuietAction.mockResolvedValue({ checkins: cleared, conversationId: null, error: null });
    const { container, unmount } = render(<CheckinFeed initial={checkins({ commitments: [], quiet: true })} proposalsEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "이야기하기" }));
    expect(actions.dismissQuietAction).toHaveBeenCalledTimes(1);
    expect(nav.open).toHaveBeenCalledWith({ text: "요즘 준비가 어떻게 되어 가는지 이야기하고 싶어요.", contexts: [] });
    unmount();
    const again = render(<CheckinFeed initial={checkins({ commitments: [], quiet: true })} proposalsEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(again.container.firstChild).toBeNull());
    expect(container.firstChild).toBeNull();
  });
  it("제안은 켰는데 약속 확인을 정하지 않은 사용자에게만 받을지 묻고, 답은 제안을 건드리지 않는 설정으로 저장한다", async () => {
    const undecided = checkins({ outreach: null, commitments: [] });
    expect(render(<CheckinFeed initial={undecided} proposalsEnabled={false} />).container.firstChild).toBeNull();
    cleanup();
    actions.decideOutreachAction.mockResolvedValue({ checkins: cleared, conversationId: null, error: null });
    const { container } = render(<CheckinFeed initial={undecided} proposalsEnabled />);
    expect(screen.getByText(/약속한 날에 여쭤봐도 될까요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "좋아요" }));
    await waitFor(() => expect(actions.decideOutreachAction).toHaveBeenCalledWith(true));
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
