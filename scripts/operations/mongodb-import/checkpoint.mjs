export async function beginImport(db, runId, manifest) {
  const existing = await db.collection("import_runs").findOne({ _id: runId });
  if (existing && existing.schemaHash !== manifest.schemaHash) throw new Error("source schema changed; start a new import run");
  if (!existing) await db.collection("import_runs").insertOne({ _id: runId, schemaHash: manifest.schemaHash, tables: manifest.tables, validation: {}, completed: false });
  return existing;
}
export async function checkpoint(db, runId, table) { return db.collection("import_checkpoints").findOne({ runId, tableName: table }); }
import { randomUUID } from "node:crypto";
export async function saveCheckpoint(db, runId, table, lastKey, processedCount) { await db.collection("import_checkpoints").updateOne({ runId, tableName: table }, { $set: { lastKey, processedCount }, $setOnInsert: { _id: randomUUID() } }, { upsert: true }); }
