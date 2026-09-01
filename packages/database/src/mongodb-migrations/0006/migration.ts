import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/** 기존 `career_views` 행을 그대로 읽으면서 UUID 기반 v2 설정을 추가한다. */
export async function careerViewConfigurationSteps(): Promise<MongoMigrationStep[]> {
  return [{
    id: "career_views:configuration_fields",
    async run(db: Db) {
      const info = await db.listCollections({ name: "career_views" }, { nameOnly: false }).next() as Document | null;
      if (!info) throw new Error("career_views collection is missing");
      const validator = structuredClone((info.options.validator ?? {}) as Document);
      const schema = validator.$jsonSchema as Document;
      const properties = schema.properties as Document;
      Object.assign(properties, {
        configuration: { bsonType: "object" },
        version: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 },
        updatedAt: { bsonType: "date" },
      });
      await db.command({ collMod: "career_views", validator, validationLevel: "strict", validationAction: "error" });
      await db.collection("career_views").createIndexes([
        { name: "career_view_configuration_order", key: { userId: 1, categoryId: 1, "configuration.order": 1, _id: 1 }, partialFilterExpression: { configuration: { $exists: true } } },
        { name: "career_view_configuration_id", key: { userId: 1, _id: 1, "configuration.version": 1 }, partialFilterExpression: { configuration: { $exists: true } } },
      ]);
    },
  }];
}
