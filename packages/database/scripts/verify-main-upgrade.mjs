import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { BSON, MongoClient } from "mongodb";
import { loadMongoMigrations, migrateMongo } from "../dist/index.js";

const databaseUrl = process.env.TEST_MONGODB_URL;
const databaseName = process.env.VERIFY_UPGRADE_DATABASE;
if (!databaseUrl || !databaseName?.startsWith("expresso_test_")) throw new Error("TEST_MONGODB_URL and an expresso_test_ VERIFY_UPGRADE_DATABASE are required");
const client = new MongoClient(databaseUrl, { serverSelectionTimeoutMS: 3_000 });
const hash = value => createHash("sha256").update(BSON.EJSON.stringify(value, { relaxed: false })).digest("hex");
try {
  const db = client.db(databaseName);
  const before = new Map();
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name === "migration_locks") continue;
    before.set(name, await db.collection(name).find({}).sort({ _id: 1 }).toArray());
  }
  const history = before.get("schema_migrations");
  if (!history?.length || history.some(row => row._id >= "0025")) throw new Error("verification requires an already migrated main fixture before 0025");
  const registered = await loadMongoMigrations();
  for (const row of history) {
    const migration = registered.find(item => item.version === row._id);
    assert.equal(migration?.name, row.name);
    assert.equal(migration?.checksum, row.checksum);
  }
  const result = await migrateMongo({ databaseUrl, databaseName });
  const preserved = [];
  for (const [name, documents] of before) {
    let after = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
    if (name === "schema_migrations") after = after.filter(row => row._id < "0025");
    if (name === "career_records") after = after.map(row => {
      const original = documents.find(item => String(item._id) === String(row._id));
      if (!Object.hasOwn(original, "propertyValues")) { const { propertyValues: _, ...rest } = row; return rest; }
      return row;
    });
    assert.equal(hash(after), hash(documents), `${name}: original documents changed`);
    preserved.push({ collection: name, count: documents.length, sha256: hash(documents) });
  }
  const categories = await db.collection("career_categories").find({}).toArray();
  assert.ok(categories.every(row => typeof row.userId === "string" && Array.isArray(row.propertySchemaV2) && !Object.hasOwn(row, "isSystem") && !Object.hasOwn(row, "propertySchema")));
  const records = await db.collection("career_records").find({}).toArray();
  assert.ok(records.every(row => Array.isArray(row.propertyValues)));
  const rerun = await migrateMongo({ databaseUrl, databaseName });
  assert.deepEqual(rerun.applied, []);
  console.log(JSON.stringify({ databaseName, result, rerun, categories: categories.length, records: records.length, historicalChecksumsPreserved: history.length, registry: registered.map(({ version, name, checksum }) => ({ version, name, checksum })), preserved }, null, 2));
} finally { await client.close(); }
