import type { MongoMigrationStep } from "../../mongo-migrations.js";
import { applyCanonicalCareerPreparation } from "./canonical-preparation.js";

/** 명시적인 forward-only 실행으로 사용자 옵션 저장소와 누락된 canonical 필드만 준비합니다. */
export async function careerCanonicalPreparationSteps(): Promise<MongoMigrationStep[]> {
  const id = { bsonType: "string", pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$" };
  return [
    { id: "career_property_options:scoped_metadata", async run(db) {
      const name = "career_property_options";
      const validator = { $jsonSchema: { bsonType: "object", additionalProperties: false, required: ["_id", "userId", "categoryId", "propertyId", "optionId", "rawLabel", "version", "createdAt"], properties: {
        _id: id, userId: id, categoryId: id, propertyId: id, optionId: id,
        rawLabel: { bsonType: "string", maxLength: 200 }, version: { bsonType: ["int", "long", "double"], enum: [1] }, createdAt: { bsonType: "date" }, metadata: { bsonType: "object" },
      } } };
      if (await db.listCollections({ name }).hasNext()) await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
      else await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error", collation: { locale: "simple" } });
      await db.collection(name).createIndex({ userId: 1, categoryId: 1, propertyId: 1, rawLabel: 1 }, { name: "career_option_scope_label", unique: true, collation: { locale: "simple" } });
      await db.collection(name).createIndex({ userId: 1, categoryId: 1, propertyId: 1, optionId: 1 }, { name: "career_option_scope_canonical_id", unique: true, collation: { locale: "simple" } });
    } },
    { id: "career:missing_canonical_schema_and_values", async run(db) { await applyCanonicalCareerPreparation(db); } },
  ];
}