import type { MongoMigrationStep } from "../../mongo-migrations.js";
export async function evidenceSearchSteps(): Promise<MongoMigrationStep[]> {
  return [{ id: "evidence-search:indexes", async run(db) {
    for (const name of ["career_evidence_index", "job_search_index"]) {
      if (!await db.listCollections({ name }, { nameOnly: true }).hasNext()) {
        await db.createCollection(name, { validator: { $jsonSchema: { bsonType: "object", required: ["_id", "expiresAt"], properties: { _id: { bsonType: "string" }, expiresAt: { bsonType: "date" } } } } });
      }
      await db.collection(name).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "search_cache_expiry" });
    }
    await db.collection("career_evidence_index").createIndex({ userId: 1, recordId: 1, fingerprint: 1 }, { name: "owned_record_evidence" });
  } }];
}
