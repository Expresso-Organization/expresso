import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { MongoClient, type Document } from "mongodb";

import { loadMongoMigrations } from "./mongo-migrations.js";
import { migrateMongo } from "./mongo-migrate.js";
import { acquireMigrationLease, recoverMigrationLease } from "./migration-lease.js";
import { careerRecordSliceSteps } from "./mongodb-migrations/0009/migration.js";

const mongoUrl = process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL;
describe.skipIf(!mongoUrl)("MongoDB migration recovery", () => {
  const databaseName = `expresso_test_migration_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(mongoUrl ?? "mongodb://127.0.0.1", { serverSelectionTimeoutMS: 3_000 });
  const db = client.db(databaseName);
  const confirmed = { executionStopped: true, pendingCommandsTerminated: true };
  beforeAll(async () => { await client.connect(); });
  afterAll(async () => { try { await db.dropDatabase(); } finally { await client.close(); } });

  it("never steals an expired lease and requires termination confirmation plus the exact token", async () => {
    const lease = await acquireMigrationLease(db, -1);
    await expect(acquireMigrationLease(db)).rejects.toThrow("expiry alone");
    await expect(recoverMigrationLease(db, lease.token, { ...confirmed, pendingCommandsTerminated: false })).rejects.toThrow("termination");
    await expect(recoverMigrationLease(db, "wrong-token", confirmed)).rejects.toThrow("ownership lost");
    await recoverMigrationLease(db, lease.token, confirmed);
  });

  it("checkpoints successful steps, blocks unsafe retry and resumes only after explicit recovery", async () => {
    let fail = true;
    let firstRuns = 0;
    const migration = { version: "0001", name: "recovery_test", checksum: "a".repeat(64), steps: [
      { id: "first", async run() { firstRuns += 1; } },
      { id: "second", async run() { if (fail) throw new Error("known test failure"); } },
    ] };
    const options = { databaseUrl: mongoUrl!, databaseName, migrations: [migration] };
    await expect(migrateMongo(options)).rejects.toThrow("known test failure");
    const history = await db.collection<{ _id: string; completedSteps: string[] }>("schema_migrations").findOne({ _id: "0001" });
    expect(history?.completedSteps).toEqual(["first"]);
    await expect(migrateMongo(options)).rejects.toThrow("expiry alone");
    const lock = await db.collection<{ token: string }>("migration_locks").findOne({});
    await recoverMigrationLease(db, lock!.token, confirmed);
    fail = false;
    expect((await migrateMongo(options)).applied).toEqual(["0001_recovery_test"]);
    expect(firstRuns).toBe(1);
    expect((await migrateMongo(options)).existing).toEqual(["0001_recovery_test"]);
    await expect(migrateMongo({ ...options, migrations: [{ ...migration, checksum: "b".repeat(64) }] })).rejects.toThrow("modified");
    expect(firstRuns).toBe(1);
  });
});

describe("MongoDB migration sources", () => {
  it("loads versioned original sources with stable checksums", async () => {
    const first = await loadMongoMigrations();
    const second = await loadMongoMigrations();
    expect(first.map(({ version, checksum }) => ({ version, checksum }))).toEqual(
      second.map(({ version, checksum }) => ({ version, checksum })),
    );
    expect(first).toHaveLength(9);
    expect(first.at(-1)).toMatchObject({
      version: "0009",
      name: "career_record_slice",
    });
    expect(first.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum))).toBe(true);
    for (const migration of first) {
      expect(new Set(migration.steps.map(({ id }) => id)).size).toBe(migration.steps.length);
    }
  });
});
describe.skipIf(!mongoUrl)("Career record slice migration 0009", () => {
  it("assigns stable UUIDv5 property IDs without rewriting healthy data", async () => {
    const databaseName = `expresso_test_career_slice_${randomUUID().replaceAll("-", "")}`;
    const client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 3_000 });
    const migrations = await loadMongoMigrations();
    const db = client.db(databaseName);
    try {
      await client.connect();
      await migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations: migrations.slice(0, 8) });
      const legacyRecord = {
        _id: randomUUID(), userId: randomUUID(), categoryId: "475106fc-bf88-4a73-9c27-66c648733936",
        title: "Legacy", status: "draft", origin: "manual", properties: { role: "Backend" },
        bodyMd: "Legacy body", version: 1, updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      };
      const records = db.collection<Document & { _id: string }>("career_records");
      await records.insertOne(legacyRecord);

      await migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations });
      const categories = db.collection<Document & { _id: string }>("career_categories");
      const experience = await categories.findOne({ _id: "475106fc-bf88-4a73-9c27-66c648733936" });
      const project = await categories.findOne({ _id: "af5510dc-9717-4f1e-b0f9-4afd79aafe0f" });
      expect(experience?.["propertyDefinitions"]).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "1c768bad-2c1f-5cee-86c5-a43574f0e256", key: "role" }),
        expect.objectContaining({ id: "d8ad6b64-6417-5e5a-967b-dca084c1892e", key: "organization" }),
      ]));
      expect(project?.["propertyDefinitions"]).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "07e3e4c1-b357-542a-9f48-4e5afa65f57d", key: "role" }),
      ]));

      const healthyCategories = await categories.find({ isSystem: true }).sort({ _id: 1 }).toArray();
      const healthyRecord = await records.findOne({ _id: legacyRecord._id });
      for (const step of await careerRecordSliceSteps()) await step.run(db);
      expect(await categories.find({ isSystem: true }).sort({ _id: 1 }).toArray()).toEqual(healthyCategories);
      expect(await records.findOne({ _id: legacyRecord._id })).toEqual(healthyRecord);

      const reversedSchema = Object.fromEntries(Object.entries(experience?.["propertySchema"] as Document).reverse());
      await categories.updateOne({ _id: experience!._id }, { $set: { propertySchema: reversedSchema } });
      for (const step of await careerRecordSliceSteps()) await step.run(db);
      expect((await categories.findOne({ _id: experience!._id }))?.["propertyDefinitions"])
        .toEqual(experience?.["propertyDefinitions"]);
    } finally {
      try { await db.dropDatabase(); } finally { await client.close(); }
    }
  }, 60_000);

  it("rejects conflicting existing property definitions instead of overwriting them", async () => {
    const databaseName = `expresso_test_career_conflict_${randomUUID().replaceAll("-", "")}`;
    const client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 3_000 });
    const migrations = await loadMongoMigrations();
    const db = client.db(databaseName);
    try {
      await client.connect();
      await migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations: migrations.slice(0, 8) });
      const categories = db.collection<Document & { _id: string }>("career_categories");
      const conflicting = [{
        id: randomUUID(), key: "role", label: "충돌", type: "text", required: false, system: false,
      }];
      await categories.updateOne(
        { _id: "475106fc-bf88-4a73-9c27-66c648733936" },
        { $set: { propertyDefinitions: conflicting } },
      );

      await expect(migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations }))
        .rejects.toThrow(/conflicting propertyDefinitions.*475106fc-bf88-4a73-9c27-66c648733936/i);
      expect((await categories.findOne({ _id: "475106fc-bf88-4a73-9c27-66c648733936" }))?.["propertyDefinitions"])
        .toEqual(conflicting);
    } finally {
      try { await db.dropDatabase(); } finally { await client.close(); }
    }
  }, 60_000);
});
