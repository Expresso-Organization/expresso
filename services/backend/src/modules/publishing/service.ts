import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { DeploymentSchema, DeploymentSummarySchema, GeneratedPageDeploymentSnapshotSchema, PageStyleGrammarSchema, PublicPortfolioSchema, SignedAssetSchema, pageDocument, type PublishPortfolio } from "@expresso/contracts";
import { mongoCollections, type DeploymentDoc, type ExportAssetDoc, type JsonObject } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { readSnapshot, snapshotRefFromStored, writeSnapshot } from "../../platform/snapshot-payload.js";
import { MongoEntitlementService } from "../entitlements/index.js";
import { requireActiveUser } from "../identity/index.js";
import { pageOutline } from "./outline.js";
import { PublishingError } from "./public.js";

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
    const document = pageDocument({ html: page.html, css: page.css, title: portfolio.title, description: page.rationale, ...(grammar ? { grammar } : {}) });
    return { portfolioId, title: portfolio.title, templateId: portfolio.templateId, sections: sections.map((section) => ({ id: section._id, order: section.orderNo, visible: section.visible, blocks: blocks.filter(({ portfolioSectionId: id }) => id === section._id).map((block) => ({ id: block._id, kind: block.kind, content: block.content, style: block.style, locked: block.locked })) })), generatedPage: GeneratedPageDeploymentSnapshotSchema.parse({ id: page._id, revision: page.revision, document }), outline: pageOutline(document, portfolioId) };
  }

  async #dto(row: DeploymentDoc) {
    const snapshot = await readSnapshot(this.context, snapshotRefFromStored(row.snapshot));
    return DeploymentSchema.parse({ id: row._id, portfolioId: row.portfolioId, version: row.version, slug: row.subdomain, snapshot, seo: row.seo, contactVisibility: row.contactVisibility, publishedAt: row.publishedAt!.toISOString() });
  }

  /**
   * 주소는 포트폴리오가 가진다(`portfolios.publicSlug`). 같은 주소로 몇 번이든 새 판을
   * 올리고, `deployments.subdomain`에는 그 판을 올릴 때의 주소만 남는다.
   */
  async publish(userId: string, portfolioId: string, input: PublishPortfolio, at = new Date()) {
    try {
      const row = await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session };
        const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId }, options); if (!portfolio) throw new PublishingError(404, "portfolio not found");
        // 다른 포트폴리오가 가진 주소이거나, 다른 포트폴리오가 옛 주소로 아직 넘겨 주는 중이면 받을 수 없다.
        const holder = await db.portfolios.findOne({ publicSlug: input.slug, _id: { $ne: portfolioId } }, options);
        const forwarding = await db.deploymentSlugRedirects.findOne({ oldSlug: input.slug, portfolioId: { $ne: portfolioId }, expiresAt: { $gt: at } }, options);
        if (holder || forwarding) throw new PublishingError(409, "slug is already reserved");
        const snapshotValue = await this.#snapshot(tx, userId, portfolioId); const snapshot = await writeSnapshot(tx, userId, snapshotValue);
        const previous = await db.deployments.find({ userId, portfolioId }, options).sort({ version: -1 }).limit(1).next();
        const deployment: DeploymentDoc = { _id: randomUUID(), userId, portfolioId, version: (previous?.version ?? 0) + 1, subdomain: input.slug, customDomain: null, seoIndexable: input.seo.indexable, contactVisibility: input.contactVisibility, publishedAt: at, hasUnpublishedChanges: false, generatedPageId: snapshotValue.generatedPage.id, snapshot: snapshot as unknown as JsonObject, seo: input.seo as JsonObject };
        await db.deployments.insertOne(deployment, options);
        const changed = await db.portfolios.updateOne({ _id: portfolioId, userId }, { $set: { currentDeploymentId: deployment._id, publicSlug: input.slug, status: "published", updatedAt: at } }, options); if (changed.matchedCount !== 1) throw new PublishingError(404, "portfolio not found");
        const previousSlug = portfolio.publicSlug ?? null;
        if (previousSlug && previousSlug !== input.slug) {
          const expiresAt = new Date(at.getTime() + 30 * 24 * 60 * 60 * 1000);
          await db.deploymentSlugRedirects.updateMany({ userId, portfolioId, expiresAt: { $gt: at } }, { $set: { newSlug: input.slug } }, options);
          await db.deploymentSlugRedirects.updateOne({ oldSlug: previousSlug }, { $set: { userId, portfolioId, oldSlug: previousSlug, newSlug: input.slug, createdAt: at, expiresAt }, $setOnInsert: { _id: randomUUID() } }, { ...options, upsert: true });
        }
        // 옛 주소로 돌아왔으면 그 주소에서 넘겨 주던 것은 지운다.
        await db.deploymentSlugRedirects.deleteMany({ oldSlug: input.slug, portfolioId }, options);
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
    const db = mongoCollections(this.context.db);
    const portfolio = await db.portfolios.findOne({ publicSlug: slug, status: "published" });
    const current = portfolio?.currentDeploymentId ? await db.deployments.findOne({ _id: portfolio.currentDeploymentId, portfolioId: portfolio._id }) : null;
    if (current) return PublicPortfolioSchema.parse({ kind: "portfolio", deployment: await this.#dto(current) });
    const redirect = await db.deploymentSlugRedirects.findOne({ oldSlug: slug, expiresAt: { $gt: at } });
    if (redirect) { const target = await db.portfolios.findOne({ _id: redirect.portfolioId, userId: redirect.userId, publicSlug: redirect.newSlug, status: "published" }); if (target) return PublicPortfolioSchema.parse({ kind: "redirect", from: redirect.oldSlug, to: redirect.newSlug, expiresAt: redirect.expiresAt.toISOString() }); }
    throw new PublishingError(404, "published portfolio not found");
  }

  async unpublish(userId: string, portfolioId: string) { const result = await inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); return mongoCollections(tx.db).portfolios.updateOne({ _id: portfolioId, userId, currentDeploymentId: { $ne: null } }, { $set: { status: "unlisted", updatedAt: new Date() } }, { session: tx.session }); }); if (result.matchedCount !== 1) throw new PublishingError(404, "published portfolio not found"); return { portfolioId, status: "unlisted" as const }; }
  async rollback(userId: string, portfolioId: string, deploymentId: string) { const row = await inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session }; const target = await db.deployments.findOne({ _id: deploymentId, userId, portfolioId }, options); if (!target) throw new PublishingError(404, "deployment not found"); const changed = await db.portfolios.updateOne({ _id: portfolioId, userId }, { $set: { currentDeploymentId: target._id, status: "published", updatedAt: new Date() } }, options); if (changed.matchedCount !== 1) throw new PublishingError(404, "portfolio not found"); return target; }); return this.#dto(row); }

  async replaceResume(userId: string, portfolioId: string, fileUrl: string) { return inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); const entitlement = await new MongoEntitlementService(tx).check(userId, "export.document"); if (!entitlement.allowed) throw new PublishingError(403, "resume asset entitlement required"); const db = mongoCollections(tx.db); const options = { session: tx.session }; if (!await db.portfolios.findOne({ _id: portfolioId, userId }, options)) throw new PublishingError(404, "portfolio not found"); const previous = await db.exportAssets.find({ userId, portfolioId, kind: "resume_file" }).sort({ version: -1 }).limit(1).next(); await db.exportAssets.updateMany({ userId, portfolioId, kind: "resume_file", revokedAt: null }, { $set: { revokedAt: new Date(), accessNonce: randomUUID() } }, options); const asset: ExportAssetDoc = { _id: randomUUID(), userId, portfolioId, kind: "resume_file", fileUrl, pageFormat: null, downloadCount: 0, version: (previous?.version ?? 0) + 1, accessNonce: randomUUID(), revokedAt: null, createdAt: new Date() }; await db.exportAssets.insertOne(asset, options); return { id: asset._id, portfolioId, kind: asset.kind, version: asset.version }; }); }
  #signature(asset: ExportAssetDoc, expires: number) { return createHmac("sha256", this.#signingSecret).update(`${asset._id}:${asset.version}:${asset.accessNonce}:${expires}`).digest("hex"); }
  async signAsset(userId: string, assetId: string, ttlSeconds = 300, at = new Date()) { const entitlement = await new MongoEntitlementService(this.context).check(userId, "export.document"); if (!entitlement.allowed) throw new PublishingError(403, "asset entitlement required"); const asset = await mongoCollections(this.context.db).exportAssets.findOne({ _id: assetId, userId, revokedAt: null }); if (!asset) throw new PublishingError(404, "asset not found"); const expires = Math.floor(at.getTime() / 1000) + ttlSeconds; return SignedAssetSchema.parse({ assetId, url: `/v1/public/assets/${assetId}?version=${asset.version}&expires=${expires}&signature=${this.#signature(asset, expires)}`, expiresAt: new Date(expires * 1000).toISOString() }); }
  async resolveAsset(assetId: string, version: number, expires: number, signature: string, at = new Date()) { if (expires <= Math.floor(at.getTime() / 1000)) throw new PublishingError(403, "asset link expired"); const db = mongoCollections(this.context.db); const asset = await db.exportAssets.findOne({ _id: assetId, revokedAt: null }); if (!asset || asset.version !== version) throw new PublishingError(404, "asset not found"); const expected = this.#signature(asset, expires); const actual = Buffer.from(signature); const expectedBytes = Buffer.from(expected); if (actual.length !== expectedBytes.length || !timingSafeEqual(actual, expectedBytes)) throw new PublishingError(403, "invalid asset signature"); await db.exportAssets.updateOne({ _id: assetId, version, revokedAt: null }, { $inc: { downloadCount: 1 } }); return { assetId: asset._id, kind: asset.kind, fileUrl: asset.fileUrl }; }
}

export { PublishingService as MongoPublishingService };
