import { createHash, randomUUID } from "node:crypto";

import { CreateMediaBlockSchema, MEDIA_MAX_BYTES, MediaAssetSchema, PortfolioMediaSchema, type CreateMediaBlock } from "@expresso/contracts";
import { mongoCollections, type MediaAssetDoc } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { readImageMeta, UnsupportedImageError } from "../../platform/storage/image.js";
import { buildVariants, orientedSize } from "../../platform/storage/transcode.js";
import { storageKeyFor, type MediaStorage } from "../../platform/storage/client.js";
import { requireActiveUser } from "../identity/index.js";
import { MediaError } from "./public.js";

function dto(row: MediaAssetDoc, variants: number[] = []) { return MediaAssetSchema.parse({ id: row._id, mimeType: row.mimeType, width: row.width, height: row.height, bytes: row.byteSize, variants: [...variants].sort((a, b) => a - b), createdAt: row.createdAt.toISOString() }); }

export class MediaService {
  constructor(readonly context: MongoContext, readonly storage: MediaStorage) {}
  async upload(userId: string, bytes: Buffer) {
    if (!bytes.length) throw new MediaError(400, "빈 파일입니다");
    if (bytes.length > MEDIA_MAX_BYTES) throw new MediaError(413, `한 장은 ${Math.floor(MEDIA_MAX_BYTES / 1024 / 1024)}MB까지입니다`);
    let meta; try { meta = readImageMeta(bytes); } catch (error) { if (error instanceof UnsupportedImageError) throw new MediaError(415, error.message); throw error; }
    await inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); });
    const display = await orientedSize(bytes, meta); const checksum = createHash("sha256").update(bytes).digest("hex"); const db = mongoCollections(this.context.db);
    const existing = await db.mediaAssets.findOne({ userId, checksum }); if (existing) return dto(existing, await this.#widths(existing._id));
    const id = randomUUID(); const key = storageKeyFor(userId, id); const variants = await buildVariants(bytes, meta); const written = [key, ...variants.map((item) => `${key}@${item.width}.webp`)];
    try {
      await this.storage.put(key, bytes, meta.mimeType);
      for (const variant of variants) await this.storage.put(`${key}@${variant.width}.webp`, variant.bytes, variant.mimeType);
      const row = await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, userId); const collections = mongoCollections(tx.db); const options = { session: tx.session };
        const duplicate = await collections.mediaAssets.findOne({ userId, checksum }, options); if (duplicate) return duplicate;
        const now = new Date(); const asset: MediaAssetDoc = { _id: id, userId, storageKey: key, mimeType: meta.mimeType, width: display.width, height: display.height, byteSize: bytes.length, checksum, createdAt: now };
        await collections.mediaAssets.insertOne(asset, options);
        if (variants.length) await collections.mediaVariants.insertMany(variants.map((variant) => ({ _id: randomUUID(), userId, mediaAssetId: id, storageKey: `${key}@${variant.width}.webp`, mimeType: variant.mimeType, width: variant.width, height: variant.height, byteSize: variant.bytes.length, createdAt: now })), options);
        return asset;
      });
      if (row._id !== id) { await Promise.allSettled(written.map((path) => this.storage.delete(path))); return dto(row, await this.#widths(row._id)); }
      return dto(row, variants.map(({ width }) => width));
    } catch (error) { await Promise.allSettled(written.map((path) => this.storage.delete(path))); const raced = await db.mediaAssets.findOne({ userId, checksum }); if (raced) return dto(raced, await this.#widths(raced._id)); throw error; }
  }
  async #widths(assetId: string) { return (await mongoCollections(this.context.db).mediaVariants.find({ mediaAssetId: assetId }).sort({ width: 1 }).toArray()).map(({ width }) => width); }
  async read(assetId: string, width?: number) { const db = mongoCollections(this.context.db); const row = await db.mediaAssets.findOne({ _id: assetId, storageKey: { $ne: "" } }); if (!row) throw new MediaError(404, "asset not found"); const variants = width === undefined ? [] : await db.mediaVariants.find({ mediaAssetId: assetId }).sort({ width: 1 }).toArray(); const fitting = variants.filter((item) => item.width <= (width ?? 0)); const target = width === undefined || !variants.length ? row : fitting.at(-1) ?? variants[0]!; const stored = await this.storage.get(target.storageKey); if (!stored) throw new MediaError(404, "asset bytes are missing"); return { bytes: stored.bytes, mimeType: target.mimeType as MediaAssetDoc["mimeType"] }; }
  async list(userId: string) { const db = mongoCollections(this.context.db); const rows = await db.mediaAssets.find({ userId, storageKey: { $ne: "" } }).sort({ createdAt: -1 }).limit(60).toArray(); return Promise.all(rows.map(async (row) => dto(row, await this.#widths(row._id)))); }
  async addBlock(userId: string, portfolioId: string, sectionId: string, input: CreateMediaBlock) { const parsed = CreateMediaBlockSchema.parse(input); return inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const options = { session: tx.session }; if (!await db.portfolioSections.findOne({ _id: sectionId, userId, portfolioId }, options)) throw new MediaError(404, "section not found"); const asset = await db.mediaAssets.findOne({ _id: parsed.assetId, userId }, options); if (!asset) throw new MediaError(404, "asset not found"); const blocks = await db.blocks.find({ userId, portfolioSectionId: sectionId }, options).sort({ orderNo: 1, _id: 1 }).toArray(); const anchor = parsed.afterBlockId ? blocks.find(({ _id }) => _id === parsed.afterBlockId) : undefined; if (parsed.afterBlockId && !anchor) throw new MediaError(404, "anchor block not found"); const at = anchor ? anchor.orderNo + 1 : (blocks.at(-1)?.orderNo ?? -1) + 1; await db.blocks.updateMany({ userId, portfolioSectionId: sectionId, orderNo: { $gte: at } }, { $inc: { orderNo: 1 } }, options); const variants = await db.mediaVariants.find({ userId, mediaAssetId: asset._id }, options).sort({ width: 1 }).toArray(); const content = PortfolioMediaSchema.parse({ assetId: asset._id, alt: parsed.alt, ...(parsed.caption === undefined ? {} : { caption: parsed.caption }), frame: parsed.frame, width: asset.width, height: asset.height, variants: variants.map(({ width }) => width) }); const blockId = randomUUID(); await db.blocks.insertOne({ _id: blockId, userId, portfolioSectionId: sectionId, kind: "media", content: content as never, style: {}, sourceRecordId: null, syncState: "detached", locked: true, orderNo: at }, options); await db.revisions.insertOne({ _id: randomUUID(), userId, portfolioId, blockId, actor: "user", before: null, after: content as never, changeKind: "edit", summary: "이미지를 놓았습니다", createdAt: new Date() }, options); return { blockId, sectionId, assetId: asset._id }; }); }
}

export { MediaService as MongoMediaService };
