import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 커리어 카테고리 보관 자리를 연다.
 *
 * - `career_categories.archivedAt` — 보관한 때. 없거나 null이면 보관하지 않은 카테고리다.
 *   기존 문서는 그대로 두고 읽을 때 null로 본다.
 *
 * 번호 0031: 0025–0030은 열린 PR(에이전트 대화 · 커리어 Spring 통합)이 쓴다(2026-11-10 확인).
 */
export async function careerCategoryArchiveSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "career_categories:archived_at", async run(db: Db) {
      const info = await db.listCollections({ name: "career_categories" }, { nameOnly: false }).next() as Document | null;
      if (!info) throw new Error("career_categories collection is missing");
      const validator = structuredClone((info.options.validator ?? {}) as Document);
      Object.assign((validator.$jsonSchema as Document).properties as Document, { archivedAt: { bsonType: ["date", "null"] } });
      await db.command({ collMod: "career_categories", validator, validationLevel: "strict", validationAction: "error" });
    } },
  ];
}
