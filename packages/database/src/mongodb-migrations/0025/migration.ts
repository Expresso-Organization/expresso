import type { MongoMigrationStep } from "../../mongo-migrations.js";
export async function careerWorkflowSteps(): Promise<MongoMigrationStep[]> {
 return [{ id: "career_workflow:create", async run(db) {
  if (!await db.listCollections({ name: "career_workflows" }, { nameOnly: true }).hasNext()) await db.createCollection("career_workflows", { validator: { $jsonSchema: { bsonType: "object", required: ["_id", "userId", "conversationId", "requestId", "inputHash", "version", "createdAt", "result"], properties: { _id: { bsonType: "string" }, userId: { bsonType: "string" }, conversationId: { bsonType: "string" }, requestId: { bsonType: "string" }, inputHash: { bsonType: "string" }, version: { bsonType: "number" }, createdAt: { bsonType: "date" }, result: { bsonType: "object" } } } } });
  await db.collection("career_workflows").createIndexes([{ name: "workflow_request", key: { userId: 1, conversationId: 1, requestId: 1 }, unique: true }, { name: "workflow_latest", key: { userId: 1, conversationId: 1, createdAt: -1 } }]);
 } }];
}
