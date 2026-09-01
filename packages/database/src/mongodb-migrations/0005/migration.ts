import { createHash } from "node:crypto";
import type { Db, Document, IndexDescription } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";
const UUID = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const id = { bsonType: "string", pattern: UUID, maxLength: 36 };
const date = { bsonType: "date" };
const integer = { bsonType: ["int", "long", "double"], multipleOf: 1, minimum: 0 };
const binary = { bsonType: "binData" };
const validator = (required: string[], properties: Document): Document => ({
  $jsonSchema: { bsonType: "object", required, properties },
});
const specs: Array<{ name: string; validator: Document; indexes: IndexDescription[] }> = [
 { name: "career_document_snapshots", validator: validator(["_id","userId","recordId","documentVersion","schemaVersion","content","stateVector","serverSequence","checksum","actor","createdAt"], { _id:id,userId:id,recordId:id,documentVersion:integer,version:integer,schemaVersion:integer,content:{},stateVector:binary,serverSequence:integer,checksum:{bsonType:"string",pattern:"^[a-f0-9]{64}$"},actor:{bsonType:"string",enum:["user","ai","migration"]},createdAt:date }), indexes:[{name:"career_snapshot_record_version",key:{recordId:1,version:-1}}] },
 { name: "career_document_updates", validator: validator(["_id","recordId","userId","clientId","clientSequence","serverSequence","update","byteLength","updateHash","actor","receivedAt","compactedAt"], { _id:id,recordId:id,userId:id,clientId:{bsonType:"string",minLength:1,maxLength:128},clientSequence:integer,serverSequence:integer,update:binary,byteLength:{...integer,maximum:1048576},updateHash:{bsonType:"string",pattern:"^[a-f0-9]{64}$"},actor:{bsonType:"string",enum:["user","ai","migration"]},receivedAt:date,compactedAt:{bsonType:["date","null"]} }), indexes:[{name:"career_update_client_key",key:{recordId:1,clientId:1,clientSequence:1},unique:true},{name:"career_update_compaction",key:{recordId:1,serverSequence:1}}] },
 { name: "career_record_revisions", validator: validator(["_id","userId","recordId","actor","summary","beforeVersion","afterVersion","createdAt"], { _id:id,userId:id,recordId:id,actor:{bsonType:"string",enum:["user","ai","migration"]},summary:{bsonType:"string",maxLength:2000},beforeVersion:integer,afterVersion:integer,snapshotId:{bsonType:["string","null"]},proposalId:{bsonType:["string","null"]},expiresAt:{bsonType:["date","null"]},createdAt:date }), indexes:[{name:"career_revision_record_created",key:{recordId:1,createdAt:-1}}] },
 { name: "career_record_relations", validator: validator(["_id","userId","sourceRecordId","sourcePropertyId","targetRecordId","cardinality","deletePolicy","createdBy","createdAt","updatedAt"], { _id:id,userId:id,sourceRecordId:id,sourcePropertyId:id,targetRecordId:id,inversePropertyId:{bsonType:["string","null"]},cardinality:{bsonType:"string",enum:["single","multiple"]},deletePolicy:{bsonType:"string",enum:["restrict","nullify"]},createdBy:{bsonType:"string",enum:["user","ai"]},createdAt:date,updatedAt:date }), indexes:[{name:"career_relation_unique",key:{userId:1,sourceRecordId:1,sourcePropertyId:1,targetRecordId:1},unique:true},{name:"career_relation_target",key:{userId:1,targetRecordId:1}}] },
];
function uuidV5(categoryId: string, key: string): string {
  const digest = createHash("sha1")
    .update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex"))
    .update(`${categoryId}:${key}`)
    .digest();
  digest[6] = (digest[6]! & 15) | 80;
  digest[8] = (digest[8]! & 63) | 128;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function careerEditorLedgerSteps(): Promise<MongoMigrationStep[]> {
  return [
    ...specs.map((spec): MongoMigrationStep => ({
      id: `collection:${spec.name}`,
      async run(db: Db) {
        if (await db.listCollections({ name: spec.name }, { nameOnly: true }).hasNext()) {
          await db.command({ collMod: spec.name, validator: spec.validator, validationLevel: "strict", validationAction: "error" });
        } else {
          await db.createCollection(spec.name, { validator: spec.validator, validationLevel: "strict", validationAction: "error" });
        }
        await db.collection(spec.name).createIndexes(spec.indexes);
      },
    })),
    {
      id: "career_records:editor_fields",
      async run(db: Db) {
        const info = await db.listCollections({ name: "career_records" }, { nameOnly: false }).next() as Document | null;
        if (!info) throw new Error("career_records collection is missing");
        const current = structuredClone((info.options.validator ?? {}) as Document);
        const properties = (current.$jsonSchema as Document).properties as Document;
        Object.assign(properties, { documentSchemaVersion: { bsonType: ["int", "long", "double", "null"], minimum: 0, multipleOf: 1 }, documentVersion: { bsonType: ["int", "long", "double", "null"], minimum: 0, multipleOf: 1 }, latestSnapshotId: { bsonType: ["string", "null"] }, computedProperties: { bsonType: ["object", "null"] }, unmappedProperties: { bsonType: ["object", "null"] }, editorMigratedAt: { bsonType: ["date", "null"] } });
        await db.command({ collMod: "career_records", validator: current, validationLevel: "strict", validationAction: "error" });
      },
    },
    {
      id: "career_categories:property_ids",
      async run(db: Db) {
        const cursor = db.collection("career_categories").find({}, { projection: { _id: 1, propertySchema: 1 } });
        for await (const category of cursor) {
          const next: Document = {};
          for (const [key, definition] of Object.entries(category.propertySchema ?? {}) as Array<[string, Document]>) next[key] = { ...definition, id: definition.id ?? uuidV5(String(category._id), key) };
          await db.collection("career_categories").updateOne({ _id: category._id }, { $set: { propertySchema: next } });
        }
      },
    },
  ];
}
