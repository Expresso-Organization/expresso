import { createHash, randomUUID } from "node:crypto";
import { CareerWorkflowSchema, WorkflowInputSchema, WorkflowReviewInputSchema, type CareerWorkflow, type WorkflowInput, type WorkflowReviewInput } from "@expresso/contracts";
import { mongoCollections, type CareerWorkflowDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { AiClient } from "../../platform/ai/client.js";
import { requireActiveUser } from "../identity/index.js";
import type { AgentChatService } from "../agent-chat/index.js";
import type { CareerApi } from "../career/index.js";
import type { JobBoardApi, JobMarketApi } from "../jobs/index.js";
import type { MaterialsService } from "../materials/index.js";
import type { ConsentApi } from "../consent/index.js";
import { routeWorkflow } from "./router.js";
import { reviewClaims, WorkflowError } from "./claim-review.js";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const PROMPTS = { match: "연결된 공고와 내 경력 기록을 비교하고 요건 대조를 기록해줘.", interview: "가장 최근 요건 대조에서 부족한 근거를 확인할 질문을 한 번에 하나씩 해줘.", gap: "가장 최근 요건 대조와 내가 말한 경험을 근거로 확인·보완할 점을 정리해줘.", preparation: "가장 최근 보완점에서 준비할 항목을 함께 고르고, 주당 시간·기간·시작일을 물어 준비 계획을 제안해줘.", record: "내가 말한 경험만 근거로 경력 기록 초안을 제안해줘. 저장은 내가 승인할 때 해줘.", unknown: "" };
export class CareerWorkflowService {
 constructor(private readonly db: MongoContext, private readonly agent: Pick<AgentChatService, "get" | "freshness">, private readonly career: Pick<CareerApi, "getRecord" | "listRecords">, private readonly jobs: Pick<JobBoardApi, "get">, private readonly market: Pick<JobMarketApi, "analyzePosting">, private readonly materials: Pick<MaterialsService, "createAgentBrew">, private readonly consent: ConsentApi, private readonly ai: AiClient | null) {}
 private rows() { return this.db.db.collection<CareerWorkflowDoc>("career_workflows"); }
 async options(userId: string, conversationId: string) {
  await this.agent.get(userId, conversationId);
  const rows = await this.career.listRecords(userId, { sort: "updated_desc", limit: 100 });
  return rows.data.filter(row => row.status === "organized" || row.status === "verified").map(({ id, title, status }) => ({ id, title, status }));
 }
 private async snapshot(userId: string, conversationId: string, ids: string[]) {
  const conversation = await this.agent.get(userId, conversationId);
  if (conversation.run?.status === "running") throw new WorkflowError(409, "대화 응답이 끝난 뒤 작업 계획을 확인하세요.");
  const linked = conversation.contexts.filter(ref => ref.kind === "job");
  const job = linked.length === 1 ? await this.jobs.get(userId, linked[0]!.id) : null;
  const records = await Promise.all(ids.map(async id => {
   const record = await this.career.getRecord(userId, id);
   return { id: record.id, title: record.title, version: record.version, status: record.status, text: record.bodyMd.slice(0, 12000), textHash: hash(record.bodyMd), truncated: record.bodyMd.length > 12000 };
  }));
  const tools = conversation.messages.flatMap(message => message.tools);
  const latestReview = [...tools].reverse().find(tool => !!job && tool.review?.jobPostingId === job.id);
  const gapTool = [...tools].reverse().find(tool => !!job && tool.gapReview?.jobPostingId === job.id);
  const freshness = latestReview ? await this.agent.freshness(userId, conversationId, latestReview.id) : null;
  const gap = gapTool?.gapReview ? { id: gapTool.id, stale: !latestReview || tools.indexOf(gapTool) < tools.indexOf(latestReview) || !!freshness?.stale, summary: gapTool.gapReview.summary.slice(0, 4000) } : null;
  const sourceFingerprint = hash({ contexts: conversation.contexts, job: job ? { id: job.id, title: job.title, description: job.descriptionRaw } : null, records, review: latestReview?.review ?? null, gap });
  return { conversation, sourceFingerprint, job: job ? { id: job.id, title: job.title } : null, records, gap, jobCount: linked.length };
 }
 async list(userId: string, conversationId: string) {
  await this.agent.get(userId, conversationId);
  return (await this.rows().find({ userId, conversationId }).sort({ createdAt: -1, _id: -1 }).limit(20).toArray()).map(row => CareerWorkflowSchema.parse(row.result));
 }
 private async owned(userId: string, conversationId: string, id: string) {
  await this.agent.get(userId, conversationId);
  const row = await this.rows().findOne({ _id: id, userId, conversationId });
  if (!row) throw new WorkflowError(404, "작업 계획을 찾을 수 없습니다.");
  return row;
 }
 async create(userId: string, conversationId: string, value: WorkflowInput) {
  const input = WorkflowInputSchema.parse(value); const inputHash = hash(input);
  await this.agent.get(userId, conversationId);
  const filter = { userId, conversationId, requestId: input.requestId };
  const existing = await this.rows().findOne(filter);
  if (existing) { if (existing.inputHash !== inputHash) throw new WorkflowError(409, "같은 요청 번호의 내용이 달라졌습니다."); return CareerWorkflowSchema.parse(existing.result); }
  const source = await this.snapshot(userId, conversationId, input.recordIds);
  const routed = routeWorkflow(input.text, input.intent); const reasons = [...routed.reasons];
  let question: string | null = null;
  if (routed.intent === "unknown") question = "원하는 작업을 하나 선택해 주세요. 자동 삭제·지원 제출·배포는 지원하지 않습니다.";
  else if (routed.intent !== "record" && source.jobCount !== 1) { reasons.push("ONE_JOB_REQUIRED"); question = "대화 자료에 목표 공고를 하나만 연결해 주세요."; }
  else if (routed.intent === "portfolio" && !source.records.length) { reasons.push("RECORD_SELECTION_REQUIRED"); question = "제작에 사용할 정리됨·검증됨 기록을 1~8개 선택하세요."; }
  else if (routed.intent === "portfolio" && source.records.some(record => !["organized", "verified"].includes(record.status))) { reasons.push("INELIGIBLE_RECORD"); question = "선택한 기록의 상태를 정리됨·검증됨으로 확인하세요."; }
  const now = new Date(); const id = randomUUID();
  const result = CareerWorkflowSchema.parse({ id, conversationId, requestId: input.requestId, version: 1, intent: routed.intent, status: question ? "waiting_for_input" : "waiting_for_approval", requestText: input.text, reasonCodes: reasons, question, sourceFingerprint: source.sourceFingerprint, job: source.job, records: source.records, gap: source.gap,
   steps: routed.intent === "portfolio" ? [{ key: "materials", label: "선택한 기록으로 제작 재료 준비", status: "pending" }, { key: "claims", label: "사용할 문장과 근거 검토", status: "pending" }, { key: "handoff", label: "기존 포트폴리오 제작 화면에서 검토·계속", status: "pending" }] : [{ key: "chat", label: "기존 Agent 도구에 보낼 요청 검토", status: "pending" }], claims: [], review: null, brewId: null, nextPath: null, createdAt: now.toISOString(), updatedAt: now.toISOString() });
  try { await inTransaction(this.db, async tx => { await requireActiveUser(tx, userId); await tx.db.collection<CareerWorkflowDoc>("career_workflows").insertOne({ _id: id, ...filter, inputHash, version: 1, createdAt: now, result }, { session: tx.session }); }); }
  catch (error) { if ((error as { code?: number }).code !== 11000) throw error; const saved = await this.rows().findOne(filter); if (!saved || saved.inputHash !== inputHash) throw new WorkflowError(409, "요청 내용이 충돌했습니다."); return CareerWorkflowSchema.parse(saved.result); }
  return result;
 }
 async assertFresh(userId: string, run: CareerWorkflow) {
  const now = await this.snapshot(userId, run.conversationId, run.records.map(record => record.id));
  if (now.sourceFingerprint !== run.sourceFingerprint) throw new WorkflowError(409, "공고·경력·대조 또는 보완점이 바뀌었습니다. 새 작업 계획을 만드세요.");
  if (run.brewId) {
   const selected = await mongoCollections(this.db.db).brewSources.find({ userId, brewId: run.brewId, isSelected: true }).toArray();
   if (JSON.stringify(selected.map(source => source.recordId).sort()) !== JSON.stringify(run.records.map(record => record.id).sort())) throw new WorkflowError(409, "제작 재료 선택이 바뀌었습니다. 새 작업 계획을 만드세요.");
  }
 }
 private async save(userId: string, row: CareerWorkflowDoc, next: CareerWorkflow) {
  return inTransaction(this.db, async tx => {
   await requireActiveUser(tx, userId);
   const result = CareerWorkflowSchema.parse({ ...next, version: row.version + 1, updatedAt: new Date().toISOString() });
   const saved = await tx.db.collection<CareerWorkflowDoc>("career_workflows").updateOne({ _id: row._id, userId, conversationId: row.conversationId, version: row.version }, { $set: { version: result.version, result } }, { session: tx.session });
   if (!saved.matchedCount) throw new WorkflowError(409, "작업 계획이 바뀌었습니다. 다시 불러오세요.");
   return result;
  });
 }
 async review(userId: string, conversationId: string, id: string, value: WorkflowReviewInput) {
  const input = WorkflowReviewInputSchema.parse(value); const row = await this.owned(userId, conversationId, id); const run = row.result;
  if (row.version !== input.expectedVersion || !run.brewId || !["review_required", "waiting_for_approval"].includes(run.status)) throw new WorkflowError(409, "검토할 작업 버전을 확인하세요.");
  await this.assertFresh(userId, run); await this.consent.require(userId, "career_claim_review");
  const review = await reviewClaims(this.ai, input.claims, run.records, userId);
  await this.assertFresh(userId, run);
  const supported = review.items.every(item => item.status === "supported");
  return this.save(userId, row, { ...run, claims: input.claims, review, status: supported ? "waiting_for_approval" : "review_required", steps: run.steps.map(step => step.key === "claims" ? { ...step, status: supported ? "complete" : "waiting" } : step) });
 }
 async advance(userId: string, conversationId: string, id: string, expectedVersion: number) {
  const row = await this.owned(userId, conversationId, id); const run = row.result;
  if (run.status === "handed_off") return CareerWorkflowSchema.parse(run);
  if (row.version !== expectedVersion || run.status !== "waiting_for_approval") throw new WorkflowError(409, "입력·근거 검토를 먼저 완료하세요.");
  await this.assertFresh(userId, run);
  if (run.intent !== "portfolio") return this.save(userId, row, { ...run, status: "handed_off", steps: [{ key: "chat", label: PROMPTS[run.intent], status: "complete" }] });
  if (!run.job) throw new WorkflowError(422, "공고 하나를 연결하세요.");
  if (!run.brewId) {
   await this.consent.require(userId, "job_analysis");
   const analysis = await this.market.analyzePosting(userId, run.job.id);
   if (analysis.status !== "done") throw new WorkflowError(409, "공고 원문 분석을 요청했습니다. Worker 실행 후 분석 완료를 확인하고 같은 승인을 다시 누르세요.");
   return inTransaction(this.db, async tx => {
    await requireActiveUser(tx, userId); const options = { session: tx.session };
    const conversation = await mongoCollections(tx.db).agentConversations.findOne({ _id: conversationId, userId }, options);
    if (!conversation || conversation.run?.status === "running") throw new WorkflowError(409, "대화 상태가 바뀌었습니다.");
    for (const record of run.records) {
     const current = await mongoCollections(tx.db).careerRecords.findOne({ _id: record.id, userId, version: record.version, deletedAt: null }, options);
     if (!current) throw new WorkflowError(409, "경력 기록이 변경됐습니다.");
    }
    const brewId = await this.materials.createAgentBrew(tx, userId, id, run.job!.id, run.records.map(record => record.id));
    const claims = run.records.flatMap(record => record.text.split(/\r?\n/).map(line => line.replace(/^\s*[-*+] /, "").trim()).filter(line => line.length >= 8 && line.length <= 1000 && !line.startsWith("#")).slice(0, 1).map(text => ({ id: randomUUID(), text, sources: [{ recordId: record.id, quote: text }] })));
    const result = CareerWorkflowSchema.parse({ ...run, brewId, claims, status: "review_required", version: row.version + 1, updatedAt: new Date().toISOString(), steps: run.steps.map(step => step.key === "materials" ? { ...step, status: "complete" } : step) });
    const saved = await tx.db.collection<CareerWorkflowDoc>("career_workflows").updateOne({ _id: id, userId, conversationId, version: row.version }, { $set: { version: result.version, result } }, options);
    if (!saved.matchedCount) throw new WorkflowError(409, "작업 계획이 바뀌었습니다.");
    return result;
   });
  }
  if (!run.review || !run.claims.length || run.review.items.length !== run.claims.length || !run.review.items.every(item => item.status === "supported")) throw new WorkflowError(422, "모든 문장의 근거 검토가 필요합니다.");
  return this.save(userId, row, { ...run, status: "handed_off", nextPath: `/brew/${run.brewId}/materials`, steps: run.steps.map(step => ({ ...step, status: "complete" })) });
 }
 async cancel(userId: string, conversationId: string, id: string, expectedVersion: number) {
  const row = await this.owned(userId, conversationId, id);
  if (row.result.status === "cancelled") return row.result;
  if (row.version !== expectedVersion || row.result.status === "handed_off") throw new WorkflowError(409, "이미 연결된 작업은 이 화면에서 취소할 수 없습니다.");
  return this.save(userId, row, { ...row.result, status: "cancelled" });
 }
}
