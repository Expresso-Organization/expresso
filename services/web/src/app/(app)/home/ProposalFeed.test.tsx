// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalFeed as Feed } from "@expresso/contracts";

const actions = vi.hoisted(() => ({ disableProposalsAction: vi.fn(), dismissProposalAction: vi.fn(), enableProposalsAction: vi.fn(), loadProposalsAction: vi.fn(), refreshProposalsAction: vi.fn() }));
vi.mock("./proposal-actions", () => actions);
vi.mock("./HomeHandoff", () => ({ useHomeHandoff: () => ({ open: vi.fn(), pending: false }) }));
// 규칙 제안의 버튼만 쓴다. 홈의 입력창이 끌고 오는 것은 싣지 않는다.
vi.mock("./HomeStart", () => ({ ProposalAction: ({ action }: { action: { label: string } }) => <span>{action.label}</span> }));

import { ProposalFeed } from "./ProposalFeed";
import type { BriefingFinding } from "./briefing";

const idle = { status: "idle", stage: null, reason: null, trigger: null, startedAt: null, finishedAt: null, read: null } as const;
const feed = (overrides: Partial<Feed> = {}): Feed => ({ available: true, enabled: false, proposals: [], run: { ...idle }, ...overrides });
const finding = { id: "first-record", text: "첫 기록을 남겨 보세요.", items: [{ label: "기록 쓰기", href: "/career" }], action: { label: "기록 남기기" } } as unknown as BriefingFinding;

afterEach(cleanup);
beforeEach(() => { for (const mock of Object.values(actions)) mock.mockReset(); });

describe("홈의 제안 구획", () => {
  it("요금제가 열지 않으면 켜는 버튼 없이 규칙으로 센 제안과 요금제 안내를 세운다", () => {
    render(<ProposalFeed initial={feed({ available: false })} fallback={[finding]} hasGoal />);
    expect(screen.getByText("첫 기록을 남겨 보세요.")).toBeTruthy();
    expect(screen.getByText(/유료 요금제에서 쓸 수 있습니다/)).toBeTruthy();
    expect((screen.getByRole("link", { name: /요금제 보기/ }) as HTMLAnchorElement).getAttribute("href")).toBe("/account#plans");
    expect(screen.queryByRole("button", { name: "켜기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "다시 받기" })).toBeNull();
  });
  it("요금제가 열면 켜는 카드가 서고, 안내 창은 크레딧에서 빼지 않는다고 밝힌다", () => {
    render(<ProposalFeed initial={feed()} fallback={[finding]} hasGoal />);
    expect(screen.queryByText("첫 기록을 남겨 보세요.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "켜기" }));
    expect(screen.getByText("익스프레소가 먼저 실행하는 일이라 이번 달 크레딧에서 빼지 않습니다.")).toBeTruthy();
  });
  it("요금제 때문에 건너뛴 실행은 그 까닭을 적는다", () => {
    render(<ProposalFeed initial={feed({ enabled: true, run: { ...idle, status: "skipped", reason: "plan_required" } })} fallback={[]} hasGoal />);
    expect(screen.getByText("지금 요금제에서는 새 제안을 만들지 않습니다.")).toBeTruthy();
  });
});
