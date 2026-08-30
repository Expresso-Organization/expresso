import { createHash, randomBytes, randomUUID } from "node:crypto";

import { AccountExportSchema, DeletionRequestSchema } from "@expresso/contracts";
import { mongoCollections, type AccountDeletionRequestDoc } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { AccountLifecycleError } from "./public.js";
import { purgePhase } from "./mongo-purge.js";

const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const iso = (value: Date) => value.toISOString();
function row(value: Record<string, unknown>) { return Object.fromEntries(Object.entries(value).map(([key, item]) => [key === "_id" ? "id" : key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item])); }

export class AccountLifecycleService {
  constructor(readonly context: MongoContext) {}

  async exportData(userId: string, at = new Date()) {
    const db = mongoCollections(this.context.db); const account = await db.users.findOne({ _id: userId });
    if (!account) throw new AccountLifecycleError(404, "account not found");
    const [categories, records, skills, analyses, savedSearches, interests, brews, recipes, portfolios, deployments, assets, metrics, insights] = await Promise.all([
      db.careerCategories.find({ userId }).sort({ sortOrder: 1, _id: 1 }).toArray(), db.careerRecords.find({ userId }).sort({ _id: 1 }).toArray(), db.skills.find({ userId }).sort({ name: 1, _id: 1 }).toArray(),
      db.jobAnalyses.find({ userId }).sort({ _id: 1 }).toArray(), db.savedSearches.find({ userId }).sort({ _id: 1 }).toArray(), db.interests.find({ userId }).sort({ _id: 1 }).toArray(),
      db.brews.find({ userId }).sort({ _id: 1 }).toArray(), db.recipes.find({ userId }).sort({ _id: 1 }).toArray(), db.portfolios.find({ userId }).sort({ _id: 1 }).toArray(),
      db.deployments.find({ userId }).sort({ portfolioId: 1, version: 1 }).toArray(), db.exportAssets.find({ userId }).sort({ createdAt: 1, _id: 1 }).toArray(), db.metricsDaily.find({ userId }).sort({ date: 1, metricKey: 1 }).toArray(), db.insights.find({ userId }).sort({ generatedAt: 1, _id: 1 }).toArray(),
    ]);
    return AccountExportSchema.parse(JSON.parse(JSON.stringify({ schemaVersion: 1, generatedAt: at.toISOString(), account: row(account), career: { categories: categories.map(row), records: records.map(row), skills: skills.map(row) }, jobs: { analyses: analyses.map(row), savedSearches: savedSearches.map(row), interests: interests.map(row) }, brewing: { brews: brews.map(row), recipes: recipes.map(row) }, publishing: { portfolios: portfolios.map(row), deployments: deployments.map(row), assets: assets.map(row) }, analytics: { metrics: metrics.map(row), insights: insights.map(row) } })));
  }

  async requestDeletion(userId: string, at = new Date()) {
    const cancellationToken = randomBytes(32).toString("base64url");
    const request = await inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const account = await db.users.findOneAndUpdate({ _id: userId, deletionRequestedAt: null }, { $set: { deletionRequestedAt: at }, $inc: { lifecycleVersion: 1 } }, { ...options, returnDocument: "before" });
      if (!account) { if (await db.users.findOne({ _id: userId }, options)) throw new AccountLifecycleError(409, "account deletion already requested"); throw new AccountLifecycleError(404, "account not found"); }
      const [portfolios, assets] = await Promise.all([db.portfolios.find({ userId }, options).project({ _id: 1, status: 1 }).toArray(), db.exportAssets.find({ userId, revokedAt: null }, options).project({ _id: 1 }).toArray()]);
      const doc: AccountDeletionRequestDoc = { _id: randomUUID(), userId, subjectId: userId, status: "pending", requestedAt: at, purgeAfter: new Date(at.getTime() + 30 * 86_400_000), cancellationTokenHash: tokenHash(cancellationToken), restoration: { portfolios: portfolios.map(({ _id, status }) => ({ id: _id, status })), assets: assets.map(({ _id }) => ({ id: _id })) }, phase: "access_revoked" };
      await db.accountDeletionRequests.insertOne(doc, options); await db.portfolios.updateMany({ userId, status: "published" }, { $set: { status: "unlisted" } }, options); await db.exportAssets.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: at } }, options); await db.identitySessions.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: at } }, options);
      await db.accountDeletionEvents.insertOne({ _id: randomUUID(), requestId: doc._id, phase: "access_revoked", affectedRows: portfolios.length + assets.length, occurredAt: at }, options); return doc;
    });
    return DeletionRequestSchema.parse({ requestId: request._id, status: request.status, requestedAt: iso(request.requestedAt), purgeAfter: iso(request.purgeAfter), cancellationToken });
  }

  async cancelDeletion(cancellationToken: string, at = new Date()) {
    const request = await inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session }; const hash = tokenHash(cancellationToken);
      const current = await db.accountDeletionRequests.findOne({ cancellationTokenHash: hash, status: "pending" }, options);
      if (!current || !current.userId) throw new AccountLifecycleError(404, "pending deletion request not found");
      if (current.purgeAfter <= at) throw new AccountLifecycleError(409, "deletion grace period expired");
      const changed = await db.accountDeletionRequests.updateOne({ _id: current._id, status: "pending", phase: "access_revoked" }, { $set: { status: "cancelled", cancelledAt: at, phase: "cancelled" } }, options);
      if (!changed.matchedCount) throw new AccountLifecycleError(409, "account purge already started");
      await db.users.updateOne({ _id: current.userId, deletionRequestedAt: { $ne: null } }, { $set: { deletionRequestedAt: null }, $inc: { lifecycleVersion: 1 } }, options);
      const restoration = current.restoration as { portfolios?: Array<{ id: string; status: "draft" | "published" | "unlisted" }>; assets?: Array<{ id: string }> };
      for (const portfolio of restoration.portfolios ?? []) await db.portfolios.updateOne({ _id: portfolio.id, userId: current.userId }, { $set: { status: portfolio.status } }, options);
      const assetIds = (restoration.assets ?? []).map(({ id }) => id); if (assetIds.length) await db.exportAssets.updateMany({ _id: { $in: assetIds }, userId: current.userId }, { $set: { revokedAt: null, accessNonce: randomUUID() } }, options);
      await db.accountDeletionEvents.updateOne({ requestId: current._id, phase: "cancelled" }, { $setOnInsert: { _id: randomUUID(), requestId: current._id, phase: "cancelled", affectedRows: 0, occurredAt: at } }, { ...options, upsert: true }); return current;
    });
    return DeletionRequestSchema.parse({ requestId: request._id, status: "cancelled", requestedAt: iso(request.requestedAt), purgeAfter: iso(request.purgeAfter) });
  }

  async purgeExpired(at = new Date(), limit = 100) {
    const candidates = await mongoCollections(this.context.db).accountDeletionRequests.find({ status: "pending", purgeAfter: { $lte: at } }).sort({ purgeAfter: 1, _id: 1 }).limit(limit).toArray(); const purged: string[] = [];
    for (const candidate of candidates) {
      while (true) {
        const current = await mongoCollections(this.context.db).accountDeletionRequests.findOne({ _id: candidate._id, status: "pending" }); if (!current?.userId) break;
        if (current.phase === "complete") { await inTransaction(this.context, async (tx) => { const db = mongoCollections(tx.db); const options = { session: tx.session }; const changed = await db.accountDeletionRequests.updateOne({ _id: current._id, status: "pending", phase: "complete" }, { $set: { status: "purged", purgedAt: at, userId: null, restoration: {} } }, options); if (changed.matchedCount) await db.accountDeletionEvents.updateOne({ requestId: current._id, phase: "account_purged" }, { $setOnInsert: { _id: randomUUID(), requestId: current._id, phase: "account_purged", affectedRows: 1, occurredAt: at } }, { ...options, upsert: true }); }); purged.push(current._id); break; }
        const advanced = await inTransaction(this.context, (tx) => purgePhase(tx, current._id, current.userId!, current.phase, at)); if (!advanced) break;
      }
    }
    return { purged };
  }
}

export { AccountLifecycleService as MongoAccountLifecycleService };
