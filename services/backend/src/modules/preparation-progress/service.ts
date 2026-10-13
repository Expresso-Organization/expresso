import { createHash, randomUUID } from "node:crypto";
import { CreateReplanSchema, PreparationProgressSchema, PreparationReplanSchema, UpdateTaskProgressSchema, type CreateReplan, type PreparationProgress, type PreparationReplan, type UpdateTaskProgress } from "@expresso/contracts";
import type { PreparationProgressDoc, PreparationProgressEventDoc, PreparationReplanDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import type { PreparationService } from "../career-preparation/index.js";
import type { CareerGapService } from "../job-career-gap/index.js";
import { ProgressError, scheduleRemaining } from "./planner.js";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class PreparationProgressService {
  constructor(private readonly context: MongoContext, private readonly plans: Pick<PreparationService, "get">, private readonly gaps: Pick<CareerGapService, "getLatest">) {}
  private rows() { return this.context.db.collection<PreparationProgressDoc>("career_preparation_progress"); }
  private async parent(userId: string, conversationId: string, planId: string) {
    const plan = await this.plans.get(userId, conversationId, planId);
    if (plan.status !== "approved") throw new ProgressError(409, "approve P7 first");
    return plan;
  }
  async get(userId: string, conversationId: string, planId: string): Promise<PreparationProgress | null> {
    await this.parent(userId, conversationId, planId);
    const row = await this.rows().findOne({ _id: planId, userId, conversationId });
    return row ? PreparationProgressSchema.parse(row.result) : null;
  }
  async start(userId: string, conversationId: string, planId: string) {
    const plan = await this.parent(userId, conversationId, planId);
    const existing = await this.get(userId, conversationId, planId); if (existing) return existing;
    const now = new Date().toISOString();
    const result = PreparationProgressSchema.parse({ planId, conversationId, version: 1, scheduleVersion: 1, settings: plan.settings,
      tasks: plan.tasks.map((task) => ({ ...task, status: "not_started", note: "", outcome: "", outcomeUrl: "", spentMinutes: 0, updatedAt: now })),
      history: [{ scheduleVersion: 1, settings: plan.settings, slots: plan.tasks.map((task) => ({ taskId: task.id, week: task.week, date: task.date, minutes: task.minutes })), approvedAt: now }], updatedAt: now });
    try { await inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); await tx.db.collection<PreparationProgressDoc>("career_preparation_progress").insertOne({ _id: planId, userId, conversationId, version: 1, result }, { session: tx.session }); }); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw error; const saved = await this.get(userId, conversationId, planId); if (!saved) throw error; return saved; }
    return result;
  }
  async update(userId: string, conversationId: string, planId: string, taskId: string, value: UpdateTaskProgress) {
    await this.parent(userId, conversationId, planId); const input = UpdateTaskProgressSchema.parse(value); const fingerprint = hash({ taskId, input });
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const options = { session: tx.session };
      const rows = tx.db.collection<PreparationProgressDoc>("career_preparation_progress");
      const events = tx.db.collection<PreparationProgressEventDoc>("career_preparation_progress_events");
      const row = await rows.findOne({ _id: planId, userId, conversationId }, options);
      if (!row) throw new ProgressError(404, "start progress first");
      const receipt = await events.findOne({ userId, planId, requestId: input.requestId }, options);
      if (receipt) { if (receipt.fingerprint !== fingerprint) throw new ProgressError(409, "request inputs changed"); return PreparationProgressSchema.parse(row.result); }
      if (row.version !== input.expectedVersion) throw new ProgressError(409, "progress changed");
      if (!row.result.tasks.some((task) => task.id === taskId)) throw new ProgressError(404, "task not found");
      const now = new Date().toISOString();
      const result = PreparationProgressSchema.parse({ ...row.result, version: row.version + 1, updatedAt: now,
        tasks: row.result.tasks.map((task) => task.id !== taskId ? task : { ...task, status: input.status, note: input.note, outcome: input.outcome, outcomeUrl: input.outcomeUrl, spentMinutes: input.spentMinutes, updatedAt: now }) });
      const saved = await rows.updateOne({ _id: planId, userId, conversationId, version: row.version }, { $set: { version: result.version, result } }, options);
      if (!saved.matchedCount) throw new ProgressError(409, "progress changed");
      await events.insertOne({ _id: randomUUID(), userId, conversationId, planId, requestId: input.requestId, fingerprint, taskId, resultVersion: result.version, createdAt: new Date() }, options);
      return result;
    });
  }
  async listReplans(userId: string, conversationId: string, planId: string) {
    await this.parent(userId, conversationId, planId);
    const rows = await this.context.db.collection<PreparationReplanDoc>("career_preparation_replans").find({ userId, conversationId, planId }).sort({ createdAt: -1, _id: -1 }).limit(50).toArray();
    return rows.map((row) => PreparationReplanSchema.parse(row.result));
  }
  private async currentSource(userId: string, conversationId: string, planId: string) {
    const plan = await this.parent(userId, conversationId, planId); const latest = await this.gaps.getLatest(userId, conversationId);
    if (!latest.data || latest.stale || latest.data.id !== plan.gapResultId) throw new ProgressError(409, "P6 source changed; make a new P7 plan");
  }
  async createReplan(userId: string, conversationId: string, planId: string, value: CreateReplan) {
    await this.currentSource(userId, conversationId, planId); const input = CreateReplanSchema.parse(value); const fingerprint = hash(input);
    const filter = { userId, conversationId, planId, requestId: input.requestId };
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const options = { session: tx.session };
      const drafts = tx.db.collection<PreparationReplanDoc>("career_preparation_replans");
      const existing = await drafts.findOne(filter, options);
      if (existing) { if (existing.fingerprint !== fingerprint) throw new ProgressError(409, "request inputs changed"); return PreparationReplanSchema.parse(existing.result); }
      const progress = await tx.db.collection<PreparationProgressDoc>("career_preparation_progress").findOne({ _id: planId, userId, conversationId }, options);
      if (!progress) throw new ProgressError(404, "start progress first");
      if (progress.version !== input.expectedVersion) throw new ProgressError(409, "progress changed");
      const slots = scheduleRemaining(progress.result.tasks, input.settings); const now = new Date(); const id = randomUUID();
      const result = PreparationReplanSchema.parse({ id, planId, conversationId, requestId: input.requestId, version: 1, baseProgressVersion: progress.version, status: "draft", settings: input.settings, slots, createdAt: now.toISOString(), decidedAt: null });
      await drafts.insertOne({ _id: id, ...filter, fingerprint, version: 1, status: "draft", createdAt: now, result }, options); return result;
    });
  }
  async decideReplan(userId: string, conversationId: string, planId: string, replanId: string, expectedVersion: number, action: "approve" | "reject") {
    await this.parent(userId, conversationId, planId);
    if (action === "approve") await this.currentSource(userId, conversationId, planId);
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const options = { session: tx.session };
      const drafts = tx.db.collection<PreparationReplanDoc>("career_preparation_replans"); const rows = tx.db.collection<PreparationProgressDoc>("career_preparation_progress");
      const draft = await drafts.findOne({ _id: replanId, userId, conversationId, planId }, options);
      if (!draft) throw new ProgressError(404, "replan not found");
      const status = action === "approve" ? "approved" : "rejected";
      if (draft.status === status) return PreparationReplanSchema.parse(draft.result);
      if (draft.status !== "draft" || draft.version !== expectedVersion) throw new ProgressError(409, "replan changed");
      const now = new Date().toISOString();
      if (action === "approve") {
        const progress = await rows.findOne({ _id: planId, userId, conversationId }, options);
        if (!progress || progress.version !== draft.result.baseProgressVersion) throw new ProgressError(409, "progress changed; create a new replan");
        if (progress.result.history.length >= 50) throw new ProgressError(409, "schedule history limit reached");
        const slots = new Map(draft.result.slots.map((slot) => [slot.taskId, slot]));
        const result = PreparationProgressSchema.parse({ ...progress.result, version: progress.version + 1, scheduleVersion: progress.result.scheduleVersion + 1, settings: draft.result.settings, updatedAt: now,
          tasks: progress.result.tasks.map((task) => { const slot = slots.get(task.id); return !slot || task.status === "completed" ? task : { ...task, week: slot.week, date: slot.date }; }),
          history: [...progress.result.history, { scheduleVersion: progress.result.scheduleVersion + 1, settings: draft.result.settings, slots: draft.result.slots, approvedAt: now }] });
        const saved = await rows.updateOne({ _id: planId, userId, conversationId, version: progress.version }, { $set: { version: result.version, result } }, options);
        if (!saved.matchedCount) throw new ProgressError(409, "progress changed");
      }
      const result = PreparationReplanSchema.parse({ ...draft.result, version: draft.version + 1, status, decidedAt: now });
      await drafts.updateOne({ _id: replanId, userId, conversationId, planId, status: "draft", version: expectedVersion }, { $set: { version: result.version, status, result } }, options); return result;
    });
  }
}
