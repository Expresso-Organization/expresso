import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 챙기기 — 약속과 먼저 연락하기.
 *
 * - `consultant_commitments`: 사용자가 하겠다고 한 일과 날짜. 컨설턴트가 대화에서 저장하고 약속한 날에 묻는다.
 * - `consultant_profiles.outreach`: 먼저 연락하기 동의와, 하루 한 건 · 2주에 한 번을 지키기 위한 마지막 날짜.
 * - 알림 종류 `consultant`: `notifications.kind`와 `users.notificationPreferences`에 더한다.
 * - 예약 작업 `consultant_checkins`: 하루 한 번 약속을 확인한다. 0032가 잡을 심는 방식과 같다.
 *
 * 기존 컬렉션의 검증 규칙은 허용 값을 더하기만 한다. 좁히지 않으므로 기존 문서의 쓰기는 그대로다.
 */
const DAY = { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } as const;
const JOB_KEY = "consultant_checkins";

async function validatorOf(db: Db, name: string) {
  const info = await db.listCollections({ name }, { nameOnly: false }).next() as Document | null;
  if (!info) throw new Error(`${name} collection is missing`);
  return structuredClone((info.options.validator ?? {}) as Document);
}
const apply = (db: Db, name: string, validator: Document) => db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });

export async function consultantFollowUpSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "consultant_commitments:create", async run(db: Db) {
      const validator = { $jsonSchema: { bsonType: "object", required: ["_id", "userId", "title", "detail", "dueOn", "status", "awaiting", "nextCheckOn", "checks", "conversationId", "createdAt", "updatedAt"], additionalProperties: false, properties: {
        _id: { bsonType: "string" }, userId: { bsonType: "string" }, title: { bsonType: "string", maxLength: 200 }, detail: { bsonType: "string", maxLength: 500 },
        dueOn: DAY, status: { enum: ["open", "done", "dropped"] }, awaiting: { bsonType: "bool" }, nextCheckOn: { anyOf: [DAY, { bsonType: "null" }] },
        checks: { bsonType: "array", maxItems: 10, items: { bsonType: "object", required: ["on", "at"], additionalProperties: false, properties: { on: DAY, at: { bsonType: "date" } } } },
        conversationId: { bsonType: ["string", "null"] }, createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
      } } };
      if (await db.listCollections({ name: "consultant_commitments" }).hasNext()) await apply(db, "consultant_commitments", validator);
      else await db.createCollection("consultant_commitments", { validator, validationLevel: "strict", validationAction: "error" });
      await db.collection("consultant_commitments").createIndexes([
        { name: "consultant_commitment_owner", key: { userId: 1, status: 1, dueOn: 1 } },
        { name: "consultant_commitment_check", key: { status: 1, nextCheckOn: 1 } },
      ]);
    } },
    { id: "consultant_profiles:outreach", async run(db: Db) {
      const validator = await validatorOf(db, "consultant_profiles");
      ((validator.$jsonSchema as Document).properties as Document).outreach = { bsonType: "object", required: ["enabled", "decidedAt", "lastNotifiedOn", "lastQuietOn", "quiet"], additionalProperties: false, properties: {
        enabled: { bsonType: "bool" }, decidedAt: { bsonType: "date" }, lastNotifiedOn: { anyOf: [DAY, { bsonType: "null" }] }, lastQuietOn: { anyOf: [DAY, { bsonType: "null" }] }, quiet: { bsonType: "bool" },
      } };
      await apply(db, "consultant_profiles", validator);
    } },
    { id: "notifications:consultant_kind", async run(db: Db) {
      const notifications = await validatorOf(db, "notifications");
      const kind = ((notifications.$jsonSchema as Document).properties as Document).kind as Document;
      if (!(kind.enum as string[]).includes("consultant")) kind.enum = [...(kind.enum as string[]), "consultant"];
      await apply(db, "notifications", notifications);
      const users = await validatorOf(db, "users");
      const preferences = ((users.$jsonSchema as Document).properties as Document).notificationPreferences as Document;
      for (const shape of (preferences.anyOf ?? []) as Document[]) if (shape.bsonType === "object" && shape.properties) (shape.properties as Document).consultant = { bsonType: "bool" };
      await apply(db, "users", users);
    } },
    { id: "scheduled_job_definitions:consultant_key", async run(db: Db) {
      const validator = await validatorOf(db, "scheduled_job_definitions");
      const id = ((validator.$jsonSchema as Document).properties as Document)._id as Document;
      const keys = id.enum as string[];
      if (!keys.includes(JOB_KEY)) id.enum = [...keys, JOB_KEY];
      await apply(db, "scheduled_job_definitions", validator);
    } },
    { id: "scheduled_job_definitions:consultant_seed", async run(db: Db) {
      // 첫 실행은 다음 날 0시(UTC) 뒤다. 배포하는 순간에 실행이 몰리지 않게 한다(0032는 지금으로 넣어 배포 중 옛 워커가 집었다).
      const tomorrow = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1, 0, 0, 0));
      await db.collection("scheduled_job_definitions").updateOne(
        { _id: JOB_KEY as unknown as Document["_id"] },
        { $setOnInsert: { intervalSeconds: 86_400, nextRunAt: tomorrow, lastStartedAt: null, lastFinishedAt: null, lastStatus: null, failureCount: 0 } },
        { upsert: true },
      );
    } },
  ];
}
