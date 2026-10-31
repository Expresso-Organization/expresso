import { randomUUID } from "node:crypto";
import { CareerProducerBusinessCommandSchema, CareerProducerDocumentCommandSchema, CareerProducerScopeSchema, IdempotencyKeySchema, UuidSchema, type CareerProducerBusinessCommand, type CareerProducerDocumentCommand, type CareerProducerIntent, type CareerProducerScope } from "@expresso/contracts";
import { mongoCollections, type CareerProductOperationDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { assertActiveRecordsForWrite } from "./mongo-record-guard.js";
import { createCareerProducerIntent, validateCareerProducerIntent, careerProducerScopeFilter, type CareerProducerCoordinator } from "./prepared-producer.js";

export interface CareerProductWriteMetadata { kind: "create" | "patch"; recordId: string | null; expectedBusinessVersion?: number }
/** 제품 intent와 reference fence만 저장하고 business/document 내용은 owner에 위임합니다. */
export class PreparedCareerProductWrites {
  constructor(readonly context: MongoContext, readonly coordinator: Pick<CareerProducerCoordinator, "execute">) {}
  private replay(row: CareerProductOperationDoc, userId: string, inputHash: string, metadata: CareerProductWriteMetadata) {
    const intent = validateCareerProducerIntent(row.writerIntegration);
    if (row.userId !== userId || row.inputHash !== inputHash || row.kind !== metadata.kind || row.recordId !== metadata.recordId || row.requestHash !== intent.fingerprint || row._id !== intent.operationId || row._id !== intent.sourceId || intent.producer !== "career-product" || intent.userId !== userId) throw new CareerError(409, "Career idempotency key was reused for another write");
    return { scope: CareerProducerScopeSchema.parse(intent), created: false };
  }
  async findPrepared(userId:string, rawKey:string, inputHash:string):Promise<CareerProducerScope|null> {
    UuidSchema.parse(userId);const key=IdempotencyKeySchema.parse(rawKey);
    if(!/^[a-f0-9]{64}$/.test(inputHash))throw new CareerError(400,"Career input fingerprint is invalid");
    return inTransaction(this.context,async tx=>{
      await requireActiveUser(tx,userId);
      const row=await mongoCollections(tx.db).careerProductOperations.findOne({userId,inputIdempotencyKey:key},{session:tx.session});
      if(!row)return null;
      return this.replay(row,userId,inputHash,{kind:row.kind,recordId:row.recordId}).scope;
    });
  }
  async prepareWithStatus(userId: string, rawKey: string, inputHash: string, rawBusiness: CareerProducerBusinessCommand | null, rawDocument: CareerProducerDocumentCommand | null, metadata: CareerProductWriteMetadata) {
    UuidSchema.parse(userId); const key = IdempotencyKeySchema.parse(rawKey);
    if (!/^[a-f0-9]{64}$/.test(inputHash)) throw new CareerError(400, "Career input fingerprint is invalid");
    const business = rawBusiness === null ? null : CareerProducerBusinessCommandSchema.parse(rawBusiness);
    const document = rawDocument === null ? null : CareerProducerDocumentCommandSchema.parse(rawDocument);
    if (!business && !document || metadata.kind === "create" && (metadata.recordId !== null || business?.kind !== "create" || document && (document.kind !== "markdown" || document.recordId !== null || document.expectedVersion !== 0)) || metadata.kind === "patch" && (!UuidSchema.safeParse(metadata.recordId).success || business && (business.kind !== "patch" || business.recordId !== metadata.recordId || business.patches.length !== 1) || document && document.recordId !== metadata.recordId)) throw new CareerError(400, "Career owner command binding is invalid");
    const make = () => inTransaction(this.context, async tx => {
      await requireActiveUser(tx, userId); const db = mongoCollections(tx.db), options = { session: tx.session };
      const existing = await db.careerProductOperations.findOne({ userId, inputIdempotencyKey: key }, options);
      if (existing) return this.replay(existing, userId, inputHash, metadata);
      const record = metadata.kind === "patch" ? await db.careerRecords.findOne({ _id: metadata.recordId!, userId, deletedAt: null }, options) : null;
      if (metadata.kind === "patch" && !record) throw new CareerError(404, "Career record not found");
      if (record) {
        const expected = business?.kind === "patch" ? business.expectedVersion : metadata.expectedBusinessVersion;
        if (!Number.isSafeInteger(expected) || expected! < 1) throw new CareerError(400, "Career If-Match is required");
        if (record.version !== expected) throw new CareerError(412, "Career version is stale");
        if (document && (record.documentVersion ?? 0) !== document.expectedVersion) throw new CareerError(409, "Career document version is stale");
        await assertActiveRecordsForWrite(tx, userId, [record._id]);
      }
      const categoryId = business?.kind === "create" ? business.input.categoryId : record?.categoryId;
      if (!categoryId) throw new CareerError(400, "Career category binding is invalid");
      const category = await db.careerCategories.findOne({ _id: categoryId, userId }, options);
      if (!category) throw new CareerError(404, "Career category not found");
      if (business && category.version !== business.expectedCategoryVersion) throw new CareerError(412, "Career category version is stale");
      if (business && (!Array.isArray(category.propertySchemaV2) || !Number.isSafeInteger(category.schemaVersion) || category.schemaVersion! < 1)) throw new CareerError(409, "CANONICAL_SCHEMA_NOT_PREPARED");
      if (business) {
        const job = await db.careerPropertyMutations.findOne({ userId, categoryId, active: true }, options);
        if (job) throw new CareerError(409, "Career schema mutation is active", { mutationId: job._id, status: job.status, retryable: true });
      }
      const operationId = randomUUID(), now = new Date();
      const intent = createCareerProducerIntent({ producer: "career-product", userId, sourceId: operationId, operationId, business, document });
      await db.careerProductOperations.insertOne({ _id: operationId, userId, inputIdempotencyKey: key, inputHash, requestHash: intent.fingerprint, kind: metadata.kind, recordId: metadata.recordId, writerIntegration: intent, active: true, result: null, createdAt: now, updatedAt: now }, options);
      return { scope: CareerProducerScopeSchema.parse(intent), created: true };
    });
    try { return await make(); }
    catch (error) {
      if ((error as {code?:number}).code !== 11000) throw error;
      return inTransaction(this.context, async tx => {
        await requireActiveUser(tx, userId);
        const replay = await mongoCollections(tx.db).careerProductOperations.findOne({ userId, inputIdempotencyKey: key }, { session: tx.session });
        if (!replay) throw new CareerError(409, "Career record has another pending operation");
        return this.replay(replay, userId, inputHash, metadata);
      });
    }
  }
  async prepare(userId: string, key: string, inputHash: string, business: CareerProducerBusinessCommand | null, document: CareerProducerDocumentCommand | null, metadata: CareerProductWriteMetadata) {
    return (await this.prepareWithStatus(userId, key, inputHash, business, document, metadata)).scope;
  }
  async execute(raw: CareerProducerScope): Promise<CareerProducerIntent> {
    const scope = CareerProducerScopeSchema.parse(raw);
    if (scope.producer !== "career-product" || scope.sourceId !== scope.operationId) throw new CareerError(409, "Career product operation scope is invalid");
    return this.coordinator.execute(scope, async (tx: MongoTransaction, intent) => {
      const db = mongoCollections(tx.db), options = { session: tx.session };
      const source = await db.careerProductOperations.findOne(careerProducerScopeFilter(scope), options);
      if (!source || !source.active || source._id !== scope.operationId || source.requestHash !== scope.fingerprint) throw new CareerError(409, "Career product source changed");
      const recordId = intent.businessResult?.data.id ?? intent.documentResult?.recordId;
      if (!recordId || source.kind === "patch" && source.recordId !== recordId || intent.businessResult && intent.documentResult && intent.businessResult.data.id !== intent.documentResult.recordId) throw new CareerError(409, "Career owner receipt identity changed");
      const record = await db.careerRecords.findOne({ _id: recordId, userId: scope.userId, deletedAt: null }, options);
      if (!record) throw new CareerError(404, "Career owner record is no longer active");
      await assertActiveRecordsForWrite(tx, scope.userId, [recordId]);
      const finalized = await db.careerProductOperations.updateOne({ ...careerProducerScopeFilter(scope), active: true }, { $set: { active: false, result: { recordId, version: record.version }, updatedAt: new Date() } }, options);
      if (finalized.matchedCount !== 1) throw new CareerError(409, "Career product finalization changed");
    });
  }
}
