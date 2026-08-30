import type { Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

export async function analyticsAndPreferenceSteps(): Promise<MongoMigrationStep[]> {
  return [
    {
      id: "users:notification_preferences_map",
      async run(db) {
        const info = await db.listCollections({ name: "users" }, { nameOnly: false }).next() as Document | null;
        if (!info) throw new Error("users collection is missing");
        const validator = structuredClone((info.options.validator ?? {}) as Document);
        const properties = (validator["$jsonSchema"] as Document | undefined)?.["properties"] as Document | undefined;
        if (!properties) throw new Error("users validator is incomplete");
        properties["notificationPreferences"] = {
          anyOf: [
            { bsonType: "object", properties: { deadline: { bsonType: "bool" }, saved_search: { bsonType: "bool" }, generation: { bsonType: "bool" }, traffic: { bsonType: "bool" } }, additionalProperties: false },
            { bsonType: "null" },
          ],
        };
        await db.command({ collMod: "users", validator, validationLevel: "strict", validationAction: "error" });
      },
    },
    {
      id: "analytics_rate_limits:window_unique",
      async run(db) {
        await db.collection("analytics_rate_limits").createIndex(
          { visitorHash: 1, targetId: 1, period: 1 },
          { name: "analytics_rate_window_key", unique: true },
        );
      },
    },
  ];
}
