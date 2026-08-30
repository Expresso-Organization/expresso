#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createConnection } from "mysql2/promise";
import { MongoClient } from "mongodb";
import { beginImport, checkpoint, saveCheckpoint } from "./mongodb-import/checkpoint.mjs";
import { inspectSource, openReadOnlySource, readPage } from "./mongodb-import/source.mjs";
import { TABLE_ORDER, TARGET_COLLECTION, transformRow } from "./mongodb-import/transform.mjs";
import { verifyImport } from "./mongodb-import/verify.mjs";

const sourceUrl = process.env.MYSQL_SOURCE_URL; const targetUrl = process.env.MONGODB_MIGRATE_URL; const databaseName = process.env.MONGODB_DATABASE; const runId = process.env.IMPORT_RUN_ID ?? randomUUID(); const pageSize = Number(process.env.IMPORT_PAGE_SIZE ?? 500);
if (!sourceUrl || !targetUrl || !databaseName) throw new Error("MYSQL_SOURCE_URL, MONGODB_MIGRATE_URL and MONGODB_DATABASE are required");
if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 5_000) throw new Error("IMPORT_PAGE_SIZE must be 1..5000");
const source = await openReadOnlySource(createConnection, sourceUrl); const client = new MongoClient(targetUrl); await client.connect(); const db = client.db(databaseName);
try {
  const manifest = await inspectSource(source); await beginImport(db, runId, manifest);
  for (const table of TABLE_ORDER) {
    const saved = await checkpoint(db, runId, table); let after = saved?.lastKey ?? ""; let processed = saved?.processedCount ?? 0;
    while (true) {
      const rows = await readPage(source, table, after, pageSize); if (!rows.length) break;
      for (const item of rows) { const document = transformRow(table, item, runId); const collection = db.collection(TARGET_COLLECTION[table]); const existing = await collection.findOne({ _id: document._id }); if (existing && (existing.importRunId !== runId || existing.sourceHash !== document.sourceHash)) throw new Error(`${table}:${document._id} conflicts with existing target content`); if (!existing) await collection.insertOne(document); after = item.id; processed += 1; }
      await saveCheckpoint(db, runId, table, after, processed);
    }
  }
  const validation = await verifyImport(source, db, runId, pageSize); if (validation.mismatches.length) { await db.collection("import_runs").updateOne({ _id: runId }, { $set: { validation } }); throw new Error(`import verification failed with ${validation.mismatches.length} mismatch(es)`); }
  await db.collection("import_runs").updateOne({ _id: runId }, { $set: { validation, completed: true } }); console.log(JSON.stringify({ runId, completed: true, counts: validation.counts, hash: validation.hash }));
} catch (error) { console.error(JSON.stringify({ runId, completed: false, error: error instanceof Error ? error.message.replace(/(?:mysql|mongodb):\/\/[^\s]+/gi, "[redacted-url]") : "unknown" })); process.exitCode = 1; }
finally { await source.rollback(); await source.end(); await client.close(); }
