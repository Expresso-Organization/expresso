import type { Db } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 활동 포스터.
 *
 * - `activity_posters`: 출처의 포스터(부트캠프는 캠프 배너)를 폭 480px webp로 줄여 둔다. `_id`는 활동 `_id`다.
 *   받아 온 출처 주소를 함께 두어, 같은 주소면 다시 받지 않는다.
 * - `activities.poster`: 보관한 그림의 가로 · 세로 · 체크섬. 목록이 그림을 읽지 않고도 자리와 주소를 만든다.
 *   0035의 검증 규칙에 이 칸만 더한다 — 나머지 칸은 지금 규칙 그대로 둔다.
 */
const SIZE = { bsonType: ["int", "long", "double"], minimum: 1 } as const;

export async function activityPosterSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "activities:poster_field", async run(db: Db) {
      const current = await db.listCollections({ name: "activities" }, { nameOnly: false }).next();
      const schema = (current?.options as { validator?: { $jsonSchema?: { properties?: Record<string, unknown> } } } | undefined)?.validator?.$jsonSchema;
      if (!schema?.properties) throw new Error("activities validator not found — 0035 must run first");
      schema.properties.poster = { bsonType: ["object", "null"], required: ["width", "height", "checksum"], additionalProperties: false, properties: {
        width: SIZE, height: SIZE, checksum: { bsonType: "string", minLength: 64, maxLength: 64 },
      } };
      await db.command({ collMod: "activities", validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" });
    } },
    { id: "activity_posters:create", async run(db: Db) {
      const validator = { $jsonSchema: { bsonType: "object", required: ["_id", "sourceUrl", "data", "mediaType", "width", "height", "checksum", "readAt"], additionalProperties: false, properties: {
        _id: { bsonType: "string", maxLength: 120 }, sourceUrl: { bsonType: "string", maxLength: 2000 }, data: { bsonType: "binData" },
        mediaType: { bsonType: "string", maxLength: 40 }, width: SIZE, height: SIZE,
        checksum: { bsonType: "string", minLength: 64, maxLength: 64 }, readAt: { bsonType: "date" },
      } } };
      if (await db.listCollections({ name: "activity_posters" }).hasNext()) await db.command({ collMod: "activity_posters", validator, validationLevel: "strict", validationAction: "error" });
      else await db.createCollection("activity_posters", { validator, validationLevel: "strict", validationAction: "error" });
    } },
  ];
}
