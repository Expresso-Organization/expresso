import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { BSON, MongoClient } from "mongodb";
import { loadMongoMigrations, migrateMongo } from "../dist/index.js";

const databaseUrl = process.env.TEST_MONGODB_URL;
const sourceName = process.env.CLONE_UPGRADE_SOURCE;
const targetName = process.env.VERIFY_UPGRADE_DATABASE;
if (!databaseUrl || !sourceName?.startsWith("expresso_test_") || !targetName?.startsWith("expresso_test_") || sourceName === targetName) throw new Error("distinct expresso_test_ source/target and TEST_MONGODB_URL required");
const report = JSON.parse(await readFile(process.env.VERIFY_UPGRADE_REPORT, "utf8"));
assert.equal(report.databaseName, sourceName);
const client = new MongoClient(databaseUrl, { serverSelectionTimeoutMS: 3_000 });
const hash = value => createHash("sha256").update(BSON.EJSON.stringify(value, { relaxed: false })).digest("hex");
try {
  const source = client.db(sourceName), target = client.db(targetName);
  assert.equal((await target.listCollections().toArray()).length, 0, "clone target must be empty");
  const originals = new Map();
  for (const item of report.preserved) {
    let documents = await source.collection(item.collection).find({}).sort({ _id: 1 }).toArray();
    if (item.collection === "schema_migrations") documents = documents.filter(row => row._id < "0025");
    // 이 대표 fixture의 원본 기록에는 canonical 배열이 없었다. 해시가 다르면 복사를 거부한다.
    if (item.collection === "career_records") documents = documents.map(({ propertyValues: _, ...row }) => row);
    assert.equal(hash(documents), item.sha256, `${item.collection}: source no longer matches the original main fixture`);
    originals.set(item.collection, documents);
  }
  await migrateMongo({ databaseUrl, databaseName: targetName, migrations: (await loadMongoMigrations()).filter(item => item.version < "0025") });
  for (const [name, documents] of originals) {
    await target.collection(name).deleteMany({});
    if (documents.length) await target.collection(name).insertMany(documents);
  }
  console.log(JSON.stringify({ sourceName, targetName, originalCollectionsVerified: originals.size }));
} finally { await client.close(); }
