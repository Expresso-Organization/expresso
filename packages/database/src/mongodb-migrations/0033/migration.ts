import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 최종 구직 목표.
 *
 * - `users.jobGoal`: 사용자가 쓴 구직 목표 — 하고 싶은 일 · 가고 싶은 곳 · 시기와 지금 상황.
 *   온보딩과 앱의 구직 목표 화면, 에이전트 대화가 쓴다. 아직 적지 않은 사용자에게는 없다.
 * - `users.profile.primaryGoal`(온보딩의 「지금 가장 급한 것」)을 없앤다. 저장만 되고 읽는 곳이 없던 값이다.
 *   검증 규칙이 필수로 두고 있어, 규칙을 먼저 풀고 저장된 값을 지운다.
 */
const TEXT = { bsonType: "string", maxLength: 300 } as const;

export async function jobGoalSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "users:job_goal_schema", async run(db: Db) {
      const info = await db.listCollections({ name: "users" }, { nameOnly: false }).next() as Document | null;
      if (!info) throw new Error("users collection is missing");
      const validator = structuredClone((info.options.validator ?? {}) as Document);
      const properties = (validator.$jsonSchema as Document).properties as Document;
      for (const shape of ((properties.profile as Document).anyOf ?? []) as Document[]) {
        if (shape.bsonType !== "object") continue;
        shape.required = ((shape.required ?? []) as string[]).filter((name) => name !== "primaryGoal");
        delete (shape.properties as Document).primaryGoal;
      }
      properties.jobGoal = { anyOf: [
        { bsonType: "object", required: ["work", "place", "timing", "source", "updatedAt"], additionalProperties: false, properties: {
          work: TEXT, place: TEXT, timing: TEXT, source: { enum: ["onboarding", "app", "chat"] }, updatedAt: { bsonType: "date" },
        } },
        { bsonType: "null" },
      ] };
      await db.command({ collMod: "users", validator, validationLevel: "strict", validationAction: "error" });
    } },
    { id: "users:drop_primary_goal", async run(db: Db) {
      await db.collection("users").updateMany({ "profile.primaryGoal": { $exists: true } }, { $unset: { "profile.primaryGoal": "" } });
    } },
  ];
}
