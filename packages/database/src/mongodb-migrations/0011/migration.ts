import type { MongoMigrationStep } from "../../mongo-migrations.js";
/** 승인한 준비 계획. 초안은 대화의 도구 결과에만 있고, 여기에는 승인한 계획과 그 진행만 남는다. */
export async function preparationPlanSteps(): Promise<MongoMigrationStep[]> {
  return [{ id: "preparation_plans:create", async run(db) {
    const validator = { $jsonSchema: { bsonType: "object", required: ["_id", "userId", "conversationId", "jobPostingId", "title", "summary", "settings", "tasks", "version", "scheduleVersion", "createdAt", "updatedAt"], properties: {
      _id: { bsonType: "string" }, userId: { bsonType: "string" }, conversationId: { bsonType: "string" }, jobPostingId: { bsonType: "string" },
      title: { bsonType: "string", maxLength: 300 }, summary: { bsonType: "string", maxLength: 2000 }, settings: { bsonType: "object" },
      tasks: { bsonType: "array", minItems: 1, maxItems: 40 }, version: { bsonType: ["int", "long", "double"], minimum: 1 }, scheduleVersion: { bsonType: ["int", "long", "double"], minimum: 1 },
      createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
    } } };
    if (await db.listCollections({ name: "preparation_plans" }).hasNext()) await db.command({ collMod: "preparation_plans", validator });
    else await db.createCollection("preparation_plans", { validator });
    await db.collection("preparation_plans").createIndexes([{ name: "preparation_plan_owner_updated", key: { userId: 1, updatedAt: -1 } }, { name: "preparation_plan_conversation", key: { userId: 1, conversationId: 1 } }]);
  } }];
}
