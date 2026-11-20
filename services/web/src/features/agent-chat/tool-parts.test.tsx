// @vitest-environment jsdom
import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentToolResult } from "@expresso/contracts";
import { RequirementReviewCard } from "./RequirementReviewCard";
import { GapReviewCard } from "./GapReviewCard";
import { RecordDraftCard } from "./RecordDraftCard";
import { JobGoalDraftCard } from "./JobGoalDraftCard";
import { PlanDraftCard } from "./PlanDraftCard";
import { PlanCard } from "./PlanCard";
import { ReplanDraftCard } from "./ReplanDraftCard";
import { PageEditCard } from "./PageEditCard";
import { TOOL_PARTS, isBelowTool, toolPartFor, type ToolPartContext } from "./tool-parts";

afterEach(cleanup);

const context = (overrides: Partial<ToolPartContext> = {}): ToolPartContext => ({
  conversationId: "00000000-0000-4000-8000-000000000001", conversationVersion: 3, busy: false, canAnswer: true,
  pageEditLatest: () => true,
  decideDraft: vi.fn(async () => undefined), decideGoalDraft: vi.fn(async () => undefined), decidePlanDraft: vi.fn(async () => undefined), decideReplanDraft: vi.fn(async () => undefined),
  undoPageEdit: vi.fn(async () => undefined), answerPart: vi.fn(async () => undefined), ...overrides,
});
/** 카드가 받는 결과의 속은 보지 않는다 — 어느 컴포넌트가 어떤 속성으로 그려지는지만 본다. */
const tool = (name: string, detail: Record<string, unknown> = {}, status: AgentToolResult["status"] = "complete") => ({ id: "t1", name, status, summary: "요약", ...detail }) as AgentToolResult;
const element = (target: AgentToolResult, using = context()) => toolPartFor(target)!.render(target, using) as ReactElement<Record<string, unknown>>;

describe("대화 속 화면의 등록표", () => {
  it("기존 카드는 작업 흔적 안에서 변경 전과 같은 컴포넌트로 그린다", () => {
    const cases: [string, Record<string, unknown>, unknown][] = [
      ["요건 대조", { review: { items: [] } }, RequirementReviewCard],
      ["보완점 정리", { gapReview: { items: [] } }, GapReviewCard],
      ["새 기록 초안", { recordDraft: { draftId: "d1" } }, RecordDraftCard],
      ["구직 목표 변경", { goalDraft: { draftId: "d2" } }, JobGoalDraftCard],
      ["준비 계획 초안", { planDraft: { draftId: "d3", status: "ready", planId: null } }, PlanDraftCard],
      ["계획 재배치 초안", { replanDraft: { draftId: "d4" } }, ReplanDraftCard],
      ["지면 요소 고침", { pageEdit: { editId: "e1", portfolioId: "p1", revision: 2 } }, PageEditCard],
    ];
    for (const [name, detail, component] of cases) {
      const target = tool(name, detail);
      expect(toolPartFor(target)?.placement, name).toBe("trace");
      expect(element(target).type, name).toBe(component);
      expect(isBelowTool(target), name).toBe(false);
    }
  });
  it("카드에 대화 id · 실행 중 여부 · 최신 판 여부를 넘기고, 카드의 결정을 그 초안의 동작으로 잇는다", async () => {
    const using = context({ busy: true, pageEditLatest: vi.fn(() => false) });
    expect(element(tool("요건 대조", { review: { items: [] } }), using).props).toMatchObject({ conversationId: using.conversationId, toolId: "t1" });
    const draft = element(tool("새 기록 초안", { recordDraft: { draftId: "d1" } }), using);
    expect(draft.props.disabled).toBe(true);
    await (draft.props.onDecide as (decision: unknown) => Promise<void>)({ action: "reject" });
    expect(using.decideDraft).toHaveBeenCalledWith("d1", { action: "reject" });
    const edit = element(tool("지면 요소 고침", { pageEdit: { editId: "e1", portfolioId: "p1", revision: 2 } }), using);
    expect(edit.props.latest).toBe(false);
    await (edit.props.onUndo as () => Promise<void>)();
    expect(using.undoPageEdit).toHaveBeenCalledWith("e1");
  });
  it("승인한 준비 계획 초안은 계획 카드로 바꿔 그린다", () => {
    const approved = element(tool("준비 계획 초안", { planDraft: { draftId: "d3", status: "approved", planId: "00000000-0000-4000-8000-000000000009" } }));
    expect(approved.type).toBe(PlanCard);
    expect(approved.props).toMatchObject({ planId: "00000000-0000-4000-8000-000000000009", refreshKey: 3 });
  });
  it("카드가 없는 도구는 등록표에 걸리지 않는다", () => {
    expect(toolPartFor(tool("기록 목록 확인"))).toBeUndefined();
    expect(toolPartFor(tool("기록 변경 제안", { proposal: { proposalId: "p" } }))).toBeUndefined();
  });
  it("답변 글 아래에 그리는 항목은 도구 이름을 갖는다", () => {
    for (const part of TOOL_PARTS.filter(part => part.placement === "below")) expect(part.toolNames?.length, part.key).toBeGreaterThan(0);
  });
  it("선택지 질문은 부품이 생기기 전에도 답변 글 아래 자리를 차지하고, 부품이 오면 선택지를 그려 답을 보낸다", () => {
    const pending = tool("선택지 질문", {}, "running");
    expect(isBelowTool(pending)).toBe(true);
    expect(toolPartFor(pending)?.placement).toBe("below");
    const using = context();
    const { rerender, container } = render(<>{toolPartFor(pending)!.render(pending, using)}</>);
    expect(screen.getByRole("status").textContent).toBe("선택지를 준비하고 있습니다.");
    const failed = tool("선택지 질문", {}, "failed");
    rerender(<>{toolPartFor(failed)!.render(failed, using)}</>);
    expect(container.firstChild).toBeNull();
    const shown = tool("선택지 질문", { ui: { kind: "choice", partId: "00000000-0000-4000-8000-000000000010", prompt: "어느 쪽인가요?", multiple: false, options: [{ id: "o1", label: "예" }, { id: "o2", label: "아니오" }], answer: null } });
    rerender(<>{toolPartFor(shown)!.render(shown, using)}</>);
    fireEvent.click(screen.getByRole("radio", { name: "아니오" }));
    expect(using.answerPart).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000010", ["o2"]);
    rerender(<>{toolPartFor(shown)!.render(shown, context({ canAnswer: false }))}</>);
    expect((screen.getByRole("radio", { name: "예" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
