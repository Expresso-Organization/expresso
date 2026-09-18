import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const BLOCK_TYPE_PATTERN = "^[a-z][a-zA-Z0-9_.-]{0,63}$";

async function collectionValidator(db: Db, name: string): Promise<Document> {
  const info = await db.listCollections({ name }, { nameOnly: false }).next() as Document | null;
  if (!info) throw new Error(`${name} collection is missing`);
  const validator = structuredClone((info.options.validator ?? {}) as Document);
  const properties = (validator["$jsonSchema"] as Document | undefined)?.["properties"] as Document | undefined;
  if (!properties) throw new Error(`${name} validator is incomplete`);
  return validator;
}

function richTextMarkSchema(): Document {
  return {
    bsonType: "object",
    required: ["type"],
    properties: {
      type: { bsonType: "string", enum: ["bold", "italic", "strike", "code", "link"] },
      attrs: { bsonType: "object" },
    },
    additionalProperties: false,
  };
}

function richTextSpanSchema(): Document {
  return {
    bsonType: "object",
    required: ["text"],
    properties: {
      text: { bsonType: "string", maxLength: 200_000 },
      marks: { bsonType: "array", maxItems: 20, items: richTextMarkSchema() },
    },
    additionalProperties: false,
  };
}

function richBlockSchema(): Document {
  return {
    bsonType: "object",
    required: ["id", "type", "attrs"],
    properties: {
      id: { bsonType: "string", pattern: UUID_PATTERN, maxLength: 36 },
      type: { bsonType: "string", pattern: BLOCK_TYPE_PATTERN, maxLength: 64 },
      attrs: { bsonType: "object" },
      content: {
        bsonType: "array",
        maxItems: 20_000,
        items: { bsonType: "object" },
      },
      text: {
        bsonType: "array",
        items: richTextSpanSchema(),
      },
    },
    additionalProperties: false,
  };
}

function richBlockBodySchema(): Document {
  return {
    bsonType: "object",
    required: ["schemaVersion", "type", "content"],
    properties: {
      schemaVersion: { bsonType: ["int", "long", "double"], multipleOf: 1, enum: [1] },
      type: { bsonType: "string", enum: ["doc"] },
      content: {
        bsonType: "array",
        maxItems: 20_000,
        items: richBlockSchema(),
      },
    },
    additionalProperties: false,
  };
}

export async function careerRichBlockBodySteps(): Promise<MongoMigrationStep[]> {
  return [{
    id: "career_records:rich_block_body_validator",
    async run(db) {
      const validator = await collectionValidator(db, "career_records");
      const properties = (validator["$jsonSchema"] as Document)["properties"] as Document;
      properties["blockBody"] = richBlockBodySchema();
      await db.command({
        collMod: "career_records",
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    },
  }];
}
