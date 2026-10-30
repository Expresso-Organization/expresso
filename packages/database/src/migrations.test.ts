import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

import mainChecksums from "./main-migration-checksums.json" with { type: "json" };
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

  it.each([
    { version: "0017", name: "career_canonical_preparation" },
    { version: "0014", name: "career_business_writer_preparation" },
    { version: "0099", name: "unreconciled_future" },
  ])("rejects conflicting deployed history $version before any lock, checkpoint or DDL", async ({ version, name }) => {
    const collisionName = `expresso_test_collision_${randomUUID().replaceAll("-", "")}`;
    const isolated = client.db(collisionName);
    try {
      const recorded = { _id: version, name, checksum: "c".repeat(64), state: "applied", completedSteps: [], appliedAt: new Date() };
      await isolated.collection("schema_migrations").insertOne(recorded as never);
      const before = await isolated.collection("schema_migrations").find({}).toArray();
      await expect(migrateMongo({ databaseUrl: mongoUrl!, databaseName: collisionName })).rejects.toThrow("MIGRATION_HISTORY_CONFLICT");
      expect(await isolated.collection("schema_migrations").find({}).toArray()).toEqual(before);
      expect(await isolated.listCollections({}, { nameOnly: true }).toArray()).toEqual([expect.objectContaining({ name: "schema_migrations" })]);
    } finally { await isolated.dropDatabase(); }
  });

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
  it("keeps forward checksum inputs in LF form across Windows staging and deployment", async () => {
    for (const version of ["0025", "0026", "0027", "0028", "0029", "0030"]) {
      const directory = new URL(`./mongodb-migrations/${version}/`, import.meta.url);
      const manifest = await readFile(new URL("checksum-manifest.json", directory));
      const { files } = JSON.parse(manifest.toString("utf8")) as { files: string[] };
      for (const file of ["checksum-manifest.json", ...files]) {
        expect((await readFile(new URL(file, directory))).includes(13), `${version}/${file} must contain LF only`).toBe(false);
      }
    }
  });

  it("preserves all migration identities and checksums already recorded by main", async () => {
    const list = await loadMongoMigrations();
    expect(list.filter(item => item.version < "0025").map(({ version, name, checksum }) => ({ version, name, checksum }))).toEqual(mainChecksums);
    expect(list.filter(item => item.version >= "0025").map(item => item.version)).toEqual(["0025", "0026", "0027", "0028", "0029", "0030"]);
  });
  it("loads versioned original sources with stable checksums", async () => {
    const first = await loadMongoMigrations();
    const second = await loadMongoMigrations();
    expect(first.map(({ version, checksum }) => ({ version, checksum }))).toEqual(
      second.map(({ version, checksum }) => ({ version, checksum })),
    );
    expect(first).toHaveLength(25);
    expect(first.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum))).toBe(true);
    for (const migration of first) {
      expect(new Set(migration.steps.map(({ id }) => id)).size).toBe(migration.steps.length);
    }
  });

  it("preserves every migration checksum in the deployed build", async () => {
    const source = await loadMongoMigrations();
    const builtModule = await import(new URL("../dist/mongo-migrations.js", import.meta.url).href) as typeof import("./mongo-migrations.js");
    const built = await builtModule.loadMongoMigrations();
    const identity = ({ version, name, checksum }: typeof source[number]) => ({ version, name, checksum });
    expect(built.map(identity)).toEqual(source.map(identity));
  });
});
