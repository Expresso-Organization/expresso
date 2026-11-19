"use client";
import type { ReactNode } from "react";
import type { AgentGoalDraftDecision, AgentPlanDecision, AgentRecordDraftDecision, AgentReplanDecision, AgentToolResult } from "@expresso/contracts";
import { RequirementReviewCard } from "./RequirementReviewCard";
import { RecordDraftCard } from "./RecordDraftCard";
import { JobGoalDraftCard } from "./JobGoalDraftCard";
import { GapReviewCard } from "./GapReviewCard";
import { PlanDraftCard } from "./PlanDraftCard";
import { PlanCard } from "./PlanCard";
import { ReplanDraftCard } from "./ReplanDraftCard";
import { PageEditCard } from "./PageEditCard";
import { ChoicePart, ChoicePartPending } from "./ChoicePart";
import { FormPart, FormPartPending } from "./FormPart";
import { SavedRecordCard, SavedRecordPending } from "./SavedRecordCard";
import { CommitmentCard, CommitmentPending } from "./CommitmentCard";

/**
 * 대화 속 화면의 등록표. 도구 결과를 어떤 컴포넌트로, 어느 자리에 그릴지 이 표 하나가 정한다.
 *
 * 새 부품이나 카드는 이 표에 한 줄을 더한다 — 대화 화면의 분기문을 고치지 않는다.
 */

/** 그려지는 자리. `trace`는 작업 흔적의 단계 아래, `below`는 답변 글 아래(작업 흔적 밖)다. */
export type ToolPartPlacement = "trace" | "below";

/** 부품이 화면에서 받아 쓰는 것. 도메인 데이터는 도구 결과에 있고, 여기에는 상태와 동작만 둔다. */
export interface ToolPartContext {
  conversationId: string | null;
  /** 대화가 바뀔 때마다 오르는 번호. 계획 카드가 다시 읽을 때를 안다. */
  conversationVersion: number | undefined;
  /** 실행 중이거나 요청을 보내는 중. 승인 · 거절 · 되돌리기를 막는다. */
  busy: boolean;
  /** 이 도구 결과에 지금 답할 수 있는가 — 마지막 답변에 있고, 실행 중이 아니며, 보낼 수 있는 상태다. */
  canAnswer: boolean;
  /** 지면 고침이 지금 지면의 최신 판인가. 그 지면이 연결되지 않은 화면에서는 알 수 없다(undefined). */
  pageEditLatest(edit: { portfolioId: string; revision: number }): boolean | undefined;
  decideDraft(draftId: string, decision: AgentRecordDraftDecision): Promise<void>;
  decideGoalDraft(draftId: string, decision: AgentGoalDraftDecision): Promise<void>;
  decidePlanDraft(draftId: string, decision: AgentPlanDecision): Promise<void>;
  decideReplanDraft(draftId: string, decision: AgentReplanDecision): Promise<void>;
  undoPageEdit(editId: string): Promise<void>;
  /** 부품에 답한다. 선택지는 고른 id, 입력 칸 묶음은 칸마다의 값이다. */
  answerPart(partId: string, answer: { optionIds: string[] } | { values: { id: string; text: string }[] }): Promise<void>;
  /** 에이전트가 저장한 기록을 되돌린다(휴지통으로 옮긴다). */
  undoSavedRecord(recordId: string): Promise<void>;
}

export interface ToolPart {
  key: string;
  placement: ToolPartPlacement;
  /**
   * `below` 자리의 항목이 맡는 도구 이름(서버가 보내는 이름, `platform/agent/runtime.ts`의 `TOOL_LABELS`).
   * 자리는 결과의 유무가 아니라 이름으로 정한다 — 입력을 쓰는 중이거나 돌려보내진 호출도 같은 자리에 그려,
   * 부품이 생길 때 자리가 바뀌지 않는다.
   */
  toolNames?: readonly string[];
  match(tool: AgentToolResult): boolean;
  render(tool: AgentToolResult, context: ToolPartContext): ReactNode;
}

export const TOOL_PARTS: readonly ToolPart[] = [
  { key: "choice", placement: "below", toolNames: ["선택지 질문"], match: tool => tool.name === "선택지 질문",
    render: (tool, context) => tool.ui?.kind === "choice"
      ? <ChoicePart part={tool.ui} interactive={context.canAnswer} onAnswer={optionIds => context.answerPart(tool.ui!.partId, { optionIds })} />
      : <ChoicePartPending failed={tool.status === "failed"} /> },
  { key: "form", placement: "below", toolNames: ["입력 칸 질문"], match: tool => tool.name === "입력 칸 질문",
    render: (tool, context) => tool.ui?.kind === "form"
      ? <FormPart part={tool.ui} interactive={context.canAnswer} onAnswer={values => context.answerPart(tool.ui!.partId, { values })} />
      : <FormPartPending failed={tool.status === "failed"} /> },
  { key: "savedRecord", placement: "below", toolNames: ["기록 저장"], match: tool => tool.name === "기록 저장",
    render: (tool, context) => { const saved = tool.savedRecord; return saved
      ? <SavedRecordCard saved={saved} disabled={context.busy} onUndo={() => context.undoSavedRecord(saved.recordId)} />
      : <SavedRecordPending failed={tool.status === "failed"} />; } },
  { key: "commitment", placement: "below", toolNames: ["약속"], match: tool => tool.name === "약속",
    render: (tool, context) => tool.commitment
      ? <CommitmentCard commitment={tool.commitment} refreshKey={context.conversationVersion} />
      : <CommitmentPending failed={tool.status === "failed"} /> },
  { key: "review", placement: "trace", match: tool => !!tool.review,
    render: (tool, context) => <RequirementReviewCard conversationId={context.conversationId} toolId={tool.id} review={tool.review!} /> },
  { key: "gapReview", placement: "trace", match: tool => !!tool.gapReview,
    render: (tool, context) => <GapReviewCard conversationId={context.conversationId} toolId={tool.id} gapReview={tool.gapReview!} /> },
  { key: "recordDraft", placement: "trace", match: tool => !!tool.recordDraft,
    render: (tool, context) => { const draft = tool.recordDraft!; return <RecordDraftCard draft={draft} disabled={context.busy} onDecide={decision => context.decideDraft(draft.draftId, decision)} />; } },
  { key: "goalDraft", placement: "trace", match: tool => !!tool.goalDraft,
    render: (tool, context) => { const draft = tool.goalDraft!; return <JobGoalDraftCard draft={draft} disabled={context.busy} onDecide={decision => context.decideGoalDraft(draft.draftId, decision)} />; } },
  { key: "planDraft", placement: "trace", match: tool => !!tool.planDraft,
    render: (tool, context) => {
      const draft = tool.planDraft!;
      // 승인한 초안은 계획 카드로 바뀐다. 진행은 계획에서 읽는다.
      if (draft.status === "approved" && draft.planId) return <PlanCard planId={draft.planId} refreshKey={context.conversationVersion} />;
      return <PlanDraftCard draft={draft} disabled={context.busy} onDecide={decision => context.decidePlanDraft(draft.draftId, decision)} />;
    } },
  { key: "replanDraft", placement: "trace", match: tool => !!tool.replanDraft,
    render: (tool, context) => { const draft = tool.replanDraft!; return <ReplanDraftCard draft={draft} disabled={context.busy} onDecide={decision => context.decideReplanDraft(draft.draftId, decision)} />; } },
  { key: "pageEdit", placement: "trace", match: tool => !!tool.pageEdit,
    render: (tool, context) => { const edit = tool.pageEdit!; return <PageEditCard edit={edit} latest={context.pageEditLatest(edit)} disabled={context.busy} onUndo={() => context.undoPageEdit(edit.editId)} />; } },
];

/** 이 도구 결과를 그릴 항목. 위에서부터 처음 맞는 것. 없으면 작업 흔적에 이름과 요약만 남는다. */
export const toolPartFor = (tool: AgentToolResult) => TOOL_PARTS.find(part => part.match(tool));
/** 이 도구 호출을 답변 글 아래에 그리는가. 이름만 본다. */
export const isBelowTool = (tool: Pick<AgentToolResult, "name">) => TOOL_PARTS.some(part => part.placement === "below" && part.toolNames?.includes(tool.name));
