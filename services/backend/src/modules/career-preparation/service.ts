import { createHash, randomUUID } from "node:crypto";
import { ApprovePreparationSchema, CreatePreparationSchema, PreparationPlanSchema, type ApprovePreparation, type CreatePreparation, type PreparationPlan } from "@expresso/contracts";
import type { PreparationPlanDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import type { CareerGapService } from "../job-career-gap/index.js";
import { buildPreparationTasks, PREPARATION_GENERATOR_VERSION } from "./planner.js";
import { PreparationError } from "./public.js";
export class PreparationService {
  constructor(private readonly context: MongoContext, private readonly gaps: Pick<CareerGapService, "getLatest">) {}
  private rows() { return this.context.db.collection<PreparationPlanDoc>("career_preparation_plans"); }
  async get(userId: string, conversationId: string, planId: string) {
  const row = await this.rows().findOne({
      _id: planId,
      userId,
      conversationId,
    });
    if (!row) throw new PreparationError(404, "plan not found");
    return PreparationPlanSchema.parse(row.result);
  }
  async list(userId: string, conversationId: string) {
    const latest = await this.gaps.getLatest(userId, conversationId);
    const rows = await this.rows().find({ userId, conversationId }).sort({ createdAt: -1, _id: -1 }).limit(50).toArray();
    return { data: rows.map((row) => PreparationPlanSchema.parse(row.result)), stale: latest.stale };
  }
  async create(userId: string, conversationId: string, value: CreatePreparation): Promise<PreparationPlan> {
    const input = CreatePreparationSchema.parse(value);
    const latest = await this.gaps.getLatest(userId, conversationId);
    if (!latest.data || latest.stale || latest.data.id !== input.gapResultId) throw new PreparationError(409, "refresh P3/P6 before planning");
    const gapIds = [...input.gapIds].sort();
    const gaps = latest.data.items.filter((item) => gapIds.includes(item.id));
    if (gaps.length !== gapIds.length) throw new PreparationError(400, "unknown gap IDs");
    const fingerprint = createHash("sha256").update(JSON.stringify({ generatorVersion: PREPARATION_GENERATOR_VERSION, gapResultId: input.gapResultId, gapIds, settings: input.settings })).digest("hex");
    const filter = { userId, conversationId, requestId: input.requestId };
    const previous = await this.rows().findOne(filter);
    if (previous) {
      if (previous.inputFingerprint !== fingerprint) throw new PreparationError(409, "request ID reused with changed inputs");
      return PreparationPlanSchema.parse(previous.result);
    }
    const tasks = buildPreparationTasks(gaps, input.settings);
    const now = new Date(); const id = randomUUID();
    const result = PreparationPlanSchema.parse({ id, conversationId, gapResultId: input.gapResultId, requestId: input.requestId, version: 1, status: "draft", title: "공고 맞춤 준비 계획", summary: "선택한 Gap과 가용 시간으로 만든 준비 착수 계획입니다. 예상 시간은 계획 배정량이며 숙련·프로젝트 완성·합격을 보장하지 않습니다. 날짜는 각 주의 시작일입니다.", settings: input.settings, gapIds, tasks, totalMinutes: tasks.reduce((sum, task) => sum + task.minutes, 0), createdAt: now.toISOString(), decidedAt: null, generatorVersion: PREPARATION_GENERATOR_VERSION });
    try {
      await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, userId);
        await tx.db.collection<PreparationPlanDoc>("career_preparation_plans").insertOne({ _id: id, ...filter, inputFingerprint: fingerprint, status: "draft", version: 1, createdAt: now, result }, { session: tx.session });
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const existing = await this.rows().findOne(filter);
      if (!existing || existing.inputFingerprint !== fingerprint) throw new PreparationError(409, "conflicting preparation request");
      return PreparationPlanSchema.parse(existing.result);
    }
    return result;
  }
  async approve(userId: string, conversationId: string, planId: string, value: ApprovePreparation) {
    const input = ApprovePreparationSchema.parse(value);
    const row = await this.rows().findOne({ _id: planId, userId, conversationId });
    if (!row) throw new PreparationError(404, "plan not found");
    const latest = await this.gaps.getLatest(userId, conversationId);
    if (!latest.data || latest.stale || latest.data.id !== row.result.gapResultId) throw new PreparationError(409, "plan source is stale");
    const edits = new Map(input.taskEdits.map((edit) => [edit.id, edit]));
    if (edits.size !== input.taskEdits.length || edits.size !== row.result.tasks.length || row.result.tasks.some((task) => !edits.has(task.id))) throw new PreparationError(400, "invalid task edits");
    const result = PreparationPlanSchema.parse({ ...row.result, title: input.title, summary: input.summary, tasks: row.result.tasks.map((task) => ({ ...task, ...edits.get(task.id)! })), status: "approved", version: row.version + 1, decidedAt: new Date().toISOString() });
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const rows = tx.db.collection<PreparationPlanDoc>("career_preparation_plans");
      const current = await rows.findOne({ _id: planId, userId, conversationId }, { session: tx.session });
      if (!current) throw new PreparationError(404, "plan not found");
      if (current.status === "approved") {
        const comparable = (plan: PreparationPlan) => JSON.stringify({ title: plan.title, summary: plan.summary, tasks: plan.tasks });
        if (comparable(current.result) !== comparable(result)) throw new PreparationError(409, "approved plan differs");
        return PreparationPlanSchema.parse(current.result);
      }
      if (current.status !== "draft" || current.version !== input.expectedVersion) throw new PreparationError(409, "plan changed");
      const saved = await rows.updateOne({ _id: planId, userId, conversationId, status: "draft", version: input.expectedVersion }, { $set: { status: "approved", version: result.version, result } }, { session: tx.session });
      if (!saved.matchedCount) throw new PreparationError(409, "plan changed");
      return result;
    });
  }
  async reject(userId: string, conversationId: string, planId: string, expectedVersion: number) {
    await this.gaps.getLatest(userId, conversationId);
    return inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const rows = tx.db.collection<PreparationPlanDoc>("career_preparation_plans");
      const current = await rows.findOne({ _id: planId, userId, conversationId }, { session: tx.session });
      if (!current) throw new PreparationError(404, "plan not found");
      if (current.status === "rejected") return PreparationPlanSchema.parse(current.result);
      if (current.status !== "draft" || current.version !== expectedVersion) throw new PreparationError(409, "plan changed");
      const result = PreparationPlanSchema.parse({ ...current.result, status: "rejected", version: current.version + 1, decidedAt: new Date().toISOString() });
      await rows.updateOne({ _id: planId, userId, conversationId, status: "draft", version: expectedVersion }, { $set: { status: "rejected", version: result.version, result } }, { session: tx.session });
      return result;
    });
  }
}
