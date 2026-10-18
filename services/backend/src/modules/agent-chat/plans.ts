import { mongoCollections, type PreparationPlanDoc } from "@expresso/database";
import { PreparationPlanSchema, type AgentPlanDraft, type AgentReplanDraft, type PreparationPlan, type UpdateTaskProgress } from "@expresso/contracts";
import type { MongoContext } from "../../platform/mongodb.js";

/**
 * 승인한 준비 계획의 저장소. 계획은 대화가 아니라 사용자에게 속한다 — 읽기 · 쓰기는 모두
 * `{_id, userId}`로 거른다.
 */
export const planView = (row: PreparationPlanDoc): PreparationPlan => {
  const { _id, userId: _userId, createdAt, updatedAt, ...data } = row;
  return PreparationPlanSchema.parse({ ...data, id: _id, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() });
};

export class PreparationPlans {
  constructor(private readonly db: MongoContext) {}
  private get rows() { return mongoCollections(this.db.db).preparationPlans; }
  async get(userId: string, planId: string) {
    const row = await this.rows.findOne({ _id: planId, userId });
    return row ? planView(row) : null;
  }
  /** 승인한 초안으로 계획을 만든다. 계획 id는 초안 id라 다시 보내도 하나만 생긴다. */
  async create(userId: string, conversationId: string, draft: AgentPlanDraft, edits: { title: string; summary: string; tasks: Map<string, { title: string; action: string; deliverable: string }> }) {
    const now = new Date();
    const row: PreparationPlanDoc = {
      _id: draft.draftId, userId, conversationId, jobPostingId: draft.jobPostingId, title: edits.title, summary: edits.summary, settings: draft.settings,
      tasks: draft.tasks.map(task => ({ ...task, ...edits.tasks.get(task.id)!, status: "not_started", note: "", outcome: "", outcomeUrl: "", spentMinutes: 0, updatedAt: now.toISOString() })),
      version: 1, scheduleVersion: 1, createdAt: now, updatedAt: now,
    };
    try { await this.rows.insertOne(row); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
    return (await this.get(userId, draft.draftId))!;
  }
  /** 작업 하나의 진행. 다른 화면에서 먼저 고쳤으면(버전이 다르면) null. */
  async updateTask(userId: string, planId: string, taskId: string, input: UpdateTaskProgress) {
    const now = new Date();
    const { expectedVersion, ...progress } = input;
    const row = await this.rows.findOneAndUpdate(
      { _id: planId, userId, version: expectedVersion, "tasks.id": taskId },
      { $set: { "tasks.$[task].status": progress.status, "tasks.$[task].note": progress.note, "tasks.$[task].outcome": progress.outcome, "tasks.$[task].outcomeUrl": progress.outcomeUrl, "tasks.$[task].spentMinutes": progress.spentMinutes, "tasks.$[task].updatedAt": now.toISOString(), updatedAt: now }, $inc: { version: 1 } },
      { arrayFilters: [{ "task.id": taskId }], returnDocument: "after" },
    );
    return row ? planView(row) : null;
  }
  /** 승인한 재배치를 적용한다. 초안을 만든 뒤 계획이 바뀌었으면 null. */
  async applyReplan(userId: string, draft: AgentReplanDraft) {
    const current = await this.rows.findOne({ _id: draft.planId, userId, version: draft.baseVersion });
    if (!current) return null;
    const slots = new Map(draft.slots.map(slot => [slot.taskId, slot]));
    const tasks = current.tasks.map(task => { const slot = slots.get(task.id); return slot ? { ...task, week: slot.week, date: slot.date } : task; });
    const row = await this.rows.findOneAndUpdate({ _id: draft.planId, userId, version: draft.baseVersion }, { $set: { tasks, settings: draft.settings, updatedAt: new Date() }, $inc: { version: 1, scheduleVersion: 1 } }, { returnDocument: "after" });
    return row ? planView(row) : null;
  }
}
