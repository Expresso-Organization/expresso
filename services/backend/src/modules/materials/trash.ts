import { TrashedBrewSchema } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { MaterialsError } from "./public.js";

/** 휴지통 보관 기간. 포트폴리오 · 커리어 기록 휴지통과 같은 30일이다. */
const BREW_TRASH_RETENTION_MS = 30 * 86_400_000;

/**
 * 만들던 포트폴리오(제작) 휴지통.
 *
 * 생성 중인 제작은 옮기지 않는다 — 작업이 휴지통 제작에 포트폴리오를 만들 수 있다.
 * 이 제작으로 이미 만든 포트폴리오는 그대로 둔다(「다시 뽑기」가 같은 제작을 다시 쓴다).
 */
export class BrewTrashService {
  constructor(readonly context: MongoContext) {}

  async trash(userId: string, brewId: string, at = new Date()): Promise<void> {
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const brews = mongoCollections(tx.db).brews;
      const result = await brews.updateOne(
        { _id: brewId, userId, deletedAt: null, status: { $ne: "generating" } },
        { $set: { deletedAt: at, purgeAfter: new Date(at.getTime() + BREW_TRASH_RETENTION_MS) } },
        { session: tx.session },
      );
      if (result.matchedCount === 1) return;
      const current = await brews.findOne({ _id: brewId, userId, deletedAt: null }, { session: tx.session, projection: { status: 1 } });
      if (current?.status === "generating") throw new MaterialsError(409, "brew is generating");
      throw new MaterialsError(404, "brew not found");
    });
  }

  async restore(userId: string, brewId: string, at = new Date()): Promise<void> {
    const result = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      return mongoCollections(tx.db).brews.updateOne(
        { _id: brewId, userId, deletedAt: { $ne: null }, purgeAfter: { $gt: at } },
        { $set: { deletedAt: null, purgeAfter: null } },
        { session: tx.session },
      );
    });
    if (result.matchedCount !== 1) throw new MaterialsError(404, "restorable brew not found");
  }

  /** 최근에 지운 순서. 이름은 홈 카드와 같다 — 공고 없이 시작한 제작의 이름, 없으면 공고 제목. */
  async list(userId: string, at = new Date()) {
    const db = mongoCollections(this.context.db);
    const rows = await db.brews.aggregate<{ _id: string; status: string; freeTitle?: string | null; postingTitle?: string | null; deletedAt: Date; purgeAfter: Date }>([
      { $match: { userId, deletedAt: { $ne: null }, purgeAfter: { $gt: at } } },
      { $sort: { deletedAt: -1, _id: -1 } },
      { $limit: 200 },
      { $lookup: { from: db.jobAnalyses.collectionName, localField: "jobAnalysisId", foreignField: "_id", as: "analysis" } },
      { $lookup: { from: db.jobPostings.collectionName, localField: "analysis.jobPostingId", foreignField: "_id", as: "posting" } },
      { $project: { status: 1, freeTitle: 1, deletedAt: 1, purgeAfter: 1, postingTitle: { $first: "$posting.title" } } },
    ]).toArray();
    return {
      data: rows.map((row) => TrashedBrewSchema.parse({
        id: row._id, status: row.status, title: row.freeTitle?.trim() || row.postingTitle || null,
        deletedAt: row.deletedAt.toISOString(), purgeAfter: row.purgeAfter.toISOString(),
      })),
    };
  }
}

async function ids(tx: MongoTransaction, collection: string, filter: Record<string, unknown>): Promise<string[]> {
  const rows = await tx.db.collection<{ _id: string }>(collection).find(filter, { projection: { _id: 1 }, session: tx.session }).toArray();
  return rows.map((row) => row._id);
}

/**
 * 보관 기간이 지난 휴지통 제작을 질문 · 답변 · 레시피와 함께 지운다. 이 제작으로 만든 포트폴리오가 남아 있으면
 * (휴지통 포함) 409로 건너뛴다. 공고 분석(`job_analyses`)은 공고 화면이 함께 쓰므로, 생성 작업 · 크레딧 원장은
 * 쓴 크레딧 기록이므로, 작업 기록(`brew_jobs`)은 실행 기록이므로 남긴다.
 */
export async function purgeTrashedBrew(context: MongoContext, userId: string, brewId: string, at = new Date()): Promise<number> {
  return inTransaction(context, async (tx) => {
    const db = mongoCollections(tx.db);
    const session = { session: tx.session };
    const brew = await db.brews.findOne({ _id: brewId, userId, deletedAt: { $ne: null }, purgeAfter: { $lte: at } }, session);
    if (!brew) throw new MaterialsError(404, "purgeable brew not found");
    if (await db.portfolios.findOne({ userId, brewId }, session)) throw new MaterialsError(409, "brew still has portfolios");
    const interviewSessionId = await ids(tx, "interview_sessions", { userId, brewId });
    const questionId = await ids(tx, "questions", { userId, interviewSessionId: { $in: interviewSessionId } });
    const answerId = await ids(tx, "answers", { userId, questionId: { $in: questionId } });
    const recipeId = await ids(tx, "recipes", { userId, brewId });
    const recipeSectionId = await ids(tx, "recipe_sections", { userId, recipeId: { $in: recipeId } });
    const sweeps: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ["answer_record_changes", { answerId: { $in: answerId } }],
      ["answers", { _id: { $in: answerId } }],
      ["questions", { _id: { $in: questionId } }],
      ["interview_sessions", { _id: { $in: interviewSessionId } }],
      ["recipe_items", { recipeSectionId: { $in: recipeSectionId } }],
      ["recipe_sections", { _id: { $in: recipeSectionId } }],
      ["recipe_evidence_paths", { recipeId: { $in: recipeId } }],
      ["recipe_revisions", { recipeId: { $in: recipeId } }],
      ["recipe_unused_sources", { recipeId: { $in: recipeId } }],
      ["recipes", { _id: { $in: recipeId } }],
      ["brew_sources", { brewId }],
    ];
    let removed = 0;
    for (const [collection, filter] of sweeps) removed += (await tx.db.collection(collection).deleteMany({ userId, ...filter }, session)).deletedCount;
    removed += (await db.brews.deleteOne({ _id: brewId, userId }, session)).deletedCount;
    return removed;
  });
}
