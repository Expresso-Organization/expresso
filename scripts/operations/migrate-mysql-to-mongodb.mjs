#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createConnection } from "mysql2/promise";
import { MongoClient } from "mongodb";
import { beginImport, checkpoint, saveCheckpoint } from "./mongodb-import/checkpoint.mjs";
import { parseImportArgs } from "./mongodb-import/cli.mjs";
import { inspectSource, openReadOnlySource, readPage } from "./mongodb-import/source.mjs";
import { TABLE_ORDER, TARGET_COLLECTION, transformRow } from "./mongodb-import/transform.mjs";
import { verifyImport } from "./mongodb-import/verify.mjs";

const { mode, reportPath } = parseImportArgs(process.argv.slice(2));
const sourceUrl = process.env.MYSQL_SOURCE_URL;
const targetUrl = process.env.MONGODB_MIGRATE_URL;
const databaseName = process.env.MONGODB_DATABASE;
const runId = process.env.IMPORT_RUN_ID ?? (mode === "verify-only" ? undefined : randomUUID());
const pageSize = Number(process.env.IMPORT_PAGE_SIZE ?? 500);
if (!sourceUrl) throw new Error("MYSQL_SOURCE_URL is required");
if (mode !== "dry-run" && (!targetUrl || !databaseName)) throw new Error("MONGODB_MIGRATE_URL and MONGODB_DATABASE are required");
if (!runId) throw new Error("IMPORT_RUN_ID is required for --verify-only");
if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 5_000) throw new Error("IMPORT_PAGE_SIZE must be 1..5000");

async function saveReport(value) {
  if (!reportPath) return;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
function safeError(error) {
  return error instanceof Error
    ? error.message.replace(/(?:mysql|mongodb):\/\/[^\s]+/gi, "[redacted-url]")
    : "unknown";
}

let source;
let client;
let result;
try {
  source = await openReadOnlySource(createConnection, sourceUrl);
  const manifest = await inspectSource(source);

  if (mode === "dry-run") {
    const counts = {};
    for (const table of TABLE_ORDER) {
      let after = "";
      let count = 0;
      while (true) {
        const rows = await readPage(source, table, after, pageSize);
        if (!rows.length) break;
        for (const row of rows) {
          transformRow(table, row, runId);
          after = row.id;
          count += 1;
        }
      }
      counts[table] = count;
    }
    result = { mode, completed: true, schemaHash: manifest.schemaHash, counts };
  } else {
    client = new MongoClient(targetUrl);
    await client.connect();
    const db = client.db(databaseName);

    if (mode === "verify-only") {
      const validation = await verifyImport(source, db, runId, pageSize);
      result = { mode, runId, completed: validation.mismatches.length === 0, ...validation };
      if (!result.completed) process.exitCode = 1;
    } else {
      await beginImport(db, runId, manifest);
      for (const table of TABLE_ORDER) {
        const saved = await checkpoint(db, runId, table);
        let after = saved?.lastKey ?? "";
        let processed = saved?.processedCount ?? 0;
        while (true) {
          const rows = await readPage(source, table, after, pageSize);
          if (!rows.length) break;
          for (const item of rows) {
            const document = transformRow(table, item, runId);
            const collection = db.collection(TARGET_COLLECTION[table]);
            const existing = await collection.findOne({ _id: document._id });
            if (existing && (existing.importRunId !== runId || existing.sourceHash !== document.sourceHash)) {
              throw new Error(`${table}:${document._id} conflicts with existing target content`);
            }
            if (!existing) await collection.insertOne(document);
            after = item.id;
            processed += 1;
          }
          await saveCheckpoint(db, runId, table, after, processed);
        }
      }
      const validation = await verifyImport(source, db, runId, pageSize);
      result = { mode, runId, completed: validation.mismatches.length === 0, ...validation };
      await db.collection("import_runs").updateOne(
        { _id: runId },
        { $set: { validation, completed: result.completed } },
      );
      if (!result.completed) process.exitCode = 1;
    }
  }
  await saveReport(result);
  console.log(JSON.stringify(result));
} catch (error) {
  result = { mode, runId, completed: false, error: safeError(error) };
  await saveReport(result);
  console.error(JSON.stringify(result));
  process.exitCode = 1;
} finally {
  if (source) {
    await source.rollback();
    await source.end();
  }
  await client?.close();
}
