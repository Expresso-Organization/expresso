import { mongoCollections } from "@expresso/database";

import { loadRuntimeConfig } from "../config/runtime-config.js";
import { CareerDocumentService } from "../modules/career-editor/index.js";
import { createMongoResource } from "../platform/mongodb.js";

/**
 * 2026-11-02 이전 첫 열기 변환이 커리어 본문에 남긴 HTML 엔티티(`&amp;` · `&lt;` · `&gt;`)를 원래 글자로 되돌린다.
 *
 *   pnpm --filter @expresso/backend career-repair-escaped           # 바꿀 기록 수만 센다
 *   pnpm --filter @expresso/backend career-repair-escaped --apply   # 실제로 고친다
 *
 * 고치기 전 본문은 각 기록의 이력 「깨진 글 복구 전」으로 남는다. 열린 편집기에는 바로 반영된다.
 */
const apply = process.argv.includes("--apply");
const config = loadRuntimeConfig();
if (!config.mongodbUrl || !config.mongodbDatabase) throw new Error("MongoDB runtime configuration is missing");
const database = createMongoResource(config.mongodbUrl, { databaseName: config.mongodbDatabase });
try {
  const service = new CareerDocumentService(database, config.assetSigningSecret);
  const records = await mongoCollections(database.db).careerRecords
    .find({ deletedAt: null, documentSchemaVersion: 2 }, { projection: { _id: 1, userId: 1 } }).toArray();
  let matched = 0;
  for (const record of records) if (await service.repairEscapedText(record.userId, record._id, apply)) matched += 1;
  console.info(`${apply ? "repaired" : "would repair"} ${matched} of ${records.length} BlockNote records`);
} finally {
  await database.close();
}
