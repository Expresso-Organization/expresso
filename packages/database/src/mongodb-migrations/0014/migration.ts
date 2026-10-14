import { readFile } from "node:fs/promises";
import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

export async function careerBusinessWriterPreparationSteps(): Promise<MongoMigrationStep[]> {
  const schema = JSON.parse(await readFile(new URL("./business-schema.json", import.meta.url), "utf8")) as Document;
  return [
    { id: "career_records:canonical_business_fields", async run(db: Db) {
      const info = await db.listCollections({ name: "career_records" }).next();
      if (!info || !("options" in info) || !info.options?.validator?.$jsonSchema) throw new Error("career_records validator is missing");
      const validator = structuredClone(info.options.validator) as Document;
      Object.assign(validator.$jsonSchema.properties, schema.recordProperties);
      // 기존 제품 writer는 canonical 값 없이도 계속 저장할 수 있습니다. 레거시 필드와 validator는 보존합니다.
      await db.command({ collMod: "career_records", validator, validationLevel: "strict", validationAction: "error" });
    } },
    { id: "career_command_idempotency:collection", async run(db: Db) {
      const name = "career_command_idempotency";
      if (await db.listCollections({ name }).hasNext()) {
        await db.command({ collMod: name, validator: schema.idempotencyValidator, validationLevel: "strict", validationAction: "error" });
      } else await db.createCollection(name, { validator: schema.idempotencyValidator, validationLevel: "strict", validationAction: "error" });
      await db.collection(name).createIndex({ userId: 1, key: 1 }, { unique: true, name: "career_command_actor_key" });
    } },
  ];
}
