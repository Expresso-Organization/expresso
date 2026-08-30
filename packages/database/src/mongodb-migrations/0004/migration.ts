import type { Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

const COLLECTIONS = ["job_sources", "companies", "job_postings", "job_posting_requirements"];

export async function jobImportMetadataSteps(): Promise<MongoMigrationStep[]> {
  return COLLECTIONS.map((name) => ({
    id: `${name}:import_metadata`,
    async run(db) {
      const info = await db.listCollections({ name }, { nameOnly: false }).next() as Document | null; if (!info) throw new Error(`${name} collection is missing`);
      const validator = structuredClone((info.options.validator ?? {}) as Document); const properties = (validator["$jsonSchema"] as Document | undefined)?.["properties"] as Document | undefined; if (!properties) throw new Error(`${name} validator is incomplete`);
      properties["importRunId"] = { bsonType: "string", maxLength: 64 }; properties["sourceHash"] = { bsonType: "string", pattern: "^[a-f0-9]{64}$", minLength: 64, maxLength: 64 };
      await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" }); await db.collection(name).createIndex({ importRunId: 1, _id: 1 }, { name: "import_run_rows" });
    },
  }));
}
