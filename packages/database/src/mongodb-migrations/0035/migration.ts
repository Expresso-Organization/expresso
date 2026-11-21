import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 활동 출처 확장.
 *
 * - `activities`: 출처에 링커리어 · 콘테스트코리아 · Dev-Event · 부트텐트, 종류에 부트캠프를 더한다.
 *   접수 시작일 · 마감 정밀도 · 시작일 · 대상 · 상금 · 원 공고 주소 · 학비 · 내일배움카드 여부 ·
 *   중복 대표(`duplicateOf`) 칸을 더한다. 0032가 쓴 문서에는 새 칸이 없으므로 모두 필수가 아니다.
 * - `activity_sources`: 출처별 마지막 실행 · 성공 시각 · 오류 · 읽은 수. 목록은 마지막 성공 실행에서 본 활동만 보인다.
 *
 * 0034는 열린 PR(feat/design-chat)이 쓰고 있다(2026-11-20 확인).
 */
const DATE = { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } as const;
const SOURCES = ["wevity", "linkareer", "contestkorea", "devevent", "boottent"] as const;

async function ensureCollection(db: Db, name: string, validator: Document) {
  if (await db.listCollections({ name }).hasNext()) await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
  else await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error" });
}

export async function activitySourceSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "activities:sources_schema", async run(db: Db) {
      await ensureCollection(db, "activities", { $jsonSchema: { bsonType: "object", required: ["_id", "source", "kind", "title", "host", "fields", "url", "deadlineOn", "status", "firstSeenAt", "lastSeenAt"], properties: {
        _id: { bsonType: "string", maxLength: 120 }, source: { enum: [...SOURCES] }, kind: { enum: ["contest", "hackathon", "bootcamp"] },
        title: { bsonType: "string", maxLength: 300 }, host: { bsonType: "string", maxLength: 200 }, fields: { bsonType: "array", maxItems: 12, items: { bsonType: "string", maxLength: 60 } },
        url: { bsonType: "string", maxLength: 2000 }, deadlineOn: DATE, status: { bsonType: "string", maxLength: 40 },
        firstSeenAt: { bsonType: "date" }, lastSeenAt: { bsonType: "date" },
        applyStartOn: { anyOf: [DATE, { bsonType: "null" }] }, deadlinePrecision: { enum: ["day", "month"] }, startsOn: { anyOf: [DATE, { bsonType: "null" }] },
        eligibility: { bsonType: ["string", "null"], maxLength: 300 }, prize: { bsonType: ["string", "null"], maxLength: 200 },
        homepageUrl: { bsonType: ["string", "null"], maxLength: 2000 }, tuition: { bsonType: ["int", "long", "double", "null"], minimum: 0 },
        nbcardRequired: { bsonType: ["bool", "null"] }, duplicateOf: { bsonType: ["string", "null"], maxLength: 120 },
      } } });
      await db.collection("activities").createIndexes([
        { name: "activity_list", key: { duplicateOf: 1, kind: 1, deadlineOn: 1 } },
        { name: "activity_source_seen", key: { source: 1, lastSeenAt: 1 } },
      ]);
    } },
    { id: "activity_sources:create", async run(db: Db) {
      await ensureCollection(db, "activity_sources", { $jsonSchema: { bsonType: "object", required: ["_id", "lastRunAt", "lastSucceededAt", "lastError", "lastRead"], additionalProperties: false, properties: {
        _id: { enum: [...SOURCES] }, lastRunAt: { bsonType: "date" }, lastSucceededAt: { bsonType: ["date", "null"] },
        lastError: { bsonType: ["string", "null"], maxLength: 500 }, lastRead: { bsonType: ["int", "long", "double"], minimum: 0 },
      } } });
    } },
  ];
}
