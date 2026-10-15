// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentPlanDraft, AgentReplanDraft, PreparationPlan } from "@expresso/contracts";
import { PlanDraftCard } from "./PlanDraftCard";
import { PlanCard } from "./PlanCard";
import { ReplanDraftCard } from "./ReplanDraftCard";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const settings = { weeklyHours: 1, weeks: 4, startDate: "2026-10-19" };
const tasks = ["learn", "project"].map((kind, index) => ({ id: id(10 + index), gapId: id(9), requirement: "Kubernetes 운영", kind: kind as "learn", week: index + 1, date: ["2026-10-19", "2026-10-26"][index]!, minutes: 60, title: `작업 ${index + 1}`, action: "할 일", deliverable: "결과물" }));
const draft: AgentPlanDraft = { draftId: id(1), jobPostingId: id(2), title: "Kubernetes 준비", summary: "요약", settings, tasks, status: "ready", planId: null };
const plan: PreparationPlan = { id: id(1), conversationId: id(3), jobPostingId: id(2), title: "Kubernetes 준비", summary: "요약", settings, version: 2, scheduleVersion: 1, createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z", tasks: tasks.map(task => ({ ...task, status: "not_started" as const, note: "", outcome: "", outcomeUrl: "", spentMinutes: 0, updatedAt: "2026-10-15T00:00:00.000Z" })) };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("준비 계획 초안 카드", () => {
  it("주차별 작업을 보이고, 대화상자에서 고친 작업 문구로 승인한다", async () => {
    const onDecide = vi.fn(async () => undefined);
    render(<PlanDraftCard draft={draft} disabled={false} onDecide={onDecide} />);
    expect(screen.getByText("1주 · 2026-10-19")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /작업 문구 고치기/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getAllByLabelText("작업")[0]!, { target: { value: "작업 1 (고침)" } });
    fireEvent.click(within(dialog).getAllByRole("button", { name: "닫기" }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "승인하고 저장" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalled());
    expect(onDecide.mock.calls[0]![0]).toMatchObject({ action: "approve", title: "Kubernetes 준비", taskEdits: [{ id: id(10), title: "작업 1 (고침)" }, { id: id(11), title: "작업 2" }] });
  });
});

describe("준비 계획 카드", () => {
  it("불러온 계획에 진행을 저장하고, 완료에 결과가 없으면 이유를 보인다", async () => {
    const saved = { ...plan, version: 3, tasks: [{ ...plan.tasks[0]!, status: "completed" as const, outcome: "예제 완성" }, plan.tasks[1]!] };
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        if (!body.outcome) return Response.json({ error: { message: "완료하려면 결과 설명이나 링크를 남겨 주세요." } }, { status: 400 });
        return Response.json({ data: saved });
      }
      return Response.json({ data: plan });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<PlanCard planId={plan.id} refreshKey={1} />);
    await screen.findByText("0/2 완료");
    fireEvent.click(screen.getByRole("button", { name: /작업 1 · 시작 전/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("상태"), { target: { value: "completed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toContain("결과 설명이나 링크"));
    fireEvent.change(within(dialog).getByLabelText(/^결과 \(/), { target: { value: "예제 완성" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));
    await screen.findByText("1/2 완료");
    expect(JSON.parse(String(fetcher.mock.calls.at(-1)![1]!.body))).toMatchObject({ expectedVersion: 2, status: "completed", outcome: "예제 완성" });
  });
});

describe("계획 재배치 초안 카드", () => {
  it("남은 작업의 새 주차를 보이고 승인한다", async () => {
    const replan: AgentReplanDraft = { draftId: id(4), planId: plan.id, baseVersion: 2, settings: { ...settings, weeklyHours: 2 }, slots: [{ taskId: id(11), title: "작업 2", week: 1, date: "2026-11-02" }], status: "ready" };
    const onDecide = vi.fn(async () => undefined);
    render(<ReplanDraftCard draft={replan} disabled={false} onDecide={onDecide} />);
    expect(screen.getByText("1주 · 2026-11-02")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이대로 다시 배치" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith({ action: "approve" }));
  });
});
