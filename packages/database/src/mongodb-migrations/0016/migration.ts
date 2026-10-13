import type { MongoMigrationStep } from "../../mongo-migrations.js";
export async function preparationProgressSteps(): Promise<MongoMigrationStep[]> {
  return [{ id: "preparation_progress:create", async run(db) {
    for (const name of ["career_preparation_progress", "career_preparation_progress_events", "career_preparation_replans"]) {
      if (!await db.listCollections({ name }, { nameOnly: true }).hasNext()) await db.createCollection(name, { validator: { $jsonSchema: { bsonType: "object", required: ["_id", "userId", "conversationId"], properties: { _id: { bsonType: "string" }, userId: { bsonType: "string" }, conversationId: { bsonType: "string" } } } } });
    }
    await db.collection("career_preparation_progress").createIndex({ userId: 1, conversationId: 1 });
    await db.collection("career_preparation_progress_events").createIndexes([
      { name: "progress_request", key: { userId: 1, planId: 1, requestId: 1 }, unique: true },
      { name: "progress_event_history", key: { userId: 1, planId: 1, resultVersion: 1 } },
    ]);
    await db.collection("career_preparation_replans").createIndexes([
      { name: "replan_request", key: { userId: 1, planId: 1, requestId: 1 }, unique: true },
      { name: "replan_latest", key: { userId: 1, planId: 1, createdAt: -1 } },
    ]);
  } }];
}
