import { randomUUID } from "node:crypto";

import { LayoutCandidateListResponseSchema } from "@expresso/contracts";
import { mongoCollections, type LayoutSpecDoc } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { ConsentApi } from "../consent/index.js";
import { requireActiveUser } from "../identity/index.js";
import { LayoutRemixError, type LayoutRemixer } from "./remixer.js";
import { LayoutError, parseStoredSpec } from "./public.js";

function mapRow(row: LayoutSpecDoc) {
  return { id: row._id, portfolioId: row.portfolioId, seedTemplateId: row.seedTemplateId ?? null, spec: row.spec, promptVersion: row.promptVersion, editedBy: row.editedBy, orderNo: row.orderNo, instruction: row.instruction ?? null, createdAt: row.createdAt.toISOString() };
}

export class MongoLayoutService {
  readonly #remixer: LayoutRemixer | null; readonly #consent: ConsentApi | null;
  constructor(readonly context: MongoContext, remixer?: LayoutRemixer | null, consent?: ConsentApi | null) {
    this.#remixer = remixer ?? null; this.#consent = consent ?? null;
  }

  async candidates(userId: string, portfolioId: string) {
    const db = mongoCollections(this.context.db);
    if (!await db.portfolios.findOne({ _id: portfolioId, userId })) throw new LayoutError(404, "portfolio not found");
    const latest = await db.layoutSpecs.find({ userId, portfolioId }).sort({ createdAt: -1, orderNo: -1, _id: -1 }).limit(1).next();
    const rows = latest ? await db.layoutSpecs.find({ userId, portfolioId, batchId: latest.batchId }).sort({ orderNo: 1, _id: 1 }).toArray() : [];
    return LayoutCandidateListResponseSchema.parse({ data: { selectedId: rows.find(({ selected }) => selected)?._id ?? null, candidates: rows.map(mapRow) } });
  }

  async select(userId: string, portfolioId: string, layoutId: string) {
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      if (!await db.portfolios.findOne({ _id: portfolioId, userId }, options)) throw new LayoutError(404, "portfolio not found");
      if (!await db.layoutSpecs.findOne({ _id: layoutId, userId, portfolioId }, options)) throw new LayoutError(404, "layout candidate not found");
      await db.layoutSpecs.updateMany({ userId, portfolioId, selected: true }, { $set: { selected: false } }, options);
      await db.layoutSpecs.updateOne({ _id: layoutId, userId, portfolioId }, { $set: { selected: true } }, options);
    });
    return this.candidates(userId, portfolioId);
  }

  async remix(userId: string, portfolioId: string, instruction: string) {
    if (!this.#remixer) throw new LayoutError(503, "layout remix is unavailable");
    await this.#consent?.require(userId, "style_remix");
    const db = mongoCollections(this.context.db);
    const current = await db.layoutSpecs.findOne({ userId, portfolioId, selected: true });
    if (!current) throw new LayoutError(409, "portfolio has no layout to remix");
    const spec = parseStoredSpec(current.spec);
    if (!spec) throw new LayoutError(409, "stored layout is no longer valid");
    const sections = await db.portfolioSections.find({ userId, portfolioId }).toArray();
    const recipeSections = await db.recipeSections.find({ userId, _id: { $in: sections.flatMap(({ recipeSectionId }) => recipeSectionId ? [recipeSectionId] : []) } }).toArray();
    const titles = new Map(sections.map((section) => [section._id, recipeSections.find(({ _id }) => _id === section.recipeSectionId)?.title ?? ""]));
    const blockRows = await db.blocks.find({ userId, portfolioSectionId: { $in: sections.map(({ _id }) => _id) } }).sort({ orderNo: 1, _id: 1 }).toArray();
    const blockIds = spec.sections.flatMap(({ portfolioSectionId }) => blockRows.filter((row) => row.portfolioSectionId === portfolioSectionId).map(({ _id }) => _id));
    let remixed;
    try {
      remixed = await this.#remixer.remix({ instruction, current: spec, sections: spec.sections.map(({ portfolioSectionId }) => ({ portfolioSectionId, title: titles.get(portfolioSectionId) ?? "" })), blockIds });
    } catch (error) {
      if (error instanceof LayoutRemixError) throw new LayoutError(422, error.message);
      throw error;
    }
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const collections = mongoCollections(tx.db); const options = { session: tx.session };
      if (!await collections.portfolios.findOne({ _id: portfolioId, userId }, options)) throw new LayoutError(404, "portfolio not found");
      const stillCurrent = await collections.layoutSpecs.findOne({ _id: current._id, userId, portfolioId, selected: true }, options);
      if (!stillCurrent) throw new LayoutError(409, "layout changed while remixing");
      const last = await collections.layoutSpecs.find({ userId, portfolioId, batchId: current.batchId }, options).sort({ orderNo: -1 }).limit(1).next();
      await collections.layoutSpecs.updateMany({ userId, portfolioId, selected: true }, { $set: { selected: false } }, options);
      await collections.layoutSpecs.insertOne({ _id: randomUUID(), userId, portfolioId, batchId: current.batchId, generationJobId: null, seedTemplateId: null, spec: remixed as never, promptVersion: current.promptVersion, editedBy: "user", orderNo: (last?.orderNo ?? -1) + 1, selected: true, createdAt: new Date(), instruction }, options);
    });
    return this.candidates(userId, portfolioId);
  }
}
