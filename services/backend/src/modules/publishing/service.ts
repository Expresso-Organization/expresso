import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { DeploymentSchema, DeploymentSummarySchema, GeneratedPageDeploymentSnapshotSchema, PageStyleGrammarSchema, PublicPortfolioSchema, SignedAssetSchema, pageDocument, type PublishPortfolio, type SubmitExport } from "@expresso/contracts";
import { mongoCollections, type DeploymentDoc, type ExportAssetDoc, type ExportJobDoc, type JsonObject } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { readSnapshot, snapshotRefFromStored, writeSnapshot } from "../../platform/snapshot-payload.js";
import { MongoEntitlementService } from "../entitlements/index.js";
import { requireActiveUser } from "../identity/index.js";
import { PublishingError } from "./public.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const duplicate = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === 11000;

export class PublishingService {
  readonly #signingSecret: string;
  constructor(readonly context: MongoContext, signingSecret = "expresso-local-asset-signing-secret") { if (signingSecret.length < 16) throw new Error("asset signing secret must be at least 16 characters"); this.#signingSecret = signingSecret; }

  async #snapshot(tx: MongoTransaction, userId: string, portfolioId: string) {
    const db = mongoCollections(tx.db); const options = { session: tx.session };
    const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId }, options); if (!portfolio) throw new PublishingError(404, "portfolio not found");
    const sections = await db.portfolioSections.find({ userId, portfolioId }, options).sort({ orderNo: 1, _id: 1 }).toArray();
    const blocks = await db.blocks.find({ userId, portfolioSectionId: { $in: sections.map(({ _id }) => _id) } }, options).sort({ orderNo: 1, _id: 1 }).toArray();
    const page = await db.generatedPages.find({ userId, portfolioId, qualityStatus: "ready" }, options).sort({ revision: -1 }).limit(1).next();
    if (!page) throw new PublishingError(409, "ready generated page is required for publication");
    const grammar = PageStyleGrammarSchema.safeParse(page.styleSpecSnapshot).success ? PageStyleGrammarSchema.parse(page.styleSpecSnapshot) : undefined;
    return { portfolioId, title: portfolio.title, templateId: portfolio.templateId, sections: sections.map((section) => ({ id: section._id, order: section.orderNo, visible: section.visible, blocks: blocks.filter(({ portfolioSectionId: id }) => id === section._id).map((block) => ({ id: block._id, kind: block.kind, content: block.content, style: block.style, locked: block.locked })) })), generatedPage: GeneratedPageDeploymentSnapshotSchema.parse({ id: page._id, revision: page.revision, document: pageDocument({ html: page.html, css: page.css, title: portfolio.title, description: page.rationale, ...(grammar ? { grammar } : {}) }) }) };
  }

  async #dto(row: DeploymentDoc) {
    const snapshot = await readSnapshot(this.context, snapshotRefFromStored(row.snapshot));
    return DeploymentSchema.parse({ id: row._id, portfolioId: row.portfolioId, version: row.version, slug: row.subdomain, snapshot, seo: row.seo, contactVisibility: row.contactVisibility, publishedAt: row.publishedAt!.toISOString() });
  }

  async publish(userId: string, portfolioId: string, input: PublishPortfolio, at = new Date()) {
    try {
      const row = await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session };
        const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId }, options); if (!portfolio) throw new PublishingError(404, "portfolio not found");
        const snapshotValue = await this.#snapshot(tx, userId, portfolioId); const snapshot = await writeSnapshot(tx, userId, snapshotValue);
        const current = portfolio.currentDeploymentId ? await db.deployments.findOne({ _id: portfolio.currentDeploymentId, userId, portfolioId }, options) : null;
        const previous = await db.deployments.find({ userId, portfolioId }, options).sort({ version: -1 }).limit(1).next();
        const deployment: DeploymentDoc = { _id: randomUUID(), userId, portfolioId, version: (previous?.version ?? 0) + 1, subdomain: input.slug, customDomain: null, seoIndexable: input.seo.indexable, contactVisibility: input.contactVisibility, publishedAt: at, hasUnpublishedChanges: false, snapshot: snapshot as unknown as JsonObject, seo: input.seo as JsonObject };
        await db.deployments.insertOne(deployment, options);
        const changed = await db.portfolios.updateOne({ _id: portfolioId, userId }, { $set: { currentDeploymentId: deployment._id, status: "published", updatedAt: at } }, options); if (changed.matchedCount !== 1) throw new PublishingError(404, "portfolio not found");
        if (current && current.subdomain !== input.slug) {
          const expiresAt = new Date(at.getTime() + 30 * 24 * 60 * 60 * 1000);
          await db.deploymentSlugRedirects.updateMany({ userId, portfolioId, expiresAt: { $gt: at } }, { $set: { newSlug: input.slug } }, options);
          await db.deploymentSlugRedirects.updateOne({ oldSlug: current.subdomain }, { $set: { userId, portfolioId, oldSlug: current.subdomain, newSlug: input.slug, createdAt: at, expiresAt }, $setOnInsert: { _id: randomUUID() } }, { ...options, upsert: true });
        }
        return deployment;
      });
      return this.#dto(row);
    } catch (error) { if (duplicate(error)) throw new PublishingError(409, "slug is already reserved"); throw error; }
  }

  async listDeployments(userId: string, portfolioId: string) {
    const db = mongoCollections(this.context.db); const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId }); if (!portfolio) throw new PublishingError(404, "portfolio not found");
    const rows = await db.deployments.find({ userId, portfolioId }).sort({ version: -1 }).limit(50).toArray();
    return Promise.all(rows.map(async (row) => { const snapshot = await readSnapshot(this.context, snapshotRefFromStored(row.snapshot)); const sections = snapshot.sections as Array<{ blocks?: unknown[] }> | undefined ?? []; return DeploymentSummarySchema.parse({ id: row._id, version: row.version, slug: row.subdomain, publishedAt: row.publishedAt!.toISOString(), isCurrent: portfolio.currentDeploymentId === row._id, seoIndexable: row.seoIndexable, contactVisibility: row.contactVisibility, sectionCount: sections.length, blockCount: sections.reduce((sum, section) => sum + (section.blocks?.length ?? 0), 0) }); }));
  }

  async getPublic(slug: string, at = new Date()) {
    const db = mongoCollections(this.context.db); const direct = await db.deployments.findOne({ subdomain: slug });
    if (direct) { const portfolio = await db.portfolios.findOne({ _id: direct.portfolioId, currentDeploymentId: direct._id, status: "published" }); if (portfolio) return PublicPortfolioSchema.parse({ kind: "portfolio", deployment: await this.#dto(direct) }); }
    const redirect = await db.deploymentSlugRedirects.findOne({ oldSlug: slug, expiresAt: { $gt: at } });
    if (redirect) { const portfolio = await db.portfolios.findOne({ _id: redirect.portfolioId, userId: redirect.userId, status: "published" }); const deployment = portfolio?.currentDeploymentId ? await db.deployments.findOne({ _id: portfolio.currentDeploymentId, subdomain: redirect.newSlug }) : null; if (deployment) return PublicPortfolioSchema.parse({ kind: "redirect", from: redirect.oldSlug, to: redirect.newSlug, expiresAt: redirect.expiresAt.toISOString() }); }
    throw new PublishingError(404, "published portfolio not found");
  }

  async unpublish(userId: string, portfolioId: string) { const result = await inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); return mongoCollections(tx.db).portfolios.updateOne({ _id: portfolioId, userId, currentDeploymentId: { $ne: null } }, { $set: { status: "unlisted", updatedAt: new Date() } }, { session: tx.session }); }); if (result.matchedCount !== 1) throw new PublishingError(404, "published portfolio not found"); return { portfolioId, status: "unlisted" as const }; }
  async rollback(userId: string, portfolioId: string, deploymentId: string) { const row = await inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session }; const target = await db.deployments.findOne({ _id: deploymentId, userId, portfolioId }, options); if (!target) throw new PublishingError(404, "deployment not found"); const changed = await db.portfolios.updateOne({ _id: portfolioId, userId }, { $set: { currentDeploymentId: target._id, status: "published", updatedAt: new Date() } }, options); if (changed.matchedCount !== 1) throw new PublishingError(404, "portfolio not found"); return target; }); return this.#dto(row); }

  #exportDto(row: ExportJobDoc) { return { id: row._id, portfolioId: row.portfolioId, kind: row.kind, pageFormat: row.pageFormat ?? null, status: row.status, attempts: row.attempts, assetId: row.assetId ?? null, errorCode: row.errorCode ?? null }; }
  async submitExport(userId: string, portfolioId: string, key: string, input: SubmitExport) {
    const hash = digest(input); const row = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const entitlement = await new MongoEntitlementService(tx).check(userId, "export.document"); if (!entitlement.allowed) throw new PublishingError(403, "document export entitlement required");
      const db = mongoCollections(tx.db); const options = { session: tx.session }; const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId }, options); if (!portfolio) throw new PublishingError(404, "portfolio not found");
      const existing = await db.exportJobs.findOne({ userId, idempotencyKey: key }, options); if (existing) { if (existing.requestHash !== hash) throw new PublishingError(409, "idempotency key reused for another export"); return existing; }
      const now = new Date(); const job: ExportJobDoc = { _id: randomUUID(), userId, portfolioId, deploymentId: portfolio.currentDeploymentId ?? null, kind: input.kind, pageFormat: input.pageFormat ?? null, status: "queued", attempts: 0, idempotencyKey: key, requestHash: hash, assetId: null, errorCode: null, createdAt: now, updatedAt: now };
      await db.exportJobs.insertOne(job, options); await addMongoOutboxEvent(tx, { userId, topic: "portfolio.export", payload: { exportJobId: job._id, userId }, idempotencyKey: `portfolio-export:${job._id}` }); return job;
    }); return this.#exportDto(row);
  }
  async getExport(userId: string, id: string) { const row = await mongoCollections(this.context.db).exportJobs.findOne({ _id: id, userId }); if (!row) throw new PublishingError(404, "export job not found"); return this.#exportDto(row); }
  async processExport(id: string) { await inTransaction(this.context, async (tx) => { const db = mongoCollections(tx.db); const options = { session: tx.session }; const job = await db.exportJobs.findOne({ _id: id }, options); if (!job) throw new PublishingError(404, "export job not found"); await requireActiveUser(tx, job.userId); if (job.status === "done") return; const asset: ExportAssetDoc = { _id: randomUUID(), userId: job.userId, portfolioId: job.portfolioId, kind: job.kind, fileUrl: `exports/${job.userId}/${id}.${job.kind}`, pageFormat: job.pageFormat ?? null, downloadCount: 0, version: 1, accessNonce: randomUUID(), revokedAt: null, createdAt: new Date() }; await db.exportAssets.insertOne(asset, options); await db.exportJobs.updateOne({ _id: id, attempts: job.attempts, status: { $ne: "done" } }, { $set: { status: "done", attempts: job.attempts + 1, assetId: asset._id, errorCode: null, updatedAt: new Date() } }, options); }); const row = await mongoCollections(this.context.db).exportJobs.findOne({ _id: id }); if (!row) throw new Error("export job missing"); return this.#exportDto(row); }

  async replaceResume(userId: string, portfolioId: string, fileUrl: string) { return inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); const entitlement = await new MongoEntitlementService(tx).check(userId, "export.document"); if (!entitlement.allowed) throw new PublishingError(403, "resume asset entitlement required"); const db = mongoCollections(tx.db); const options = { session: tx.session }; if (!await db.portfolios.findOne({ _id: portfolioId, userId }, options)) throw new PublishingError(404, "portfolio not found"); const previous = await db.exportAssets.find({ userId, portfolioId, kind: "resume_file" }).sort({ version: -1 }).limit(1).next(); await db.exportAssets.updateMany({ userId, portfolioId, kind: "resume_file", revokedAt: null }, { $set: { revokedAt: new Date(), accessNonce: randomUUID() } }, options); const asset: ExportAssetDoc = { _id: randomUUID(), userId, portfolioId, kind: "resume_file", fileUrl, pageFormat: null, downloadCount: 0, version: (previous?.version ?? 0) + 1, accessNonce: randomUUID(), revokedAt: null, createdAt: new Date() }; await db.exportAssets.insertOne(asset, options); return { id: asset._id, portfolioId, kind: asset.kind, version: asset.version }; }); }
  #signature(asset: ExportAssetDoc, expires: number) { return createHmac("sha256", this.#signingSecret).update(`${asset._id}:${asset.version}:${asset.accessNonce}:${expires}`).digest("hex"); }
  async signAsset(userId: string, assetId: string, ttlSeconds = 300, at = new Date()) { const entitlement = await new MongoEntitlementService(this.context).check(userId, "export.document"); if (!entitlement.allowed) throw new PublishingError(403, "asset entitlement required"); const asset = await mongoCollections(this.context.db).exportAssets.findOne({ _id: assetId, userId, revokedAt: null }); if (!asset) throw new PublishingError(404, "asset not found"); const expires = Math.floor(at.getTime() / 1000) + ttlSeconds; return SignedAssetSchema.parse({ assetId, url: `/v1/public/assets/${assetId}?version=${asset.version}&expires=${expires}&signature=${this.#signature(asset, expires)}`, expiresAt: new Date(expires * 1000).toISOString() }); }
  async resolveAsset(assetId: string, version: number, expires: number, signature: string, at = new Date()) { if (expires <= Math.floor(at.getTime() / 1000)) throw new PublishingError(403, "asset link expired"); const db = mongoCollections(this.context.db); const asset = await db.exportAssets.findOne({ _id: assetId, revokedAt: null }); if (!asset || asset.version !== version) throw new PublishingError(404, "asset not found"); const expected = this.#signature(asset, expires); const actual = Buffer.from(signature); const expectedBytes = Buffer.from(expected); if (actual.length !== expectedBytes.length || !timingSafeEqual(actual, expectedBytes)) throw new PublishingError(403, "invalid asset signature"); await db.exportAssets.updateOne({ _id: assetId, version, revokedAt: null }, { $inc: { downloadCount: 1 } }); return { assetId: asset._id, kind: asset.kind, fileUrl: asset.fileUrl }; }
}

export { PublishingService as MongoPublishingService };
