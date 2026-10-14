import { CareerWriteOperationResponseSchema, UuidSchema, type CareerProducerIntent, type CareerWriteOperation } from "@expresso/contracts";
import type { Document } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { CAREER_PRODUCER_COLLECTIONS, validateCareerProducerIntent } from "./prepared-producer.js";

/** Public 응답에는 owner 결과의 상태와 record identity만 포함합니다. */
export function publicCareerWriteOperation(intent: CareerProducerIntent): CareerWriteOperation {
  const recordId = intent.businessResult?.data.id ?? (intent.business?.kind === "patch" ? intent.business.recordId : null) ?? intent.document?.recordId ?? null;
  const state = intent.state === "blocked" ? "recovery-required" : intent.state;
  return CareerWriteOperationResponseSchema.parse({ data: {
    operationId: intent.operationId, producer: intent.producer, state, recordId,
    owners: { business: !intent.business ? "not-required" : intent.businessResult ? "completed" : "pending", document: !intent.document ? "not-required" : intent.documentResult ? "completed" : "pending" },
    statusUrl: "/v1/career/write-operations/"+intent.operationId,
    retryable: ["pending", "running", "retry"].includes(state), updatedAt: intent.updatedAt,
  } }).data;
}
export async function getCareerWriteOperation(context: MongoContext, userId: string, rawId: string) {
  const operationId = UuidSchema.parse(rawId);
  return inTransaction(context, async tx => {
    await requireActiveUser(tx, userId);
    const matches: CareerProducerIntent[] = [];
    for (const [producer, collection] of Object.entries(CAREER_PRODUCER_COLLECTIONS)) {
      const rows = await tx.db.collection<Document & {_id:string}>(collection).find({ userId, $or: [
        { "writerIntegration.operationId": operationId }, { writerIntegrationHistory: { $elemMatch: { operationId } } },
      ] }, { session: tx.session }).limit(2).toArray();
      for (const row of rows) {
        for (const raw of [row.writerIntegration, ...(row.writerIntegrationHistory ?? [])]) {
          if (raw?.operationId !== operationId) continue;
          const intent = validateCareerProducerIntent(raw);
          if (intent.producer !== producer || intent.userId !== userId || intent.sourceId !== row._id || intent.businessResult && intent.businessResult.data.userId !== userId) throw new CareerError(409, "Career operation binding changed");
          matches.push(intent);
        }
      }
    }
    if (matches.length === 0) throw new CareerError(404, "Career operation not found");
    if (matches.length !== 1) throw new CareerError(409, "Career operation identity is ambiguous");
    return CareerWriteOperationResponseSchema.parse({ data: publicCareerWriteOperation(matches[0]!) });
  });
}
