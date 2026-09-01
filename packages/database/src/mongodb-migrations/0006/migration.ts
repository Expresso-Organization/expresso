import type { Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * Recipe v2 — 내용 항목과 그 근거.
 *
 * v1 의 `recipe_items` · `recipe_evidence_paths` 는 그대로 둔다. 두 판이
 * 나란히 살고, v1 레시피를 읽을 때는 어댑터가 항목을 이 모양으로 바꾼다
 * (`docs/architecture/portfolio-creation-flow-v2.md` §10.4).
 */

const UUID = {
  bsonType: "string",
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
  maxLength: 36,
} as const;

const ORDER_NO = { bsonType: ["int", "long", "double"], multipleOf: 1, minimum: 0 } as const;

function schema(required: string[], properties: Document): Document {
  return { $jsonSchema: { bsonType: "object", required, properties } };
}

/** 이미 있는 컬렉션의 검증기에 항목을 더한다. 기존 값은 건드리지 않는다. */
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

export async function recipeV2ItemSteps(): Promise<MongoMigrationStep[]> {
  return [
    {
      id: "recipes:blueprint_fields",
      async run(db) {
        await extendValidator(db, "recipes", {
          schemaVersion: { bsonType: ["int", "long", "double"], multipleOf: 1, minimum: 1 },
          designSystemRevisionId: { anyOf: [UUID, { bsonType: "null" }] },
          intent: { anyOf: [{ bsonType: "object" }, { bsonType: "null" }] },
          title: { anyOf: [{ bsonType: "string", maxLength: 300 }, { bsonType: "null" }] },
          adoptedRecipeId: { anyOf: [UUID, { bsonType: "null" }] },
        });
        await db.collection("recipes").createIndex(
          { userId: 1, brewId: 1, schemaVersion: 1 },
          { name: "recipe_user_brew_schema_version" },
        );
      },
    },
    {
      id: "recipe_sections:takeaway",
      async run(db) {
        await extendValidator(db, "recipe_sections", { takeaway: { bsonType: "string", maxLength: 500 } });
      },
    },
    {
      id: "recipe_elements:create",
      async run(db) {
        await db.createCollection("recipe_elements", {
          validator: schema(
            ["_id", "userId", "recipeId", "recipeSectionId", "orderNo", "text", "updatedAt"],
            {
              _id: UUID,
              userId: UUID,
              recipeId: UUID,
              recipeSectionId: UUID,
              orderNo: ORDER_NO,
              text: { bsonType: "string", maxLength: 2_000 },
              updatedAt: { bsonType: "date" },
            },
          ),
          validationLevel: "strict",
          validationAction: "error",
        });
        await db.collection("recipe_elements").createIndexes([
          { name: "recipe_element_user_id_id_key", key: { userId: 1, _id: 1 }, unique: true },
          { name: "recipe_element_user_id_section_id_order_no_key", key: { userId: 1, recipeSectionId: 1, orderNo: 1 }, unique: true },
          { name: "recipe_element_user_id_recipe_id_fkey", key: { userId: 1, recipeId: 1 } },
        ]);
      },
    },
    {
      id: "recipe_element_sources:create",
      async run(db) {
        await db.createCollection("recipe_element_sources", {
          validator: schema(
            ["_id", "userId", "recipeId", "recipeElementId", "sourceType", "sourceId", "role", "orderNo", "createdAt"],
            {
              _id: UUID,
              userId: UUID,
              recipeId: UUID,
              recipeElementId: UUID,
              sourceType: { bsonType: "string", enum: ["record", "answer", "requirement"] },
              sourceId: UUID,
              role: { bsonType: "string", enum: ["primary", "supporting"] },
              orderNo: ORDER_NO,
              createdAt: { bsonType: "date" },
            },
          ),
          validationLevel: "strict",
          validationAction: "error",
        });
        await db.collection("recipe_element_sources").createIndexes([
          { name: "recipe_element_source_user_id_id_key", key: { userId: 1, _id: 1 }, unique: true },
          // 같은 근거를 한 항목에 두 번 걸지 않는다.
          { name: "recipe_element_source_element_source_key", key: { userId: 1, recipeElementId: 1, sourceId: 1 }, unique: true },
          { name: "recipe_element_source_user_id_recipe_id_fkey", key: { userId: 1, recipeId: 1 } },
        ]);
      },
    },
  ];
}
