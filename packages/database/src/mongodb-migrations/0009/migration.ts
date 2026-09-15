import type { Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 레시피에 문장 종류 · 섹션 역할 · 보여주는 형식.
 *
 * 값의 어휘는 계약(`@expresso/contracts` `recipe-vocabulary.ts`)이 갖고, 여기서는
 * 모양만 지킨다 — enum 을 검증기에 박으면 형식을 하나 더할 때마다 마이그레이션이
 * 필요해진다. 기존 문서는 손대지 않는다: 없는 값은 읽을 때 point · other 다.
 */

/**
 * 이미 있는 컬렉션의 검증기에 항목을 더한다. 기존 값은 건드리지 않는다.
 * 0006 의 것과 같지만 가져오지 않는다 — 적용된 마이그레이션은 체크섬으로 잠겨 있어
 * 파일을 한 글자도 바꿀 수 없다.
 */
async function extendValidator(
  db: Parameters<MongoMigrationStep["run"]>[0],
  name: string,
  additions: Document,
): Promise<void> {
  const info = (await db.listCollections({ name }, { nameOnly: false }).next()) as Document | null;
  if (!info) throw new Error(`${name} collection is missing`);
  const validator = structuredClone((info.options.validator ?? {}) as Document);
  const properties = (validator["$jsonSchema"] as Document | undefined)?.["properties"] as Document | undefined;
  if (!properties) throw new Error(`${name} validator is incomplete`);
  for (const [key, value] of Object.entries(additions)) properties[key] = value;
  await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
}

const SHORT = { bsonType: "string", maxLength: 40 } as const;
const OBJECT_OR_NULL = { anyOf: [{ bsonType: "object" }, { bsonType: "null" }] } as const;

export async function recipeContentKindSteps(): Promise<MongoMigrationStep[]> {
  return [
    {
      id: "recipe_sections:role_presentation",
      async run(db) {
        await extendValidator(db, "recipe_sections", {
          role: SHORT,
          presentation: { anyOf: [SHORT, { bsonType: "null" }] },
        });
      },
    },
    {
      id: "recipe_elements:content_kinds",
      async run(db) {
        await extendValidator(db, "recipe_elements", {
          kind: SHORT,
          metric: OBJECT_OR_NULL,
          media: OBJECT_OR_NULL,
          link: OBJECT_OR_NULL,
        });
      },
    },
    {
      id: "recipe_items:content",
      async run(db) {
        await extendValidator(db, "recipe_items", { content: OBJECT_OR_NULL });
      },
    },
  ];
}
