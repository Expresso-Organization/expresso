import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

const uuid = { bsonType: "string", pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89ab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$" };
const hash = { bsonType: "string", pattern: "^[a-f0-9]{64}$" };
const count = { bsonType: ["int", "long", "double"], minimum: 0, maximum: 9007199254740991, multipleOf: 1 };
const nullableUuid = { ...uuid, bsonType: ["string", "null"] };
const timestamp = { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?Z$" };
function scope(producers: string[]): Document {
  return { bsonType: "object", additionalProperties: false,
    required: ["producer", "userId", "sourceId", "operationId", "fingerprint"],
    properties: { producer: { enum: producers }, userId: uuid, sourceId: uuid, operationId: uuid, fingerprint: hash } };
}
function intent(producer: string): Document {
  const base = scope([producer]);
  return { ...base, required: [...base.required, "business", "document", "state", "leaseToken", "leaseUntil", "attempts", "fence", "businessResult", "documentResult", "lastError", "createdAt", "updatedAt"],
    properties: { ...base.properties,
      business: { bsonType: ["object", "null"] }, document: { bsonType: ["object", "null"] },
      state: { enum: ["pending", "running", "retry", "completed", "cancelled", "blocked"] },
      leaseToken: nullableUuid, leaseUntil: { ...timestamp, bsonType: ["string", "null"] }, attempts: count, fence: count,
      businessResult: { bsonType: ["object", "null"] }, documentResult: { bsonType: ["object", "null"] },
      lastError: { enum: [null, "OWNER_CALL_FAILED", "LEASE_LOST", "FINALIZE_FAILED", "OWNER_CONFLICT", "RECOVERY_ATTEMPTS_EXHAUSTED"] },
      createdAt: timestamp, updatedAt: timestamp } };
}
async function extend(db: Db, name: string, fields: Document): Promise<void> {
  const info = await db.listCollections({ name }).next();
  if (!info || !("options" in info) || !info.options?.validator?.$jsonSchema) throw new Error("product owner source validator missing");
  // 이미 적용된 schema의 다른 필드는 유지하고 이번 버전의 명시적 필드만 확장합니다.
  const validator = structuredClone(info.options.validator) as Document;
  Object.assign(validator.$jsonSchema.properties, fields);
  await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
}
export async function careerProductOwnerPreparationSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "career_product_operations:durable_intent", async run(db) {
      const name = "career_product_operations", productIntent = intent("career-product");
      const properties: Document = {
        _id: uuid, userId: uuid, inputIdempotencyKey: { bsonType:"string", minLength:16, maxLength:128, pattern:"^[A-Za-z0-9._~:+/\\-]+$" }, inputHash: hash, requestHash: hash,
        kind: { enum: ["create", "patch"] }, recordId: nullableUuid, writerIntegration: productIntent,
        active: { bsonType: "bool" }, result: { bsonType: ["object", "null"], additionalProperties: false,
          required: ["recordId", "version"], properties: { recordId: uuid, version: { ...count, minimum: 1 } } },
        createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
      };
      const validator = { $and: [
        { $jsonSchema: { bsonType: "object", additionalProperties: false, required: Object.keys(properties), properties } },
        { $expr: { $and: [
          { $eq: ["$_id", "$writerIntegration.sourceId"] }, { $eq: ["$_id", "$writerIntegration.operationId"] },
          { $eq: ["$userId", "$writerIntegration.userId"] }, { $eq: ["$requestHash", "$writerIntegration.fingerprint"] },
          { $or: [{ $ne: ["$writerIntegration.business", null] }, { $ne: ["$writerIntegration.document", null] }] },
          { $or: [{ $eq: ["$kind", "$writerIntegration.business.kind"] }, { $and: [{ $eq: ["$kind", "patch"] }, { $eq: ["$writerIntegration.business", null] }] }] },
          { $cond: [{ $eq: ["$kind", "create"] }, { $eq: ["$recordId", null] }, { $and: [
            { $ne: ["$recordId", null] },
            { $or: [{ $eq: ["$writerIntegration.business", null] }, { $eq: ["$recordId", "$writerIntegration.business.recordId"] }] },
            { $or: [{ $eq: ["$writerIntegration.document", null] }, { $eq: ["$recordId", "$writerIntegration.document.recordId"] }] },
          ] }] },
        ] } },
      ] };
      if (await db.listCollections({ name }).hasNext()) await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
      else await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error", collation: { locale: "simple" } });
      await db.collection(name).createIndexes([
        { name: "career_product_input_key", key: { userId: 1, inputIdempotencyKey: 1 }, unique: true, collation: { locale: "simple" } },
        { name: "career_product_active_record", key: { userId: 1, recordId: 1 }, unique: true, partialFilterExpression: { active: true, kind: "patch" }, collation: { locale: "simple" } },
        { name: "career_product_recovery", key: { "writerIntegration.state": 1, "writerIntegration.leaseUntil": 1, updatedAt: 1 } },
      ]);
    } },
    { id: "career_ai_proposals:bounded_recovery", async run(db) {
      const aiIntent = intent("ai-proposal");
      await extend(db, "career_ai_proposals", { writerIntegration: aiIntent, writerIntegrationHistory: { bsonType: "array", items: aiIntent } });
      await db.collection("career_ai_proposals").createIndex({ "writerIntegration.state": 1, "writerIntegration.leaseUntil": 1, updatedAt: 1 }, { name: "career_ai_writer_recovery" });
    } },
    { id: "interview_career_operations:bounded_recovery", async run(db) {
      await extend(db, "interview_career_operations", { writerIntegration: intent("interview") });
    } },
    { id: "career_records:product_document_reservation", async run(db) {
      await extend(db, "career_records", { documentReservation: scope(["ai-proposal", "interview", "career-product"]) });
    } },
  ];
}
