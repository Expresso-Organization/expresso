import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { MongoClient, type Document } from "mongodb";

import { loadMongoMigrations } from "./mongo-migrations.js";
import { migrateMongo } from "./mongo-migrate.js";
import { acquireMigrationLease, recoverMigrationLease } from "./migration-lease.js";
import { careerRecordSliceSteps } from "./mongodb-migrations/0009/migration.js";
import { careerRichBlockBodySteps } from "./mongodb-migrations/0010/migration.js";

const richBlockBodyFixtures = JSON.parse(
  readFileSync(
    new URL("../../contracts/openapi/fixtures/career-rich-block-body-v1.json", import.meta.url),
    "utf8",
  ),
) as Record<string, Document>;

function careerRecord(blockBody?: Document): Document & { _id: string } {
  return {
    _id: randomUUID(),
    userId: randomUUID(),
    categoryId: "475106fc-bf88-4a73-9c27-66c648733936",
    title: "",
    status: "draft",
    origin: "manual",
    properties: {},
    bodyMd: "",
    version: 1,
    updatedAt: new Date("2026-09-05T00:00:00.000Z"),
    ...(blockBody ? { propertyValues: [], blockBody, editorSchemaVersion: 1 } : {}),
  };
}

async function currentValidator(client: MongoClient, databaseName: string): Promise<Document> {
  const info = await client.db(databaseName).listCollections(
    { name: "career_records" },
    { nameOnly: false },
  ).next() as Document | null;
  if (!info) throw new Error("career_records collection is missing");
  return structuredClone((info.options.validator ?? {}) as Document);
}

function withoutBlockBodySchema(validator: Document): Document {
  const result = structuredClone(validator);
  delete (((result["$jsonSchema"] as Document)["properties"] as Document)["blockBody"]);
  return result;
}

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
    expect(first).toHaveLength(10);
    expect(first.at(-1)).toMatchObject({
      version: "0010",
      name: "career_rich_block_body",
    });
    expect(first.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum))).toBe(true);
    for (const migration of first) {
      expect(new Set(migration.steps.map(({ id }) => id)).size).toBe(migration.steps.length);
    }
  });
});

describe.skipIf(!mongoUrl)("Career rich block body migration 0010", () => {
  it("widens only blockBody validation without rewriting existing records", async () => {
    const databaseName = `expresso_test_career_rich_body_${randomUUID().replaceAll("-", "")}`;
    const client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 3_000 });
    const migrations = await loadMongoMigrations();
    const db = client.db(databaseName);
    const records = db.collection<Document & { _id: string }>("career_records");
    try {
      await client.connect();
      await migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations: migrations.slice(0, 9) });

      const legacyRecord = careerRecord();
      const paragraphRecord = careerRecord(richBlockBodyFixtures.paragraphOnly!);
      await records.insertMany([legacyRecord, paragraphRecord]);
      const recordsBefore = await records.find({}).sort({ _id: 1 }).toArray();
      const validatorBefore = await currentValidator(client, databaseName);

      await migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations });

      expect(await records.find({}).sort({ _id: 1 }).toArray()).toEqual(recordsBefore);
      const validatorAfter = await currentValidator(client, databaseName);
      expect(withoutBlockBodySchema(validatorAfter)).toEqual(withoutBlockBodySchema(validatorBefore));

      for (const fixtureName of ["emptyRoot", "richNested", "unknownBlock"] as const) {
        await expect(records.insertOne(careerRecord(richBlockBodyFixtures[fixtureName]!))).resolves.toBeDefined();
      }
      await expect(records.insertOne(careerRecord())).resolves.toBeDefined();

      const healthyRecordsBeforeRerun = await records.find({}).sort({ _id: 1 }).toArray();
      const validatorBeforeRerun = await currentValidator(client, databaseName);
      const indexesBeforeRerun = await records.listIndexes().toArray();
      for (const step of await careerRichBlockBodySteps()) await step.run(db);
      expect(await records.find({}).sort({ _id: 1 }).toArray()).toEqual(healthyRecordsBeforeRerun);
      expect(await currentValidator(client, databaseName)).toEqual(validatorBeforeRerun);
      expect(await records.listIndexes().toArray()).toEqual(indexesBeforeRerun);

      const invalidBlockType = structuredClone(richBlockBodyFixtures.paragraphOnly!);
      invalidBlockType["content"][0].type = "Heading 1";
      await expect(records.insertOne(careerRecord(invalidBlockType))).rejects.toThrow();

      const invalidAttrs = structuredClone(richBlockBodyFixtures.paragraphOnly!);
      invalidAttrs["content"][0].attrs = [];
      await expect(records.insertOne(careerRecord(invalidAttrs))).rejects.toThrow();

      const oversizedText = structuredClone(richBlockBodyFixtures.paragraphOnly!);
      oversizedText["content"][0].text = [{ text: "가".repeat(200_001) }];
      await expect(records.insertOne(careerRecord(oversizedText))).rejects.toThrow();

      const tooManyMarks = structuredClone(richBlockBodyFixtures.paragraphOnly!);
      tooManyMarks["content"][0].text = [{
        text: "본문",
        marks: Array.from({ length: 21 }, () => ({ type: "bold" })),
      }];
      await expect(records.insertOne(careerRecord(tooManyMarks))).rejects.toThrow();

      const missingCompatibilityField = careerRecord(richBlockBodyFixtures.emptyRoot!);
      delete missingCompatibilityField["bodyMd"];
      await expect(records.insertOne(missingCompatibilityField)).rejects.toThrow();

      const rerun = await migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations });
      expect(rerun.existing).toContain("0010_career_rich_block_body");
    } finally {
      try { await db.dropDatabase(); } finally { await client.close(); }
    }
  }, 60_000);
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
