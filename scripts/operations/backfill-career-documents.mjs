#!/usr/bin/env node
import { randomUUID, createHash } from "node:crypto";
import { MongoClient, Binary } from "mongodb";
import { markdownToCareerDocument, careerDocumentToMarkdown, encodeDocumentAsYUpdate, encodeDocumentStateVector } from "../../packages/editor/dist/index.js";

const args = new Set(process.argv.slice(2));
const mode = args.has("--dry-run") ? "dry-run" : args.has("--apply") ? "apply" : null;
const batchArgument = process.argv.find((value) => value.startsWith("--batch-size="));
const batchSize = Number(process.env.CAREER_BACKFILL_BATCH_SIZE ?? batchArgument?.slice("--batch-size=".length) ?? 100);
if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5_000) throw new Error("batch size must be 1..5000");
const url = process.env.TEST_MONGODB_ADMIN_URL ?? process.env.MONGODB_MIGRATE_URL ?? process.env.MONGODB_URL;
const databaseName = process.env.MONGODB_DATABASE ?? "expresso";

export const normalizeMarkdown = (value) => value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
export const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function backfillCareerDocuments({ client, databaseName: name, mode: runMode, batchSize: size = 100 }) {
  if (!["dry-run", "apply"].includes(runMode)) throw new Error("invalid backfill mode");
  const db = client.db(name);
  const records = db.collection("career_records");
  const snapshots = db.collection("career_document_snapshots");
  const report = { mode: runMode, scanned: 0, eligible: 0, migrated: 0, skipped: 0, mismatches: [], writes: 0 };
  let lastId;
  while (true) {
    const filter = { deletedAt: null, ...(lastId ? { _id: { $gt: lastId } } : {}) };
    const rows = await records.find(filter).sort({ _id: 1 }).limit(size).toArray();
    if (!rows.length) break;
    for (const record of rows) {
        report.scanned += 1;
        lastId = record._id;
        const existing = await snapshots.findOne({ recordId: record._id }, { sort: { documentVersion: -1 } });
        if (existing || record.documentVersion != null) {
          report.skipped += 1;
          continue;
        }
        report.eligible += 1;
        const source = normalizeMarkdown(record.bodyMd ?? "");
        const document = markdownToCareerDocument(source);
        const roundTrip = normalizeMarkdown(careerDocumentToMarkdown(document));
        if (roundTrip !== source) {
          report.mismatches.push({ recordId: record._id, reason: "round-trip mismatch" });
          continue;
        }
        if (runMode === "dry-run") report.migrated += 1;
        if (runMode === "apply") {
          const update = encodeDocumentAsYUpdate(document);
          const snapshotId = randomUUID();
          const session = client.startSession();
          try {
            const outcome = await session.withTransaction(async () => {
              const result = await records.updateOne({ _id: record._id, $or: [{ documentVersion: null }, { documentVersion: { $exists: false } }] }, { $set: { documentVersion: 0, documentSchemaVersion: 1, latestSnapshotId: snapshotId, editorMigratedAt: new Date() } }, { session });
              if (!result.modifiedCount) return "skipped";
              await snapshots.insertOne({ _id: snapshotId, userId: record.userId, recordId: record._id, documentVersion: 0, version: 0, schemaVersion: 1, content: document, stateVector: new Binary(Buffer.from(encodeDocumentStateVector(document))), serverSequence: 0, checksum: checksum(update), actor: "migration", createdAt: new Date() }, { session });
              return "migrated";
            });
            if (outcome === "migrated") { report.writes += 1; report.migrated += 1; }
            else report.skipped += 1;
          } finally { await session.endSession(); }
        }
      }
      if (rows.length < size) break;
    }
  return report;
}

async function main() {
  if (!mode) throw new Error("choose exactly one of --dry-run or --apply");
  if (!url) throw new Error("TEST_MONGODB_ADMIN_URL or MONGODB_URL is required");
  const client = new MongoClient(url);
  await client.connect();
  try { process.stdout.write(`${JSON.stringify(await backfillCareerDocuments({ client, databaseName, mode, batchSize }))}\n`); }
  finally { await client.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
