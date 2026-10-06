import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

async function collectionValidator(db: Db, name: string): Promise<Document> {
  const info = await db.listCollections({ name }, { nameOnly: false }).next() as Document | null;
  if (!info) throw new Error(`${name} collection is missing`);
  const validator = structuredClone((info.options.validator ?? {}) as Document);
  const properties = (validator["$jsonSchema"] as Document | undefined)?.["properties"] as Document | undefined;
  if (!properties) throw new Error(`${name} validator is incomplete`);
  return validator;
}

export async function careerComputationVersionSteps(): Promise<MongoMigrationStep[]> {
  return [{
    id: "career_records:computation_version",
    async run(db) {
      const validator = await collectionValidator(db, "career_records");
      const properties = (validator["$jsonSchema"] as Document)["properties"] as Document;
      properties["computationVersion"] = {
        bsonType: ["int", "long", "double"], minimum: 0, multipleOf: 1,
      };
      properties["computedAt"] = { bsonType: ["date", "null"] };
      await db.command({
        collMod: "career_records", validator, validationLevel: "strict", validationAction: "error",
      });
    },
  }];
}
