import type { MongoMigrationStep } from "../../mongo-migrations.js";
export async function preparationPlanSteps(): Promise<MongoMigrationStep[]> {
  return [{ id: "career_preparation_plans:create", async run(db) {
    if (!await db.listCollections({ name: "career_preparation_plans" }, { nameOnly: true }).hasNext()) {
      await db.createCollection("career_preparation_plans", { validator: { $jsonSchema: {
        bsonType: "object", required: ["_id", "userId", "conversationId", "requestId", "inputFingerprint", "status", "version", "createdAt", "result"],
        properties: { _id: { bsonType: "string" }, userId: { bsonType: "string" }, conversationId: { bsonType: "string" }, requestId: { bsonType: "string" }, inputFingerprint: { bsonType: "string" }, status: { enum: ["draft", "approved", "rejected"] }, version: { bsonType: ["int", "long", "double"], minimum: 1 }, createdAt: { bsonType: "date" }, result: { bsonType: "object" } },
      } } });
    }
    await db.collection("career_preparation_plans").createIndexes([
      { name: "preparation_request", key: { userId: 1, conversationId: 1, requestId: 1 }, unique: true },
      { name: "preparation_latest", key: { userId: 1, conversationId: 1, createdAt: -1 } },
    ]);
  } }];
}
