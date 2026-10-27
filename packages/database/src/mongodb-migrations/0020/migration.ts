import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 알림을 실제로 만들기 위한 두 가지.
 *
 * - `deadline_reminders`: 관심 공고 마감 3일 전 알림을 하루 한 번 만드는 잡.
 *   `scheduled_job_definitions._id` enum에 키를 더하고 정의를 심는다. 0001 시드가
 *   다른 잡을 심는 자리와 같다. 이미 있으면 실행 이력을 건드리지 않는다.
 * - `notifications.subject`: 알림이 가리키는 대상 이름(포트폴리오 제목 ·
 *   「회사 · 공고 제목」). 이전 알림에는 없으므로 필수로 두지 않는다.
 *
 * 번호가 0018 · 0019를 건너뛴다. 0014–0019는 열린 PR이 쓰고 있다.
 */
async function validatorOf(db: Db, name: string) {
  const info = await db.listCollections({ name }, { nameOnly: false }).next() as Document | null;
  if (!info) throw new Error(`${name} collection is missing`);
  return structuredClone((info.options.validator ?? {}) as Document);
}

export async function notificationProducerSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "scheduled_job_definitions:deadline_reminders_key", async run(db: Db) {
      const validator = await validatorOf(db, "scheduled_job_definitions");
      const id = ((validator.$jsonSchema as Document).properties as Document)._id as Document;
      const keys = id.enum as string[];
      if (!keys.includes("deadline_reminders")) id.enum = [...keys, "deadline_reminders"];
      await db.command({ collMod: "scheduled_job_definitions", validator, validationLevel: "strict", validationAction: "error" });
    } },
    { id: "scheduled_job_definitions:deadline_reminders_seed", async run(db: Db) {
      await db.collection("scheduled_job_definitions").updateOne(
        { _id: "deadline_reminders" as unknown as Document["_id"] },
        { $setOnInsert: { intervalSeconds: 86_400, nextRunAt: new Date(), lastStartedAt: null, lastFinishedAt: null, lastStatus: null, failureCount: 0 } },
        { upsert: true },
      );
    } },
    { id: "notifications:subject_field", async run(db: Db) {
      const validator = await validatorOf(db, "notifications");
      Object.assign((validator.$jsonSchema as Document).properties as Document, { subject: { bsonType: ["string", "null"], maxLength: 300 } });
      await db.command({ collMod: "notifications", validator, validationLevel: "strict", validationAction: "error" });
    } },
  ];
}
