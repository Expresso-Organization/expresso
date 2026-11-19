import type { Db } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 컨설턴트의 기억.
 *
 * - `consultant_profiles`: 사용자당 한 문서. 구직 단계와, 사용자가 원하거나 피하는 조건.
 *   에이전트가 대화에서 적고 사용자가 「내 진행」 화면에서 고친다.
 *
 * 새 컬렉션을 만들 뿐 기존 문서는 바꾸지 않는다.
 * 번호가 0033에서 0035로 건너뛴다. 0034는 열린 PR(#241 디자인 대화)이 쓰고 있다(2026-11-20 확인).
 */
export async function consultantProfileSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "consultant_profiles:create", async run(db: Db) {
      const validator = { $jsonSchema: { bsonType: "object", required: ["_id", "userId", "stage", "stageSource", "stageUpdatedAt", "preferences", "createdAt", "updatedAt"], additionalProperties: false, properties: {
        _id: { bsonType: "string" }, userId: { bsonType: "string" },
        stage: { enum: ["exploring", "preparing", "applying", null] }, stageSource: { enum: ["agent", "user", null] }, stageUpdatedAt: { bsonType: ["date", "null"] },
        preferences: { bsonType: "array", maxItems: 30, items: { bsonType: "object", required: ["id", "kind", "text", "source", "createdAt"], additionalProperties: false, properties: {
          id: { bsonType: "string" }, kind: { enum: ["prefer", "avoid"] }, text: { bsonType: "string", maxLength: 200 }, source: { enum: ["chat", "user"] }, createdAt: { bsonType: "date" },
        } } },
        createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
      } } };
      if (await db.listCollections({ name: "consultant_profiles" }).hasNext()) await db.command({ collMod: "consultant_profiles", validator, validationLevel: "strict", validationAction: "error" });
      else await db.createCollection("consultant_profiles", { validator, validationLevel: "strict", validationAction: "error" });
      await db.collection("consultant_profiles").createIndexes([{ name: "consultant_profile_owner", key: { userId: 1 }, unique: true }]);
    } },
  ];
}
