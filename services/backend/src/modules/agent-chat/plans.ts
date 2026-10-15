import { mongoCollections, type PreparationPlanDoc } from "@expresso/database";
import { PreparationPlanSchema, type AgentPlanDraft, type PreparationPlan } from "@expresso/contracts";
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
}
