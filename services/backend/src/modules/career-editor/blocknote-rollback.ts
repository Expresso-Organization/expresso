/**
 * BlockNote(schemaVersion 2) 문서를 v1 문서로 되돌립니다. 이전 버전을 다시 배포하기 전에 돌립니다.
 *
 * 기록마다 현재 BlockNote 상태를 v1 문서로 바꿔 새 v1 스냅샷(documentVersion + 1)을 쓰고,
 * v2 업데이트를 압축 처리하고, documentSchemaVersion · documentBodyHash를 지웁니다.
 * 기본은 dry-run이고 `--apply`를 줄 때만 씁니다.
 */
import { createHash, randomUUID } from "node:crypto";

import { mongoCollections, type JsonValue } from "@expresso/database";
import { encodeDocumentAsYUpdate, encodeDocumentStateVector } from "@expresso/editor";
import { BLOCKNOTE_SCHEMA_VERSION, blockNoteToCareerDocument } from "@expresso/editor/blocknote";
import { Binary, MongoClient } from "mongodb";

import { restoreBlockNote } from "./blocknote-document.js";
import { binaryBytes } from "./repository.js";

const apply = process.argv.includes("--apply");
const url = process.env.MONGODB_URL;
const databaseName = process.env.MONGODB_DATABASE;
if (!url || !databaseName) throw new Error("MONGODB_URL and MONGODB_DATABASE are required");

const client = new MongoClient(url);
await client.connect();
const collections = mongoCollections(client.db(databaseName));
let scanned = 0; let rolledBack = 0;
for await (const record of collections.careerRecords.find({ documentSchemaVersion: BLOCKNOTE_SCHEMA_VERSION })) {
  scanned += 1;
  const snapshot = await collections.careerDocumentSnapshots.findOne({ recordId: record._id, schemaVersion: BLOCKNOTE_SCHEMA_VERSION }, { sort: { documentVersion: -1, serverSequence: -1 } });
  if (!snapshot?.state) { console.log("skip (no v2 state)", record._id); continue; }
  const updates = await collections.careerDocumentUpdates.find({ recordId: record._id, serverSequence: { $gt: snapshot.serverSequence }, compactedAt: null }).sort({ serverSequence: 1 }).toArray();
  const document = blockNoteToCareerDocument(restoreBlockNote(binaryBytes(snapshot.state), updates.map((row) => binaryBytes(row.update))).blocks);
  const current = record.documentVersion ?? 0;
  const next = current + 1;
  console.log(apply ? "rollback" : "would rollback", record._id, "blocks", document.content.length, "version", current, "->", next);
  if (!apply) continue;
  const snapshotId = randomUUID();
  const canonical = encodeDocumentAsYUpdate(document);
  const moved = await collections.careerRecords.updateOne(
    { _id: record._id, documentVersion: current, documentSchemaVersion: BLOCKNOTE_SCHEMA_VERSION },
    { $set: { documentVersion: next, documentSchemaVersion: 1, latestSnapshotId: snapshotId, documentBodyHash: null } },
  );
  if (!moved.modifiedCount) { console.log("skip (changed concurrently)", record._id); continue; }
  await collections.careerDocumentSnapshots.insertOne({
    _id: snapshotId, userId: record.userId, recordId: record._id, documentVersion: next, version: next, schemaVersion: 1,
    content: document as unknown as JsonValue, stateVector: new Binary(Buffer.from(encodeDocumentStateVector(document))),
    serverSequence: next, checksum: createHash("sha256").update(canonical).digest("hex"), actor: "migration", createdAt: new Date(),
  });
  await collections.careerDocumentUpdates.updateMany({ recordId: record._id, compactedAt: null }, { $set: { compactedAt: new Date() } });
  rolledBack += 1;
}
await client.close();
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", scanned, rolledBack }));
