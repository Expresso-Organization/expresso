import type { PortfolioReadApi } from "../portfolios/index.js";
import type { PageApi } from "../page/index.js";
import { AgentCredentials } from "./credentials.js";
import { randomUUID } from "node:crypto";
import { AgentConversationSchema, type CareerDocumentBootstrap, type AgentConversation, type AgentContext, type AgentMessage, type SendAgentMessage, type AgentApproval, type AgentRecordDraftDecision, type AgentRecordDraftInput, type AgentPlanDecision, type AgentReplanDecision, type ReplanProposalInput, type UpdateTaskProgress, type GapReviewDraft, type PlanProposalInput, type RequirementReview, type RequirementReviewDraft } from "@expresso/contracts";
import { mongoCollections, type AgentConversationDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { AgentToolRejection, type AgentRecordText, type AgentRuntime } from "../../platform/agent/runtime.js";
import { buildReview, hash, recordText, reviewIssues } from "./requirement-review.js";
import { buildDraft, draftIssues } from "./record-draft.js";
import { buildGapReview, gapIssues, latestReview, latestTool } from "./gap-review.js";
import { buildPreparationTasks, PlanCapacityError, scheduleRemaining } from "./preparation-planner.js";
import { PreparationPlans } from "./plans.js";
import type { CareerDocumentApi } from "../career-editor/index.js";
import type { CareerApi } from "../career/index.js";
import type { JobBoardApi } from "../jobs/index.js";
import type { ConsentApi } from "../consent/index.js";

/**
 * 실행 중인 대화의 heartbeat 주기. 실행 인스턴스는 이 주기로 문서를 갱신하고, 갱신이 맞지
 * 않으면(다른 인스턴스가 취소해 `running`이 아니면) 실행을 중단한다. 그래서 다른 인스턴스에서
 * 낸 취소가 실행에 닿는 최대 지연이기도 하다. 같은 인스턴스의 취소는 즉시 전달된다.
 */
export const RUN_HEARTBEAT_MS = 1_000;

export class AgentChatError extends Error { constructor(readonly statusCode: number, message: string) { super(message); } }
const view = (row: AgentConversationDoc) => { const { _id, userId: _userId, heartbeatAt: _heartbeat, ...data } = row; return AgentConversationSchema.parse({ ...data, id: _id }); };
export class AgentChatService {
  private readonly running = new Map<string, AbortController>();
  private readonly tasks = new Set<Promise<void>>();
  constructor(private readonly db: MongoContext, private readonly runtime: AgentRuntime | null, private readonly career: Pick<CareerApi, "getRecord" | "listRecords" | "listCategories" | "createRecord">, private readonly jobs: Pick<JobBoardApi, "get">, private readonly documents: CareerDocumentApi, private readonly consent: ConsentApi, readonly credentials: AgentCredentials = new AgentCredentials(db), private readonly portfolios?: Pick<PortfolioReadApi, "get">, private readonly pages?: Pick<PageApi, "latest">) {}
  private get plans() { return new PreparationPlans(this.db); }
  async consentRequired(userId: string) {
    const result = await this.consent.list(userId);
    return !result.data.consents.some(item => item.scope === "career_records" && item.granted);
  }
  get enabled() { return !!this.runtime; }
  private get rows() { return mongoCollections(this.db.db).agentConversations; }
  private async owned(userId: string, id: string) {
    await this.rows.updateOne({ _id: id, userId, "run.status": "running", heartbeatAt: { $lt: new Date(Date.now() - 60_000) } }, { $set: { "run.status": "interrupted", "run.error": "서버 실행이 중단되었습니다. 다시 보내 주세요.", updatedAt: new Date().toISOString() }, $inc: { version: 1 } });
    const row = await this.rows.findOne({ _id: id, userId });
    if (!row) throw new AgentChatError(404, "대화를 찾을 수 없습니다.");
    return row;
  }
  async get(userId: string, id: string) { return view(await this.owned(userId, id)); }
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
        return { ...ref, data: { portfolio, generatedPage: page ? { html: page.html } : null } };
      }
      const record = await this.career.getRecord(userId, ref.id);
      const snapshot = await this.documents.bootstrap(userId, ref.id);
      return { ...ref, data: { record, document: snapshot.document, documentVersion: snapshot.documentVersion } };
    }));
  }
  /** 에이전트가 읽는 기록의 글. 남의 기록 · 삭제된 기록은 getRecord가 막는다. */
  private async recordTexts(userId: string, ids: readonly string[]) {
    const rows = new Map<string, { title: string; text: string }>();
    for (const id of new Set(ids)) {
      try {
        const record = await this.career.getRecord(userId, id);
        rows.set(id, { title: record.title, text: recordText(record, (await this.documents.bootstrap(userId, id)).document) });
      } catch { /* 읽을 수 없는 기록은 없는 기록과 같다. */ }
    }
    return rows;
  }
  private async readRecords(userId: string, ids: string[]): Promise<AgentRecordText[]> {
    const rows = await this.recordTexts(userId, ids);
    // 한 번에 읽는 양을 기록당 4,000자로 묶어 둔다 — 인용은 앞부분에서 나와도 전체 글 안에 있다.
    return [...rows].map(([id, row]) => ({ id, title: row.title, text: row.text.slice(0, 4_000), truncated: row.text.length > 4_000 }));
  }
  private async categories(userId: string) {
    return (await this.career.listCategories(userId)).map(category => ({ id: category.id, name: category.name }));
  }
  private async listRecords(userId: string) {
    const [categories, result] = await Promise.all([this.categories(userId), this.career.listRecords(userId, { sort: "updated_desc", limit: 100 })]);
    return { categories, records: result.data.map(record => ({ id: record.id, title: record.title, category: record.categoryKey, status: record.status, updatedAt: record.updatedAt })) };
  }
  /** 새 기록 초안. 출처는 실행을 시작할 때의 대화(방금 보낸 질문 포함)에서 확인한다. */
  private async draftRecord(row: AgentConversationDoc, input: AgentRecordDraftInput) {
    const categories = await this.categories(row.userId);
    const issues = draftIssues(input, row.messages, new Set(categories.map(category => category.id)));
    if (issues.length) throw new AgentToolRejection(issues);
    return buildDraft(input, randomUUID(), categories);
  }
  /**
   * 초안 승인 · 거절. AI 없이 동작한다.
   *
   * 승인은 초안 id를 멱등 키로 기록을 만든다 — 두 번 눌러도 기록은 하나다. 기록 생성이
   * 실패하면(카테고리 필수 속성 등) 초안 상태를 바꾸지 않는다.
   */
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
  /** 대조 이후 공고 원문이나 근거로 쓴 기록이 바뀌었는가. */
  async freshness(userId: string, id: string, toolId: string) {
    const row = await this.owned(userId, id);
    const review = row.messages.flatMap(message => message.tools).find(tool => tool.id === toolId)?.review;
    if (!review) throw new AgentChatError(404, "이 대화의 요건 대조를 찾을 수 없습니다.");
    return this.reviewFreshness(userId, review);
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
  /** 실행 전에 확인할 것: 런타임 · 실행 중 여부 · 동의 · 연결 자료 크기. 보내기와 다시 보내기가 함께 쓴다. */
  private async prepare(userId: string, row: AgentConversationDoc) {
    if (!this.runtime) throw new AgentChatError(503, "에이전트가 아직 설정되지 않았습니다.");
    if (row.run?.status === "running") throw new AgentChatError(409, "응답이 끝나거나 취소된 뒤 보내 주세요.");
    await this.consent.require(userId, "partial_edit");
    const context = await this.context(userId, row.contexts);
    if (JSON.stringify(context).length > 120_000) throw new AgentChatError(422, "연결된 자료가 너무 큽니다. 자료를 나누어 새 대화를 시작해 주세요.");
    return context;
  }
  async send(userId: string, id: string, input: SendAgentMessage, apiKey?: string) {
    const row = await this.owned(userId, id);
    if (row.messages.some(message => message.id === input.requestId)) return view(row);
    if (row.messages.length >= 98 || JSON.stringify(row.messages).length > 160_000) throw new AgentChatError(409, "대화가 길어졌습니다. 새 대화를 시작해 주세요.");
    const context = await this.prepare(userId, row);
    const now = new Date().toISOString();
    const user: AgentMessage = { id: input.requestId, role: "user", text: input.text, tools: [], createdAt: now };
    const assistant: AgentMessage = { id: randomUUID(), role: "assistant", text: "", tools: [], createdAt: now };
    const run = { id: randomUUID(), requestId: input.requestId, status: "running" as const, error: null, startedAt: now };
    const changed = await this.rows.findOneAndUpdate({ _id: id, userId, version: row.version, "run.status": { $ne: "running" } }, { $push: { messages: { $each: [user, assistant] } }, $set: { run, title: row.messages.length ? row.title : input.text.slice(0, 100), updatedAt: now, heartbeatAt: new Date() }, $inc: { version: 1 } }, { returnDocument: "after" });
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
    const context = await this.prepare(userId, row);
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
      await this.runtime!.run({ messages: row.messages.slice(0, -1), context, ...(apiKey ? { apiKey } : {}), signal: controller.signal,
        emit: async event => {
          if (controller.signal.aborted) throw new Error("cancelled");
          if (event.type === "text") { message.text += event.text; if (message.text.length > 64_000) throw new Error("response too large"); }
          else { const before = event.tool.proposal ? beforeDocuments.get(event.tool.proposal.proposalId) : undefined; if (before) event.tool.beforeDocument = before; const at = message.tools.findIndex(tool => tool.id === event.tool.id); if (at < 0) message.tools.push(event.tool); else message.tools[at] = event.tool; if (message.tools.length > 30) throw new Error("too many tools"); }
          if (event.type === "tool" || Date.now() - lastFlush > 200) await flush();
        },
        records: { list: () => this.listRecords(row.userId), read: ids => this.readRecords(row.userId, ids) },
        review: draft => this.review(row.userId, row.contexts, draft),
        draftRecord: input => this.draftRecord(row, input),
        // 같은 실행에서 방금 남긴 도구 결과(예: 대조 직후의 보완점)도 보이도록 지금 쓰는 답변을 넣어 넘긴다.
        gapReview: draft => this.gapReview(row.userId, [...row.messages.slice(0, -1), message], draft),
        planDraft: input => this.planDraft(row.userId, [...row.messages.slice(0, -1), message], input),
        replanDraft: input => this.replanDraft(row.userId, input),
        readPlan: planId => this.plans.get(row.userId, planId),
        propose: async (recordId, draft) => {
          if (!row.contexts.some(ref => ref.kind === "record" && ref.id === recordId)) throw new AgentChatError(403, "대화에 연결된 기록만 변경할 수 있습니다.");
          await this.consent.require(row.userId, "partial_edit");
          if (controller.signal.aborted) throw new Error("cancelled");
          const doc = await this.documents.bootstrap(row.userId, recordId);
          const source = context.find(ref => ref.kind === "record" && ref.id === recordId);
          if (!source || !("documentVersion" in source.data) || source.data.documentVersion !== doc.documentVersion) throw new AgentChatError(409, "답변을 만드는 동안 기록이 변경되었습니다. 다시 요청해 주세요.");
          const blockIds = doc.document.content.map(block => block.id);
          const proposal = await this.documents.createPreparedAiProposal(row.userId, recordId, { prompt: row.messages.at(-2)!.text, selection: { blockIds } }, draft);
          if (controller.signal.aborted) { await this.documents.cancelAiProposal(row.userId, recordId, { recordId, proposalId: proposal.proposalId }); throw new Error("cancelled"); }
          beforeDocuments.set(proposal.proposalId, doc.document);
          return proposal;
        },
      });
      if (controller.signal.aborted) throw new Error("cancelled");
      await flush();
      await this.rows.updateOne(filter, { $set: { "run.status": "complete" }, $inc: { version: 1 } });
    } catch {
      for (const tool of message.tools) if (tool.status === "running") { tool.status = "failed"; tool.summary = "실행이 중단되었습니다."; }
      await this.rows.updateOne(filter, { $set: { [`messages.${row.messages.length - 1}`]: message, "run.status": controller.signal.aborted ? "interrupted" : "failed", "run.error": "응답을 완료하지 못했습니다. 설정을 확인하고 다시 보내 주세요." }, $inc: { version: 1 } });
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
  async close() { for (const controller of this.running.values()) controller.abort(); await Promise.allSettled(this.tasks); }
}
