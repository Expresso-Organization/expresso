import { readFile } from "node:fs/promises";
import type { Db, Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";
const uuidPattern = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89ab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$";
const uuid = { bsonType: "string", pattern: uuidPattern };
const version = { bsonType: ["int", "long", "double"], minimum: 1, maximum: 9007199254740991, multipleOf: 1 };
const edge = {
  bsonType: "object", additionalProperties: false,
  required: ["_id", "userId", "sourceRecordId", "sourcePropertyId", "targetRecordId", "cardinality", "deletePolicy", "createdBy", "createdAt", "updatedAt"],
  properties: { _id: uuid, userId: uuid, sourceRecordId: uuid, sourcePropertyId: uuid, targetRecordId: uuid, inversePropertyId: { bsonType: ["string", "null"], pattern: uuidPattern }, cardinality: { enum: ["single", "multiple"] }, deletePolicy: { enum: ["restrict", "nullify"] }, createdBy: { enum: ["user", "ai"] }, createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" } },
};
const edges = { bsonType: "array", maxItems: 1000, items: edge };
const binding = {
  bsonType: "object", additionalProperties: false,
  required: ["recordId", "categoryId", "categoryVersion", "schemaVersion", "definitionId", "version", "config"],
  properties: { recordId: uuid, categoryId: uuid, categoryVersion: version, schemaVersion: version, definitionId: uuid, version, config: { bsonType: "object" } },
};
// 모든 원본 edge의 소유자는 외부 ledger/receipt의 사용자와 같아야 합니다.
function sameOwner(path: string): Document {
  return { $allElementsTrue: [{ $map: { input: { $ifNull: ["$" + path, []] }, as: "edge", in: { $eq: ["$$edge.userId", "$userId"] } } }] };
}
export async function careerRelationPropertyMutationPreparationSteps(): Promise<MongoMigrationStep[]> {
  // 과거 migration의 원본 입력을 이 버전 안에 고정해 미래 runtime 변경과 분리합니다.
  const base = JSON.parse(await readFile(new URL("./mutation-base-schema.json", import.meta.url), "utf8")) as Document;
  const job = base.career_property_mutations.$jsonSchema;
  job.properties.privateOptionSnapshotJson = { bsonType: "string", minLength: 2, maxLength: 2097152 };
  job.properties.privateOptionSnapshotFingerprint = { bsonType: "string", pattern: "^[a-f0-9]{64}$" };
  const jobValidator = { $and: [base.career_property_mutations, { $expr: { $eq: [{ $eq: [{ $type: "$privateOptionSnapshotJson" }, "missing"] }, { $eq: [{ $type: "$privateOptionSnapshotFingerprint" }, "missing"] }] } }] };
  base.career_property_mutation_receipts.$jsonSchema.properties.relationRestoration = {
    bsonType: "object", additionalProperties: false, required: ["deletionMutationId", "propertyId", "forwardEdges", "inverseEdges"],
    properties: { deletionMutationId: uuid, propertyId: uuid, forwardEdges: edges, inverseEdges: edges },
  };
  const receiptValidator = { $and: [base.career_property_mutation_receipts, { $expr: { $and: [sameOwner("relationRestoration.forwardEdges"), sameOwner("relationRestoration.inverseEdges")] } }] };
  const ledgerValidator = {
    $and: [{
      $jsonSchema: {
        bsonType: "object", additionalProperties: false,
        required: ["_id", "userId", "categoryId", "propertyId", "recordId", "deletionMutationId", "definitionVersion", "deletedAt", "categoryVersion", "schemaVersion", "config", "sourceRecordVersion", "forwardEdges", "inverseEdges", "inverseDefinitionBindings", "inverseRecordVersions", "inverseRecordReferenceVersions", "createdAt"],
        properties: {
          _id: uuid, userId: uuid, categoryId: uuid, propertyId: uuid, recordId: uuid, deletionMutationId: uuid, definitionVersion: version,
          deletedAt: { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?Z$" },
          categoryVersion: version, schemaVersion: version, config: { bsonType: "object" }, sourceRecordVersion: version,
          forwardEdges: edges, inverseEdges: edges,
          inverseDefinitionBindings: { bsonType: "array", maxItems: 1000, items: binding },
          inverseRecordVersions: { bsonType: "object", additionalProperties: false, patternProperties: { [uuidPattern]: version } },
          inverseRecordReferenceVersions: { bsonType: "object", additionalProperties: false, patternProperties: { [uuidPattern]: { ...version, minimum: 0 } } },
          createdAt: { bsonType: "date" },
        },
      },
    }, { $expr: { $and: [sameOwner("forwardEdges"), sameOwner("inverseEdges")] } }],
  };
  const entries = [
    { name: "career_property_mutations", validator: jobValidator },
    { name: "career_property_mutation_receipts", validator: receiptValidator },
    { name: "career_relation_property_tombstones", validator: ledgerValidator },
  ];
  return entries.map(({ name, validator }) => ({ id: name + ":relation_preparation", async run(db: Db) {
    if (await db.listCollections({ name }).hasNext()) await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
    else await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error", collation: { locale: "simple" } });
    if (name === "career_relation_property_tombstones") {
      await db.collection(name).createIndex({ userId: 1, recordId: 1, propertyId: 1 }, { unique: true, name: "career_relation_tombstone_current_generation", collation: { locale: "simple" } });
      await db.collection(name).createIndex({ userId: 1, deletionMutationId: 1, recordId: 1, propertyId: 1 }, { unique: true, name: "career_relation_tombstone_deletion_generation", collation: { locale: "simple" } });
    }
  } }));
}