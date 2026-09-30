import type { MongoMigrationStep } from "../../mongo-migrations.js";
export async function agentCredentialSteps(): Promise<MongoMigrationStep[]> {
  return [{ id: "agent_credentials:create", async run(db) {
    const validator = { $jsonSchema: { bsonType: "object", required: ["_id", "userId", "ciphertext", "iv", "tag", "version", "updatedAt"], additionalProperties: false, properties: {
      _id: { bsonType: "string" }, userId: { bsonType: "string" }, ciphertext: { bsonType: "string", maxLength: 1024 }, iv: { bsonType: "string", maxLength: 32 }, tag: { bsonType: "string", maxLength: 32 }, version: { enum: [1] }, updatedAt: { bsonType: "date" },
    } } };
    if (await db.listCollections({ name: "agent_credentials" }).hasNext()) await db.command({ collMod: "agent_credentials", validator });
    else await db.createCollection("agent_credentials", { validator });
    await db.collection("agent_credentials").createIndex({ userId: 1 }, { unique: true, name: "agent_credential_owner" });
  } }];
}
