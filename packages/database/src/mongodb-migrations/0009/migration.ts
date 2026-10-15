import type { MongoMigrationStep } from "../../mongo-migrations.js";
export async function agentConversationSteps(): Promise<MongoMigrationStep[]> {
  return [{ id: "agent_conversations:create", async run(db) {
    const validator = { $jsonSchema: { bsonType: "object", required: ["_id", "userId", "title", "contexts", "messages", "version", "updatedAt", "heartbeatAt"], properties: {
      _id: { bsonType: "string" }, userId: { bsonType: "string" }, title: { bsonType: "string", maxLength: 120 }, contexts: { bsonType: "array", maxItems: 10 }, messages: { bsonType: "array", maxItems: 100 }, version: { bsonType: ["int", "long", "double"], minimum: 0 }, updatedAt: { bsonType: "string" }, heartbeatAt: { bsonType: "date" },
    } } };
    if (await db.listCollections({ name: "agent_conversations" }).hasNext()) await db.command({ collMod: "agent_conversations", validator });
    else await db.createCollection("agent_conversations", { validator });
    await db.collection("agent_conversations").createIndexes([{ name: "agent_owner_updated", key: { userId: 1, updatedAt: -1 } }, { name: "agent_running_heartbeat", key: { "run.status": 1, heartbeatAt: 1 } }]);
  } }];
}
