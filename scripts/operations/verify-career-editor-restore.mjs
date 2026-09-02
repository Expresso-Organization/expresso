import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const sourceUrl = process.env.MONGODB_RESTORE_SOURCE_URL;
const sourceDatabase = process.env.MONGODB_RESTORE_SOURCE_DATABASE;
const targetUrl = process.env.MONGODB_RESTORE_URL;
const targetDatabase = process.env.MONGODB_RESTORE_DATABASE;
const outputPath = process.argv[2];
const restoreCopy = process.argv.includes("--restore-copy");
if (!sourceUrl || !sourceDatabase || !targetUrl || !targetDatabase || !outputPath) throw new Error("source/target restore verification configuration is incomplete");
if (sourceDatabase === targetDatabase) throw new Error("restore source and target databases must differ");
if (restoreCopy && (process.env.MONGODB_RESTORE_ALLOW_REPLACE !== "1" || !/restore/i.test(targetDatabase))) {
  throw new Error("restore copy requires MONGODB_RESTORE_ALLOW_REPLACE=1 and a target database name containing restore");
}

const editorCollections = ["career_categories", "career_records", "career_document_snapshots", "career_document_updates", "career_record_revisions", "career_record_relations", "career_views", "career_ai_proposals"];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { $binary: value.toString("base64") };
  return value;
}
async function cursorDigest(cursor) {
  const hash = createHash("sha256");
  let count = 0;
  for await (const row of cursor) { hash.update(JSON.stringify(canonical(row))); hash.update("\n"); count += 1; }
  return { count, checksum: hash.digest("hex") };
}
async function fingerprint(db) {
  const result = {};
  for (const name of editorCollections) {
    result[name] = await cursorDigest(db.collection(name).find({}, { batchSize: 500 }).sort({ _id: 1 }));
  }
  return {
    collections: result,
    ownerCategoryRecordCounts: await cursorDigest(db.collection("career_records").aggregate([{ $group: { _id: { userId: "$userId", categoryId: "$categoryId" }, count: { $sum: 1 } } }, { $sort: { "_id.userId": 1, "_id.categoryId": 1 } }], { batchSize: 500 })),
    computedProjection: await cursorDigest(db.collection("career_records").find({}, { projection: { _id: 1, userId: 1, categoryId: 1, computedProperties: 1 }, batchSize: 500 }).sort({ _id: 1 })),
  };
}

async function copyCollections(source, target) {
  for (const name of editorCollections) {
    const destination = target.collection(name);
    await destination.deleteMany({});
    let batch = [];
    for await (const row of source.collection(name).find({}, { batchSize: 500 }).sort({ _id: 1 })) {
      batch.push(row);
      if (batch.length === 500) { await destination.insertMany(batch, { ordered: true }); batch = []; }
    }
    if (batch.length) await destination.insertMany(batch, { ordered: true });
  }
}

function semanticComputed(record, definitions) {
  return Object.fromEntries(definitions
    .filter((definition) => definition.deletedAt === null && (definition.type === "formula" || definition.type === "rollup"))
    .map((definition) => [definition.key, record.computedProperties?.[definition.key] ?? null]));
}

async function rebuildComputedProjections(source, targetClient, target) {
  const { MongoCareerComputationService } = await import("../../services/backend/dist/modules/career-computation/service.js");
  const computation = new MongoCareerComputationService({ client: targetClient, db: target });
  const mismatches = [];
  let rebuilt = 0;
  for await (const record of target.collection("career_records").find({ deletedAt: null }, { batchSize: 100 }).sort({ _id: 1 })) {
    const category = await target.collection("career_categories").findOne({ _id: record.categoryId, $or: [{ userId: null }, { userId: record.userId }, { userId: { $exists: false } }] });
    const definitions = category?.propertySchemaV2?.filter((definition) => definition.deletedAt === null) ?? [];
    const derivedIds = definitions.filter((definition) => definition.type === "formula" || definition.type === "rollup").map((definition) => definition.id);
    if (!derivedIds.length) continue;
    const sourceRecord = await source.collection("career_records").findOne({ _id: record._id, userId: record.userId });
    const expected = semanticComputed(sourceRecord ?? {}, definitions);
    await target.collection("career_records").updateOne({ _id: record._id, userId: record.userId }, { $unset: { computedProperties: "" } });
    const result = await computation.recompute({ eventId: `00000000-0000-4000-8000-${String(rebuilt + 1).padStart(12, "0")}`, userId: record.userId, recordId: record._id, changedPropertyIds: definitions.map((definition) => definition.id), sourceRecordVersion: record.version });
    const rebuiltRecord = await target.collection("career_records").findOne({ _id: record._id, userId: record.userId });
    if (result !== "applied" || JSON.stringify(canonical(semanticComputed(rebuiltRecord ?? {}, definitions))) !== JSON.stringify(canonical(expected))) mismatches.push(record._id);
    rebuilt += 1;
  }
  return { rebuilt, mismatches };
}

const sourceClient = new MongoClient(sourceUrl, { serverSelectionTimeoutMS: 5_000 });
const targetClient = new MongoClient(targetUrl, { serverSelectionTimeoutMS: 5_000 });
try {
  await Promise.all([sourceClient.connect(), targetClient.connect()]);
  const [sourceHello, targetHello] = await Promise.all([sourceClient.db(sourceDatabase).admin().command({ hello: 1 }), targetClient.db(targetDatabase).admin().command({ hello: 1 })]);
  if (targetHello.isWritablePrimary !== true || targetHello.setName !== "rs0") throw new Error("restore target is not a writable rs0 primary");
  const sourceDb = sourceClient.db(sourceDatabase); const targetDb = targetClient.db(targetDatabase);
  if (restoreCopy) await copyCollections(sourceDb, targetDb);
  const [source, target] = await Promise.all([fingerprint(sourceDb), fingerprint(targetDb)]);
  const mismatches = editorCollections.filter((name) => JSON.stringify(source.collections[name]) !== JSON.stringify(target.collections[name]));
  if (JSON.stringify(source.ownerCategoryRecordCounts) !== JSON.stringify(target.ownerCategoryRecordCounts)) mismatches.push("owner_category_record_counts");
  if (JSON.stringify(source.computedProjection) !== JSON.stringify(target.computedProjection)) mismatches.push("computed_projection_restore");
  const projectionRebuild = await rebuildComputedProjections(sourceDb, targetClient, targetDb);
  if (projectionRebuild.mismatches.length) mismatches.push("computed_projection_rebuild");
  const report = { verifiedAt: new Date().toISOString(), sourceDatabase, targetDatabase, restoreCopy, sourceReplicaSet: sourceHello.setName ?? null, targetReplicaSet: targetHello.setName ?? null, source, target, projectionRebuild, mismatches };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report));
  if (mismatches.length) process.exitCode = 1;
} finally { await Promise.allSettled([sourceClient.close(), targetClient.close()]); }
