import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_RESTORE_URL;
const databaseName = process.env.MONGODB_RESTORE_DATABASE;
const outputPath = process.argv[2];
if (!uri || !databaseName || !outputPath) throw new Error("restore verification configuration is incomplete");

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
try {
  await client.connect();
  const db = client.db(databaseName);
  const hello = await db.admin().command({ hello: 1 });
  if (hello.isWritablePrimary !== true || hello.setName !== "rs0") {
    throw new Error("restore target is not a writable rs0 primary");
  }
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = collections.map(({ name }) => name).filter((name) => !name.startsWith("system.")).sort();
  const counts = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()])));
  const jobAssetHashes = Object.fromEntries(await Promise.all([
    "job_sources", "companies", "job_postings", "job_posting_requirements",
  ].map(async (name) => {
    const documents = await db.collection(name).find().sort({ _id: 1 }).toArray();
    return [name, createHash("sha256").update(JSON.stringify(documents)).digest("hex")];
  })));
  const migration = await db.collection("schema_migrations").find().sort({ version: -1 }).limit(1).next();
  if (!migration || migration.version < 4) throw new Error("restored schema migration is behind version 4");

  const brokenChunks = await db.collection("snapshot_chunks").countDocuments({
    $or: [{ payloadId: { $exists: false } }, { part: { $exists: false } }, { bytes: { $exists: false } }, { sha256: { $exists: false } }],
  });
  const references = [];
  for (const collection of ["deployments", "portfolio_snapshots", "recipe_revisions"]) {
    const rows = await db.collection(collection).find({ "snapshot.kind": "chunks" }).project({ _id: 1, snapshot: 1 }).toArray();
    for (const row of rows) references.push({ collection, id: row._id, ref: row.snapshot });
  }
  let brokenChunkSets = 0;
  const referencedPayloads = new Set();
  for (const { ref } of references) {
    referencedPayloads.add(ref.payloadId);
    const chunks = await db.collection("snapshot_chunks").find({ payloadId: ref.payloadId }).sort({ part: 1 }).toArray();
    if (chunks.length !== ref.parts || chunks.some((chunk, index) => chunk.part !== index)) { brokenChunkSets += 1; continue; }
    const bytes = [];
    let invalidDigest = false;
    for (const chunk of chunks) {
      const value = Buffer.from(chunk.bytes.buffer); bytes.push(value);
      if (createHash("sha256").update(value).digest("hex") !== chunk.sha256) invalidDigest = true;
    }
    if (invalidDigest || createHash("sha256").update(Buffer.concat(bytes)).digest("hex") !== ref.sha256) brokenChunkSets += 1;
  }
  const chunkPayloads = await db.collection("snapshot_chunks").distinct("payloadId");
  const orphanChunkSets = chunkPayloads.filter((payloadId) => !referencedPayloads.has(payloadId)).length;
  if (brokenChunks > 0 || brokenChunkSets > 0) throw new Error("snapshot chunk integrity check failed");

  const report = {
    verifiedAt: new Date().toISOString(),
    database: databaseName,
    replicaSet: hello.setName,
    latestMigration: migration.version,
    collectionCount: names.length,
    counts,
    jobAssetHashes,
    chunkIntegrity: { references: references.length, brokenChunks, brokenChunkSets, orphanChunkSets },
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report));
} finally {
  await client.close();
}
