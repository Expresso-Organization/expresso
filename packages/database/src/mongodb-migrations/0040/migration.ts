import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 포트폴리오 잇기 — 컨설턴트가 포트폴리오를 먼저 제안한 날.
 *
 * - `consultant_profiles.portfolioSuggestion`: 마지막으로 제안한 서울 날짜. 같은 제안을 2주 안에 되풀이하지 않는 데 쓴다.
 *
 * 검증 규칙에 허용 칸을 더하기만 한다. 기존 문서는 바꾸지 않고, 칸이 없는 문서는 제안한 적이 없는 것으로 읽는다.
 */
const DAY = { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } as const;

export async function consultantPortfolioSteps(): Promise<MongoMigrationStep[]> {
  return [
    { id: "consultant_profiles:portfolio_suggestion", async run(db: Db) {
      const info = await db.listCollections({ name: "consultant_profiles" }, { nameOnly: false }).next() as Document | null;
      if (!info) throw new Error("consultant_profiles collection is missing");
      const validator = structuredClone((info.options.validator ?? {}) as Document);
      ((validator.$jsonSchema as Document).properties as Document).portfolioSuggestion = { bsonType: "object", required: ["lastSuggestedOn"], additionalProperties: false, properties: { lastSuggestedOn: DAY } };
      await db.command({ collMod: "consultant_profiles", validator, validationLevel: "strict", validationAction: "error" });
    } },
  ];
}
