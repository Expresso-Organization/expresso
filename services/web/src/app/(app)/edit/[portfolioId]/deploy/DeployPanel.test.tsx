// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { DeploymentSummary, PortfolioDetail } from "@expresso/contracts";

const deployAction = vi.fn(async () => ({}));
vi.mock("./deploy-actions", () => ({ deployAction: (...args: unknown[]) => deployAction(...(args as [])) }));
// 셸의 머리 · 몸통은 이 화면과 상관없는 탐색 맥락을 요구한다. 단추가 그려지는 자리만 남긴다.
vi.mock("@/components/shell/AppShell", () => ({
  DocumentHeader: ({ actions }: { actions?: ReactNode }) => <header>{actions}</header>,
  AppBody: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

import { publicSiteUrl } from "@/lib/public-site";

import { DeployPanel } from "./DeployPanel";

const PORTFOLIO_ID = "00000000-0000-4000-8000-0000000000aa";

function portfolio(status: PortfolioDetail["status"], deployed = true, changed = false): PortfolioDetail {
  return {
    id: PORTFOLIO_ID,
    title: "토스 프론트엔드",
    status,
    deployment: deployed
      ? {
          id: "00000000-0000-4000-8000-000000000002",
          version: 2,
          subdomain: "minjae",
          customDomain: null,
          seoIndexable: false,
          contactVisibility: "hidden",
          publishedAt: "2026-11-20T00:00:00.000Z",
          hasUnpublishedChanges: changed,
        }
      : null,
  } as PortfolioDetail;
}

const version = (n: number, isCurrent: boolean): DeploymentSummary => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  version: n,
  slug: "minjae",
  publishedAt: "2026-11-20T00:00:00.000Z",
  isCurrent,
  seoIndexable: false,
  contactVisibility: "hidden",
  sectionCount: 0,
  blockCount: 0,
} as DeploymentSummary);

const DEPLOYMENTS = [version(2, true), version(1, false)];

function sentIntent(call = 0) {
  const data = (deployAction.mock.calls[call] as unknown[] | undefined)?.[1] as FormData | undefined;
  return data ? Object.fromEntries(data.entries()) : null;
}

beforeEach(() => deployAction.mockClear());
afterEach(() => cleanup());

it("공개 중이면 상태 머리의 「열기」가 공개 주소를 새 탭으로 연다", () => {
  render(<DeployPanel portfolio={portfolio("published")} deployments={DEPLOYMENTS} checks={[]} nextVersion={3} canPublish />);

  const head = screen.getByRole("region", { name: "공개 상태" });
  expect(within(head).getByText("공개 중")).toBeTruthy();
  const open = within(head).getByRole("link", { name: /열기/ });
  expect(open.getAttribute("href")).toBe(publicSiteUrl("minjae"));
  expect(open.getAttribute("target")).toBe("_blank");
});

it("공개 중단은 확인 창을 거친 뒤에야 보낸다", async () => {
  render(<DeployPanel portfolio={portfolio("published")} deployments={DEPLOYMENTS} checks={[]} nextVersion={3} canPublish />);

  fireEvent.click(screen.getByRole("button", { name: "공개 중단" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("공개를 중단할까요?")).toBeTruthy();
  expect(deployAction).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "공개 중단" }));
  });
  await waitFor(() => expect(deployAction).toHaveBeenCalledTimes(1));
  expect(sentIntent()).toMatchObject({ intent: "unpublish", portfolioId: PORTFOLIO_ID });
});

it("지난 판 되돌리기도 확인 창을 거치고, 취소하면 보내지 않는다", async () => {
  render(<DeployPanel portfolio={portfolio("published")} deployments={DEPLOYMENTS} checks={[]} nextVersion={3} canPublish />);

  fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("v1 판으로 되돌릴까요?")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
  expect(deployAction).not.toHaveBeenCalled();
});

it("공개를 중단했으면 「다시 공개」가 지금 판을 새 판 없이 다시 연다", async () => {
  render(<DeployPanel portfolio={portfolio("unlisted")} deployments={DEPLOYMENTS} checks={[]} nextVersion={3} canPublish />);

  const head = screen.getByRole("region", { name: "공개 상태" });
  expect(within(head).getByText("공개 중단")).toBeTruthy();
  expect(within(head).queryByRole("link", { name: /열기/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "공개 중단" })).toBeNull();

  await act(async () => {
    fireEvent.click(within(head).getByRole("button", { name: /다시 공개/ }));
  });
  await waitFor(() => expect(deployAction).toHaveBeenCalledTimes(1));
  expect(sentIntent()).toMatchObject({ intent: "reopen", deploymentId: DEPLOYMENTS[0]!.id });
});

it("배포할 지면이 없으면 헤더 배포 단추를 누를 수 없다", () => {
  render(<DeployPanel portfolio={portfolio("draft", false)} deployments={[]} checks={[]} nextVersion={1} canPublish={false} />);

  const publish = screen.getByRole("button", { name: /v1 배포/ });
  expect((publish as HTMLButtonElement).disabled).toBe(true);
  expect(within(screen.getByRole("region", { name: "공개 상태" })).getByText("아직 배포 전")).toBeTruthy();
});

it("배포 뒤 고친 것이 있으면 상태 머리가 그 사실을 말한다", () => {
  render(<DeployPanel portfolio={portfolio("published", true, true)} deployments={DEPLOYMENTS} checks={[]} nextVersion={3} canPublish />);

  expect(screen.getByText(/고친 내용이 아직 나가지 않았습니다/)).toBeTruthy();
});
