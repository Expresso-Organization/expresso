// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ setStageAction: vi.fn(), removePreferenceAction: vi.fn() }));
vi.mock("./goal-actions", () => actions);
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { ProgressSections } from "./ProgressSections";

afterEach(cleanup);
beforeEach(() => { actions.setStageAction.mockReset().mockResolvedValue({}); actions.removePreferenceAction.mockReset().mockResolvedValue({}); });

const at = "2026-11-20T00:00:00.000Z";
const empty = { stage: null, stageSource: null, preferences: [] };
const filled = {
  stage: "preparing" as const, stageSource: "agent" as const,
  preferences: [
    { id: "00000000-0000-4000-8000-000000000001", kind: "avoid" as const, text: "야근이 잦은 곳", source: "chat" as const, createdAt: at },
    { id: "00000000-0000-4000-8000-000000000002", kind: "prefer" as const, text: "재택이 되는 곳", source: "chat" as const, createdAt: at },
  ],
};
const commitments = [
  { id: "00000000-0000-4000-8000-000000000021", title: "해커톤 지원서 내기", due: "11월 19일", overdue: true, href: "/home?chat=00000000-0000-4000-8000-000000000010" },
  { id: "00000000-0000-4000-8000-000000000022", title: "SQL 문제 20개 풀기", due: "11월 27일", overdue: false, href: null },
];
const conversations = [{ id: "00000000-0000-4000-8000-000000000010", title: "준비 계획을 세우고 싶어요", date: "11월 19일", outcomes: ["준비 계획 승인: 백엔드 준비 (주 10시간 · 8주)"] }];

describe("내 진행의 구획", () => {
  it("아직 기억이 없으면 단계는 고르지 않은 채로 있고, 조건과 대화는 빈 상태를 알린다", () => {
    render(<ProgressSections memory={empty} diagnosis={null} commitments={[]} conversations={[]} />);
    for (const name of [/^탐색/, /^준비/, /^지원/]) expect(screen.getByRole("radio", { name }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/아직 정해지지 않았습니다/)).toBeTruthy();
    expect(screen.getByText(/아직 기억하는 조건이 없습니다/)).toBeTruthy();
    expect(screen.getByText("아직 대화가 없습니다.")).toBeTruthy();
    expect(screen.getByText(/아직 하기로 한 일이 없습니다/)).toBeTruthy();
    expect(screen.getByText(/아직 진단하지 않았습니다/)).toBeTruthy();
  });
  it("저장된 목표 진단을 대화와 같은 카드로 보인다", () => {
    const diagnosis = { work: "백엔드 개발자", family: "백엔드", basis: "family" as const, focus: null, level: null, sampleSize: 66, companyCount: 15, interestedCount: 0, small: false, summary: "Kafka가 가장 큰 빈칸입니다.", items: [{ id: "technology:kafka", kind: "technology" as const, label: "Kafka", count: 39, status: "gap" as const, evidence: [], note: "" }], demandAt: at, assessedAt: at, stale: "records" as const };
    render(<ProgressSections memory={filled} diagnosis={diagnosis} commitments={[]} conversations={[]} />);
    // 구획과 그 안의 카드가 같은 이름이다. 안쪽이 카드다.
    const card = screen.getAllByRole("region", { name: "목표 진단" }).at(-1)!;
    expect(card.textContent).toContain("백엔드 공고 66건(회사 15곳)");
    expect(card.textContent).toContain("39/66건");
    expect(card.textContent).toContain("진단 뒤에 기록이 바뀌었습니다");
    expect(screen.queryByText(/아직 진단하지 않았습니다/)).toBeNull();
  });
  it("하기로 한 일은 날짜와 함께 보이고, 지난 일은 표시하며, 잡은 대화가 있으면 그 대화로 간다", () => {
    render(<ProgressSections memory={filled} diagnosis={null} commitments={commitments} conversations={[]} />);
    const late = screen.getByRole("link", { name: /해커톤 지원서 내기/ });
    expect(late.getAttribute("href")).toBe("/home?chat=00000000-0000-4000-8000-000000000010");
    expect(late.textContent).toContain("지남");
    expect(late.textContent).toContain("11월 19일까지");
    const upcoming = screen.getByText("SQL 문제 20개 풀기").parentElement!;
    expect(upcoming.tagName).toBe("SPAN");
    expect(upcoming.textContent).not.toContain("지남");
  });
  it("컨설턴트가 판단한 단계를 표시하고, 다른 단계를 고르면 바로 저장한다", async () => {
    render(<ProgressSections memory={filled} diagnosis={null} commitments={commitments} conversations={conversations} />);
    expect(screen.getByRole("radio", { name: /^준비/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/컨설턴트가 대화에서 판단한 단계입니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /^준비/ }));
    expect(actions.setStageAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: /^지원/ }));
    await waitFor(() => expect(actions.setStageAction).toHaveBeenCalledWith("applying"));
  });
  it("조건을 종류와 함께 보이고, 지우기를 누르면 그 조건을 지운다", async () => {
    render(<ProgressSections memory={filled} diagnosis={null} commitments={commitments} conversations={conversations} />);
    expect(screen.getByText("피함")).toBeTruthy();
    expect(screen.getByText("원함")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "야근이 잦은 곳 지우기" }));
    await waitFor(() => expect(actions.removePreferenceAction).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001"));
  });
  it("최근 대화는 그 대화로 가는 링크이고 날짜와 정한 것을 함께 보인다", () => {
    render(<ProgressSections memory={filled} diagnosis={null} commitments={commitments} conversations={conversations} />);
    const link = screen.getByRole("link", { name: /준비 계획을 세우고 싶어요/ });
    expect(link.getAttribute("href")).toBe("/home?chat=00000000-0000-4000-8000-000000000010");
    expect(link.textContent).toContain("11월 19일");
    expect(link.textContent).toContain("준비 계획 승인: 백엔드 준비");
  });
  it("저장하지 못하면 이유를 알린다", async () => {
    actions.setStageAction.mockResolvedValue({ error: "저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요." });
    render(<ProgressSections memory={filled} diagnosis={null} commitments={[]} conversations={[]} />);
    fireEvent.click(screen.getByRole("radio", { name: /^탐색/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("저장하지 못했습니다");
  });
});
