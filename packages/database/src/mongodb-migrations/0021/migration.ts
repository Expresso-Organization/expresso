import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

const UUID = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const id = { bsonType: "string", pattern: UUID, maxLength: 36 };
const count = { bsonType: ["int", "long", "double"], minimum: 0, multipleOf: 1 };

/**
 * AI 사용량을 남기고 요금제 한도를 생성 횟수에서 크레딧으로 바꾼다.
 *
 * - `ai_usage_events` — 성공한 AI 호출 한 건이 한 줄이다.
 * - `plans` — `generationQuota`(월 생성 횟수)를 지우고 이름 · 월 가격 · 월 크레딧 ·
 *   카드 순서를 더한다. 값의 출처는 화면 정의서 「요금제 · 사용량」이다.
 * - `features`에서 `generation.unlimited`를 지운다. 정의서는 유료 플랜에도 월
 *   크레딧 한도를 그린다(Double Shot "620 / 1,000"). 한도를 판단하는 쪽이 이제 이
 *   값을 읽지 않으므로 남겨 두지 않는다.
 *
 * 크레딧 하나의 크기(10,000 토큰)는 `@expresso/contracts`의 `TOKENS_PER_CREDIT`에
 * 근거와 함께 있다. 저장된 생성 40건의 평균이 약 235,000 토큰이어서 무료 플랜
 * 100 크레딧으로 네 번 생성한다.
 *
 * 0001의 `schema.json`은 고치지 않는다. 그 파일은 0001의 체크섬에 들어가서, 고치면
 * 이미 적용한 데이터베이스에서 마이그레이션이 멈춘다. 번호가 0021인 이유는
 * 0014–0016 · 0018 · 0019를 열린 PR이 쓰고 있어서다.
 */
const PLANS: Record<string, { displayName: string; monthlyPriceKrw: number; monthlyCredits: number; sortOrder: number }> = {
  free: { displayName: "Single Shot", monthlyPriceKrw: 0, monthlyCredits: 100, sortOrder: 1 },
  pro: { displayName: "Double Shot", monthlyPriceKrw: 9_900, monthlyCredits: 1_000, sortOrder: 2 },
  team: { displayName: "Extra Shot", monthlyPriceKrw: 19_900, monthlyCredits: 2_500, sortOrder: 3 },
};

async function validatorOf(db: Db, name: string) {
  const info = await db.listCollections({ name }, { nameOnly: false }).next() as Document | null;
  if (!info) throw new Error(`${name} collection is missing`);
  return structuredClone((info.options.validator ?? {}) as Document);
}

export async function aiUsageAndPlanCreditSteps(): Promise<MongoMigrationStep[]> {
  const events = {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "userId", "contract", "model", "inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens", "costUsd", "durationMs", "createdAt"],
      properties: {
        _id: id,
        userId: { bsonType: ["string", "null"], pattern: UUID, maxLength: 36 },
        contract: { bsonType: "string", maxLength: 80 },
        model: { bsonType: "string", maxLength: 200 },
        inputTokens: count,
        outputTokens: count,
        cacheReadTokens: count,
        cacheCreationTokens: count,
        costUsd: { bsonType: ["int", "long", "double", "null"], minimum: 0 },
        durationMs: count,
        createdAt: { bsonType: "date" },
      },
    },
  };
  return [
    { id: "collection:ai_usage_events", async run(db: Db) {
      if (await db.listCollections({ name: "ai_usage_events" }, { nameOnly: true }).hasNext()) {
        await db.command({ collMod: "ai_usage_events", validator: events, validationLevel: "strict", validationAction: "error" });
      } else {
        await db.createCollection("ai_usage_events", { validator: events, validationLevel: "strict", validationAction: "error" });
      }
      await db.collection("ai_usage_events").createIndexes([
        { name: "ai_usage_user_created", key: { userId: 1, createdAt: -1 } },
      ]);
    } },
    // 규칙을 먼저 바꾼다. 값부터 바꾸면 `generationQuota`가 빠진 문서가 지금 규칙에 걸린다.
    { id: "plans:credit_validator", async run(db: Db) {
      const validator = await validatorOf(db, "plans");
      const schema = validator.$jsonSchema as Document;
      const properties = schema.properties as Document;
      delete properties.generationQuota;
      Object.assign(properties, {
        displayName: { bsonType: "string", minLength: 1, maxLength: 80 },
        monthlyPriceKrw: count,
        monthlyCredits: count,
        sortOrder: count,
      });
      schema.required = [
        ...(schema.required as string[]).filter((field) => field !== "generationQuota"),
        "displayName", "monthlyPriceKrw", "monthlyCredits", "sortOrder",
      ];
      await db.command({ collMod: "plans", validator, validationLevel: "strict", validationAction: "error" });
    } },
    // `features`의 키에 점이 들어 있어(`generation.unlimited`) `$set` 경로로 쓸 수 없다.
    // 문서를 통째로 바꿔 넣는다.
    { id: "plans:credit_values", async run(db: Db) {
      const plans = db.collection("plans");
      for (const plan of await plans.find({}).toArray()) {
        const values = PLANS[plan.code as string];
        if (!values) throw new Error(`plan ${String(plan.code)} has no credit values`);
        const { generationQuota: _dropped, ...rest } = plan;
        const { "generation.unlimited": _unlimited, ...features } = plan.features as Document;
        await plans.replaceOne({ _id: plan._id }, { ...rest, ...values, features });
      }
    } },
  ];
}
