import type { Db } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 진단 — 구직 목표가 요구하는 것과 내 기록의 대조(사용자마다 하나).
 *
 * - `consultant_diagnoses`: 진단할 때의 목표, 표본(직군 · 공고 수 · 회사 수), 요건마다의 건수와 상태 · 근거.
 *   `_id`는 사용자 id다. 새로 집계하면 그 문서를 고쳐 쓴다.
 *
 * 새 컬렉션만 만든다. 기존 컬렉션은 건드리지 않는다.
 */
export async function consultantDiagnosisSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "consultant_diagnoses:create", async run(db: Db) {
      const text = (maxLength: number) => ({ bsonType: "string", maxLength });
      const count = { bsonType: ["int", "long", "double"], minimum: 0 };
      const validator = { $jsonSchema: { bsonType: "object", required: ["_id", "userId", "work", "family", "basis", "focus", "level", "sampleSize", "companyCount", "interestedCount", "small", "summary", "items", "demandAt", "assessedAt", "updatedAt"], additionalProperties: false, properties: {
        _id: { bsonType: "string" }, userId: { bsonType: "string" }, work: text(300), family: { bsonType: ["string", "null"], maxLength: 40 }, basis: { enum: ["family", "keyword"] },
        focus: { bsonType: ["string", "null"], maxLength: 80 }, level: { enum: ["entry", null] }, sampleSize: count, companyCount: count, interestedCount: count, small: { bsonType: "bool" }, summary: text(600),
        items: { bsonType: "array", maxItems: 14, items: { bsonType: "object", required: ["id", "kind", "label", "count", "status", "evidence", "note"], additionalProperties: false, properties: {
          id: text(80), kind: { enum: ["technology", "experience", "career", "qualification"] }, label: text(80), count, status: { enum: ["confirmed", "partial", "unconfirmed", "gap"] },
          evidence: { bsonType: "array", maxItems: 3, items: { bsonType: "object", required: ["recordId", "quote", "recordTitle"], additionalProperties: false, properties: { recordId: { bsonType: "string" }, quote: text(600), recordTitle: text(200) } } },
          note: text(300),
        } } },
        demandAt: { bsonType: "date" }, assessedAt: { bsonType: ["date", "null"] }, updatedAt: { bsonType: "date" },
      } } };
      if (await db.listCollections({ name: "consultant_diagnoses" }).hasNext()) await db.command({ collMod: "consultant_diagnoses", validator, validationLevel: "strict", validationAction: "error" });
      else await db.createCollection("consultant_diagnoses", { validator, validationLevel: "strict", validationAction: "error" });
      await db.collection("consultant_diagnoses").createIndexes([{ name: "consultant_diagnosis_owner", key: { userId: 1 }, unique: true }]);
    } },
  ];
}
