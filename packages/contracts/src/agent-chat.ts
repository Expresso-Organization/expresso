import { JobPostingDetailSchema } from "./job-board.js";
import { CareerRecordSchema, JOB_GOAL_TEXT_MAX } from "./career.js";
import { PortfolioDetailSchema } from "./portfolios.js";
import { GeneratedPageSchema } from "./page.js";
import { CareerDocumentBootstrapSchema } from "./career-editor.js";
import { z } from "zod";
import { UuidSchema, TimestampSchema } from "./common.js";
import { AiEditProposalDetailSchema, AiEditProposalSchema } from "./career-ai.js";
import { JobAnalysisStatusSchema } from "./job-analysis.js";
import { DesignGraphicSchema } from "./design-chat.js";

export const AgentContextSchema = z.strictObject({ kind: z.enum(["job", "record", "portfolio"]), id: UuidSchema });
/**
 * 요건 대조 — 공고의 요건마다 내 기록으로 확인되는 정도.
 *
 * 강함 · 일부는 근거 기록 인용이 있어야 하고, 미확인은 근거가 없어야 한다. 기록에 없다는
 * 것은 경험이 없다는 뜻이 아니므로 "없음" 대신 "미확인"이라고 부른다.
 */
const RequirementAssessmentSchema = z.enum(["strong", "partial", "unconfirmed"]);
const requirementItemShape = {
  requirement: z.string().trim().min(1).max(300),
  jobQuote: z.string().trim().min(1).max(600),
  kind: z.enum(["must", "nice", "responsibility"]),
  assessment: RequirementAssessmentSchema,
  explanation: z.string().trim().min(1).max(1_200),
  recommendation: z.string().trim().max(600),
};
const evidenceShape = { recordId: UuidSchema, quote: z.string().trim().min(1).max(600) };
const assessmentMatchesEvidence = (item: { assessment: z.infer<typeof RequirementAssessmentSchema>; evidence: unknown[] }, ctx: z.RefinementCtx) => {
  if (item.assessment === "unconfirmed" && item.evidence.length > 0) ctx.addIssue({ code: "custom", path: ["evidence"], message: "미확인 요건에는 근거를 붙이지 않습니다." });
  if (item.assessment !== "unconfirmed" && item.evidence.length === 0) ctx.addIssue({ code: "custom", path: ["evidence"], message: "강함 · 일부 요건에는 근거 기록 인용이 1개 이상 필요합니다." });
};
export const RequirementReviewDraftSchema = z.strictObject({
  jobPostingId: UuidSchema,
  summary: z.string().trim().min(1).max(1_500),
  items: z.array(z.strictObject({ ...requirementItemShape, evidence: z.array(z.strictObject(evidenceShape)).max(5) }).superRefine(assessmentMatchesEvidence)).min(1).max(12),
});
/** 근거로 읽은 기록 글의 해시. 지금 글과 다르면 그 기록이 바뀐 것이다. */
const RecordSnapshotSchema = z.strictObject({ recordId: UuidSchema, textHash: z.string().length(64) });
export const RequirementReviewSchema = z.strictObject({
  jobPostingId: UuidSchema,
  summary: RequirementReviewDraftSchema.shape.summary,
  items: z.array(z.strictObject({ ...requirementItemShape, evidence: z.array(z.strictObject({ ...evidenceShape, recordTitle: z.string().max(200) })).max(5) }).superRefine(assessmentMatchesEvidence)).min(1).max(12),
  /** 대조할 때 읽은 원문의 해시. 지금 원문과 다르면 다시 대조해야 한다. */
  snapshot: z.strictObject({ jobContentHash: z.string().length(64), records: z.array(RecordSnapshotSchema).max(60) }),
  createdAt: TimestampSchema,
});
export const AgentReviewFreshnessResponseSchema = z.strictObject({ data: z.strictObject({ stale: z.boolean(), changed: z.array(z.enum(["job", "records"])).max(2) }) });
export type RequirementReviewDraft = z.infer<typeof RequirementReviewDraftSchema>;
export type RequirementReview = z.infer<typeof RequirementReviewSchema>;
/**
 * 대화로 만드는 새 기록 초안. 출처는 이 대화에서 사용자가 한 말이어야 하고, 저장은 사용자가
 * 카드에서 승인할 때만 일어난다.
 */
const recordDraftSourceSchema = z.strictObject({ messageId: UuidSchema, quote: z.string().trim().min(1).max(600) });
export const AgentRecordDraftInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  categoryId: UuidSchema.optional(),
  bodyMd: z.string().trim().min(1).max(20_000),
  sources: z.array(recordDraftSourceSchema).min(1).max(10),
});
export const AgentRecordDraftSchema = z.strictObject({
  draftId: UuidSchema,
  title: AgentRecordDraftInputSchema.shape.title,
  categoryId: UuidSchema.nullable(),
  bodyMd: AgentRecordDraftInputSchema.shape.bodyMd,
  sources: AgentRecordDraftInputSchema.shape.sources,
  /** 카드에서 고를 수 있는 카테고리. 초안을 만들 때의 목록이다. */
  categories: z.array(z.strictObject({ id: UuidSchema, name: z.string().max(120) })).max(50),
  status: z.enum(["ready", "approved", "rejected"]),
  recordId: UuidSchema.nullable(),
});
export const AgentRecordDraftDecisionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("approve"), title: AgentRecordDraftInputSchema.shape.title, bodyMd: AgentRecordDraftInputSchema.shape.bodyMd, categoryId: UuidSchema }),
  z.strictObject({ action: z.literal("reject") }),
]);
export type AgentRecordDraftInput = z.infer<typeof AgentRecordDraftInputSchema>;
export type AgentRecordDraft = z.infer<typeof AgentRecordDraftSchema>;
export type AgentRecordDraftDecision = z.infer<typeof AgentRecordDraftDecisionSchema>;
/**
 * 대화로 고치는 구직 목표의 초안. 에이전트는 바뀌는 칸만 제안하고, 저장은 사용자가 카드에서
 * 승인할 때만 일어난다. 승인하면 그 시점의 목표에 바뀌는 칸만 덮는다.
 */
const goalDraftText = z.string().trim().min(1).max(JOB_GOAL_TEXT_MAX);
export const AgentGoalDraftInputSchema = z.strictObject({
  work: goalDraftText.optional().describe("하고 싶은 일. 바뀌지 않으면 넣지 않습니다."),
  place: goalDraftText.optional().describe("일하고 싶은 곳. 바뀌지 않으면 넣지 않습니다."),
  timing: goalDraftText.optional().describe("취업 목표 시기와 지금 상황. 바뀌지 않으면 넣지 않습니다."),
});
const goalDraftTexts = z.strictObject({ work: z.string().max(JOB_GOAL_TEXT_MAX), place: z.string().max(JOB_GOAL_TEXT_MAX), timing: z.string().max(JOB_GOAL_TEXT_MAX) });
export const AgentGoalDraftSchema = z.strictObject({
  draftId: UuidSchema,
  /** 바뀌지 않는 칸은 null이다. */
  work: goalDraftText.nullable(),
  place: goalDraftText.nullable(),
  timing: goalDraftText.nullable(),
  /** 초안을 만들 때 적혀 있던 목표. 목표가 없었으면 null. */
  previous: goalDraftTexts.nullable(),
  /** replaced — 저장하기 전에 같은 대화에서 새 초안이 나와 닫혔다. */
  status: z.enum(["ready", "approved", "rejected", "replaced"]),
});
export const AgentGoalDraftDecisionSchema = z.strictObject({ action: z.enum(["approve", "reject"]) });
export type AgentGoalDraftInput = z.infer<typeof AgentGoalDraftInputSchema>;
export type AgentGoalDraft = z.infer<typeof AgentGoalDraftSchema>;
export type AgentGoalDraftDecision = z.infer<typeof AgentGoalDraftDecisionSchema>;
/**
 * 보완점 정리 — 요건 대조와 대화에서 확인한 내용으로, 이 공고를 위해 무엇을 확인하거나
 * 준비할지 정리한 것.
 *
 * 기록에 없다는 것만으로는 부족하다고 보지 않는다 — 그런 요건은 "확인 필요"이고, "보완 필요"는
 * 사용자가 대화에서 직접 부족하다고 말한 경우에만 쓴다.
 */
const GapTypeSchema = z.enum(["evidence", "experience", "skill", "qualification", "portfolio"]);
const GapStatusSchema = z.enum(["needs_confirmation", "needs_improvement"]);
const GapPrioritySchema = z.enum(["high", "medium", "low"]);
const gapEvidenceShape = { sourceType: z.enum(["record", "user_message"]), sourceId: UuidSchema, quote: z.string().trim().min(1).max(600) };
const gapItemShape = {
  requirementIndex: z.number().int().min(0).max(11),
  type: GapTypeSchema,
  status: GapStatusSchema,
  priority: GapPrioritySchema,
  explanation: z.string().trim().min(1).max(1_200),
  suggestedAction: z.string().trim().min(1).max(600),
};
export const GapReviewDraftSchema = z.strictObject({
  summary: z.string().trim().min(1).max(1_500),
  items: z.array(z.strictObject({ ...gapItemShape, evidence: z.array(z.strictObject(gapEvidenceShape)).max(7) })).min(1).max(20),
});
export const GapReviewSchema = z.strictObject({
  jobPostingId: UuidSchema,
  summary: GapReviewDraftSchema.shape.summary,
  items: z.array(z.strictObject({
    ...gapItemShape,
    id: UuidSchema,
    requirement: z.string().max(300),
    jobQuote: z.string().max(600),
    evidence: z.array(z.strictObject({ ...gapEvidenceShape, label: z.string().max(200) })).max(7),
  })).min(1).max(20),
  /**
   * 근거로 인용한 기록 글의 해시(보완점 20개 × 근거 7개까지). 이 필드가 생기기 전에 만든 보완점에는
   * 없다 — 그때는 바탕이 된 요건 대조의 최신성만 본다.
   */
  snapshot: z.strictObject({ records: z.array(RecordSnapshotSchema).max(140) }).optional(),
  createdAt: TimestampSchema,
});
export type GapReviewDraft = z.infer<typeof GapReviewDraftSchema>;
export type GapReview = z.infer<typeof GapReviewSchema>;
/**
 * 준비 계획 — 고른 보완점과 쓸 수 있는 시간으로 주차별 작업을 배치한 것.
 *
 * 작업은 규칙으로 만든다(AI가 시간을 정하지 않는다). 승인 전에는 대화의 도구 결과로만 있고,
 * 승인하면 대화 밖에도 남는 계획이 되어 작업마다 진행을 기록한다.
 */
export const PreparationSettingsSchema = z.strictObject({
  weeklyHours: z.number().int().min(1).max(40),
  weeks: z.number().int().min(1).max(12),
  startDate: z.iso.date(),
});
const preparationText = z.string().trim().min(1).max(2_000);
export const PreparationTaskDraftSchema = z.strictObject({
  id: UuidSchema,
  gapId: UuidSchema,
  requirement: z.string().max(300),
  kind: z.enum(["confirm", "learn", "project", "check", "portfolio"]),
  week: z.number().int().min(1).max(12),
  date: z.iso.date(),
  minutes: z.number().int().min(30).max(60),
  title: z.string().trim().min(1).max(300),
  action: preparationText,
  deliverable: preparationText,
});
export const TaskProgressStatusSchema = z.enum(["not_started", "in_progress", "completed", "blocked"]);
const OutcomeUrlSchema = z.union([z.literal(""), z.url().max(2_048).refine(value => ["http:", "https:"].includes(new URL(value).protocol), "http(s) 링크만 남길 수 있습니다.")]);
export const PreparationTaskSchema = PreparationTaskDraftSchema.extend({
  status: TaskProgressStatusSchema,
  note: z.string().max(2_000),
  outcome: z.string().max(2_000),
  outcomeUrl: OutcomeUrlSchema,
  spentMinutes: z.number().int().min(0).max(100_000),
  updatedAt: TimestampSchema,
});
export const PlanProposalInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  summary: preparationText,
  gapIndexes: z.array(z.number().int().min(0).max(19)).min(1).max(10).refine(items => new Set(items).size === items.length, "같은 보완점을 두 번 고를 수 없습니다."),
  settings: PreparationSettingsSchema,
});
export const AgentPlanDraftSchema = z.strictObject({
  draftId: UuidSchema,
  jobPostingId: UuidSchema,
  title: PlanProposalInputSchema.shape.title,
  summary: preparationText,
  settings: PreparationSettingsSchema,
  tasks: z.array(PreparationTaskDraftSchema).min(1).max(40),
  status: z.enum(["ready", "approved", "rejected"]),
  /** 승인하면 계획 id. 초안 id와 같다 — 승인을 다시 보내도 계획은 하나다. */
  planId: UuidSchema.nullable(),
});
export const AgentPlanDecisionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("approve"), title: PlanProposalInputSchema.shape.title, summary: preparationText, taskEdits: z.array(z.strictObject({ id: UuidSchema, title: PreparationTaskDraftSchema.shape.title, action: preparationText, deliverable: preparationText })).min(1).max(40) }),
  z.strictObject({ action: z.literal("reject") }),
]);
export const PreparationPlanSchema = z.strictObject({
  id: UuidSchema,
  conversationId: UuidSchema,
  jobPostingId: UuidSchema,
  title: PlanProposalInputSchema.shape.title,
  summary: preparationText,
  settings: PreparationSettingsSchema,
  tasks: z.array(PreparationTaskSchema).min(1).max(40),
  version: z.number().int().positive(),
  scheduleVersion: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export const PreparationPlanResponseSchema = z.strictObject({ data: PreparationPlanSchema });
/** 작업 진행 기록. 완료는 결과 설명이나 링크가 있어야 한다 — 무엇을 끝냈는지 남지 않은 완료는 받지 않는다. */
export const UpdateTaskProgressSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  status: TaskProgressStatusSchema,
  note: z.string().max(2_000),
  outcome: z.string().max(2_000),
  outcomeUrl: OutcomeUrlSchema,
  spentMinutes: z.number().int().min(0).max(100_000),
}).refine(input => input.status !== "completed" || !!input.outcome.trim() || !!input.outcomeUrl, { message: "완료하려면 결과 설명이나 링크를 남겨 주세요.", path: ["outcome"] });
/** 남은 작업 재배치. 완료하지 않은 작업만 새 설정으로 다시 배치한다. */
export const ReplanProposalInputSchema = z.strictObject({ planId: UuidSchema, settings: PreparationSettingsSchema });
export const AgentReplanDraftSchema = z.strictObject({
  draftId: UuidSchema,
  planId: UuidSchema,
  /** 이 초안을 만든 때의 계획 버전. 승인할 때 계획이 그 사이에 바뀌었으면 받지 않는다. */
  baseVersion: z.number().int().positive(),
  settings: PreparationSettingsSchema,
  slots: z.array(z.strictObject({ taskId: UuidSchema, title: z.string().max(300), week: z.number().int().min(1).max(12), date: z.iso.date() })).min(1).max(40),
  status: z.enum(["ready", "approved", "rejected"]),
});
export const AgentReplanDecisionSchema = z.strictObject({ action: z.enum(["approve", "reject"]) });
export type UpdateTaskProgress = z.infer<typeof UpdateTaskProgressSchema>;
export type ReplanProposalInput = z.infer<typeof ReplanProposalInputSchema>;
export type AgentReplanDraft = z.infer<typeof AgentReplanDraftSchema>;
export type AgentReplanDecision = z.infer<typeof AgentReplanDecisionSchema>;
export type PreparationSettings = z.infer<typeof PreparationSettingsSchema>;
export type PreparationTaskDraft = z.infer<typeof PreparationTaskDraftSchema>;
export type PreparationTask = z.infer<typeof PreparationTaskSchema>;
export type PlanProposalInput = z.infer<typeof PlanProposalInputSchema>;
export type AgentPlanDraft = z.infer<typeof AgentPlanDraftSchema>;
export type AgentPlanDecision = z.infer<typeof AgentPlanDecisionSchema>;
export type PreparationPlan = z.infer<typeof PreparationPlanSchema>;
/** 지면 요소의 Spec 키. 편집 화면의 `data-xp-key`와 같다. */
export const PageElementKeySchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/);
/** 메시지를 보낼 때 다듬기 화면에서 고른 요소. 에이전트는 이 요소를 고칠 대상으로 읽는다. */
export const AgentPageSelectionSchema = z.strictObject({ portfolioId: UuidSchema, key: PageElementKeySchema, label: z.string().trim().min(1).max(200) });
/**
 * 에이전트가 지면 요소 하나에 쓰는 고침. 바꾸지 않는 칸은 비운다. 고를 수 있는 값은 요소마다 달라
 * 형식에는 모양만 두고, 서버가 그 요소의 선택지로 검사해 어긋난 항목을 돌려준다.
 */
export const AgentPageElementEditInputSchema = z.strictObject({
  portfolioId: UuidSchema,
  key: PageElementKeySchema,
  note: z.string().trim().min(1).max(400).describe("무엇을 바꿨는지 사용자에게 하는 말 한두 문장"),
  props: z.array(z.strictObject({ name: z.string().min(1).max(60), value: z.string().min(1).max(60) })).max(20).optional().describe("모양 선택지. read_page_element의 options에 있는 값만"),
  style: z.array(z.strictObject({ part: z.string().min(1).max(60), color: z.string().max(30).optional(), font: z.string().max(30).optional(), size: z.string().max(30).optional() })).max(20).optional().describe("글자 부분마다 색 · 서체 · 크기 단계. 빈 부분은 기본 모양"),
  text: z.array(z.strictObject({ path: z.string().min(1).max(300), value: z.string().max(20_000) })).max(64).optional().describe("read_page_element의 text 경로와 새 글"),
});
export const AgentPageElementReadInputSchema = z.strictObject({ portfolioId: UuidSchema, key: PageElementKeySchema });
/** 에이전트가 지면 요소를 고쳐 저장한 새 판. 되돌리기는 이 판이 아직 최신일 때만 된다. */
export const AgentPageEditSchema = z.strictObject({
  editId: UuidSchema,
  portfolioId: UuidSchema,
  key: PageElementKeySchema,
  label: z.string().max(200),
  note: z.string().max(400),
  // 지면 글 한도(본문 20,000자 · 섹션 제목 300자 + 칸 이름)와 맞춘다. 더 좁으면 긴 본문을 고친 대화는 읽을 수 없게 된다.
  changes: z.array(z.strictObject({ label: z.string().max(400), before: z.string().max(20_000), after: z.string().max(20_000) })).max(120),
  revision: z.number().int().positive(),
  undone: z.boolean(),
});
export type AgentPageSelection = z.infer<typeof AgentPageSelectionSchema>;
export type AgentPageElementEditInput = z.infer<typeof AgentPageElementEditInputSchema>;
export type AgentPageEdit = z.infer<typeof AgentPageEditSchema>;
/**
 * 대화에서 시작한 포트폴리오 제작. 도구 결과에는 ID와 공고의 이름만 둔다 — 분석의 진행과 결과, 만들어진 제작은
 * 서버가 그때그때 `job_analyses`와 `brews`에서 읽는다(`AgentBrewStartState`). 대화는 메시지와 도구 수에 상한이 있고
 * 모델에는 요약만 넘어가므로, 바뀌는 상태를 여기에 적어 두면 옛 값이 남는다.
 */
export const AgentBrewStartSchema = z.strictObject({
  startId: UuidSchema,
  jobPostingId: UuidSchema,
  jobAnalysisId: UuidSchema,
  title: z.string().min(1).max(300),
  companyName: z.string().max(200),
  /** 카드를 세울 때 이 대화에 이미 있던 제작. 없었으면 null이다. 그 뒤에 만든 제작은 상태(`AgentBrewStartState.brewId`)가 알려 준다. */
  brewId: UuidSchema.nullable(),
});
export type AgentBrewStart = z.infer<typeof AgentBrewStartSchema>;
/** 제작을 시작하는 도구의 입력. 공고는 대화에 연결된 것만 받는다. */
export const AgentBrewStartInputSchema = z.strictObject({ jobPostingId: UuidSchema.describe("대화에 연결된 공고(context의 kind가 job인 것)의 id") });
export type AgentBrewStartInput = z.infer<typeof AgentBrewStartInputSchema>;
/** 제작의 지금 상태. 분석이 끝났으면 요건이 내 기록으로 얼마나 확인되는지를 센다. */
export const AgentBrewStartStateSchema = z.strictObject({
  status: JobAnalysisStatusSchema.shape.status,
  stage: JobAnalysisStatusSchema.shape.stage,
  failure: JobAnalysisStatusSchema.shape.failure,
  /** 분석이 끝난 뒤에만 있다. `covered` 기록으로 확인됨 · `partial` 일부만 · `missing` 기록에 없음. */
  requirements: z.strictObject({ total: z.number().int().nonnegative(), covered: z.number().int().nonnegative(), partial: z.number().int().nonnegative(), missing: z.number().int().nonnegative() }).nullable(),
  brewId: UuidSchema.nullable(),
  /**
   * 만든 제작이 가 있는 단계. `materials` 재료 고르기 · `interview` AI 대화 · `design` 디자인과 그 뒤. 제작이 없으면 null이다.
   * 재료 · AI 대화 단계는 대화의 카드(「재료 고르기」 · 「AI 대화」)가 맡고, 그 뒤의 단계는 아직 지금의 화면이 맡는다.
   */
  step: z.enum(["materials", "interview", "design"]).nullable(),
  /**
   * 에이전트가 이 분석의 결과를 대화에서 이미 알렸는가. 분석이 끝났는데 아직 알리지 않았으면 카드가 알림을 청한다
   * (`POST brew-starts/:startId/announce`) — 그때 서버가 에이전트의 답을 하나 시작한다.
   */
  announced: z.boolean(),
});
export type AgentBrewStartState = z.infer<typeof AgentBrewStartStateSchema>;
export const AgentBrewStartStateResponseSchema = z.strictObject({ data: AgentBrewStartStateSchema });
/**
 * 대화에 뜨는 「재료 고르기」 카드. 제작 ID만 둔다 — 줄 세운 기록과 고른 것은 카드가 `brew_sources`에서 그때그때 읽는다.
 * 이 카드를 든 답변은 에이전트가 아니라 서버가 쓴다(AI를 부르지 않는다).
 */
export const AgentBrewMaterialsSchema = z.strictObject({ brewId: UuidSchema, jobPostingId: UuidSchema });
export type AgentBrewMaterials = z.infer<typeof AgentBrewMaterialsSchema>;
/**
 * 대화에 뜨는 「AI 대화」 카드. 제작 ID만 둔다 — 물어볼 근거와 답한 질문은 카드가 인터뷰 세션에서 그때그때 읽는다.
 * 이 카드를 든 답변도 서버가 쓰고, 바로 뒤에 에이전트가 첫 질문을 하는 답변이 붙는다.
 */
export const AgentBrewInterviewSchema = z.strictObject({ brewId: UuidSchema, jobPostingId: UuidSchema });
export type AgentBrewInterview = z.infer<typeof AgentBrewInterviewSchema>;
/** 대화에서 한 질문의 답을 저장하는 도구의 입력. 답의 글은 서버가 사용자 메시지 원문으로 만든다 — 모델이 쓰지 않는다. */
export const AgentInterviewAnswerInputSchema = z.strictObject({
  jobPostingId: UuidSchema.describe("인터뷰 중인 제작의 공고 id(brews의 jobPostingId)"),
  basis: z.number().int().min(0).max(99).describe("brews.interview.bases에서 이 질문이 고른 근거의 index"),
  question: z.string().trim().min(5).max(200).describe("이 근거로 처음 한 질문. 대화에서 한 그대로 옮긴다"),
  messageIds: z.array(UuidSchema).min(1).max(10).describe("이 질문과 꼬리 질문에 답한 사용자 메시지의 id"),
});
export type AgentInterviewAnswerInput = z.infer<typeof AgentInterviewAnswerInputSchema>;
/**
 * 대화에 뜨는 「디자인」 카드. 디자인 대화(`design_chats`)의 답 하나를 가리킨다 — 말과 견본 · 첫 화면은 카드가 디자인 대화에서
 * 그때그때 읽는다. `designMessageId`가 null이면 디자인을 여는 카드다. 구성이 생길 때까지 기다리고, 디자인 대화의 첫 답을 그린다.
 */
export const AgentBrewDesignSchema = z.strictObject({ brewId: UuidSchema, jobPostingId: UuidSchema, designMessageId: UuidSchema.nullable() });
export type AgentBrewDesign = z.infer<typeof AgentBrewDesignSchema>;
/**
 * 대화에 뜨는 「생성」 카드. 디자인 대화에서 고른 첫 화면으로 시작한 생성 하나를 가리킨다 — 진행과 만들어지는 지면은 카드와 무대가
 * 그때그때 읽는다(생성 상태 · 생성 스트림).
 */
export const AgentBrewGenerationSchema = z.strictObject({ brewId: UuidSchema, jobPostingId: UuidSchema, generationId: UuidSchema });
export type AgentBrewGeneration = z.infer<typeof AgentBrewGenerationSchema>;
/** 견본에서 고른 스타일과 레이아웃으로 첫 화면을 그린다. 대화에 그 첫 화면의 카드가 붙는다. */
/** 견본의 짝과 그래픽의 차원(2D · 3D)으로 첫 화면을 그린다. 차원은 사용자가 고른다. */
export const AgentDesignDrawSchema = z.strictObject({ styleId: UuidSchema, layoutId: UuidSchema, graphic: DesignGraphicSchema.optional() });
export type AgentDesignDraw = z.infer<typeof AgentDesignDrawSchema>;
/** 말로 견본을 다시 받는 도구의 입력. 견본은 디자인 대화가 견본 규칙대로 만든다 — 에이전트는 무엇을 원하는지만 옮긴다. */
export const AgentDesignProposeInputSchema = z.strictObject({
  jobPostingId: UuidSchema.describe("디자인 중인 제작의 공고 id(brews의 jobPostingId)"),
  request: z.string().trim().min(1).max(2_000).describe("사용자가 원하는 스타일이나 구성. 사용자의 말에 가깝게"),
  focus: z.enum(["both", "styles", "layouts"]).describe("새로 낼 견본. 색 · 서체 · 분위기 이야기면 styles, 구성 이야기면 layouts, 둘 다면 both"),
});
export type AgentDesignProposeInput = z.infer<typeof AgentDesignProposeInputSchema>;
/** 그린 첫 화면을 말로 고치는 도구의 입력. 바뀌는 자리만 고친다(디자인 대화의 고치는 호출). */
export const AgentDesignReviseInputSchema = z.strictObject({
  jobPostingId: UuidSchema.describe("디자인 중인 제작의 공고 id(brews의 jobPostingId)"),
  instruction: z.string().trim().min(1).max(2_000).describe("무엇을 어떻게 바꿀지 한 문장"),
  screen: z.string().max(200).describe("고칠 첫 화면의 이름(brews.design.screens에 적힌 그대로). 가장 최근 것을 고치면 빈 글"),
});
export type AgentDesignReviseInput = z.infer<typeof AgentDesignReviseInputSchema>;

/**
 * 작업물 재료. 에이전트가 AI 대화 단계에서 사용자에게 만든 사이트 링크 · 화면 스크린샷 · 깃허브 레포를 청하고, 받은 것을 고른 커리어 기록 본문의
 * 「작업물」에 붙인다(2026-11-21 사용자: "작업물 재료는 에이전트가 사용자에게 채팅에서 적극적으로 요청하도록 하자", 붙일 곳은 커리어 기록).
 * 생성은 고른 기록 본문의 `/v1/media/…` 그림을 지면 그림으로 쓴다.
 */
/** 사용자 메시지에 붙인 그림. 그림은 먼저 미디어로 올리고 그 id를 싣는다. */
export const AgentAttachmentSchema = z.strictObject({ mediaId: UuidSchema, name: z.string().trim().max(200).optional() });
export type AgentAttachment = z.infer<typeof AgentAttachmentSchema>;
export const AGENT_ATTACHMENT_LIMIT = 6;
const WorkUrlSchema = z.string().trim().url().max(2_000).refine((value) => /^https?:\/\//i.test(value), "http(s) 주소만 받습니다");
/** 공개 깃허브 레포를 읽는 도구의 입력. */
export const AgentRepoReadInputSchema = z.strictObject({ url: WorkUrlSchema.describe("깃허브 레포 주소(https://github.com/owner/repo)") });
export type AgentRepoReadInput = z.infer<typeof AgentRepoReadInputSchema>;
/** 받은 작업물을 기록에 붙이는 도구의 입력. */
export const AgentWorkAttachInputSchema = z.strictObject({
  recordId: UuidSchema.describe("붙일 커리어 기록의 id. 제작에서 고른 기록(brews[].materials) 중에서 고른다"),
  items: z.array(z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("image"), mediaId: UuidSchema.describe("사용자 메시지 attachments의 mediaId"), caption: z.string().trim().min(1).max(200).describe("무엇의 화면인지 한 줄") }),
    z.strictObject({ kind: z.literal("site"), url: WorkUrlSchema.describe("사용자가 준 사이트 주소. 서버가 첫 화면을 찍는다"), caption: z.string().trim().min(1).max(200).describe("무엇의 사이트인지 한 줄") }),
    z.strictObject({ kind: z.literal("repo"), url: WorkUrlSchema.describe("깃허브 레포 주소"), summary: z.string().trim().min(1).max(1_000).describe("read_repository로 읽은 내용으로 쓴 요약. 무엇을 만든 레포인지와 쓴 기술") }),
  ])).min(1).max(AGENT_ATTACHMENT_LIMIT),
});
export type AgentWorkAttachInput = z.infer<typeof AgentWorkAttachInputSchema>;
/** 대화에 뜨는 「작업물」 카드. 무엇을 어느 기록에 붙였는지. `src`는 지면 그림 경로(`/v1/media/…`)다. */
export const AgentWorkMaterialsSchema = z.strictObject({
  recordId: UuidSchema,
  recordTitle: z.string().max(300),
  items: z.array(z.strictObject({ kind: z.enum(["image", "site", "repo"]), src: z.string().max(300).nullable(), url: z.string().max(2_000).nullable(), caption: z.string().max(1_000) })).max(AGENT_ATTACHMENT_LIMIT),
});
export type AgentWorkMaterials = z.infer<typeof AgentWorkMaterialsSchema>;

export const AgentToolResultSchema = z.strictObject({ id: z.string().max(200), name: z.string().max(100), status: z.enum(["running", "complete", "failed"]), summary: z.string().max(8_000), proposal: AiEditProposalDetailSchema.optional(), beforeDocument: CareerDocumentBootstrapSchema.shape.document.optional(), undone: z.boolean().optional(), review: RequirementReviewSchema.optional(), recordDraft: AgentRecordDraftSchema.optional(), goalDraft: AgentGoalDraftSchema.optional(), gapReview: GapReviewSchema.optional(), planDraft: AgentPlanDraftSchema.optional(), replanDraft: AgentReplanDraftSchema.optional(), pageEdit: AgentPageEditSchema.optional(), brewStart: AgentBrewStartSchema.optional(), brewMaterials: AgentBrewMaterialsSchema.optional(), brewInterview: AgentBrewInterviewSchema.optional(), brewDesign: AgentBrewDesignSchema.optional(), brewGeneration: AgentBrewGenerationSchema.optional(), workMaterials: AgentWorkMaterialsSchema.optional() });
export const AgentMessageSchema = z.strictObject({ id: UuidSchema, role: z.enum(["user", "assistant"]), text: z.string().max(64_000), tools: z.array(AgentToolResultSchema).max(30), selection: AgentPageSelectionSchema.optional(), attachments: z.array(AgentAttachmentSchema).max(AGENT_ATTACHMENT_LIMIT).optional(), createdAt: TimestampSchema });
export const AgentRunSchema = z.strictObject({ id: UuidSchema, requestId: UuidSchema, status: z.enum(["running", "complete", "cancelled", "failed", "interrupted"]), error: z.string().max(1_000).nullable(), startedAt: TimestampSchema });
export const AgentConversationSchema = z.strictObject({ id: UuidSchema, title: z.string().max(120), contexts: z.array(AgentContextSchema).max(10), messages: z.array(AgentMessageSchema).max(100), run: AgentRunSchema.nullable(), version: z.number().int().nonnegative(), updatedAt: TimestampSchema });
export const AgentConversationResponseSchema = z.strictObject({ data: AgentConversationSchema });
export const AgentConversationListSchema = z.strictObject({ data: z.array(AgentConversationSchema.omit({ messages: true })).max(100) });
export const CreateAgentConversationSchema = z.strictObject({ contexts: z.array(AgentContextSchema).max(10).default([]) });
export const AgentApiKeySchema = z.string().trim().min(20).max(300).regex(/^sk-ant-[A-Za-z0-9_-]+$/);
export const SendAgentMessageSchema = z.strictObject({ requestId: UuidSchema, text: z.string().trim().min(1).max(8_000), selection: AgentPageSelectionSchema.optional(), attachments: z.array(AgentAttachmentSchema).max(AGENT_ATTACHMENT_LIMIT).optional() });
export const AddAgentContextSchema = z.strictObject({ context: AgentContextSchema });
export const AgentApprovalSchema = z.strictObject({ proposalId: UuidSchema, action: z.enum(["apply", "reject", "undo"]), expectedDocumentVersion: z.number().int().nonnegative(), commandIndexes: z.array(z.number().int().nonnegative()).max(100).optional(), propertyChangeIndexes: z.array(z.number().int().nonnegative()).max(50).optional() });
export type AgentContext = z.infer<typeof AgentContextSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type AgentToolResult = z.infer<typeof AgentToolResultSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type AgentConversation = z.infer<typeof AgentConversationSchema>;
export type SendAgentMessage = z.infer<typeof SendAgentMessageSchema>;
export type AgentApproval = z.infer<typeof AgentApprovalSchema>;

export const AgentEditDraftSchema = AiEditProposalSchema.pick({ summary: true, commands: true, propertyChanges: true });
export type AgentEditDraft = z.infer<typeof AgentEditDraftSchema>;

/**
 * 제작을 연 결과. 다음 단계가 이 대화 안에 있으면(재료 고르기 · AI 대화) `conversation`에 그 카드가 있는 대화가 오고 `path`는 null이다.
 * 아직 대화로 옮기지 않은 단계면 `path`가 지금의 화면이고 `conversation`은 null이다.
 */
export const AgentBrewOpenResponseSchema = z.strictObject({ data: z.strictObject({ brewId: UuidSchema, path: z.string().min(1).max(300).nullable(), conversation: AgentConversationSchema.nullable() }) });
/**
 * 에이전트 채팅을 쓸 수 있는가. 모든 계정이 서버 인증으로 쓰고, 개인 키를 등록한 계정은 그 키로 쓴다.
 * `creditsExhausted`는 서버 인증으로 도는 계정이 이번 달 크레딧을 다 썼다는 뜻이다. 개인 키를 등록한 계정은 늘 거짓이다.
 */
export const AgentChatAccessSchema = z.strictObject({ data: z.strictObject({ enabled: z.boolean(), consentRequired: z.boolean(), apiKeyConfigured: z.boolean(), creditsExhausted: z.boolean(), model: z.literal("sonnet") }) });

export const SaveAgentApiKeySchema = z.strictObject({ apiKey: AgentApiKeySchema });
export const AgentCredentialStatusSchema = z.strictObject({ data: z.strictObject({ configured: z.boolean() }) });

export const SetAgentContextsSchema = z.strictObject({ contexts: z.array(AgentContextSchema).max(10).refine(items => new Set(items.map(item => `${item.kind}:${item.id}`)).size === items.length, "중복 자료를 선택할 수 없습니다."), expectedVersion: z.number().int().nonnegative() });
export const AgentResourceDetailSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("job"), data: JobPostingDetailSchema }),
  z.strictObject({ kind: z.literal("record"), data: CareerRecordSchema, document: CareerDocumentBootstrapSchema }),
  z.strictObject({ kind: z.literal("portfolio"), data: PortfolioDetailSchema, page: GeneratedPageSchema.nullable() }),
]);
export type AgentResourceDetail = z.infer<typeof AgentResourceDetailSchema>;
