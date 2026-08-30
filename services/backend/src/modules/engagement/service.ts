import { randomUUID } from "node:crypto";

import { API_PREFIX, HomeReadModelSchema, type NotificationKind, type UnifiedSearchQuery } from "@expresso/contracts";
import { mongoCollections, type NotificationDoc } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { type NotificationDeliveryProvider, EngagementError } from "./public.js";

const KINDS: NotificationKind[] = ["deadline", "generation", "saved_search", "traffic"];
const kstDate = (at: Date) => new Date(at.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const dto = (row: NotificationDoc) => ({ id: row._id, kind: row.kind, targetUrl: row.targetUrl, readAt: row.readAt?.toISOString() ?? null, deliveryStatus: row.deliveryStatus, attempts: row.attempts, createdAt: row.createdAt.toISOString() });
function decode(cursor?: string) { if (!cursor) return null; try { const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); if (typeof value.title !== "string" || typeof value.type !== "string" || typeof value.id !== "string") throw new Error(); return value as { title: string; type: string; id: string }; } catch { throw new EngagementError(400, "invalid search cursor"); } }
const encode = (row: { sortTitle: string; type: string; id: string }) => Buffer.from(JSON.stringify({ title: row.sortTitle, type: row.type, id: row.id })).toString("base64url");

export class EngagementService {
  constructor(readonly context: MongoContext) {}
  async setPreference(userId: string, kind: NotificationKind, enabled: boolean) { await inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); const users = mongoCollections(tx.db).users; const user = await users.findOne({ _id: userId, deletionRequestedAt: null }, { session: tx.session }); if (!user) throw new EngagementError(404, "user not found"); await users.updateOne({ _id: userId }, { $set: { notificationPreferences: { ...(user.notificationPreferences ?? {}), [kind]: enabled } } }, { session: tx.session }); }); return { kind, enabled }; }
  async preferences(userId: string) { const user = await mongoCollections(this.context.db).users.findOne({ _id: userId }); const prefs = user?.notificationPreferences ?? {}; return KINDS.map((kind) => ({ kind, enabled: typeof prefs[kind] === "boolean" ? prefs[kind] : true })); }
  async notify(userId: string, kind: NotificationKind, targetUrl: string, dedupeKey: string, at = new Date()) { return inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); const prefs = (await mongoCollections(tx.db).users.findOne({ _id: userId }, { session: tx.session }))?.notificationPreferences ?? {}; if (prefs[kind] === false) return { created: false, reason: "PREFERENCE_DISABLED" as const, notification: null }; const db = mongoCollections(tx.db); const date = kstDate(at); const existing = await db.notifications.findOne({ userId, dedupeKey, dedupeDate: date }, { session: tx.session }); if (existing) return { created: false, reason: "DUPLICATE" as const, notification: dto(existing) }; const row: NotificationDoc = { _id: randomUUID(), userId, kind, targetUrl, dedupeKey, dedupeDate: date, readAt: null, deliveryStatus: "queued", attempts: 0, nextAttemptAt: at, lastError: null, createdAt: at, deliveredAt: null }; await db.notifications.insertOne(row, { session: tx.session }); await addMongoOutboxEvent(tx, { userId, topic: "notification.deliver", payload: { notificationId: row._id, userId }, idempotencyKey: `notification-deliver:${row._id}` }); return { created: true, reason: "CREATED" as const, notification: dto(row) }; }); }
  async deliver(id: string, provider: NotificationDeliveryProvider, at = new Date()) { const claimed = await inTransaction(this.context, async (tx) => { const db = mongoCollections(tx.db); const row = await db.notifications.findOne({ _id: id }, { session: tx.session }); if (!row) throw new EngagementError(404, "notification not found"); await requireActiveUser(tx, row.userId); if (["sent", "suppressed", "sending"].includes(row.deliveryStatus) || row.nextAttemptAt > at) return null; const prefs = (await db.users.findOne({ _id: row.userId }, { session: tx.session }))?.notificationPreferences ?? {}; if (prefs[row.kind] === false) { await db.notifications.updateOne({ _id: id }, { $set: { deliveryStatus: "suppressed" } }, { session: tx.session }); return null; } const changed = await db.notifications.findOneAndUpdate({ _id: id, deliveryStatus: row.deliveryStatus, attempts: row.attempts }, { $set: { deliveryStatus: "sending" }, $inc: { attempts: 1 } }, { session: tx.session, returnDocument: "after" }); return changed; }); if (!claimed) return this.getNotificationById(id); try { await provider.send({ id: claimed._id, userId: claimed.userId, kind: claimed.kind, targetUrl: claimed.targetUrl }); await mongoCollections(this.context.db).notifications.updateOne({ _id: id, deliveryStatus: "sending", attempts: claimed.attempts }, { $set: { deliveryStatus: "sent", deliveredAt: at, lastError: null } }); } catch (error) { await mongoCollections(this.context.db).notifications.updateOne({ _id: id, deliveryStatus: "sending", attempts: claimed.attempts }, { $set: { deliveryStatus: "failed", lastError: error instanceof Error ? error.name.slice(0, 100) : "UnknownError", nextAttemptAt: new Date(at.getTime() + Math.min(2 ** claimed.attempts, 300) * 1000) } }); throw error; } return this.getNotificationById(id); }
  async getNotificationById(id: string) { const row = await mongoCollections(this.context.db).notifications.findOne({ _id: id }); if (!row) throw new EngagementError(404, "notification not found"); return dto(row); }
  async listNotifications(userId: string) { return (await mongoCollections(this.context.db).notifications.find({ userId }).sort({ createdAt: -1, _id: -1 }).limit(100).toArray()).map(dto); }
  async home(userId: string) {
    type HomeRow =
      | { kind: "brew"; id: string; status: string; updatedAt: Date }
      | { kind: "portfolio"; id: string; title: string; status: string }
      | { kind: "job"; id: string; title: string; company: string; score: unknown; companyId: string; logoChecksum?: string | null }
      | { kind: "metric"; key: string; value: unknown };
    const db = mongoCollections(this.context.db);
    // 홈 한 번에 독립 find를 여러 개 열면 동시 요청 수만큼 pool 대기가 증폭된다.
    // 컬렉션별 limit과 정렬은 유지하면서 서버 왕복은 단일 aggregation으로 묶는다.
    const rows = await db.brews.aggregate<HomeRow>([
      { $match: { userId, status: { $ne: "done" } } },
      { $sort: { updatedAt: -1, _id: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, kind: { $literal: "brew" }, id: "$_id", status: 1, updatedAt: 1 } },
      { $unionWith: { coll: db.portfolios.collectionName, pipeline: [
        { $match: { userId } }, { $sort: { title: 1, _id: 1 } }, { $limit: 10 },
        { $project: { _id: 0, kind: { $literal: "portfolio" }, id: "$_id", title: 1, status: 1 } },
      ] } },
      { $unionWith: { coll: db.matchScores.collectionName, pipeline: [
        { $match: { userId } }, { $sort: { total: -1, _id: 1 } }, { $limit: 5 },
        { $lookup: { from: db.jobPostings.collectionName, localField: "jobPostingId", foreignField: "_id", as: "posting" } },
        { $unwind: "$posting" },
        { $lookup: { from: db.companies.collectionName, localField: "posting.companyId", foreignField: "_id", as: "company" } },
        { $unwind: "$company" },
        { $project: { _id: 0, kind: { $literal: "job" }, id: "$posting._id", title: "$posting.title", company: "$company.name", score: "$total", companyId: "$company._id", logoChecksum: "$company.logoChecksum" } },
      ] } },
      { $unionWith: { coll: db.metricsDaily.collectionName, pipeline: [
        { $match: { userId } }, { $group: { _id: "$metricKey", value: { $sum: "$value" } } },
        { $project: { _id: 0, kind: { $literal: "metric" }, key: "$_id", value: 1 } },
      ] } },
    ]).toArray();
    const brews = rows.filter((row): row is Extract<HomeRow, { kind: "brew" }> => row.kind === "brew");
    const portfolios = rows.filter((row): row is Extract<HomeRow, { kind: "portfolio" }> => row.kind === "portfolio");
    const jobs = rows.filter((row): row is Extract<HomeRow, { kind: "job" }> => row.kind === "job");
    const metrics = rows.filter((row): row is Extract<HomeRow, { kind: "metric" }> => row.kind === "metric")
      .sort((left, right) => left.key.localeCompare(right.key));
    return HomeReadModelSchema.parse({
      activeBrews: brews.map((row) => ({ id: row.id, status: row.status, updatedAt: row.updatedAt.toISOString() })),
      portfolios: portfolios.map((row) => ({ id: row.id, title: row.title, status: row.status })),
      recommendedJobs: jobs.map((row) => ({
        id: row.id, title: row.title, company: row.company, score: Number(String(row.score)),
        companyLogoUrl: row.logoChecksum ? `${API_PREFIX}/companies/${row.companyId}/logo?v=${row.logoChecksum.slice(0, 16)}` : null,
      })),
      keyMetrics: metrics.map((row) => ({ key: row.key, value: Number(String(row.value)) })),
      empty: { brews: !brews.length, portfolios: !portfolios.length, recommendations: !jobs.length, metrics: !metrics.length },
    });
  }
  async search(userId: string, input: UnifiedSearchQuery) { const db = mongoCollections(this.context.db); const q = input.q.toLocaleLowerCase(); const [records, portfolios, scores] = await Promise.all([db.careerRecords.find({ userId, deletedAt: null }).toArray(), db.portfolios.find({ userId }).toArray(), db.matchScores.find({ userId }).toArray()]); const jobs = await Promise.all(scores.map(async ({ jobPostingId }) => { const posting = await db.jobPostings.findOne({ _id: jobPostingId }); const company = posting ? await db.companies.findOne({ _id: posting.companyId }) : null; return posting ? { id: posting._id, type: "job" as const, title: posting.title, subtitle: company?.name ?? "", sortTitle: posting.title.toLocaleLowerCase() } : null; })); let rows = [...records.map((row) => ({ id: row._id, type: "record" as const, title: row.title, subtitle: row.status, sortTitle: row.title.toLocaleLowerCase() })), ...portfolios.map((row) => ({ id: row._id, type: "portfolio" as const, title: row.title, subtitle: row.status, sortTitle: row.title.toLocaleLowerCase() })), ...jobs.filter((row): row is NonNullable<typeof row> => Boolean(row))].filter(({ title }) => title.toLocaleLowerCase().includes(q)).sort((a, b) => a.sortTitle.localeCompare(b.sortTitle) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id)); const cursor = decode(input.cursor); if (cursor) rows = rows.filter((row) => row.sortTitle > cursor.title || row.sortTitle === cursor.title && (row.type > cursor.type || row.type === cursor.type && row.id > cursor.id)); const hasNextPage = rows.length > input.limit; const page = rows.slice(0, input.limit); return { data: page.map(({ sortTitle: _, ...row }) => row), page: { hasNextPage, nextCursor: hasNextPage && page.at(-1) ? encode(page.at(-1)!) : null } }; }
}

export { EngagementService as MongoEngagementService };
