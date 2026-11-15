import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 능동 제안과 활동 수집.
 *
 * - `proposal_feeds`: 사용자당 한 문서. 켬 여부, 에이전트가 쓴 제안, 다시 제안하지 않는 대상, 마지막 실행.
 * - `activities`: 수집한 공모전 · 해커톤. 사용자 것이 아니라 모두가 함께 본다.
 * - 예약 잡 `proposal_briefing`(켠 사용자에게 하루 한 번 제안 실행을 맡긴다)과
 *   `activity_collect`(하루 한 번 활동을 받아 온다)를 `scheduled_job_definitions`에 더한다.
 *   0020이 잡을 심는 방식과 같다. 이미 있으면 실행 이력을 건드리지 않는다.
 *
 * 번호가 0031에서 이어진다. 0025–0030은 열린 PR이 쓰고 있다(2026-11-15 확인).
 */
async function validatorOf(db: Db, name: string) {
  const info = await db.listCollections({ name }, { nameOnly: false }).next() as Document | null;
  if (!info) throw new Error(`${name} collection is missing`);
  return structuredClone((info.options.validator ?? {}) as Document);
}

async function ensureCollection(db: Db, name: string, validator: Document) {
  if (await db.listCollections({ name }).hasNext()) await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
  else await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error" });
}

const JOB_KEYS = ["proposal_briefing", "activity_collect"] as const;

export async function proactiveProposalSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "proposal_feeds:create", async run(db: Db) {
      await ensureCollection(db, "proposal_feeds", { $jsonSchema: { bsonType: "object", required: ["_id", "userId", "enabled", "proposals", "dismissed", "run", "autoRuns", "seenThrough", "createdAt", "updatedAt"], properties: {
        _id: { bsonType: "string" }, userId: { bsonType: "string" }, enabled: { bsonType: "bool" },
        proposals: { bsonType: "array", maxItems: 12 }, dismissed: { bsonType: "array", maxItems: 500, items: { bsonType: "string", maxLength: 160 } },
        run: { bsonType: "object" }, autoRuns: { bsonType: "object" }, seenThrough: { bsonType: ["date", "null"] },
        createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
      } } });
      await db.collection("proposal_feeds").createIndexes([
        { name: "proposal_feed_owner", key: { userId: 1 }, unique: true },
        { name: "proposal_feed_enabled", key: { enabled: 1, userId: 1 } },
      ]);
    } },
    { id: "activities:create", async run(db: Db) {
      await ensureCollection(db, "activities", { $jsonSchema: { bsonType: "object", required: ["_id", "source", "kind", "title", "host", "fields", "url", "deadlineOn", "status", "firstSeenAt", "lastSeenAt"], properties: {
        _id: { bsonType: "string", maxLength: 120 }, source: { enum: ["wevity"] }, kind: { enum: ["contest", "hackathon"] },
        title: { bsonType: "string", maxLength: 300 }, host: { bsonType: "string", maxLength: 200 }, fields: { bsonType: "array", maxItems: 12, items: { bsonType: "string", maxLength: 60 } },
        url: { bsonType: "string", maxLength: 2000 }, deadlineOn: { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, status: { bsonType: "string", maxLength: 40 },
        firstSeenAt: { bsonType: "date" }, lastSeenAt: { bsonType: "date" },
      } } });
      await db.collection("activities").createIndexes([
        { name: "activity_kind_deadline", key: { kind: 1, deadlineOn: 1 } },
        { name: "activity_first_seen", key: { firstSeenAt: -1 } },
      ]);
    } },
    { id: "scheduled_job_definitions:proposal_keys", async run(db: Db) {
      const validator = await validatorOf(db, "scheduled_job_definitions");
      const id = ((validator.$jsonSchema as Document).properties as Document)._id as Document;
      const keys = id.enum as string[];
      id.enum = [...keys, ...JOB_KEYS.filter((key) => !keys.includes(key))];
      await db.command({ collMod: "scheduled_job_definitions", validator, validationLevel: "strict", validationAction: "error" });
    } },
    { id: "scheduled_job_definitions:proposal_seeds", async run(db: Db) {
      for (const key of JOB_KEYS) {
        await db.collection("scheduled_job_definitions").updateOne(
          { _id: key as unknown as Document["_id"] },
          { $setOnInsert: { intervalSeconds: 86_400, nextRunAt: new Date(), lastStartedAt: null, lastFinishedAt: null, lastStatus: null, failureCount: 0 } },
          { upsert: true },
        );
      }
    } },
  ];
}
