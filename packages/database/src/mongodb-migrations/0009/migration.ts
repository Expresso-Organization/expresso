import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const LEGACY_PROPERTY_TYPES = ["text", "number", "date", "tags", "boolean"];

interface PropertyDefinition extends Document {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  system: boolean;
}

function uuidBytes(value: string): Buffer {
  const hex = value.replaceAll("-", "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error(`Invalid UUID namespace: ${value}`);
  return Buffer.from(hex, "hex");
}

/** 기존 category ID를 namespace로, property key를 name으로 사용하는 RFC 9562 UUIDv5입니다. */
export function legacyPropertyDefinitionId(categoryId: string, key: string): string {
  const bytes = createHash("sha1").update(uuidBytes(categoryId)).update(key, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function collectionValidator(db: Db, name: string): Promise<Document> {
  const info = await db.listCollections({ name }, { nameOnly: false }).next() as Document | null;
  if (!info) throw new Error(`${name} collection is missing`);
  const validator = structuredClone((info.options.validator ?? {}) as Document);
  const properties = (validator["$jsonSchema"] as Document | undefined)?.["properties"] as Document | undefined;
  if (!properties) throw new Error(`${name} validator is incomplete`);
  return validator;
}

function validatorProperties(validator: Document): Document {
  return ((validator["$jsonSchema"] as Document)["properties"] as Document);
}

function categoryPropertyDefinitionsSchema(): Document {
  return {
    bsonType: "array",
    maxItems: 50,
    items: {
      bsonType: "object",
      required: ["id", "key", "label", "type", "required", "system"],
      properties: {
        id: { bsonType: "string", pattern: UUID_PATTERN, maxLength: 36 },
        key: { bsonType: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,63}$" },
        label: { bsonType: "string", minLength: 1, maxLength: 80 },
        type: { bsonType: "string", enum: LEGACY_PROPERTY_TYPES },
        required: { bsonType: "bool" },
        system: { bsonType: "bool" },
      },
      additionalProperties: false,
    },
  };
}

function recordCanonicalSchemas(): Record<string, Document> {
  return {
    propertyValues: {
      bsonType: "array", maxItems: 50, uniqueItems: true,
      items: {
        bsonType: "object",
        required: ["propertyDefinitionId", "type", "value"],
        properties: {
          propertyDefinitionId: { bsonType: "string", pattern: UUID_PATTERN, maxLength: 36 },
          type: { bsonType: "string", enum: ["text"] },
          value: { bsonType: "string", maxLength: 5_000 },
        },
        additionalProperties: false,
      },
    },
    blockBody: {
      bsonType: "object",
      required: ["schemaVersion", "type", "content"],
      properties: {
        schemaVersion: { bsonType: ["int", "long", "double"], multipleOf: 1, enum: [1] },
        type: { bsonType: "string", enum: ["doc"] },
        content: {
          bsonType: "array", minItems: 1,
          items: {
            bsonType: "object",
            required: ["id", "type", "attrs", "text"],
            properties: {
              id: { bsonType: "string", pattern: UUID_PATTERN, maxLength: 36 },
              type: { bsonType: "string", enum: ["paragraph"] },
              attrs: { bsonType: "object", additionalProperties: false },
              text: {
                bsonType: "array",
                items: {
                  bsonType: "object", required: ["text"],
                  properties: { text: { bsonType: "string", minLength: 1, maxLength: 200_000 } },
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    editorSchemaVersion: { bsonType: ["int", "long", "double"], multipleOf: 1, enum: [1] },
  };
}

function expectedDefinitions(category: Document & { _id: string }): PropertyDefinition[] {
  const schema = category["propertySchema"];
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error(`Invalid propertySchema for system category ${category._id}`);
  }
  return Object.entries(schema as Document).map(([key, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Invalid propertySchema.${key} for system category ${category._id}`);
    }
    const definition = value as Document;
    if (typeof definition["label"] !== "string" || !LEGACY_PROPERTY_TYPES.includes(definition["type"] as string) ||
      typeof definition["required"] !== "boolean" || typeof definition["system"] !== "boolean") {
      throw new Error(`Invalid propertySchema.${key} for system category ${category._id}`);
    }
    return {
      id: legacyPropertyDefinitionId(category._id, key), key, label: definition["label"], type: definition["type"],
      required: definition["required"], system: definition["system"],
    } as PropertyDefinition;
  });
}

function normalizedDefinitions(definitions: unknown): PropertyDefinition[] | null {
  if (!Array.isArray(definitions)) return null;
  return definitions.map((definition) => structuredClone(definition as PropertyDefinition))
    .sort((left, right) => left.key.localeCompare(right.key));
}

async function addSystemPropertyDefinitions(db: Db): Promise<void> {
  const categories = db.collection<Document & { _id: string }>("career_categories");
  for await (const category of categories.find({ isSystem: true }).sort({ _id: 1 })) {
    const expected = expectedDefinitions(category);
    const existing = category["propertyDefinitions"];
    if (existing !== undefined) {
      if (!isDeepStrictEqual(normalizedDefinitions(existing), normalizedDefinitions(expected))) {
        throw new Error(`Conflicting propertyDefinitions for system category ${category._id}`);
      }
      continue;
    }
    const result = await categories.updateOne(
      { _id: category._id, propertyDefinitions: { $exists: false } },
      { $set: { propertyDefinitions: expected } },
    );
    if (result.modifiedCount === 0) {
      const current = await categories.findOne({ _id: category._id });
      if (!isDeepStrictEqual(normalizedDefinitions(current?.["propertyDefinitions"]), normalizedDefinitions(expected))) {
        throw new Error(`Conflicting propertyDefinitions for system category ${category._id}`);
      }
    }
  }
}

export async function careerRecordSliceSteps(): Promise<MongoMigrationStep[]> {
  return [
    {
      id: "career_categories:property_definitions_validator",
      async run(db) {
        const validator = await collectionValidator(db, "career_categories");
        validatorProperties(validator)["propertyDefinitions"] = categoryPropertyDefinitionsSchema();
        await db.command({ collMod: "career_categories", validator, validationLevel: "strict", validationAction: "error" });
      },
    },
    {
      id: "career_categories:system_property_definitions",
      run: addSystemPropertyDefinitions,
    },
    {
      id: "career_records:canonical_fields_validator",
      async run(db) {
        const validator = await collectionValidator(db, "career_records");
        Object.assign(validatorProperties(validator), recordCanonicalSchemas());
        await db.command({ collMod: "career_records", validator, validationLevel: "strict", validationAction: "error" });
      },
    },
  ];
}
