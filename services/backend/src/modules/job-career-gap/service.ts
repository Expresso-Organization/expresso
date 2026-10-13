import { randomUUID } from "node:crypto";
import { AnalyzeCareerGapSchema, CareerGapResultSchema, type AnalyzeCareerGap, type CareerGapResult } from "@expresso/contracts";
import type { CareerGapRunDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { CAREER_GAP_PROMPT_VERSION, GAP_ACTION, type CareerGapAnalyzer } from "./analyzer.js";
import type { CareerGapInputLoader } from "./input-loader.js";
import { CareerGapError } from "./public.js";
export class CareerGapService {
  constructor(private readonly context: MongoContext, private readonly loader: CareerGapInputLoader, private readonly analyzer: CareerGapAnalyzer | null, private readonly leaseMs: number) {
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new Error("invalid gap lease");
  }
  private rows() { return this.context.db.collection<CareerGapRunDoc>("job_career_gaps"); }
  async getLatest(userId: string, conversationId: string) {
    // 결과 유무와 관계없이 대화 소유권을 확인합니다.
    await this.loader.assertOwned(userId, conversationId);
    const row = await this.rows().findOne({ userId, conversationId, status: "completed" }, { sort: { createdAt: -1, _id: -1 } });
    if (!row?.result) return { data: null, stale: false };
    const data = CareerGapResultSchema.parse(row.result);
    try {
      const input = await this.loader.load(userId, conversationId, data.messageIds);
      return { data, stale: input.fingerprint !== data.inputFingerprint };
    } catch (error) {
      if (error instanceof CareerGapError && [400, 409, 422].includes(error.statusCode)) return { data, stale: true };
      throw error;
    }
  }
  async analyze(userId: string, conversationId: string, value: AnalyzeCareerGap): Promise<CareerGapResult> {
    const inputValue = AnalyzeCareerGapSchema.parse(value);
    const messageIds = [...inputValue.messageIds].sort();
    const input = await this.loader.load(userId, conversationId, messageIds);
    const filter = { userId, conversationId, requestId: inputValue.requestId };
    let previous = await this.rows().findOne(filter);
    if (previous && (JSON.stringify(previous.messageIds) !== JSON.stringify(messageIds) || previous.inputFingerprint !== input.fingerprint)) throw new CareerGapError(409, "request inputs changed; use new request ID");
    if (previous?.status === "completed" && previous.result) return CareerGapResultSchema.parse(previous.result);
    if (!this.analyzer) throw new CareerGapError(503, "AI unavailable");
    const now = new Date();
    // 만료된 분석의 늦은 결과는 attemptId로 저장을 차단합니다.
    await this.rows().updateMany({ userId, conversationId, status: "running", leaseUntil: { $lt: now } }, { $set: { status: "failed" } });
    previous = await this.rows().findOne(filter);
    if (previous?.status === "running") throw new CareerGapError(409, "analysis running");
    const attemptId = randomUUID();
    const leaseUntil = new Date(now.getTime() + this.leaseMs);
    try {
      await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, userId);
        const rows = tx.db.collection<CareerGapRunDoc>("job_career_gaps");
        if (previous) {
          const claimed = await rows.updateOne({ ...filter, status: "failed" }, { $set: { status: "running", attemptId, leaseUntil } }, { session: tx.session });
          if (!claimed.matchedCount) throw new CareerGapError(409, "analysis already claimed");
        } else {
          await rows.insertOne({ _id: randomUUID(), ...filter, messageIds, inputFingerprint: input.fingerprint, status: "running", attemptId, leaseUntil, createdAt: now, result: null }, { session: tx.session });
        }
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new CareerGapError(409, "another analysis running; reload or retry");
      throw error;
    }
    const owner = { ...filter, status: "running" as const, attemptId };
    try {
      const output = await this.analyzer.analyze(userId, input);
      const current = await this.loader.load(userId, conversationId, messageIds);
      if (current.fingerprint !== input.fingerprint) throw new CareerGapError(409, "inputs changed during analysis");
      const result = CareerGapResultSchema.parse({
        id: randomUUID(), conversationId, jobPostingId: input.career.job.id, careerMatchId: input.match.id,
        requestId: inputValue.requestId, createdAt: new Date().toISOString(), promptVersion: CAREER_GAP_PROMPT_VERSION,
        inputFingerprint: input.fingerprint, inputSnapshot: input.career.inputSnapshot, messageIds,
        summary: output.summary,
        items: output.items.map((item) => ({ ...item, id: randomUUID(), requirement: input.match.items[item.requirementIndex]!.requirement, nextAction: GAP_ACTION[item.type] })),
      });
      await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, userId);
        const saved = await tx.db.collection<CareerGapRunDoc>("job_career_gaps").updateOne(owner, { $set: { status: "completed", result } }, { session: tx.session });
        if (!saved.matchedCount) throw new CareerGapError(409, "analysis lease replaced");
      });
      return result;
    } catch (error) {
      await this.rows().updateOne(owner, { $set: { status: "failed" } });
      throw error;
    }
  }
}
