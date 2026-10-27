/**
 * BlockNote 교체 검증용 dry-run 보고입니다. DB에 쓰지 않습니다.
 *
 * 기록마다 v1 본문(스냅샷 + 업데이트, 없으면 bodyMd)을 복원해 BlockNote로 바꾸고,
 * 블록 종류별 대응, 문단으로 낮춘 블록, 사라진 글자 수, Markdown 투영 길이를 출력합니다.
 */
import { mongoCollections } from "@expresso/database";
import { blockNoteText, careerDocumentText } from "@expresso/editor/blocknote";
import { encodeDocumentAsYUpdate, markdownToCareerDocument, parseCareerDocument, reconstructYDocument } from "@expresso/editor";
import { MongoClient } from "mongodb";

import { blockNoteMarkdown, careerDocumentToBlockNoteState, restoreBlockNote } from "./blocknote-document.js";
import { binaryBytes } from "./repository.js";

const url = process.env.MONGODB_URL;
const databaseName = process.env.MONGODB_DATABASE;
if (!url || !databaseName) throw new Error("MONGODB_URL and MONGODB_DATABASE are required");

const client = new MongoClient(url);
await client.connect();
const collections = mongoCollections(client.db(databaseName));
const rows: Array<Record<string, string | number>> = [];
const v1Types: Record<string, number> = {};
const v2Types: Record<string, number> = {};
const degradedTotal: Record<string, number> = {};

for await (const record of collections.careerRecords.find({ deletedAt: null })) {
  const snapshot = await collections.careerDocumentSnapshots.findOne({ recordId: record._id }, { sort: { documentVersion: -1, schemaVersion: -1 } });
  let source;
  let origin = "bodyMd";
  if (snapshot && snapshot.schemaVersion !== 2) {
    const updates = await collections.careerDocumentUpdates.find({ recordId: record._id, serverSequence: { $gt: snapshot.serverSequence }, compactedAt: null }).sort({ serverSequence: 1 }).toArray();
    source = reconstructYDocument([encodeDocumentAsYUpdate(parseCareerDocument(snapshot.content)), ...updates.map((row) => binaryBytes(row.update))]);
    origin = `snapshot+${updates.length}`;
  } else if (snapshot) {
    rows.push({ id: record._id.slice(0, 8), title: record.title.slice(0, 24), origin: "already v2" });
    continue;
  } else {
    source = markdownToCareerDocument(record.bodyMd);
  }
  const visit = (blocks: typeof source.content) => { for (const block of blocks) { v1Types[block.type] = (v1Types[block.type] ?? 0) + 1; if (block.content) visit(block.content); } };
  visit(source.content);
  const migrated = careerDocumentToBlockNoteState(source);
  const restored = restoreBlockNote(migrated.state).blocks;
  for (const block of restored) v2Types[block.type] = (v2Types[block.type] ?? 0) + 1;
  for (const [type, count] of Object.entries(migrated.degraded)) degradedTotal[type] = (degradedTotal[type] ?? 0) + count;
  const before = careerDocumentText(source).length;
  const after = blockNoteText(restored).length;
  const markdown = await blockNoteMarkdown(restored);
  rows.push({
    id: record._id.slice(0, 8), title: record.title.slice(0, 24), origin,
    v1Blocks: source.content.length, v2Blocks: restored.length, textBefore: before, textAfter: after, lost: before - after,
    degraded: Object.entries(migrated.degraded).map(([type, count]) => `${type}×${count}`).join(" ") || "-",
    bodyMdChars: record.bodyMd.length, projectedChars: markdown.length,
  });
}
await client.close();

console.table(rows);
console.log("v1 block types", v1Types);
console.log("BlockNote top-level types", v2Types);
console.log("degraded", degradedTotal);
console.log("records", rows.length, "lost characters", rows.reduce((total, row) => total + (typeof row["lost"] === "number" ? row["lost"] : 0), 0));
