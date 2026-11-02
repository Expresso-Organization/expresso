import { readFile } from "node:fs/promises";
import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

export async function careerPropertyMutationPreparationSteps(): Promise<MongoMigrationStep[]> {
  const schema = JSON.parse(await readFile(new URL("./mutation-schema.json", import.meta.url), "utf8")) as Document;
  return [
    ...["career_property_mutations", "career_property_mutation_receipts"].map(name => ({ id: `${name}:collection`, async run(db: Db) {
      if (await db.listCollections({ name }).hasNext()) await db.command({ collMod: name, validator: schema[name], validationLevel: "strict", validationAction: "error" });
      else await db.createCollection(name, { validator: schema[name], validationLevel: "strict", validationAction: "error" });
      if (name === "career_property_mutations") {
        await db.collection(name).createIndex({ userId: 1, categoryId: 1 }, { unique: true, partialFilterExpression: { active: true }, name: "career_mutation_active_category" });
        await db.collection(name).createIndex({ status: 1, leaseUntil: 1 }, { name: "career_mutation_resume" });
      } else await db.collection(name).createIndex({ userId: 1, mutationId: 1, recordId: 1 }, { unique: true, name: "career_mutation_record_receipt" });
    } })),
    { id: "career_records:derived_metadata", async run(db: Db) {
      const info = await db.listCollections({ name: "career_records" }).next();
      if (!info || !("options" in info) || !info.options?.validator?.$jsonSchema) throw new Error("career_records validator is missing");
      const validator = structuredClone(info.options.validator) as Document;
      Object.assign(validator.$jsonSchema.properties, { computationVersion: { bsonType: ["int", "long", "double"], minimum: 0, maximum: Number.MAX_SAFE_INTEGER, multipleOf: 1 }, computedAt: { bsonType: ["date", "null"] } });
      await db.command({ collMod: "career_records", validator, validationLevel: "strict", validationAction: "error" });
    } },
  ];
}
