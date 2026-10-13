import type { MongoMigrationStep } from "../../mongo-migrations.js";
export async function careerGapSteps(): Promise<MongoMigrationStep[]> {
  return [{ id: "job_career_gaps:create", async run(db) {
    if (!await db.listCollections({ name: "job_career_gaps" }, { nameOnly: true }).hasNext()) {
      await db.createCollection("job_career_gaps", { validator: { $jsonSchema: {
        bsonType: "object", required: ["_id", "userId", "conversationId", "requestId", "messageIds", "inputFingerprint", "status", "attemptId", "leaseUntil", "createdAt", "result"],
        properties: {
          _id: { bsonType: "string" }, userId: { bsonType: "string" }, conversationId: { bsonType: "string" }, requestId: { bsonType: "string" },
          messageIds: { bsonType: "array", maxItems: 20, items: { bsonType: "string" } },
          inputFingerprint: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
          status: { enum: ["running", "completed", "failed"] }, attemptId: { bsonType: "string" },
          leaseUntil: { bsonType: "date" }, createdAt: { bsonType: "date" }, result: { bsonType: ["object", "null"] },
        },
      } } });
    }
    await db.collection("job_career_gaps").createIndexes([
      { name: "career_gap_request", key: { userId: 1, conversationId: 1, requestId: 1 }, unique: true },
      { name: "career_gap_single_running", key: { userId: 1, conversationId: 1 }, unique: true, partialFilterExpression: { status: "running" } },
      { name: "career_gap_latest", key: { userId: 1, conversationId: 1, status: 1, createdAt: -1 } },
    ]);
  } }];
}
