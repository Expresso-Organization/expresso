import { randomUUID } from "node:crypto";
import { CompanyResearchItemSchema, ReplaceCompanyResearchSchema, type ReplaceCompanyResearch } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import type { ClientSession } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import type { CompanyResearchApi } from "./index.js";
import { CompanyResearchError } from "./public.js";

export class MongoCompanyResearchService implements CompanyResearchApi {
  constructor(readonly context: MongoContext) {}
  async #companyId(userId: string, brewId: string, session?: ClientSession) {
    const db = mongoCollections(this.context.db); const options = session ? { session } : {};
    const brew = await db.brews.findOne({ _id: brewId, userId }, options);
    const analysis = brew ? await db.jobAnalyses.findOne({ _id: brew.jobAnalysisId, userId }, options) : null;
    const posting = analysis?.jobPostingId ? await db.jobPostings.findOne({ _id: analysis.jobPostingId }, options) : null;
    if (!posting) throw new CompanyResearchError(404, "brew not found");
    return posting.companyId;
  }

  async list(userId: string, brewId: string) {
    const companyId = await this.#companyId(userId, brewId);
    const rows = await mongoCollections(this.context.db).companyResearchItems.find({ userId, companyId }).sort({ kind: 1, capturedAt: -1, _id: 1 }).toArray();
    return rows.map((row) => CompanyResearchItemSchema.parse({ id: row._id, companyId, kind: row.kind, topic: row.topic, statement: row.statement, sourceUrl: row.sourceUrl ?? null, publishedAt: row.publishedAt?.toISOString() ?? null, capturedAt: row.capturedAt.toISOString(), confidence: row.confidence, basisFactIds: row.basisFactIds }));
  }

  async replace(userId: string, brewId: string, inputValue: ReplaceCompanyResearch) {
    const input = ReplaceCompanyResearchSchema.parse(inputValue);
    for (const [index, item] of input.items.entries()) {
      if (item.kind === "fact" && !item.sourceUrl) throw new CompanyResearchError(422, `fact ${index + 1} requires sourceUrl`);
      if (item.kind === "fact" && item.basisFactIndexes.length) throw new CompanyResearchError(422, `fact ${index + 1} cannot reference basis facts`);
      if (item.kind === "signal" && !item.basisFactIndexes.length) throw new CompanyResearchError(422, `signal ${index + 1} requires basis facts`);
      for (const factIndex of item.basisFactIndexes) if (input.items[factIndex]?.kind !== "fact") throw new CompanyResearchError(422, `signal ${index + 1} references a non-fact item`);
    }
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const companyId = await this.#companyId(userId, brewId, tx.session);
      const collection = mongoCollections(tx.db).companyResearchItems;
      const ids = input.items.map(() => randomUUID());
      await collection.deleteMany({ userId, companyId }, { session: tx.session });
      if (input.items.length) await collection.insertMany(input.items.map((item, index) => ({ _id: ids[index]!, userId, companyId, kind: item.kind, topic: item.topic, statement: item.statement, sourceUrl: item.sourceUrl, publishedAt: item.publishedAt ? new Date(item.publishedAt) : null, capturedAt: new Date(), confidence: item.confidence, basisFactIds: item.basisFactIndexes.map((factIndex) => ids[factIndex]!) })), { session: tx.session });
    });
    return this.list(userId, brewId);
  }
}
