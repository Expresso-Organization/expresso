import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

import { loadMongoMigrations } from "./mongo-migrations.js";
import { migrateMongo } from "./mongo-migrate.js";
import { acquireMigrationLease, recoverMigrationLease } from "./migration-lease.js";

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
    expect(first).toHaveLength(5);
    expect(first.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum))).toBe(true);
    for (const migration of first) {
      expect(new Set(migration.steps.map(({ id }) => id)).size).toBe(migration.steps.length);
    }
  });
});

