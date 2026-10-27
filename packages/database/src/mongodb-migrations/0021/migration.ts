import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 구성(레시피)이 끝나기 전에 맡긴 생성은 아직 레시피가 없다. 그 잡을 `recipeId: null`로 저장할 수 있게
 * validator를 연다.
 *
 * 필드는 그대로 필수다 — 값이 문자열이거나 null이다. 구성 잡이 끝나면 워커가 레시피를 붙이고
 * 그때 생성을 시작한다(`GenerationService.attachRecipe`). 이미 있는 잡은 모두 문자열이라 그대로 맞는다.
 *
 * 번호 0021: 다른 브랜치가 0013~0020을 쓰고 있어 겹치지 않는 다음 번호를 쓴다(2026-10-27 확인).
 */
export async function generationWaitingRecipeSteps(): Promise<MongoMigrationStep[]> {
  return [{ id: "generation_jobs:nullable_recipe", async run(db: Db) {
    const info = await db.listCollections({ name: "generation_jobs" }, { nameOnly: false }).next() as Document | null;
    if (!info) throw new Error("generation_jobs collection is missing");
    const validator = structuredClone((info.options.validator ?? {}) as Document);
    const properties = (validator.$jsonSchema as Document).properties as Document;
    const recipe = properties.recipeId as Document;
    properties.recipeId = { ...recipe, bsonType: ["string", "null"] };
    await db.command({ collMod: "generation_jobs", validator, validationLevel: "strict", validationAction: "error" });
  } }];
}
