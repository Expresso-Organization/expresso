// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
const actions = vi.hoisted(() => ({
  trashAction: vi.fn(async (_kind: string, _id: string) => ({ error: null as string | null })),
  restoreAction: vi.fn(async (_kind: string, _id: string) => ({ error: null as string | null })),
  loadTrashAction: vi.fn(async () => ({
    portfolios: [{ id: "00000000-0000-4000-8000-000000000001", title: "지운 포트폴리오", status: "unlisted" as const, deletedAt: "2026-11-10T00:00:00.000Z", purgeAfter: "2026-12-10T00:00:00.000Z" }],
    brews: [{ id: "00000000-0000-4000-8000-000000000002", title: null, status: "draft" as const, deletedAt: "2026-11-09T00:00:00.000Z", purgeAfter: "2026-12-09T00:00:00.000Z" }],
  })),
}));
vi.mock("./trash-actions", () => actions);

import { EditorTrashMenu, PortfolioTrashButton, TrashableCard, TrashConfirm } from "./PortfolioTrash";

describe("portfolio trash", () => {
  beforeEach(() => { refresh.mockReset(); push.mockReset(); actions.trashAction.mockClear(); actions.restoreAction.mockClear(); });
  afterEach(cleanup);

  it("warns that a published portfolio goes offline and what is purged after 30 days", () => {
    render(<TrashConfirm target={{ kind: "portfolio", id: "p", title: "커머스 포트폴리오", published: true }} busy={false} error={null} onConfirm={() => undefined} onCancel={() => undefined} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading").textContent).toContain("이 포트폴리오를 휴지통으로 옮길까요?");
    expect(dialog.textContent).toContain("커머스 포트폴리오");
    expect(dialog.textContent).toContain("공개 주소가 바로 닫힙니다.");
    expect(dialog.textContent).toContain("그 뒤에는 지면 · 배포 기록 · 방문 데이터가 함께 지워집니다.");
  });

  it("does not mention the public address for drafts and unfinished portfolios", () => {
    render(<TrashConfirm target={{ kind: "brew", id: "b", title: "만들던 포트폴리오" }} busy={false} error={null} onConfirm={() => undefined} onCancel={() => undefined} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).not.toContain("공개 주소");
    expect(dialog.textContent).toContain("답변 · 레시피가 함께 지워집니다.");
  });

  it("trashes a home card after confirming and refreshes the grid", async () => {
    render(<TrashableCard target={{ kind: "portfolio", id: "p1", title: "초안" }}><a href="/edit/p1">초안</a></TrashableCard>);
    fireEvent.click(screen.getByRole("button", { name: "초안 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /휴지통으로 옮기기/ }));
    expect(actions.trashAction).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /휴지통으로 옮기기/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(actions.trashAction).toHaveBeenCalledWith("portfolio", "p1");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the dialog open with the reason when the server refuses", async () => {
    actions.trashAction.mockResolvedValueOnce({ error: "생성 중인 포트폴리오는 옮길 수 없습니다. 생성이 끝난 뒤 다시 눌러 주세요." });
    render(<TrashableCard target={{ kind: "brew", id: "b1", title: "생성 중" }}><a href="/brew/b1">생성 중</a></TrashableCard>);
    fireEvent.click(screen.getByRole("button", { name: "생성 중 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /휴지통으로 옮기기/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /휴지통으로 옮기기/ }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "생성 중인 포트폴리오는 옮길 수 없습니다. 생성이 끝난 뒤 다시 눌러 주세요.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("goes home after trashing from the editor", async () => {
    render(<EditorTrashMenu target={{ kind: "portfolio", id: "p2", title: "편집 중" }} className={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "포트폴리오 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /휴지통으로 옮기기/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /휴지통으로 옮기기/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
  });

  it("lists trashed portfolios and unfinished ones newest first and restores one", async () => {
    render(<PortfolioTrashButton />);
    fireEvent.click(screen.getByRole("button", { name: "휴지통" }));
    const list = await screen.findByRole("list", { name: "지운 포트폴리오" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("strong")?.textContent)).toEqual(["지운 포트폴리오", "만들던 포트폴리오"]);
    expect(items[1]!.textContent).toContain("만들던 포트폴리오 · ");
    fireEvent.click(within(items[0]!).getByRole("button", { name: /복원/ }));
    await waitFor(() => expect(actions.restoreAction).toHaveBeenCalledWith("portfolio", "00000000-0000-4000-8000-000000000001"));
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
    expect(refresh).toHaveBeenCalled();
  });
});
