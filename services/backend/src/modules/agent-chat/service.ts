import type { PortfolioReadApi } from "../portfolios/index.js";
import type { PageApi } from "../page/index.js";
import { AgentCredentials } from "./credentials.js";
import { randomUUID } from "node:crypto";
import { AgentConversationSchema, type CareerDocumentBootstrap, type AgentConversation, type AgentContext, type AgentMessage, type SendAgentMessage, type AgentApproval, type RequirementReviewDraft } from "@expresso/contracts";
import { mongoCollections, type AgentConversationDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { AgentToolRejection, type AgentRecordText, type AgentRuntime } from "../../platform/agent/runtime.js";
import { buildReview, hash, recordText, reviewIssues } from "./requirement-review.js";
import type { CareerDocumentApi } from "../career-editor/index.js";
import type { CareerApi } from "../career/index.js";
import type { JobBoardApi } from "../jobs/index.js";
import type { ConsentApi } from "../consent/index.js";

export class AgentChatError extends Error { constructor(readonly statusCode: number, message: string) { super(message); } }
const view = (row: AgentConversationDoc) => { const { _id, userId: _userId, heartbeatAt: _heartbeat, ...data } = row; return AgentConversationSchema.parse({ ...data, id: _id }); };
export class AgentChatService {
  private readonly running = new Map<string, AbortController>();
  private readonly tasks = new Set<Promise<void>>();
  constructor(private readonly db: MongoContext, private readonly runtime: AgentRuntime | null, private readonly career: Pick<CareerApi, "getRecord" | "listRecords">, private readonly jobs: Pick<JobBoardApi, "get">, private readonly documents: CareerDocumentApi, private readonly consent: ConsentApi, readonly credentials: AgentCredentials = new AgentCredentials(db), private readonly portfolios?: Pick<PortfolioReadApi, "get">, private readonly pages?: Pick<PageApi, "latest">) {}
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
  private async listRecords(userId: string) {
    const result = await this.career.listRecords(userId, { sort: "updated_desc", limit: 100 });
    return result.data.map(record => ({ id: record.id, title: record.title, category: record.categoryKey, status: record.status, updatedAt: record.updatedAt }));
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
    const job = await this.jobs.get(userId, review.jobPostingId).catch(() => null);
    const records = await this.recordTexts(userId, review.snapshot.records.map(item => item.recordId));
    const changed: ("job" | "records")[] = [];
    if (!job?.descriptionRaw || hash(job.descriptionRaw) !== review.snapshot.jobContentHash) changed.push("job");
    if (review.snapshot.records.some(item => { const current = records.get(item.recordId); return !current || hash(current.text) !== item.textHash; })) changed.push("records");
    return { stale: changed.length > 0, changed };
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
    }, 1_000);
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
