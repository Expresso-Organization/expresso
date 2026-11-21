import { TrashedPortfolioSchema } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { PortfolioReadError } from "./public.js";

/** 휴지통 보관 기간. 커리어 기록 휴지통과 같은 30일이다. */
export const PORTFOLIO_TRASH_RETENTION_MS = 30 * 86_400_000;

/**
 * 포트폴리오 휴지통.
 *
 * 옮기면 목록 · 상세 · 홈 · 검색 · 공개 주소에서 빠진다. 공개 중이면 같은 갱신에서 공개를 멈춘다
 * (`publishing`의 공개 중단과 같은 `status: "unlisted"`). 되살려도 공개는 다시 켜지 않는다.
 */
export class PortfolioTrashService {
  constructor(readonly context: MongoContext) {}

  async trash(userId: string, portfolioId: string, at = new Date()): Promise<void> {
    const result = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      return mongoCollections(tx.db).portfolios.updateOne(
        { _id: portfolioId, userId, deletedAt: null },
        [{ $set: {
          deletedAt: at,
          purgeAfter: new Date(at.getTime() + PORTFOLIO_TRASH_RETENTION_MS),
          status: { $cond: [{ $eq: ["$status", "published"] }, "unlisted", "$status"] },
        } }],
        { session: tx.session },
      );
    });
    if (result.matchedCount !== 1) throw new PortfolioReadError(404, "portfolio not found");
  }

  async restore(userId: string, portfolioId: string, at = new Date()): Promise<void> {
    const result = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      return mongoCollections(tx.db).portfolios.updateOne(
        { _id: portfolioId, userId, deletedAt: { $ne: null }, purgeAfter: { $gt: at } },
        { $set: { deletedAt: null, purgeAfter: null } },
        { session: tx.session },
      );
    });
    if (result.matchedCount !== 1) throw new PortfolioReadError(404, "restorable portfolio not found");
  }

  /** 최근에 지운 순서. 보관 기간이 지난 포트폴리오는 복원할 수 없어 뺀다. */
  async list(userId: string, at = new Date()) {
    const rows = await mongoCollections(this.context.db).portfolios
      .find({ userId, deletedAt: { $ne: null }, purgeAfter: { $gt: at } }, { projection: { title: 1, status: 1, deletedAt: 1, purgeAfter: 1 } })
      .sort({ deletedAt: -1, _id: -1 }).limit(200).toArray();
    return {
      data: rows.map((row) => TrashedPortfolioSchema.parse({
        id: row._id, title: row.title, status: row.status,
        deletedAt: row.deletedAt!.toISOString(), purgeAfter: row.purgeAfter!.toISOString(),
      })),
    };
  }
}

/**
 * 영구 삭제가 지우는 컬렉션과, 각 컬렉션에서 이 포트폴리오에 딸린 문서를 가리키는 필드.
 * 크레딧 원장(`generation_usage_ledger` · `generation_jobs` · `usage_counters` · `ai_usage_events`)은 넣지 않는다 —
 * 지우면 이미 쓴 크레딧이 돌아온다.
 */
const PORTFOLIO_OWNED: ReadonlyArray<readonly [collection: string, fields: ReadonlyArray<OwnerField>]> = [
  ["record_usages", ["blockId"]],
  ["generation_sentence_evidence", ["blockId"]],
  ["portfolio_edit_proposals", ["portfolioId", "blockId"]],
  ["revisions", ["portfolioId", "blockId"]],
  ["section_views", ["portfolioSectionId", "visitEventId"]],
  ["conversion_events", ["visitEventId"]],
  ["visit_events", ["deploymentId"]],
  ["analytics_event_receipts", ["deploymentId"]],
  ["metrics_daily", ["deploymentId"]],
  ["insights", ["deploymentId"]],
  ["export_jobs", ["portfolioId", "deploymentId"]],
  ["export_assets", ["portfolioId"]],
  ["deployment_slug_redirects", ["portfolioId"]],
  ["widgets", ["dashboardViewId"]],
  ["dashboard_views", ["portfolioId"]],
  ["annotations", ["portfolioId"]],
  ["blocks", ["portfolioSectionId"]],
  ["portfolio_sections", ["portfolioId"]],
  ["generated_pages", ["portfolioId"]],
  ["layout_specs", ["portfolioId"]],
  ["portfolio_snapshots", ["portfolioId"]],
  ["deployments", ["portfolioId"]],
];

type OwnerField = "portfolioId" | "portfolioSectionId" | "blockId" | "deploymentId" | "visitEventId" | "dashboardViewId";

async function ids(tx: MongoTransaction, collection: string, filter: Record<string, unknown>): Promise<string[]> {
  const rows = await tx.db.collection<{ _id: string }>(collection).find(filter, { projection: { _id: 1 }, session: tx.session }).toArray();
  return rows.map((row) => row._id);
}

/**
 * 보관 기간이 지난 휴지통 포트폴리오를 딸린 문서와 함께 지운다. 자식 id는 이 포트폴리오에서 모은 것만 쓰고,
 * 모든 조건에 `userId`를 건다. 지운 문서 수를 돌려준다.
 */
export async function purgeTrashedPortfolio(context: MongoContext, userId: string, portfolioId: string, at = new Date()): Promise<number> {
  return inTransaction(context, async (tx) => {
    const db = mongoCollections(tx.db);
    const session = { session: tx.session };
    const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId, deletedAt: { $ne: null }, purgeAfter: { $lte: at } }, session);
    if (!portfolio) throw new PortfolioReadError(404, "purgeable portfolio not found");
    const portfolioSectionId = await ids(tx, "portfolio_sections", { userId, portfolioId });
    const deploymentId = await ids(tx, "deployments", { userId, portfolioId });
    const owned: Record<OwnerField, string[]> = {
      portfolioId: [portfolioId],
      portfolioSectionId,
      blockId: await ids(tx, "blocks", { userId, portfolioSectionId: { $in: portfolioSectionId } }),
      deploymentId,
      visitEventId: await ids(tx, "visit_events", { userId, deploymentId: { $in: deploymentId } }),
      dashboardViewId: await ids(tx, "dashboard_views", { userId, portfolioId }),
    };
    let removed = 0;
    for (const [collection, fields] of PORTFOLIO_OWNED) {
      const clauses = fields.filter((field) => owned[field].length).map((field) => ({ [field]: { $in: owned[field] } }));
      if (!clauses.length) continue;
      removed += (await tx.db.collection(collection).deleteMany({ userId, $or: clauses }, session)).deletedCount;
    }
    removed += (await db.portfolios.deleteOne({ _id: portfolioId, userId }, session)).deletedCount;
    return removed;
  });
}
