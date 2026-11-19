import type { PortfolioReadApi } from "../portfolios/index.js";
import { PageElementIssues, PageServiceError, type PageApi } from "../page/index.js";
import { elementTitle } from "@expresso/portfolio-renderer";
import { AgentCredentials } from "./credentials.js";
import { randomUUID } from "node:crypto";
import { AgentConversationSchema, type AgentJobSearchInput, type AgentActivitySearchInput, type AgentFindList, type AgentRecordAppendInput, type AgentDiagnosisInput, type ConsultantDiagnosis, type ConsultantCommitment, type AgentSavedRecord, isStructuredGroup, type AgentPageElementEditInput, type AgentPageEdit, type StructuredPortfolioSnapshot, type CareerDocumentBootstrap, type AgentConversation, type AgentContext, type AgentMessage, type SendAgentMessage, type AgentApproval, type AgentRecordDraftDecision, type AgentRecordDraftInput, type AgentGoalDraftDecision, type AgentGoalDraftInput, type AgentPlanDecision, type AgentReplanDecision, type ReplanProposalInput, type UpdateTaskProgress, type GapReview, type GapReviewDraft, type PlanProposalInput, type RequirementReview, type RequirementReviewDraft } from "@expresso/contracts";
import { mongoCollections, type AgentConversationDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { AgentToolRejection, type AgentMemory, type AgentRecordText, type AgentRuntime } from "../../platform/agent/runtime.js";
import { markdownToCareerDocument } from "@expresso/editor";
import { buildReview, hash, normalize, recordText, reviewIssues } from "./requirement-review.js";
import { buildDraft, draftIssues, sourceIssues } from "./record-draft.js";
import { buildChoice, buildForm, checkReply, choiceIssues, formIssues } from "./ui-parts.js";
import { digestConversation } from "./digest.js";
import { ConsultantInputError, ConsultantLimitError, ConsultantNotFoundError, seoulDay, type ConsultantApi, type ConsultantCommitmentApi, type ConsultantDiagnosisApi, type ConsultantProfile } from "../consultant/index.js";
import { buildGoalDraft, carryOver, goalDraftIssues, mergeGoal } from "./goal-draft.js";
import { buildGapReview, gapIssues, latestReview, latestTool } from "./gap-review.js";
import { buildPreparationTasks, PlanCapacityError, scheduleRemaining } from "./preparation-planner.js";
import { PreparationPlans } from "./plans.js";
import type { CareerDocumentApi } from "../career-editor/index.js";
import { readableCareerProperties, type CareerApi } from "../career/index.js";
import type { GoalDemandApi, JobBoardApi } from "../jobs/index.js";
import { goalFamily } from "../jobs/demand.js";
import type { ActivityApi } from "../activities/index.js";
import { activityItem, activityMatches, jobItem } from "./finds.js";
import type { ConsentApi } from "../consent/index.js";

/**
 * 실행 중인 대화의 heartbeat 주기. 실행 인스턴스는 이 주기로 문서를 갱신하고, 갱신이 맞지
 * 않으면(다른 인스턴스가 취소해 `running`이 아니면) 실행을 중단한다. 그래서 다른 인스턴스에서
 * 낸 취소가 실행에 닿는 최대 지연이기도 하다. 같은 인스턴스의 취소는 즉시 전달된다.
 */
export const RUN_HEARTBEAT_MS = 1_000;
/** 서버가 실행 도중 멈췄을 때(재시작 · heartbeat 끊김) 대화에 남기는 문구. 다시 보내면 되는 상황이다. */
export const RUN_INTERRUPTED_ERROR = "서버 실행이 중단되었습니다. 다시 보내 주세요.";
const RUN_FAILED_ERROR = "응답을 완료하지 못했습니다. 설정을 확인하고 다시 보내 주세요.";
/** 종료 · 취소가 아닌 이유로 실행이 실패했을 때 원인을 받는 쪽. API는 로그에 남긴다. */
export type AgentRunFailureListener = (error: unknown, run: { conversationId: string; runId: string }) => void;

/** `publicMessage`를 주면 응답에 그 문장이 그대로 나간다. 주지 않으면 상태 코드의 일반 문장이 나간다(`api/error-handler.ts`). */
export class AgentChatError extends Error { constructor(readonly statusCode: number, message: string, readonly publicMessage?: string) { super(message); } }
const STAGE_LABELS = { exploring: "탐색", preparing: "준비", applying: "지원" } as const;
/** 모델에 넘기는 기억의 모양. 조건은 id · 종류 · 글만, 요지는 날짜(서울이 아닌 저장된 시각의 날짜 부분)와 내용만 싣는다. */
/** 확인 카드의 세 답. 첫째가 「했어요」다. 홈의 카드와 서버가 여는 대화가 같은 글을 쓴다. */
const CHECKIN_OPTIONS = ["했어요", "아직이에요", "안 하기로 했어요"] as const;
/** 모델에 넘기는 진단의 요약. 항목의 이름만 상태별로 싣는다 — 건수와 근거는 진단을 다시 읽을 때 본다. */
function diagnosisForModel(diagnosis: ConsultantDiagnosis | null): AgentMemory["diagnosis"] {
  if (!diagnosis) return null;
  const labels = (status: string) => diagnosis.items.filter(item => item.status === status).map(item => item.label);
  return { assessedOn: diagnosis.assessedAt ? seoulDay(new Date(diagnosis.assessedAt)) : null, work: diagnosis.work, sampleSize: diagnosis.sampleSize, gaps: labels("gap"), unconfirmed: labels("unconfirmed"), partial: labels("partial"), confirmed: labels("confirmed").length, stale: diagnosis.stale };
}
function memoryForModel(profile: ConsultantProfile, digests: readonly ({ title: string; said: string[]; outcomes: string[]; lastAnswer: string } & ({ updatedAt: string } | { date: string }))[], commitments: readonly Pick<ConsultantCommitment, "id" | "title" | "dueOn">[], diagnosis: AgentMemory["diagnosis"] = null, at = new Date()): AgentMemory {
  const today = seoulDay(at);
  return {
    stage: profile.stage,
    preferences: profile.preferences.map(({ id, kind, text }) => ({ id, kind, text })),
    today,
    commitments: commitments.map(({ id, title, dueOn }) => ({ id, title, dueOn, overdue: dueOn < today })),
    diagnosis,
    recentConversations: digests.map(digest => ({ title: digest.title, date: "date" in digest ? digest.date : digest.updatedAt.slice(0, 10), said: digest.said, outcomes: digest.outcomes, lastAnswer: digest.lastAnswer })),
  };
}
/** 이번 달 크레딧을 읽는 자리. 요금제의 기능 표와 무관하게 남은 크레딧만 본다(`EntitlementService.credits`). */
export interface AgentCredits { credits(userId: string, at?: Date): Promise<{ remaining: number | null }> }
/** 화면에 그대로 보이는 문장이다. 디자인 대화의 한도 안내와 같은 말로 시작한다. */
export const CREDITS_EXHAUSTED = "이번 달 AI 크레딧을 모두 썼습니다. 다음 달에 다시 대화할 수 있습니다.";
const view = (row: AgentConversationDoc) => { const { _id, userId: _userId, heartbeatAt: _heartbeat, ...data } = row; return AgentConversationSchema.parse({ ...data, id: _id }); };
export class AgentChatService {
  private readonly running = new Map<string, AbortController>();
  private readonly tasks = new Set<Promise<void>>();
  /** `close()`가 시작되면 켠다. 그 뒤에 끝난 실행은 어떤 오류로 끝났든 서버 종료로 끊긴 것이다. */
  private closing = false;
  private runFailureListener: AgentRunFailureListener | null = null;
  constructor(private readonly db: MongoContext, private readonly runtime: AgentRuntime | null, private readonly career: Pick<CareerApi, "getRecord" | "listRecords" | "listCategories" | "createRecord" | "trashRecord" | "getJobGoal" | "saveJobGoal">, private readonly jobs: Pick<JobBoardApi, "get">, private readonly documents: CareerDocumentApi, private readonly consent: ConsentApi, readonly credentials: AgentCredentials = new AgentCredentials(db), private readonly portfolios?: Pick<PortfolioReadApi, "get">, private readonly pages?: Pick<PageApi, "latest" | "elementGuide" | "editElementByAgent" | "restoreRevision">, private readonly credits?: AgentCredits, private readonly consultant?: ConsultantApi, private readonly commitments?: Pick<ConsultantCommitmentApi, "open" | "create" | "update">, private readonly diagnosis?: { demand: GoalDemandApi; store: ConsultantDiagnosisApi },
    /** 대화에서 공고와 활동을 찾을 때 쓰는 것. `dismissed`는 사용자가 능동 제안에서 「관심 없음」으로 넘긴 대상의 키(`job:<id>` · `activity:<id>`)다. */
    private readonly finds?: { jobs: Pick<JobBoardApi, "list">; activities: Pick<ActivityApi, "list">; dismissed(userId: string): Promise<ReadonlySet<string>> }) {}
  private get plans() { return new PreparationPlans(this.db); }
  /** 서비스가 Fastify 앱보다 먼저 만들어지므로 로그 수신자는 라우트 등록 때 붙인다. */
  setRunFailureListener(listener: AgentRunFailureListener) { this.runFailureListener = listener; }
  async consentRequired(userId: string) {
    const result = await this.consent.list(userId);
    return !result.data.consents.some(item => item.scope === "career_records" && item.granted);
  }
  get enabled() { return !!this.runtime; }
  /**
   * 이번 달 크레딧을 다 썼는가. 서버 인증으로 도는 실행은 서버가 비용을 내므로 시작 전에 본다.
   * 한도가 없는 요금제(`remaining`이 null)는 막지 않는다. 크레딧을 읽는 자리를 받지 않은 서비스(테스트 · 미리보기)도 막지 않는다.
   */
  async creditsExhausted(userId: string) { return (await this.credits?.credits(userId))?.remaining === 0; }
  private get rows() { return mongoCollections(this.db.db).agentConversations; }
  private async owned(userId: string, id: string) {
    await this.rows.updateOne({ _id: id, userId, "run.status": "running", heartbeatAt: { $lt: new Date(Date.now() - 60_000) } }, { $set: { "run.status": "interrupted", "run.error": RUN_INTERRUPTED_ERROR, updatedAt: new Date().toISOString() }, $inc: { version: 1 } });
    const row = await this.rows.findOne({ _id: id, userId });
    if (!row) throw new AgentChatError(404, "대화를 찾을 수 없습니다.");
    return row;
  }
  async get(userId: string, id: string) { return view(await this.owned(userId, id)); }
  /**
   * 최근 대화의 요지. 말이 오간 대화만 세고, `excludeId`(지금 대화)는 뺀다.
   * 요지는 저장하지 않고 읽을 때 만든다 — 대화 하나는 메시지 100개와 160,000자 한도가 있어 읽는 양이 정해져 있다.
   */
  async recentDigests(userId: string, excludeId?: string, limit = 5) {
    const rows = await this.rows.find({ userId, ...(excludeId ? { _id: { $ne: excludeId } } : {}), "messages.0": { $exists: true } }).sort({ updatedAt: -1 }).limit(limit).toArray();
    return rows.map(row => digestConversation(view(row)));
  }
  /** 약속 도구의 실행. 약속을 쓸 수 없는 환경과 받을 수 없는 입력은 에이전트가 고칠 수 있게 사유로 돌려준다. */
  private async commitment(work: () => Promise<ConsultantCommitment>) {
    if (!this.commitments) throw new AgentToolRejection(["이 환경에서는 약속을 쓸 수 없습니다. 사용자에게 그렇게 전하십시오."]);
    try { return await work(); }
    catch (error) { if (error instanceof ConsultantInputError || error instanceof ConsultantNotFoundError) throw new AgentToolRejection([error.message]); throw error; }
  }
  /** 실행에 넘기는 기억. 컨설턴트 프로필이 연결되지 않은 서비스(테스트 · 미리보기)는 기억을 쓰지 않는다. */
  private async memory(userId: string, conversationId: string): Promise<AgentMemory | null> {
    if (!this.consultant) return null;
    return memoryForModel(await this.consultant.profile(userId), await this.recentDigests(userId, conversationId), await this.commitments?.open(userId) ?? [], diagnosisForModel(await this.currentDiagnosis(userId)));
  }
  /**
   * 저장된 진단과, 다시 진단이 필요한지. 목표가 바뀌었거나 대조한 뒤에 기록이 바뀌었으면 그 까닭을 함께 낸다.
   * 「내 진행」 화면과 실행에 넘기는 기억이 같은 판단을 쓴다.
   */
  async currentDiagnosis(userId: string): Promise<ConsultantDiagnosis | null> {
    if (!this.diagnosis) return null;
    const [goal, latest] = await Promise.all([this.career.getJobGoal(userId), this.career.listRecords(userId, { sort: "updated_desc", limit: 1 })]);
    const changed = latest.data[0]?.updatedAt;
    return this.diagnosis.store.current(userId, { work: goal?.work ?? null, recordsChangedAt: changed ? new Date(changed) : null });
  }
  /**
   * 열린 공고를 찾아 목록의 줄로 옮긴다. 지금 있는 공고 목록 조회의 필터를 그대로 쓴다.
   * 직군은 사용자가 쓰는 말(「백엔드 개발자」)로 와도 공고에 매긴 직군으로 옮기고, 옮기지 못하면 글 검색에 더한다.
   * 사용자가 「관심 없음」으로 넘긴 공고는 뺀다 — 뺀 만큼 더 읽어 건수를 채운다.
   */
  private async searchJobs(userId: string, input: AgentJobSearchInput): Promise<AgentFindList> {
    if (!this.finds) throw new AgentToolRejection(["이 환경에서는 공고를 찾을 수 없습니다. 사용자에게 그렇게 전하십시오."]);
    const dismissed = await this.finds.dismissed(userId);
    const family = input.family ? goalFamily(input.family) : null;
    const q = [input.query, input.family && !family ? input.family : null].filter(Boolean).join(" ").trim();
    const result = await this.finds.jobs.list(userId, {
      ...(q ? { q } : {}), ...(input.technology ? { technology: input.technology } : {}), ...(family ? { family } : {}), ...(input.location ? { location: input.location } : {}),
      ...(input.experience !== undefined ? { experience: input.experience } : {}), ...(input.interested ? { interested: true } : { deadline: "open" as const }),
      sort: input.interested ? "deadline" : "recent", page: 1, limit: Math.min(50, input.limit + dismissed.size),
    });
    const kept = result.data.filter(job => !dismissed.has(`job:${job.id}`));
    const title = [family ?? input.family, input.technology, input.location, input.experience !== undefined ? (input.experience === 0 ? "신입" : `경력 ${input.experience}년`) : null, input.query ? `「${input.query}」` : null, input.interested ? "관심 공고" : null].filter(Boolean).join(" · ");
    return { title: `${title || "열린"} 공고`.slice(0, 120), items: kept.slice(0, input.limit).map(jobItem), total: Math.max(kept.length, result.summary.total - (result.data.length - kept.length)) };
  }
  /** 접수 중인 공모전 · 해커톤을 마감이 이른 순서로 찾는다. 글은 제목 · 주최 · 분야에서 찾는다. */
  private async searchActivities(userId: string, input: AgentActivitySearchInput): Promise<AgentFindList> {
    if (!this.finds) throw new AgentToolRejection(["이 환경에서는 활동을 찾을 수 없습니다. 사용자에게 그렇게 전하십시오."]);
    const dismissed = await this.finds.dismissed(userId);
    const kept = (await this.finds.activities.list({ ...(input.kind ? { kind: input.kind } : {}), limit: 100 })).filter(activity => !dismissed.has(`activity:${activity.id}`) && activityMatches(activity, input.query));
    const title = [input.kind === "contest" ? "공모전" : input.kind === "hackathon" ? "해커톤" : "공모전 · 해커톤", input.query ? `「${input.query}」` : null].filter(Boolean).join(" · ");
    return { title: `접수 중인 ${title}`.slice(0, 120), items: kept.slice(0, input.limit).map(activityItem), total: kept.length };
  }
  /** 지금 목표로 요건을 집계해 저장한다. 목표가 없으면 에이전트가 먼저 목표를 묻도록 돌려보낸다. */
  private async goalDemand(userId: string) {
    if (!this.diagnosis) throw new AgentToolRejection(["이 환경에서는 진단을 쓸 수 없습니다. 사용자에게 그렇게 전하십시오."]);
    const goal = await this.career.getJobGoal(userId);
    if (!goal?.work.trim()) throw new AgentToolRejection(["구직 목표의 하고 싶은 일이 비어 있습니다. 사용자에게 어떤 일을 목표로 하는지 묻고 propose_job_goal_update로 저장한 뒤 다시 부르십시오."]);
    return this.diagnosis.store.saveDemand(userId, await this.diagnosis.demand.forGoal(userId, { work: goal.work, timing: goal.timing }));
  }
  /**
   * 대조 결과의 확인과 저장. 요건 대조와 같은 기준이다 — 인용이 기록의 글에 그대로 있는지만 본다.
   * 「부족」은 사용자가 해 본 적이 없다고 답한 뒤에만 받는다: 그 항목이 미확인으로 저장된 뒤에 사용자의 말이 있어야 한다.
   */
  private async recordDiagnosis(userId: string, messages: readonly AgentMessage[], input: AgentDiagnosisInput) {
    if (!this.diagnosis) throw new AgentToolRejection(["이 환경에서는 진단을 쓸 수 없습니다. 사용자에게 그렇게 전하십시오."]);
    const stored = await this.currentDiagnosis(userId);
    if (!stored) throw new AgentToolRejection(["아직 집계가 없습니다. read_goal_demand를 먼저 부르십시오."]);
    if (stored.stale === "goal") throw new AgentToolRejection(["집계한 뒤에 구직 목표가 바뀌었습니다. read_goal_demand를 다시 부른 뒤 대조하십시오."]);
    const before = new Map(stored.items.map(item => [item.id, item]));
    const records = await this.recordTexts(userId, input.items.flatMap(item => item.evidence.map(evidence => evidence.recordId)));
    const lastSaid = messages.filter(message => message.role === "user").at(-1)?.createdAt;
    const answered = !!stored.assessedAt && !!lastSaid && lastSaid > stored.assessedAt;
    const issues: string[] = [];
    const seen = new Set<string>();
    for (const item of input.items) {
      const known = before.get(item.itemId);
      const label = `항목 ${item.itemId}${known ? `(${known.label})` : ""}`;
      if (seen.has(item.itemId)) issues.push(`${label}: 같은 항목이 두 번 있습니다.`);
      seen.add(item.itemId);
      if (!known) { issues.push(`${label}: 집계에 없는 항목입니다. read_goal_demand가 돌려준 id만 쓰십시오.`); continue; }
      const grounded = item.status === "confirmed" || item.status === "partial";
      if (grounded && item.evidence.length === 0) issues.push(`${label}: ${item.status}는 기록의 근거가 있어야 합니다. 근거가 없으면 unconfirmed로 두십시오.`);
      if (!grounded && item.evidence.length > 0) issues.push(`${label}: ${item.status}에는 근거를 넣지 않습니다. 근거가 있으면 confirmed나 partial입니다.`);
      if (item.status === "gap" && known.status !== "gap" && !(known.status === "unconfirmed" && answered)) issues.push(`${label}: gap은 사용자가 해 본 적이 없다고 답한 뒤에만 씁니다. 지금은 unconfirmed로 저장하고 사용자에게 해 본 적이 있는지 물으십시오.`);
      for (const evidence of item.evidence) {
        const record = records.get(evidence.recordId);
        if (!record) { issues.push(`${label}: 근거 기록 ${evidence.recordId}를 찾을 수 없습니다. read_career_records로 읽은 기록만 인용할 수 있습니다.`); continue; }
        if (!normalize(record.text).includes(normalize(evidence.quote))) issues.push(`${label}: "${record.title}"에 인용 "${evidence.quote}"이 없습니다. 기록 본문을 그대로 옮겨 주세요.`);
      }
    }
    if (issues.length) throw new AgentToolRejection(issues);
    try {
      await this.diagnosis.store.assess(userId, input.summary, input.items.map(item => ({ itemId: item.itemId, status: item.status, note: item.note, evidence: item.evidence.map(evidence => ({ ...evidence, recordTitle: records.get(evidence.recordId)!.title.slice(0, 200) })) })));
    } catch (error) { if (error instanceof ConsultantInputError) throw new AgentToolRejection([error.message]); throw error; }
    // 저장한 뒤의 진단을 다시 읽어, 다시 진단이 필요한지까지 지금 기준으로 싣는다.
    return (await this.currentDiagnosis(userId))!;
  }
  /**
   * 확인 카드에서 「했어요」라고 답한 약속의 대화를 연다.
   *
   * 컨설턴트의 질문(답한 선택지가 딸린 메시지)과 사용자의 답을 대화에 넣고 실행을 시작한다. 질문은 정해진 문구라 모델을 부르지 않는다 —
   * 실행 한 번이 인터뷰의 첫 질문이다. 채팅을 쓸 수 없는 상태(꺼짐 · 동의 없음 · 크레딧 소진)면 대화를 만들지 않고 null을 돌려준다.
   */
  async startFromCheckin(userId: string, commitment: Pick<ConsultantCommitment, "id" | "title" | "dueOn">): Promise<string | null> {
    if (!this.runtime) return null;
    const apiKey = await this.credentials.read(userId).catch(() => undefined);
    const now = new Date().toISOString();
    const partId = randomUUID(); const answerId = randomUUID();
    const prompt = `「${commitment.title}」 어떻게 됐나요?`;
    const question: AgentMessage = { id: randomUUID(), role: "assistant", text: `${Number(commitment.dueOn.slice(5, 7))}월 ${Number(commitment.dueOn.slice(8, 10))}일에 하기로 한 일을 여쭙니다.`, createdAt: now, tools: [{ id: randomUUID(), name: "선택지 질문", status: "complete", summary: prompt,
      ui: { kind: "choice", partId, prompt, multiple: false, options: CHECKIN_OPTIONS.map((label, index) => ({ id: `o${index + 1}`, label })), answer: { optionIds: ["o1"], messageId: answerId } } }] };
    const answer: AgentMessage = { id: answerId, role: "user", text: CHECKIN_OPTIONS[0], tools: [], reply: { partId, optionIds: ["o1"] }, createdAt: now };
    const assistant: AgentMessage = { id: randomUUID(), role: "assistant", text: "", tools: [], createdAt: now };
    const row: AgentConversationDoc = { _id: randomUUID(), userId, title: commitment.title.slice(0, 100), contexts: [], messages: [question, answer, assistant], run: { id: randomUUID(), requestId: answerId, status: "running", error: null, startedAt: now }, version: 1, updatedAt: now, heartbeatAt: new Date() };
    let context: Awaited<ReturnType<AgentChatService["context"]>>;
    try { context = await this.prepare(userId, { ...row, run: null }, !apiKey); }
    catch (error) { if (error instanceof AgentChatError || (error as { statusCode?: number }).statusCode) return null; throw error; }
    await this.rows.insertOne(row);
    this.start(row, context, apiKey);
    return row._id;
  }
  async list(userId: string) {
    const rows = await this.rows.find({ userId }).project<Omit<AgentConversationDoc, "messages">>({ messages: 0 }).sort({ updatedAt: -1 }).limit(100).toArray();
    return rows.map(row => { const { messages: _messages, ...summary } = view({ ...row, messages: [] }); return summary; });
  }
  private async context(userId: string, contexts: AgentContext[]) {
    return Promise.all(contexts.map(async ref => {
      if (ref.kind === "job") return { ...ref, data: await this.jobs.get(userId, ref.id) };
      if (ref.kind === "portfolio") {
        if (!this.portfolios) throw new AgentChatError(503, "포트폴리오 연결이 설정되지 않았습니다.");
        const portfolio = await this.portfolios.get(userId, ref.id);
        const page = await this.pages?.latest(userId, ref.id);
        // 구조화 지면은 HTML 대신 목차를 싣는다 — 에이전트는 요소를 key로 읽고 고친다. 자유 HTML 지면은 HTML 그대로다.
        const structured = page?.generationManifest?.structured;
        return { ...ref, data: { portfolio, generatedPage: page ? structured ? { revision: page.revision, outline: pageOutline(structured) } : { html: page.html } : null } };
      }
      const record = await this.career.getRecord(userId, ref.id);
      const snapshot = await this.documents.bootstrap(userId, ref.id);
      // 에이전트는 옵션 ID가 아니라 이름을 읽는다.
      const definitions = (await this.definitions(userId)).get(record.categoryId) ?? [];
      return { ...ref, data: { record: { ...record, properties: readableCareerProperties(record.properties, definitions) }, document: snapshot.document, documentVersion: snapshot.documentVersion } };
    }));
  }
  /** 에이전트가 읽는 기록의 글. 남의 기록 · 삭제된 기록은 getRecord가 막는다. */
  private async recordTexts(userId: string, ids: readonly string[]) {
    const rows = new Map<string, { title: string; text: string }>();
    const definitions = await this.definitions(userId);
    for (const id of new Set(ids)) {
      try {
        const record = await this.career.getRecord(userId, id);
        rows.set(id, { title: record.title, text: recordText(record, (await this.documents.bootstrap(userId, id)).document, definitions.get(record.categoryId) ?? []) });
      } catch { /* 읽을 수 없는 기록은 없는 기록과 같다. */ }
    }
    return rows;
  }
  private async readRecords(userId: string, ids: string[]): Promise<AgentRecordText[]> {
    const rows = await this.recordTexts(userId, ids);
    // 한 번에 읽는 양을 기록당 4,000자로 묶어 둔다 — 인용은 앞부분에서 나와도 전체 글 안에 있다.
    return [...rows].map(([id, row]) => ({ id, title: row.title, text: row.text.slice(0, 4_000), truncated: row.text.length > 4_000 }));
  }
  private async definitions(userId: string) {
    return new Map((await this.career.listCategories(userId)).map(category => [category.id, category.propertySchemaV2]));
  }
  private async categories(userId: string) {
    return (await this.career.listCategories(userId)).map(category => ({ id: category.id, name: category.name }));
  }
  private async listRecords(userId: string) {
    const [categories, result] = await Promise.all([this.categories(userId), this.career.listRecords(userId, { sort: "updated_desc", limit: 100 })]);
    return { categories, records: result.data.map(record => ({ id: record.id, title: record.title, category: record.categoryKey, status: record.status, updatedAt: record.updatedAt })) };
  }
  /** 새 기록 초안. 출처는 실행을 시작할 때의 대화(방금 보낸 질문 포함)에서 확인한다. */
  /**
   * 대화에서 사용자가 한 말로 정리한 기록을 바로 저장한다. 승인이 없으므로 출처 검사가 유일한 문이다 —
   * 출처는 이 대화의 사용자 메시지여야 하고, 인용은 그 말에 그대로 있어야 한다. 지나가면 「정리됨」 상태로 만든다.
   * `key`(도구 호출 id)가 같으면 기록은 하나다.
   */
  private async saveRecord(row: AgentConversationDoc, input: AgentRecordDraftInput, key: string): Promise<AgentSavedRecord> {
    const categories = await this.categories(row.userId);
    const issues = draftIssues(input, row.messages, new Set(categories.map(category => category.id)));
    const category = categories.find(item => item.id === input.categoryId);
    if (!input.categoryId) issues.push(`categoryId가 없습니다. 다음에서 고르십시오: ${categories.map(item => `${item.name}(${item.id})`).join(" · ")}`);
    if (issues.length || !category) throw new AgentToolRejection(issues);
    const { record } = await this.career.createRecord(row.userId, `agent-save:${row._id}:${key}`, { categoryId: category.id, title: input.title, bodyMd: input.bodyMd, properties: {} }, { status: "organized", origin: "ai" });
    return { recordId: record.id, title: input.title, categoryName: category.name, bodyMd: input.bodyMd, sources: input.sources, undone: false };
  }
  /**
   * 이미 있는 기록의 끝에 새 내용을 더한다. 대화에 연결되지 않은 기록에도 된다 — 홈의 대화에는 기록이 연결되어 있지 않다.
   * 더할 글은 이 대화에서 사용자가 한 말이어야 한다(새 기록과 같은 출처 규칙). 문서의 마지막 블록 뒤에 넣는 제안을 만들어 바로 적용하므로
   * 사용자가 쓴 문장은 바뀌지 않고, 카드의 「되돌리기」로 되돌린다.
   */
  private async appendToRecord(row: AgentConversationDoc, messages: readonly AgentMessage[], input: AgentRecordAppendInput) {
    const issues = sourceIssues(input.sources, messages);
    if (issues.length) throw new AgentToolRejection(issues);
    await this.consent.require(row.userId, "partial_edit");
    let doc: Awaited<ReturnType<CareerDocumentApi["bootstrap"]>>; let title: string;
    try { title = (await this.career.getRecord(row.userId, input.recordId)).title; doc = await this.documents.bootstrap(row.userId, input.recordId); }
    catch { throw new AgentToolRejection([`기록 ${input.recordId}를 찾을 수 없습니다. list_career_records의 id를 쓰십시오.`]); }
    const blocks = markdownToCareerDocument(input.bodyMd).content;
    if (!blocks.length) throw new AgentToolRejection(["bodyMd에 더할 내용이 없습니다."]);
    const draft = { summary: `「${title}」에 내용을 더했습니다.`.slice(0, 500), commands: [{ type: "insertBlocks" as const, afterBlockId: doc.document.content.at(-1)?.id ?? null, blocks }], propertyChanges: [] };
    const proposal = await this.documents.createPreparedAiProposal(row.userId, input.recordId, { prompt: messages.filter(item => item.role === "user").at(-1)?.text ?? "", selection: { blockIds: doc.document.content.map(block => block.id) } }, draft);
    const applied = await this.documents.applyAiProposal(row.userId, input.recordId, { recordId: input.recordId, proposalId: proposal.proposalId, expectedDocumentVersion: doc.documentVersion, commandIndexes: proposal.commands.map((_, index) => index), propertyChangeIndexes: [] });
    return { proposal: applied, before: doc.document };
  }
  /** 저장을 되돌린다. 기록은 지우지 않고 휴지통으로 옮긴다 — 사용자가 휴지통에서 되살릴 수 있다. */
  async undoSavedRecord(userId: string, id: string, recordId: string) {
    const row = await this.owned(userId, id);
    if (row.run?.status === "running") throw new AgentChatError(409, "응답이 끝난 뒤 되돌려 주세요.");
    const saved = row.messages.flatMap(message => message.tools).find(tool => tool.savedRecord?.recordId === recordId)?.savedRecord;
    if (!saved) throw new AgentChatError(404, "이 대화에서 저장한 기록을 찾을 수 없습니다.");
    if (saved.undone) return view(row);
    await this.career.trashRecord(userId, recordId);
    await this.rows.updateOne({ _id: id, userId }, { $set: { "messages.$[].tools.$[tool].savedRecord.undone": true, updatedAt: new Date().toISOString() }, $inc: { version: 1 } }, { arrayFilters: [{ "tool.savedRecord.recordId": recordId }] });
    return this.get(userId, id);
  }
  /**
   * 초안 승인 · 거절. AI 없이 동작한다.
   *
   * 승인은 초안 id를 멱등 키로 기록을 만든다 — 두 번 눌러도 기록은 하나다. 기록 생성이
   * 실패하면(카테고리 필수 속성 등) 초안 상태를 바꾸지 않는다.
   */
  /**
   * 대화에서 바뀐 구직 목표의 변경 초안. 저장하지 않은 앞선 초안은 닫고 그 칸을 새 초안이 이어받는다 —
   * 대기 중인 카드는 하나만 남아, 옛 카드를 나중에 눌러 새 목표를 덮지 않는다. 지금 쓰는 답변 안의
   * 초안은 `execute`가 닫는다(답변은 통째로 덮어써진다).
   */
  private async goalDraft(row: AgentConversationDoc, messages: readonly AgentMessage[], given: AgentGoalDraftInput) {
    const current = await this.career.getJobGoal(row.userId);
    const input = carryOver(given, messages.flatMap(message => message.tools).findLast(tool => tool.goalDraft?.status === "ready")?.goalDraft);
    const issues = goalDraftIssues(input, current);
    if (issues.length) throw new AgentToolRejection(issues);
    await this.rows.updateOne({ _id: row._id, userId: row.userId }, { $set: { "messages.$[].tools.$[tool].goalDraft.status": "replaced" } }, { arrayFilters: [{ "tool.goalDraft.status": "ready" }] });
    return buildGoalDraft(input, randomUUID(), current);
  }
  /** 목표 변경의 승인 · 거절. 승인하면 그 시점의 목표에 바뀌는 칸만 덮어 저장한다. AI를 부르지 않는다. */
  async decideGoalDraft(userId: string, id: string, draftId: string, decision: AgentGoalDraftDecision) {
    const row = await this.owned(userId, id);
    if (row.run?.status === "running") throw new AgentChatError(409, "응답이 끝난 뒤 처리해 주세요.");
    const draft = row.messages.flatMap(message => message.tools).find(tool => tool.goalDraft?.draftId === draftId)?.goalDraft;
    if (!draft) throw new AgentChatError(404, "이 대화의 목표 변경을 찾을 수 없습니다.");
    const target = decision.action === "approve" ? "approved" : "rejected";
    if (draft.status !== "ready") { if (draft.status === target) return view(row); throw new AgentChatError(409, draft.status === "replaced" ? "새 제안으로 바뀐 변경입니다." : "이미 처리한 변경입니다."); }
    if (decision.action === "approve") await this.career.saveJobGoal(userId, { ...mergeGoal(draft, await this.career.getJobGoal(userId)), source: "chat" });
    await this.rows.updateOne({ _id: id, userId }, { $set: { "messages.$[].tools.$[tool].goalDraft.status": target, updatedAt: new Date().toISOString() }, $inc: { version: 1 } }, { arrayFilters: [{ "tool.goalDraft.draftId": draftId, "tool.goalDraft.status": "ready" }] });
    return this.get(userId, id);
  }
  async decideRecordDraft(userId: string, id: string, draftId: string, decision: AgentRecordDraftDecision) {
    const row = await this.owned(userId, id);
    if (row.run?.status === "running") throw new AgentChatError(409, "응답이 끝난 뒤 처리해 주세요.");
    const draft = row.messages.flatMap(message => message.tools).find(tool => tool.recordDraft?.draftId === draftId)?.recordDraft;
    if (!draft) throw new AgentChatError(404, "이 대화의 기록 초안을 찾을 수 없습니다.");
    const target = decision.action === "approve" ? "approved" : "rejected";
    if (draft.status !== "ready") { if (draft.status === target) return view(row); throw new AgentChatError(409, "이미 처리한 초안입니다."); }
    let next: Record<string, unknown> = { "messages.$[].tools.$[tool].recordDraft.status": target };
    if (decision.action === "approve") {
      const { record } = await this.career.createRecord(userId, draftId, { categoryId: decision.categoryId, title: decision.title, bodyMd: decision.bodyMd, properties: {} });
      next = { ...next, "messages.$[].tools.$[tool].recordDraft.recordId": record.id, "messages.$[].tools.$[tool].recordDraft.title": decision.title, "messages.$[].tools.$[tool].recordDraft.bodyMd": decision.bodyMd, "messages.$[].tools.$[tool].recordDraft.categoryId": decision.categoryId };
    }
    await this.rows.updateOne({ _id: id, userId }, { $set: { ...next, updatedAt: new Date().toISOString() }, $inc: { version: 1 } }, { arrayFilters: [{ "tool.recordDraft.draftId": draftId, "tool.recordDraft.status": "ready" }] });
    return this.get(userId, id);
  }
  /** 요건 대조 검증. 대화에 연결된 공고의 원문과 인용한 기록의 원문으로만 확인한다. */
  private async review(userId: string, contexts: readonly AgentContext[], draft: RequirementReviewDraft) {
    if (!contexts.some(ref => ref.kind === "job" && ref.id === draft.jobPostingId)) throw new AgentToolRejection(["대화에 연결된 공고만 대조할 수 있습니다. jobPostingId를 확인하십시오."]);
    const job = await this.jobs.get(userId, draft.jobPostingId);
    if (!job.descriptionRaw) throw new AgentToolRejection(["이 공고는 원문이 없어 인용을 확인할 수 없습니다."]);
    const records = await this.recordTexts(userId, draft.items.flatMap(item => item.evidence.map(evidence => evidence.recordId)));
    const issues = reviewIssues(draft, job.descriptionRaw, records);
    if (issues.length) throw new AgentToolRejection(issues);
    return buildReview(draft, job.descriptionRaw, records);
  }
  /** 요건 대조나 보완점 정리 뒤에 공고 원문이나 근거로 쓴 기록이 바뀌었는가. */
  async freshness(userId: string, id: string, toolId: string) {
    const row = await this.owned(userId, id);
    const tools = row.messages.flatMap(message => message.tools);
    const position = tools.findIndex(tool => tool.id === toolId);
    const tool = tools[position];
    if (tool?.review) return this.reviewFreshness(userId, tool.review);
    if (tool?.gapReview) return this.gapFreshness(userId, tool.gapReview, tools.slice(0, position).findLast(earlier => earlier.review)?.review);
    throw new AgentChatError(404, "이 대화의 요건 대조나 보완점 정리를 찾을 수 없습니다.");
  }
  /**
   * 보완점의 최신성. 바탕이 된 대조(만들 때처럼 그 앞의 가장 최근 대조)가 오래되었거나, 보완점이 인용한
   * 기록의 글이 바뀌었으면 오래된 것이다.
   */
  private async gapFreshness(userId: string, gap: GapReview, review: RequirementReview | undefined) {
    const changed = new Set(review ? (await this.reviewFreshness(userId, review)).changed : []);
    const snapshot = gap.snapshot?.records ?? [];
    const records = await this.recordTexts(userId, snapshot.map(item => item.recordId));
    if (snapshot.some(item => { const current = records.get(item.recordId); return !current || hash(current.text) !== item.textHash; })) changed.add("records");
    return { stale: changed.size > 0, changed: [...changed] };
  }
  private async reviewFreshness(userId: string, review: RequirementReview) {
    const job = await this.jobs.get(userId, review.jobPostingId).catch(() => null);
    const records = await this.recordTexts(userId, review.snapshot.records.map(item => item.recordId));
    const changed: ("job" | "records")[] = [];
    if (!job?.descriptionRaw || hash(job.descriptionRaw) !== review.snapshot.jobContentHash) changed.push("job");
    if (review.snapshot.records.some(item => { const current = records.get(item.recordId); return !current || hash(current.text) !== item.textHash; })) changed.push("records");
    return { stale: changed.length > 0, changed };
  }
  /**
   * 보완점 정리. 가장 최근 요건 대조를 기준으로 하고, 그 대조가 오래되었으면 받지 않는다 —
   * 최신성은 여기(만들 때)서만 본다.
   */
  private async gapReview(userId: string, messages: AgentMessage[], draft: GapReviewDraft) {
    const review = latestReview(messages);
    if (!review) throw new AgentToolRejection(["이 대화에 요건 대조가 없습니다. 먼저 record_requirement_review로 대조하십시오."]);
    if ((await this.reviewFreshness(userId, review)).stale) throw new AgentToolRejection(["요건 대조 뒤에 공고나 근거 기록이 바뀌었습니다. 요건 대조를 먼저 다시 하십시오."]);
    const records = await this.recordTexts(userId, draft.items.flatMap(item => item.evidence.filter(evidence => evidence.sourceType === "record").map(evidence => evidence.sourceId)));
    const issues = gapIssues(draft, review, records, messages);
    if (issues.length) throw new AgentToolRejection(issues);
    return buildGapReview(draft, review, records);
  }
  /**
   * 준비 계획 제안. 가장 최근 보완점 정리를 기준으로 규칙으로 작업을 배치한다.
   * 보완점이 그 뒤의 요건 대조보다 오래되었거나 대조가 오래되었으면 받지 않는다.
   */
  private async planDraft(userId: string, messages: AgentMessage[], input: PlanProposalInput) {
    const gap = latestTool(messages, tool => tool.gapReview);
    if (!gap) throw new AgentToolRejection(["이 대화에 보완점 정리가 없습니다. 먼저 record_gap_review로 정리하십시오."]);
    const review = latestTool(messages, tool => tool.review);
    if (review && review.position > gap.position) throw new AgentToolRejection(["보완점 정리 뒤에 요건 대조를 다시 했습니다. 보완점을 먼저 다시 정리하십시오."]);
    if (review && (await this.reviewFreshness(userId, review.value)).stale) throw new AgentToolRejection(["요건 대조 뒤에 공고나 근거 기록이 바뀌었습니다. 요건 대조와 보완점 정리를 먼저 다시 하십시오."]);
    const missing = input.gapIndexes.filter(index => !gap.value.items[index]);
    if (missing.length) throw new AgentToolRejection([`보완점 번호 ${missing.join(", ")}는 가장 최근 보완점 정리에 없습니다.`]);
    try {
      const tasks = buildPreparationTasks(input.gapIndexes.map(index => gap.value.items[index]!), input.settings);
      return { draftId: randomUUID(), jobPostingId: gap.value.jobPostingId, title: input.title, summary: input.summary, settings: input.settings, tasks, status: "ready" as const, planId: null };
    } catch (error) {
      if (!(error instanceof PlanCapacityError)) throw error;
      const hours = (minutes: number) => Math.ceil(minutes / 60);
      throw new AgentToolRejection([`시간이 모자랍니다. 고른 보완점에 총 ${hours(error.neededMinutes)}시간이 필요한데 주 ${input.settings.weeklyHours}시간 × ${input.settings.weeks}주는 ${hours(error.availableMinutes)}시간입니다. 주당 시간이나 기간을 늘리거나 보완점을 줄일지 사용자에게 물어보십시오.`]);
    }
  }
  /** 계획 초안 승인 · 거절. AI 없이 동작한다. 승인하면 대화 밖에도 남는 계획이 된다. */
  async decidePlanDraft(userId: string, id: string, draftId: string, decision: AgentPlanDecision) {
    const row = await this.owned(userId, id);
    if (row.run?.status === "running") throw new AgentChatError(409, "응답이 끝난 뒤 처리해 주세요.");
    const draft = row.messages.flatMap(message => message.tools).find(tool => tool.planDraft?.draftId === draftId)?.planDraft;
    if (!draft) throw new AgentChatError(404, "이 대화의 계획 초안을 찾을 수 없습니다.");
    const target = decision.action === "approve" ? "approved" : "rejected";
    if (draft.status !== "ready") { if (draft.status === target) return view(row); throw new AgentChatError(409, "이미 처리한 초안입니다."); }
    let next: Record<string, unknown> = { "messages.$[].tools.$[tool].planDraft.status": target };
    if (decision.action === "approve") {
      const edits = new Map(decision.taskEdits.map(edit => [edit.id, { title: edit.title, action: edit.action, deliverable: edit.deliverable }]));
      if (edits.size !== draft.tasks.length || draft.tasks.some(task => !edits.has(task.id))) throw new AgentChatError(422, "모든 작업의 내용을 함께 보내 주세요.");
      const plan = await this.plans.create(userId, id, draft, { title: decision.title, summary: decision.summary, tasks: edits });
      next = { ...next, "messages.$[].tools.$[tool].planDraft.planId": plan.id, "messages.$[].tools.$[tool].planDraft.title": plan.title, "messages.$[].tools.$[tool].planDraft.summary": plan.summary };
    }
    await this.rows.updateOne({ _id: id, userId }, { $set: { ...next, updatedAt: new Date().toISOString() }, $inc: { version: 1 } }, { arrayFilters: [{ "tool.planDraft.draftId": draftId, "tool.planDraft.status": "ready" }] });
    return this.get(userId, id);
  }
  /** 남은 작업 재배치 초안. 완료하지 않은 작업만 새 설정으로 배치한다. 저장은 승인할 때. */
  private async replanDraft(userId: string, input: ReplanProposalInput) {
    const plan = await this.plans.get(userId, input.planId);
    if (!plan) throw new AgentToolRejection(["그 계획을 찾을 수 없습니다. 승인한 계획 초안의 planId를 쓰십시오."]);
    try {
      const slots = scheduleRemaining(plan.tasks, input.settings);
      if (!slots.length) throw new AgentToolRejection(["모든 작업을 마쳐 다시 배치할 작업이 없습니다."]);
      const titles = new Map(plan.tasks.map(task => [task.id, task.title]));
      return { draftId: randomUUID(), planId: plan.id, baseVersion: plan.version, settings: input.settings, slots: slots.map(slot => ({ ...slot, title: titles.get(slot.taskId)! })), status: "ready" as const };
    } catch (error) {
      if (!(error instanceof PlanCapacityError)) throw error;
      throw new AgentToolRejection([`시간이 모자랍니다. 남은 작업에 총 ${Math.ceil(error.neededMinutes / 60)}시간이 필요한데 주 ${input.settings.weeklyHours}시간 × ${input.settings.weeks}주는 ${Math.ceil(error.availableMinutes / 60)}시간입니다. 설정을 다시 물어보십시오.`]);
    }
  }
  /** 재배치 승인 · 거절. 초안 이후 계획이 바뀌었으면(진행 기록 포함) 409. */
  async decideReplanDraft(userId: string, id: string, draftId: string, decision: AgentReplanDecision) {
    const row = await this.owned(userId, id);
    if (row.run?.status === "running") throw new AgentChatError(409, "응답이 끝난 뒤 처리해 주세요.");
    const draft = row.messages.flatMap(message => message.tools).find(tool => tool.replanDraft?.draftId === draftId)?.replanDraft;
    if (!draft) throw new AgentChatError(404, "이 대화의 재배치 초안을 찾을 수 없습니다.");
    const target = decision.action === "approve" ? "approved" : "rejected";
    if (draft.status !== "ready") { if (draft.status === target) return view(row); throw new AgentChatError(409, "이미 처리한 초안입니다."); }
    if (decision.action === "approve" && !await this.plans.applyReplan(userId, draft)) throw new AgentChatError(409, "초안을 만든 뒤 계획이 바뀌었습니다. 다시 배치를 요청해 주세요.");
    await this.rows.updateOne({ _id: id, userId }, { $set: { "messages.$[].tools.$[tool].replanDraft.status": target, updatedAt: new Date().toISOString() }, $inc: { version: 1 } }, { arrayFilters: [{ "tool.replanDraft.draftId": draftId, "tool.replanDraft.status": "ready" }] });
    return this.get(userId, id);
  }
  async updateTaskProgress(userId: string, planId: string, taskId: string, input: UpdateTaskProgress) {
    const plan = await this.plans.updateTask(userId, planId, taskId, input);
    if (plan) return plan;
    if (!await this.plans.get(userId, planId)) throw new AgentChatError(404, "준비 계획을 찾을 수 없습니다.");
    throw new AgentChatError(409, "다른 화면에서 계획을 먼저 고쳤습니다. 새로 불러온 뒤 다시 저장해 주세요.");
  }
  async plan(userId: string, planId: string) {
    const plan = await this.plans.get(userId, planId);
    if (!plan) throw new AgentChatError(404, "준비 계획을 찾을 수 없습니다.");
    return plan;
  }
  /**
   * 대화에 연결된 포트폴리오에만 지면 도구를 쓴다. 지면 규칙 위반과 동시 편집 같은 4xx는 에이전트가 고쳐 다시 부르도록
   * `AgentToolRejection`으로 바꾼다.
   */
  private async pageCall<T>(row: AgentConversationDoc, portfolioId: string, work: (pages: NonNullable<AgentChatService["pages"]>) => Promise<T>): Promise<T> {
    if (!row.contexts.some(ref => ref.kind === "portfolio" && ref.id === portfolioId)) throw new AgentToolRejection(["대화에 연결된 포트폴리오만 고칠 수 있습니다. selection 또는 context의 portfolioId를 쓰십시오."]);
    if (!this.pages?.elementGuide || !this.pages.editElementByAgent) throw new AgentChatError(503, "지면 편집이 설정되지 않았습니다.");
    try { return await work(this.pages); }
    catch (error) {
      if (error instanceof PageElementIssues) throw new AgentToolRejection(error.issues);
      if (error instanceof PageServiceError && error.statusCode < 500) throw new AgentToolRejection([error.message]);
      throw error;
    }
  }
  /** 요소 고침을 새 판으로 쌓는다. 판의 지시에는 이 실행을 시작한 사용자 메시지를 남긴다 — 「이력」 탭이 그 말로 판을 보여 준다. */
  private async editPage(row: AgentConversationDoc, edit: AgentPageElementEditInput): Promise<AgentPageEdit> {
    const { portfolioId, key, note, ...changes } = edit;
    const result = await this.pageCall(row, portfolioId, pages => pages.editElementByAgent!(row.userId, portfolioId, key, changes, { instruction: row.messages.at(-2)!.text, rationale: note }));
    return { editId: randomUUID(), portfolioId, key, label: result.label, note, changes: result.changes, revision: result.page.revision, undone: false };
  }
  /**
   * 에이전트가 저장한 지면 고침을 되돌린다. 그 판이 아직 최신일 때만 바로 앞 판의 내용을 새 판으로 쌓는다 — 뒤에 다른 편집이 있으면
   * 덮지 않고 409를 낸다. AI 없이 동작한다.
   */
  async undoPageEdit(userId: string, id: string, editId: string) {
    const row = await this.owned(userId, id);
    if (row.run?.status === "running") throw new AgentChatError(409, "응답이 끝난 뒤 되돌려 주세요.");
    const edit = row.messages.flatMap(message => message.tools).find(tool => tool.pageEdit?.editId === editId)?.pageEdit;
    if (!edit) throw new AgentChatError(404, "이 대화의 지면 고침을 찾을 수 없습니다.");
    if (edit.undone) return view(row);
    if (!this.pages?.restoreRevision) throw new AgentChatError(503, "지면 편집이 설정되지 않았습니다.");
    const latest = await this.pages.latest(userId, edit.portfolioId);
    if (latest?.revision !== edit.revision) throw new AgentChatError(409, "이 고침 뒤에 다른 편집이 저장되어 되돌릴 수 없습니다. 「이력」 탭에서 판을 골라 되돌려 주세요.");
    await this.pages.restoreRevision(userId, edit.portfolioId, { revision: edit.revision - 1, expectedRevision: edit.revision });
    await this.rows.updateOne({ _id: id, userId }, { $set: { "messages.$[].tools.$[tool].pageEdit.undone": true, updatedAt: new Date().toISOString() }, $inc: { version: 1 } }, { arrayFilters: [{ "tool.pageEdit.editId": editId }] });
    return this.get(userId, id);
  }
  async create(userId: string, contexts: AgentContext[]) {
    await this.context(userId, contexts);
    const now = new Date();
    const row: AgentConversationDoc = { _id: randomUUID(), userId, title: "새 대화", contexts, messages: [], run: null, version: 0, updatedAt: now.toISOString(), heartbeatAt: now };
    await this.rows.insertOne(row); return view(row);
  }
  async attach(userId: string, id: string, context: AgentContext) {
    const row = await this.owned(userId, id);
    if (row.contexts.some(ref => ref.id === context.id && ref.kind === context.kind)) return view(row);
    if (row.run?.status === "running" || row.contexts.length >= 10) throw new AgentChatError(409, "실행이 끝난 뒤 문맥을 추가해 주세요. 최대 10개까지 연결할 수 있습니다.");
    await this.context(userId, [context]);
    const result = await this.rows.updateOne({ _id: id, userId, version: row.version }, { $push: { contexts: context }, $inc: { version: 1 }, $set: { updatedAt: new Date().toISOString() } });
    if (!result.modifiedCount) throw new AgentChatError(409, "대화가 변경되었습니다. 다시 시도해 주세요.");
    return this.get(userId, id);
  }
  async setContexts(userId: string, id: string, contexts: AgentContext[], expectedVersion: number) {
    const row = await this.owned(userId, id);
    if (row.run?.status === "running" || row.version !== expectedVersion) throw new AgentChatError(409, "대화가 변경되었습니다. 목록을 새로 확인해 주세요.");
    await this.context(userId, contexts);
    const result = await this.rows.updateOne({ _id: id, userId, version: expectedVersion, "run.status": { $ne: "running" } }, { $set: { contexts, updatedAt: new Date().toISOString() }, $inc: { version: 1 } });
    if (!result.modifiedCount) throw new AgentChatError(409, "대화가 변경되었습니다.");
    return this.get(userId, id);
  }
  /**
   * 실행 전에 확인할 것: 런타임 · 실행 중 여부 · 동의 · 이번 달 크레딧 · 연결 자료 크기. 보내기와 다시 보내기가 함께 쓴다.
   * 크레딧은 서버 인증으로 돌 때만 본다. 개인 키로 도는 실행은 그 키의 계정이 비용을 낸다.
   */
  private async prepare(userId: string, row: AgentConversationDoc, serverCredential: boolean) {
    if (!this.runtime) throw new AgentChatError(503, "에이전트가 아직 설정되지 않았습니다.");
    if (row.run?.status === "running") throw new AgentChatError(409, "응답이 끝나거나 취소된 뒤 보내 주세요.");
    await this.consent.require(userId, "partial_edit");
    if (serverCredential && await this.creditsExhausted(userId)) throw new AgentChatError(403, CREDITS_EXHAUSTED, CREDITS_EXHAUSTED);
    const context = await this.context(userId, row.contexts);
    if (JSON.stringify(context).length > 120_000) throw new AgentChatError(422, "연결된 자료가 너무 큽니다. 자료를 나누어 새 대화를 시작해 주세요.");
    return context;
  }
  async send(userId: string, id: string, input: SendAgentMessage, apiKey?: string) {
    const row = await this.owned(userId, id);
    if (row.messages.some(message => message.id === input.requestId)) return view(row);
    if (row.messages.length >= 98 || JSON.stringify(row.messages).length > 160_000) throw new AgentChatError(409, "대화가 길어졌습니다. 새 대화를 시작해 주세요.");
    if (input.selection && !row.contexts.some(ref => ref.kind === "portfolio" && ref.id === input.selection!.portfolioId)) throw new AgentChatError(409, "고른 요소의 포트폴리오가 대화에 연결되어 있지 않습니다. 포트폴리오를 연결한 뒤 보내 주세요.");
    // 부품에 한 답은 마지막 답변의 답 없는 부품만 받는다. 같은 요청이 다시 온 경우는 위에서 이미 돌려보냈다.
    const reply = input.reply ? checkReply(row.messages, input.reply) : null;
    if (reply && !reply.ok) throw new AgentChatError(409, reply.message);
    const context = await this.prepare(userId, row, !apiKey);
    const now = new Date().toISOString();
    // 답의 글은 서버가 고른 선택지의 글로 만든다 — 화면이 보낸 글을 쓰면 대화에 남는 말과 부품이 어긋날 수 있다.
    const text = reply ? reply.text : input.text;
    const user: AgentMessage = { id: input.requestId, role: "user", text, tools: [], ...(input.selection ? { selection: input.selection } : {}), ...(input.reply ? { reply: input.reply } : {}), createdAt: now };
    const assistant: AgentMessage = { id: randomUUID(), role: "assistant", text: "", tools: [], createdAt: now };
    const run = { id: randomUUID(), requestId: input.requestId, status: "running" as const, error: null, startedAt: now };
    const fields = { run, title: row.messages.length ? row.title : text.slice(0, 100), updatedAt: now, heartbeatAt: new Date() };
    // 배열에 덧붙이기와 배열 안의 칸 고치기는 한 갱신에 함께 쓸 수 없다. 답이 있으면 부품의 answer를 채운 배열 전체를 버전 조건 아래에서 쓴다.
    const answered = (): AgentMessage[] => {
      const messages = structuredClone(row.messages);
      // 부품의 종류와 답의 모양이 맞는지는 checkReply가 이미 봤다.
      if (reply?.ok) (messages[reply.messageIndex]!.tools[reply.toolIndex]!.ui as { answer: unknown }).answer = { ...reply.answer, messageId: input.requestId };
      return [...messages, user, assistant];
    };
    const changed = await this.rows.findOneAndUpdate({ _id: id, userId, version: row.version, "run.status": { $ne: "running" } }, reply ? { $set: { ...fields, messages: answered() }, $inc: { version: 1 } } : { $push: { messages: { $each: [user, assistant] } }, $set: fields, $inc: { version: 1 } }, { returnDocument: "after" });
    if (!changed) throw new AgentChatError(409, "다른 화면에서 실행을 시작했습니다.");
    this.start(changed, context, apiKey);
    return view(changed);
  }
  /**
   * 끝나지 못한 마지막 답변을 같은 질문으로 다시 만든다.
   *
   * 새 메시지를 덧붙이지 않고 마지막 답변 자리만 비워 다시 채운다 — 같은 질문이 두 번
   * 쌓이지 않는다. 그 답변이 남긴 적용 전 제안은 먼저 취소한다. 새 답변이 다시 만들
   * 수 있고, 남겨 두면 기록 편집기에 주인 없는 제안이 보인다.
   */
  async retry(userId: string, id: string, apiKey?: string) {
    const row = await this.owned(userId, id);
    const [question, answer] = row.messages.slice(-2);
    if (!row.run || !["failed", "interrupted", "cancelled"].includes(row.run.status) || question?.role !== "user" || answer?.role !== "assistant" || question.id !== row.run.requestId) throw new AgentChatError(409, "다시 보낼 질문이 없습니다.");
    const context = await this.prepare(userId, row, !apiKey);
    for (const tool of answer.tools) if (tool.proposal?.status === "ready") await this.documents.cancelAiProposal(userId, tool.proposal.recordId, { recordId: tool.proposal.recordId, proposalId: tool.proposal.proposalId }).catch(() => undefined);
    const now = new Date().toISOString();
    const fresh: AgentMessage = { id: randomUUID(), role: "assistant", text: "", tools: [], createdAt: now };
    const run = { id: randomUUID(), requestId: question.id, status: "running" as const, error: null, startedAt: now };
    const changed = await this.rows.findOneAndUpdate({ _id: id, userId, version: row.version, "run.status": { $ne: "running" } }, { $set: { [`messages.${row.messages.length - 1}`]: fresh, run, updatedAt: now, heartbeatAt: new Date() }, $inc: { version: 1 } }, { returnDocument: "after" });
    if (!changed) throw new AgentChatError(409, "다른 화면에서 실행을 시작했습니다.");
    this.start(changed, context, apiKey);
    return view(changed);
  }
  private start(row: AgentConversationDoc, context: Awaited<ReturnType<AgentChatService["context"]>>, apiKey?: string) {
    const task = this.execute(row, context, apiKey).catch(() => undefined);
    this.tasks.add(task); void task.finally(() => this.tasks.delete(task));
  }
  private async execute(row: AgentConversationDoc, context: Awaited<ReturnType<AgentChatService["context"]>>, apiKey?: string) {
    const controller = new AbortController(); this.running.set(row._id, controller);
    const runId = row.run!.id;
    const filter = { _id: row._id, userId: row.userId, "run.id": runId, "run.status": "running" };
    const message = structuredClone(row.messages.at(-1)!);
    const beforeDocuments = new Map<string, CareerDocumentBootstrap["document"]>();
    let lastFlush = 0;
    let heartbeatBusy = false;
    const flush = async () => {
      const result = await this.rows.updateOne(filter, { $set: { [`messages.${row.messages.length - 1}`]: message, updatedAt: new Date().toISOString() }, $inc: { version: 1 } });
      lastFlush = Date.now(); if (!result.matchedCount) controller.abort();
    };
    const timer = setInterval(() => {
      if (heartbeatBusy) return;
      heartbeatBusy = true;
      void this.rows.updateOne(filter, { $set: { heartbeatAt: new Date() } }).then(result => { if (!result.matchedCount) controller.abort(); }).catch(() => controller.abort()).finally(() => { heartbeatBusy = false; });
    }, RUN_HEARTBEAT_MS);
    const timeout = setTimeout(() => controller.abort(), 600_000);
    try {
      const goal = await this.career.getJobGoal(row.userId);
      const memory = await this.memory(row.userId, row._id);
      await this.runtime!.run({ userId: row.userId, messages: row.messages.slice(0, -1), context, ...(apiKey ? { apiKey } : {}), signal: controller.signal,
        emit: async event => {
          if (controller.signal.aborted) throw new Error("cancelled");
          if (event.type === "text") { message.text += event.text; if (message.text.length > 64_000) throw new Error("response too large"); }
          else { const before = event.tool.proposal ? beforeDocuments.get(event.tool.proposal.proposalId) : undefined; if (before) event.tool.beforeDocument = before; const at = message.tools.findIndex(tool => tool.id === event.tool.id); if (at < 0) message.tools.push(event.tool); else message.tools[at] = event.tool; if (message.tools.length > 30) throw new Error("too many tools"); }
          if (event.type === "tool" || Date.now() - lastFlush > 200) await flush();
        },
        records: { list: () => this.listRecords(row.userId), read: ids => this.readRecords(row.userId, ids) },
        review: draft => this.review(row.userId, row.contexts, draft),
        saveRecord: (record, key) => this.saveRecord(row, record, key),
        recordCategories: await this.categories(row.userId),
        askForm: async form => {
          const issues = formIssues(form);
          if (issues.length) throw new AgentToolRejection(issues);
          return buildForm(form, randomUUID());
        },
        jobGoal: goal ? { work: goal.work, place: goal.place, timing: goal.timing } : null,
        goalDraft: async input => {
          const draft = await this.goalDraft(row, [...row.messages.slice(0, -1), message], input);
          for (const tool of message.tools) if (tool.goalDraft?.status === "ready") tool.goalDraft.status = "replaced";
          return draft;
        },
        // 같은 실행에서 방금 남긴 도구 결과(예: 대조 직후의 보완점)도 보이도록 지금 쓰는 답변을 넣어 넘긴다.
        gapReview: draft => this.gapReview(row.userId, [...row.messages.slice(0, -1), message], draft),
        planDraft: input => this.planDraft(row.userId, [...row.messages.slice(0, -1), message], input),
        replanDraft: input => this.replanDraft(row.userId, input),
        readPlan: planId => this.plans.get(row.userId, planId),
        memory,
        updateMemory: async update => {
          if (!this.consultant) throw new AgentToolRejection(["이 환경에서는 기억을 쓸 수 없습니다. 사용자에게 그렇게 전하십시오."]);
          try {
            const { profile, changed } = await this.consultant.applyUpdate(row.userId, update);
            const parts = [changed.stage ? `단계: ${STAGE_LABELS[changed.stage]}` : null, changed.remembered ? `조건 ${changed.remembered}개 기억` : null, changed.forgotten ? `조건 ${changed.forgotten}개 지움` : null].filter(Boolean);
            return { summary: parts.length ? parts.join(" · ") : "이미 기억하고 있습니다.", memory: memoryForModel(profile, memory?.recentConversations ?? [], memory?.commitments ?? [], memory?.diagnosis ?? null) };
          } catch (error) {
            if (error instanceof ConsultantLimitError) throw new AgentToolRejection([error.message]);
            throw error;
          }
        },
        appendToRecord: async addition => {
          if (controller.signal.aborted) throw new Error("cancelled");
          const { proposal, before } = await this.appendToRecord(row, [...row.messages.slice(0, -1), message], addition);
          beforeDocuments.set(proposal.proposalId, before);
          return proposal;
        },
        searchJobs: search => this.searchJobs(row.userId, search),
        searchActivities: search => this.searchActivities(row.userId, search),
        goalDemand: () => this.goalDemand(row.userId),
        recordDiagnosis: assessment => this.recordDiagnosis(row.userId, [...row.messages.slice(0, -1), message], assessment),
        makeCommitment: commitment => this.commitment(() => this.commitments!.create(row.userId, commitment, row._id)),
        updateCommitment: ({ commitmentId, status, dueOn }) => this.commitment(() => this.commitments!.update(row.userId, commitmentId, { status, dueOn })),
        askChoice: async choice => {
          const issues = choiceIssues(choice);
          if (issues.length) throw new AgentToolRejection(issues);
          return buildChoice(choice, randomUUID());
        },
        page: {
          read: (portfolioId, key) => this.pageCall(row, portfolioId, pages => pages.elementGuide!(row.userId, portfolioId, key)),
          edit: async edit => {
            if (controller.signal.aborted) throw new Error("cancelled");
            return this.editPage(row, edit);
          },
        },
        propose: async (recordId, draft) => {
          // 연결되지 않은 기록은 블록 id를 모델이 알 수 없어 고칠 수 없다. 까닭과 다른 길을 알려 같은 호출을 되풀이하지 않게 한다.
          if (!row.contexts.some(ref => ref.kind === "record" && ref.id === recordId)) throw new AgentToolRejection(["이 기록은 대화에 연결되어 있지 않아 propose_record_edit으로 고칠 수 없습니다. 내용을 더하려면 append_to_record를 쓰십시오. 기존 문장을 고쳐야 하면 사용자에게 그 기록을 대화에 연결해 달라고 하십시오."]);
          await this.consent.require(row.userId, "partial_edit");
          if (controller.signal.aborted) throw new Error("cancelled");
          const doc = await this.documents.bootstrap(row.userId, recordId);
          const source = context.find(ref => ref.kind === "record" && ref.id === recordId);
          if (!source || !("documentVersion" in source.data) || source.data.documentVersion !== doc.documentVersion) throw new AgentChatError(409, "답변을 만드는 동안 기록이 변경되었습니다. 다시 요청해 주세요.");
          const blockIds = doc.document.content.map(block => block.id);
          const proposal = await this.documents.createPreparedAiProposal(row.userId, recordId, { prompt: row.messages.at(-2)!.text, selection: { blockIds } }, draft);
          if (controller.signal.aborted) { await this.documents.cancelAiProposal(row.userId, recordId, { recordId, proposalId: proposal.proposalId }); throw new Error("cancelled"); }
          beforeDocuments.set(proposal.proposalId, doc.document);
          // 새 블록만 더하는 제안은 사용자가 쓴 문장을 바꾸지 않는다. 승인을 기다리지 않고 바로 적용한다 — 카드의 「되돌리기」는 그대로다.
          // 그 사이 문서가 바뀌어 적용하지 못하면 승인을 기다리는 제안으로 둔다.
          if (draft.commands.length > 0 && draft.commands.every(command => command.type === "insertBlocks") && draft.propertyChanges.length === 0) {
            try { return await this.documents.applyAiProposal(row.userId, recordId, { recordId, proposalId: proposal.proposalId, expectedDocumentVersion: doc.documentVersion, commandIndexes: proposal.commands.map((_, index) => index), propertyChangeIndexes: [] }); }
            catch { return proposal; }
          }
          return proposal;
        },
      });
      if (controller.signal.aborted) throw new Error("cancelled");
      await flush();
      await this.rows.updateOne(filter, { $set: { "run.status": "complete" }, $inc: { version: 1 } });
    } catch (error) {
      for (const tool of message.tools) if (tool.status === "running") { tool.status = "failed"; tool.summary = "실행이 중단되었습니다."; }
      // 서버 종료 중에는 런타임이 abort 대신 자식 프로세스 종료 오류로 먼저 끝날 수 있다. 그래도 끊긴 것이다.
      const status = this.closing || controller.signal.aborted ? "interrupted" : "failed";
      if (status === "failed") this.runFailureListener?.(error, { conversationId: row._id, runId });
      await this.rows.updateOne(filter, { $set: { [`messages.${row.messages.length - 1}`]: message, "run.status": status, "run.error": this.closing ? RUN_INTERRUPTED_ERROR : RUN_FAILED_ERROR }, $inc: { version: 1 } });
    } finally { clearInterval(timer); clearTimeout(timeout); if (this.running.get(row._id) === controller) this.running.delete(row._id); }
  }
  async cancel(userId: string, id: string) {
    const row = await this.owned(userId, id);
    const changed = await this.rows.updateOne({ _id: id, userId, "run.id": row.run?.id, "run.status": "running" }, { $set: { "run.status": "cancelled", "run.error": null, "messages.$[].tools.$[pending].status": "failed", "messages.$[].tools.$[pending].summary": "실행을 중지했습니다." }, $inc: { version: 1 } }, { arrayFilters: [{ "pending.status": "running" }] });
    if (changed.modifiedCount) this.running.get(id)?.abort(); return this.get(userId, id);
  }
  async approve(userId: string, id: string, input: AgentApproval) {
    const row = await this.owned(userId, id);
    if (row.run?.status === "running") throw new AgentChatError(409, "응답이 끝난 뒤 적용해 주세요.");
    const foundTool = row.messages.flatMap(message => message.tools).find(tool => tool.proposal?.proposalId === input.proposalId);
    const found = foundTool?.proposal;
    if (!found) throw new AgentChatError(404, "이 대화의 제안을 찾을 수 없습니다.");
    if (foundTool?.undone) { if (input.action === "undo") return view(row); throw new AgentChatError(409, "되돌린 제안입니다. 새 제안을 요청해 주세요."); }
    const common = { recordId: found.recordId, proposalId: found.proposalId, expectedDocumentVersion: input.expectedDocumentVersion };
    if (input.action === "apply") await this.documents.applyAiProposal(userId, found.recordId, { ...common, commandIndexes: input.commandIndexes ?? found.commands.map((_, index) => index), propertyChangeIndexes: input.propertyChangeIndexes ?? found.propertyChanges.map((_, index) => index) });
    else if (input.action === "reject") await this.documents.rejectAiProposal(userId, found.recordId, common);
    else await this.documents.undoAiProposal(userId, found.recordId, common);
    const proposal = await this.documents.getAiProposal(userId, found.recordId, found.proposalId);
    await this.rows.updateOne({ _id: id, userId }, { $set: { "messages.$[].tools.$[tool].proposal": proposal, ...(input.action === "undo" ? { "messages.$[].tools.$[tool].undone": true } : {}) }, $inc: { version: 1 } }, { arrayFilters: [{ "tool.proposal.proposalId": input.proposalId }] });
    return this.get(userId, id);
  }
  async close() { this.closing = true; for (const controller of this.running.values()) controller.abort(); await Promise.allSettled(this.tasks); }
}

/** 에이전트가 읽는 지면 목차. 최상위 요소와 묶음 안의 요소를 읽는 순서대로, 화면 목차와 같은 이름으로 싣는다. */
function pageOutline(snapshot: StructuredPortfolioSnapshot) {
  const root = snapshot.spec.elements[snapshot.spec.root];
  if (root?.type !== "PortfolioPage") return [];
  const row = (key: string, depth: number) => { const { title, meta } = elementTitle(snapshot, key); return { key, depth, title, type: meta || title }; };
  return root.children.flatMap(key => {
    const node = snapshot.spec.elements[key];
    return [row(key, 0), ...(isStructuredGroup(node) ? node.children.map(child => row(child, 1)) : [])];
  });
}
