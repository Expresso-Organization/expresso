import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Decimal128, Long, MongoClient, type Db, type Document } from "mongodb";

import { loadMongoMigrations } from "./mongo-migrations.js";
import { migrateMongo } from "./mongo-migrate.js";
import { acquireMigrationLease, recoverMigrationLease } from "./migration-lease.js";
import { careerRecordSliceSteps } from "./mongodb-migrations/0009/migration.js";
import { careerRichBlockBodySteps } from "./mongodb-migrations/0010/migration.js";
import { careerPropertyCanonicalIdentitySteps } from "./mongodb-migrations/0011/migration.js";
import { careerPropertyLegacyBackfillSteps } from "./mongodb-migrations/0012/migration.js";
import { careerComputationVersionSteps } from "./mongodb-migrations/0013/migration.js";
import { legacy0009PropertyDefinitionId, officialPropertyDefinitionId } from "./career-property-canonical-mapping.js";
import { exactOptionId } from "./career-property-canonical-mapping.js";

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

  it("stops at an explicit target version and can later continue from that checkpoint", async () => {
    const targetDatabaseName = `expresso_test_target_${randomUUID().replaceAll("-", "")}`;
    const migrations = [
      { version: "0001", name: "first", checksum: "a".repeat(64), steps: [{ id: "first", async run(database: typeof db) { await database.collection("target_probe").insertOne({ version: "0001" }); } }] },
      { version: "0002", name: "second", checksum: "b".repeat(64), steps: [{ id: "second", async run(database: typeof db) { await database.collection("target_probe").insertOne({ version: "0002" }); } }] },
    ];
    const targetDb = client.db(targetDatabaseName);
    try {
      const first = await migrateMongo({ databaseUrl: mongoUrl!, databaseName: targetDatabaseName, migrations, targetVersion: "0001" });
      expect(first.applied).toEqual(["0001_first"]);
      expect(await targetDb.collection("target_probe").find({}).toArray()).toEqual([{ _id: expect.anything(), version: "0001" }]);

      const second = await migrateMongo({ databaseUrl: mongoUrl!, databaseName: targetDatabaseName, migrations, targetVersion: "0002" });
      expect(second.existing).toEqual(["0001_first"]);
      expect(second.applied).toEqual(["0002_second"]);
      expect(await targetDb.collection("target_probe").countDocuments()).toBe(2);
    } finally {
      await targetDb.dropDatabase();
    }
  });
});

describe("MongoDB migration sources", () => {
  it("loads versioned original sources with stable checksums", async () => {
    const first = await loadMongoMigrations();
    const second = await loadMongoMigrations();
    expect(first.map(({ version, checksum }) => ({ version, checksum }))).toEqual(
      second.map(({ version, checksum }) => ({ version, checksum })),
    );
    expect(first).toHaveLength(13);
    expect(first.at(-1)).toMatchObject({
      version: "0013",
      name: "career_computation_version",
    });
    expect(first.slice(0, 10).map(({ checksum }) => checksum)).toEqual([
      "7c81bedd5bac9488e40f27fb0d9de82d7b6cab6878108ef2fd58559d7c3088a7",
      "394b18fd931de92ed152a40c20dfea288f426750f4b5eaa923d384d6c6797dca",
      "f4df1c62d27eeb368aa1e91daf7083dd9191e58bf9290746be194b8f862e19c9",
      "ec98bc289d6289910e4840791a4f62dff6e2d889d00f145de6c95884920f9da5",
      "95f34fe3c07e0206befd82583b9a3b787b307554b8f99b22954bf6a40b6bf064",
      "2dca952d62cdd8004e24f4b4e82d941ea53e7aa7e6535ba186382c8617ea8f14",
      "2522da0b6fff0deea43cd58bb4d226ebfee1447a00b4caeda273fa5275f28add",
      "990235953ca8cf3c935837434a9f65073c8876551eccc5f40a35b64bf6483308",
      "1c321506a45a5c72ec9572de8b2eba0d3ce634a770ff0553519be71ac4b90b07",
      "43774a50e2691950680a5ec4cea2c283664ad2250bbf743c117fc4c077295674",
    ]);
    expect(first.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum))).toBe(true);
    for (const migration of first) {
      expect(new Set(migration.steps.map(({ id }) => id)).size).toBe(migration.steps.length);
    }
  });

  it("adds optional computation fields without changing canonical version fields", async () => {
    const commands: Document[] = [];
    const validator = { $jsonSchema: { properties: {
      version: { bsonType: "int" }, updatedAt: { bsonType: "date" },
    } } };
    const db = {
      listCollections: () => ({ next: async () => ({ options: { validator } }) }),
      command: async (command: Document) => { commands.push(command); },
    } as unknown as Db;

    for (const step of await careerComputationVersionSteps()) await step.run(db);

    const properties = commands[0]?.validator.$jsonSchema.properties;
    expect(properties.computationVersion).toEqual({
      bsonType: ["int", "long", "double"], minimum: 0, multipleOf: 1,
    });
    expect(properties.computedAt).toEqual({ bsonType: ["date", "null"] });
    expect(properties.version).toEqual({ bsonType: "int" });
    expect(properties.updatedAt).toEqual({ bsonType: "date" });
  });
});

describe.skipIf(!mongoUrl)("Career property canonical identity migration 0011", () => {
  it("materializes official definitions and remaps every registered 0009 reference idempotently", async () => {
    const databaseName = `expresso_test_cp11_${randomUUID().slice(0, 16).replaceAll("-", "")}`;
    const client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 3_000, monitorCommands: true });
    const db = client.db(databaseName);
    const categoryId = "475106fc-bf88-4a73-9c27-66c648733936";
    const roleOfficialId = officialPropertyDefinitionId(categoryId, "role");
    const role0009Id = legacy0009PropertyDefinitionId(categoryId, "role");
    const sourceRecordId = randomUUID();
    const targetRecordId = randomUUID();
    const migrationFindBatchSizes: Array<number | undefined> = [];
    let monitorMigrationReads = false;
    client.on("commandStarted", ({ commandName, command }) => {
      if (monitorMigrationReads && commandName === "find" && command["find"] === "career_records") {
        migrationFindBatchSizes.push(command["batchSize"] as number | undefined);
      }
    });
    try {
      await client.connect();
      const migrations = await loadMongoMigrations();
      await migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations: migrations.slice(0, 10) });

      const categories = db.collection<Document & { _id: string }>("career_categories");
      const records = db.collection<Document & { _id: string }>("career_records");
      const category = await categories.findOne({ _id: categoryId });
      const propertySchema = category?.["propertySchema"] as Document;
      const propertySchemaV2 = Object.entries(propertySchema).map(([key, raw], order) => {
        const definition = raw as Document;
        return {
          id: definition["id"], key, name: definition["label"],
          type: definition["type"] === "tags" ? "multi_select" : definition["type"] === "boolean" ? "checkbox" : definition["type"],
          required: definition["required"], system: definition["system"], config: {}, order, version: 1, deletedAt: null,
        };
      });
      const formulaId = randomUUID();
      propertySchemaV2.push({
        id: formulaId, key: "scoreFormula", name: "점수 수식", type: "formula",
        required: false, system: false,
        config: { source: "role", ast: { expression: { propertyId: role0009Id } }, diagnostics: [] },
        order: propertySchemaV2.length, version: 2, deletedAt: null,
      });
      await categories.updateOne(
        { _id: categoryId },
        { $set: { propertySchemaV2, propertyMutationResults: { latest: { propertyId: role0009Id } } } },
        { bypassDocumentValidation: true },
      );

      const customCategoryId = randomUUID();
      const customPropertyId = randomUUID();
      const customCategory = structuredClone(category!);
      customCategory._id = customCategoryId;
      customCategory["userId"] = randomUUID();
      customCategory["key"] = `custom_${customCategoryId.slice(0, 8)}`;
      customCategory["name"] = "사용자 카테고리";
      customCategory["isSystem"] = false;
      customCategory["propertySchema"] = {
        note: { id: customPropertyId, type: "text", label: "이전 이름", required: false, system: false },
      };
      customCategory["propertySchemaV2"] = [{
        id: customPropertyId, key: "note", name: "사용자 메모", type: "text",
        required: false, system: false, config: {}, order: 7, version: 3, deletedAt: null,
      }];
      const deletedPropertyId = randomUUID();
      customCategory["propertySchemaTombstones"] = [{
        id: deletedPropertyId, key: "archived", name: "삭제된 속성", type: "text",
        required: false, system: false, config: {}, order: 8, version: 4,
        deletedAt: "2026-09-05T12:00:00.000Z",
      }];
      delete customCategory["propertyDefinitions"];
      await categories.insertOne(customCategory, { bypassDocumentValidation: true });

      const recordBase = {
        userId: randomUUID(), categoryId, title: "", status: "draft", origin: "manual",
        properties: {}, bodyMd: "", blockBody: richBlockBodyFixtures.emptyRoot,
        editorSchemaVersion: 1, version: 1, updatedAt: new Date("2026-09-05T00:00:00.000Z"),
        deletedAt: null, purgeAfter: null,
      };
      await records.insertMany([
        {
          _id: sourceRecordId, ...recordBase,
          propertyValues: [
            { propertyDefinitionId: role0009Id, type: "text", value: "Backend" },
            { propertyDefinitionId: roleOfficialId, type: "text", value: "Backend" },
          ],
          propertyValueTombstones: {
            [role0009Id]: { type: "text", value: "old" },
            [roleOfficialId]: { type: "text", value: "old" },
          },
          computedProperties: {
            decimal: Decimal128.fromString("123.450"),
            integer: Long.fromString("9007199254740993"),
            calculatedAt: new Date("2026-09-05T12:00:00.000Z"),
          },
        },
        { _id: targetRecordId, ...recordBase, propertyValues: [] },
      ], { bypassDocumentValidation: true });
      await db.collection<Document & { _id: string }>("career_views").insertOne({
        _id: randomUUID(), userId: recordBase.userId, categoryId, createdAt: new Date(),
        configuration: {
          filter: { propertyId: role0009Id }, sorts: [{ propertyId: role0009Id }],
          visiblePropertyIds: [role0009Id, roleOfficialId], propertyOrder: [role0009Id],
          columnWidths: { [role0009Id]: 240 }, groupPropertyId: role0009Id,
        },
      }, { bypassDocumentValidation: true });
      await db.collection<Document & { _id: string }>("career_record_relations").insertOne({
        _id: randomUUID(), sourceRecordId, sourcePropertyId: role0009Id,
        targetRecordId, inversePropertyId: role0009Id,
      }, { bypassDocumentValidation: true });
      await db.collection<Document & { _id: string }>("career_ai_proposals").insertOne({
        _id: randomUUID(), recordId: sourceRecordId,
        propertyChanges: [{ propertyId: role0009Id, previousValue: null, nextValue: null }],
      }, { bypassDocumentValidation: true });
      await db.collection<Document & { _id: string }>("outbox_events").insertOne({
        _id: randomUUID(), topic: "career.computation",
        payload: {
          recordId: sourceRecordId, changedPropertyIds: [role0009Id, roleOfficialId],
          sourcePropertyVersions: { [role0009Id]: 1, [roleOfficialId]: 1 },
        },
      }, { bypassDocumentValidation: true });
      const propertyMutationTopics = ["career.property-conversion", "career.property-default", "career.property-deletion"];
      for (const [index, state] of ["pending", "published", "dead_letter"].entries()) {
        await db.collection<Document & { _id: string }>("outbox_events").insertOne({
          _id: randomUUID(), topic: propertyMutationTopics[index], state,
          idempotencyKey: `property-mutation-${index}`,
          payload: { categoryId, propertyId: role0009Id, sequence: index },
        }, { bypassDocumentValidation: true });
      }
      const categoryIndexesBefore = await categories.listIndexes().toArray();
      const recordIndexesBefore = await records.listIndexes().toArray();

      monitorMigrationReads = true;
      for (const step of await careerPropertyCanonicalIdentitySteps()) await step.run(db);
      monitorMigrationReads = false;
      expect(migrationFindBatchSizes.length).toBeGreaterThan(0);
      expect(migrationFindBatchSizes.every((size) => typeof size === "number" && size <= 100)).toBe(true);

      const migratedCategory = await categories.findOne({ _id: categoryId });
      const canonicalDefinitions = migratedCategory?.["propertyDefinitions"] as Document[];
      expect(canonicalDefinitions.find((definition) => definition["key"] === "role")).toMatchObject({
        id: roleOfficialId, key: "role", name: "역할", config: {}, order: expect.any(Number), version: 1, deletedAt: null,
      });
      expect(canonicalDefinitions.some((definition) => Object.hasOwn(definition, "label"))).toBe(false);
      expect(JSON.stringify(canonicalDefinitions)).not.toContain(role0009Id);
      expect(JSON.stringify(migratedCategory?.["propertySchemaV2"])).toContain(roleOfficialId);
      expect(JSON.stringify(migratedCategory?.["propertyMutationResults"])).toContain(roleOfficialId);
      expect(await db.collection("outbox_events").countDocuments({ "payload.propertyId": roleOfficialId })).toBe(3);
      expect((await categories.findOne({ _id: customCategoryId }))?.["propertyDefinitions"]).toEqual([
        {
          id: customPropertyId, key: "note", name: "사용자 메모", type: "text",
          required: false, system: false, config: {}, order: 7, version: 3, deletedAt: null,
        },
        {
          id: deletedPropertyId, key: "archived", name: "삭제된 속성", type: "text",
          required: false, system: false, config: {}, order: 8, version: 4,
          deletedAt: "2026-09-05T12:00:00.000Z",
        },
      ]);

      const migratedRecord = await records.findOne({ _id: sourceRecordId });
      expect(migratedRecord?.["propertyValues"]).toEqual([
        { propertyDefinitionId: roleOfficialId, type: "text", value: "Backend" },
      ]);
      expect(migratedRecord?.["propertyValueTombstones"]).toEqual({
        [roleOfficialId]: { type: "text", value: "old" },
      });
      expect(migratedRecord?.["computedProperties"]).toEqual({
        decimal: Decimal128.fromString("123.450"),
        integer: Long.fromString("9007199254740993"),
        calculatedAt: new Date("2026-09-05T12:00:00.000Z"),
      });
      expect(await categories.listIndexes().toArray()).toEqual(categoryIndexesBefore);
      expect(await records.listIndexes().toArray()).toEqual(recordIndexesBefore);

      const journal = await db.collection("career_property_migration_journal").find({}).toArray();
      expect(journal.length).toBeGreaterThan(0);
      expect(journal.every((entry) => entry["state"] === "applied")).toBe(true);
      expect(journal.every((entry) => /^[a-f0-9]{64}$/.test(String(entry["beforeDigest"])) && /^[a-f0-9]{64}$/.test(String(entry["afterDigest"])))).toBe(true);

      for (const collectionName of [
        "career_categories", "career_records", "career_views", "career_record_relations",
        "career_ai_proposals", "outbox_events",
      ]) {
        const documents = await db.collection(collectionName).find({}).toArray();
        expect(JSON.stringify(documents), collectionName).not.toContain(role0009Id);
      }

      const beforeRerun = await Promise.all([
        categories.find({}).sort({ _id: 1 }).toArray(),
        records.find({}).sort({ _id: 1 }).toArray(),
        db.collection("career_property_migration_journal").find({}).sort({ _id: 1 }).toArray(),
      ]);
      for (const step of await careerPropertyCanonicalIdentitySteps()) await step.run(db);
      expect(await Promise.all([
        categories.find({}).sort({ _id: 1 }).toArray(),
        records.find({}).sort({ _id: 1 }).toArray(),
        db.collection("career_property_migration_journal").find({}).sort({ _id: 1 }).toArray(),
      ])).toEqual(beforeRerun);

      const recoveredJournal = await db.collection<Document & { _id: string }>("career_property_migration_journal").findOne({ migration: "0011_career_property_canonical_identity" });
      await db.collection<Document & { _id: string }>("career_property_migration_journal").updateOne(
        { _id: recoveredJournal!._id },
        { $set: { state: "planned" }, $unset: { kind: "" } },
      );
      for (const step of await careerPropertyCanonicalIdentitySteps()) await step.run(db);
      expect((await db.collection<Document & { _id: string }>("career_property_migration_journal").findOne({ _id: recoveredJournal!._id }))?.["state"]).toBe("applied");

      await db.collection<Document & { _id: string }>(recoveredJournal!["collection"] as string).replaceOne(
        { _id: recoveredJournal!["documentId"] },
        recoveredJournal!["before"] as Document & { _id: string },
        { bypassDocumentValidation: true },
      );
      await db.collection<Document & { _id: string }>("career_property_migration_journal").updateOne({ _id: recoveredJournal!._id }, { $set: { state: "planned" } });
      for (const step of await careerPropertyCanonicalIdentitySteps()) await step.run(db);
      expect(await db.collection<Document & { _id: string }>(recoveredJournal!["collection"] as string).findOne({ _id: recoveredJournal!["documentId"] })).toEqual(recoveredJournal!["after"]);

      await db.collection<Document & { _id: string }>("career_property_migration_journal").updateOne({ _id: recoveredJournal!._id }, { $set: { state: "planned" } });
      await db.collection<Document & { _id: string }>(recoveredJournal!["collection"] as string).updateOne(
        { _id: recoveredJournal!["documentId"] },
        { $set: { crashRecoveryUserChange: true } },
        { bypassDocumentValidation: true },
      );
      await expect((async () => {
        for (const step of await careerPropertyCanonicalIdentitySteps()) await step.run(db);
      })()).rejects.toThrow(/journal recovery conflict|복구 conflict/i);
      expect((await db.collection<Document & { _id: string }>(recoveredJournal!["collection"] as string).findOne({ _id: recoveredJournal!["documentId"] }))?.["crashRecoveryUserChange"]).toBe(true);

      const propertyId = () => randomUUID();
      const writableValues = [
        { propertyDefinitionId: roleOfficialId, type: "text", value: "Backend" },
        { propertyDefinitionId: propertyId(), type: "number", value: Decimal128.fromString("123.45") },
        { propertyDefinitionId: propertyId(), type: "checkbox", value: true },
        { propertyDefinitionId: propertyId(), type: "select", value: null },
        { propertyDefinitionId: propertyId(), type: "multi_select", value: [propertyId(), propertyId()] },
        { propertyDefinitionId: propertyId(), type: "date", value: { precision: "month", start: "2026-09", end: null } },
        { propertyDefinitionId: propertyId(), type: "date", value: { precision: "day", start: "2026-09-05", end: "2026-09-06" } },
        { propertyDefinitionId: propertyId(), type: "date", value: { precision: "datetime", start: "2026-09-05T12:00:00+09:00", end: null, timezone: "Asia/Seoul" } },
        { propertyDefinitionId: propertyId(), type: "url", value: "https://example.com" },
        { propertyDefinitionId: propertyId(), type: "email", value: "career@example.com" },
        { propertyDefinitionId: propertyId(), type: "phone", value: "+82-10-0000-0000" },
        { propertyDefinitionId: propertyId(), type: "file", value: [propertyId()] },
        { propertyDefinitionId: propertyId(), type: "media", value: [propertyId()] },
      ];
      await expect(records.updateOne({ _id: targetRecordId }, { $set: { propertyValues: writableValues } }))
        .resolves.toMatchObject({ modifiedCount: 1 });
      await expect(records.updateOne(
        { _id: targetRecordId },
        { $set: { propertyValues: [{ propertyDefinitionId: propertyId(), type: "relation", value: [] }] } },
      )).rejects.toThrow();
      await expect(records.updateOne(
        { _id: targetRecordId },
        { $set: { propertyValues: [{ propertyDefinitionId: propertyId(), type: "date", value: { precision: "datetime", start: "2026-09-05T12:00:00", end: null, timezone: null } }] } },
      )).rejects.toThrow();
    } finally {
      try { await db.dropDatabase(); } finally { await client.close(); }
    }
  }, 60_000);

  it.each([
    ["서로 다른 old/official 값", (document: Document, oldId: string, officialId: string) => {
      document["propertyValues"] = [
        { propertyDefinitionId: oldId, type: "text", value: "old" },
        { propertyDefinitionId: officialId, type: "text", value: "official" },
      ];
    }],
    ["registry 밖 0009 ID", (document: Document, oldId: string) => {
      document["unexpectedReference"] = { propertyDefinitionId: oldId };
    }],
    ["owner가 모호한 unmapped reference", (document: Document, oldId: string) => {
      document["unmappedProperties"] = { [oldId]: { type: "text", value: "보존값" } };
    }],
  ])("첫 write 전에 %s conflict를 중단한다", async (_label, mutate) => {
    const databaseName = `expresso_test_cp11_abort_${randomUUID().slice(0, 12).replaceAll("-", "")}`;
    const client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 3_000 });
    const db = client.db(databaseName);
    const categoryId = "475106fc-bf88-4a73-9c27-66c648733936";
    const oldId = legacy0009PropertyDefinitionId(categoryId, "role");
    const officialId = officialPropertyDefinitionId(categoryId, "role");
    try {
      await client.connect();
      const migrations = await loadMongoMigrations();
      await migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations: migrations.slice(0, 10) });
      const record = careerRecord(richBlockBodyFixtures.emptyRoot);
      record.categoryId = categoryId;
      record.propertyValues = [{ propertyDefinitionId: oldId, type: "text", value: "old" }];
      mutate(record, oldId, officialId);
      await db.collection<Document & { _id: string }>("career_records").insertOne(record, { bypassDocumentValidation: true });
      const categoriesBefore = await db.collection("career_categories").find({}).sort({ _id: 1 }).toArray();
      const recordsBefore = await db.collection("career_records").find({}).sort({ _id: 1 }).toArray();

      await expect((async () => {
        for (const step of await careerPropertyCanonicalIdentitySteps()) await step.run(db);
      })()).rejects.toThrow(/preflight|conflict|등록되지 않은|모호/i);

      expect(await db.collection("career_categories").find({}).sort({ _id: 1 }).toArray()).toEqual(categoriesBefore);
      expect(await db.collection("career_records").find({}).sort({ _id: 1 }).toArray()).toEqual(recordsBefore);
      expect(await db.collection("career_property_migration_journal").countDocuments()).toBe(0);
    } finally {
      try { await db.dropDatabase(); } finally { await client.close(); }
    }
  }, 60_000);
});

describe.skipIf(!mongoUrl)("Career legacy property value backfill migration 0012", () => {
  const categoryId = "475106fc-bf88-4a73-9c27-66c648733936";
  const ownerId = "24f6e03d-f195-4ff2-a4f6-18bece6406f3";
  const ids = {
    note: "489cc638-4ab5-4ed1-824e-90b665d64b73",
    score: "b666679c-5f1e-4b99-a38c-c5b3f8d41011",
    active: "724f9d45-8208-4984-b993-5ae3146d7cdd",
    tags: "bb845eb9-b590-4018-a3fe-1d20d66392d8",
    month: "c96df99e-77cc-482c-9ebd-2c15b8bdc66d",
    select: "d14ec3c9-cfbb-4862-a67f-755f66001cb1",
    url: "328f7002-bfee-4d29-b8e6-35965879b2c8",
    email: "33548840-d695-4d30-bd83-a2da3dba6756",
    phone: "4090757f-1451-4bc2-be1e-9a8a9a1e4c51",
    file: "0e72ff8d-f9f4-442c-8762-c504640fcb12",
    media: "dd83d91f-65ac-48ea-9695-0ce012208d40",
  };

  function category(): Document & { _id: string } {
    const legacy = {
      note: { id: ids.note, type: "text", label: "메모", required: false, system: false },
      score: { id: ids.score, type: "number", label: "점수", required: false, system: false },
      active: { id: ids.active, type: "boolean", label: "활성", required: false, system: false },
      tags: { id: ids.tags, type: "tags", label: "태그", required: false, system: false },
      month: { id: ids.month, type: "date", label: "월", required: false, system: false },
      select: { id: ids.select, type: "select", label: "선택", required: false, system: false },
      url: { id: ids.url, type: "url", label: "URL", required: false, system: false },
      email: { id: ids.email, type: "email", label: "이메일", required: false, system: false },
      phone: { id: ids.phone, type: "phone", label: "전화", required: false, system: false },
      file: { id: ids.file, type: "file", label: "파일", required: false, system: false },
      media: { id: ids.media, type: "media", label: "미디어", required: false, system: false },
    };
    const definitions = Object.entries(legacy).map(([key, definition], order) => ({
      id: definition.id,
      key,
      name: definition.label,
      type: definition.type === "boolean" ? "checkbox" : definition.type === "tags" ? "multi_select" : definition.type,
      required: definition.required,
      system: definition.system,
      config: definition.type === "tags" ? { options: [] } : {},
      order,
      version: 1,
      deletedAt: null,
    }));
    return {
      _id: categoryId,
      userId: ownerId,
      key: "backfill",
      isSystem: false,
      propertySchema: legacy,
      propertySchemaV2: definitions,
      propertyDefinitions: definitions,
      sortOrder: 7,
      name: "Backfill",
      icon: "folder",
      defaultView: "table",
      version: 1,
      schemaVersion: 1,
      updatedAt: new Date("2026-09-08T00:00:00.000Z"),
    };
  }

  function record(properties: Document, propertyValues?: Document[]): Document & { _id: string } {
    return {
      _id: randomUUID(),
      userId: ownerId,
      categoryId,
      title: "",
      status: "draft",
      origin: "manual",
      properties,
      bodyMd: "",
      ...(propertyValues === undefined ? {} : { propertyValues }),
      version: 1,
      updatedAt: new Date("2026-09-08T00:00:00.000Z"),
      deletedAt: null,
    };
  }

  async function installCanaryGate(db: ReturnType<MongoClient["db"]>): Promise<void> {
    await db.collection<Document & { _id: string }>("career_property_migration_journal").insertOne({
      _id: "0012:compatibility-writer-canary",
      migration: "0012_career_property_values_backfill",
      kind: "execution_gate",
      deploymentVersion: "test-task-6",
      verifiedAt: new Date("2026-09-08T00:00:00.000Z"),
      checkedWrites: 3,
      mismatches: 0,
      state: "verified",
    });
  }

  it("losslessly backfills legacy values, materializes exact tag options, and reruns as a no-op", async () => {
    const databaseName = `expresso_test_cp12_${randomUUID().slice(0, 16).replaceAll("-", "")}`;
    const client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 3_000, monitorCommands: true });
    const db = client.db(databaseName);
    const migrationFindBatchSizes: Array<number | undefined> = [];
    let monitorMigrationReads = false;
    client.on("commandStarted", ({ commandName, command }) => {
      if (monitorMigrationReads && commandName === "find" && command["find"] === "career_records") {
        migrationFindBatchSizes.push(command["batchSize"] as number | undefined);
      }
    });
    const decimal = Decimal128.fromString("123.450");
    const properties = { note: "", score: decimal, active: true, tags: ["Java", "java", " Java ", "Java"], month: "2026-09" };
    const expectedValues = [
      { propertyDefinitionId: ids.note, type: "text", value: "" },
      { propertyDefinitionId: ids.score, type: "number", value: decimal },
      { propertyDefinitionId: ids.active, type: "checkbox", value: true },
      { propertyDefinitionId: ids.tags, type: "multi_select", value: ["Java", "java", " Java ", "Java"].map((name) => exactOptionId(ids.tags, name)) },
      { propertyDefinitionId: ids.month, type: "date", value: { precision: "month", start: "2026-09", end: null } },
    ];
    const legacyOnly = record(properties);
    const alreadyCanonical = record(properties, expectedValues);
    const typedDayProperties = { month: { type: "date", value: { start: "2026-09-08", end: null, timezone: null } } };
    const typedDayCanonical = [{ propertyDefinitionId: ids.month, type: "date", value: { precision: "day", start: "2026-09-08", end: null } }];
    const compatibilityWriterRecord = record(typedDayProperties, typedDayCanonical);
    try {
      await client.connect();
      await db.collection<Document & { _id: string }>("career_categories").insertOne(category());
      await db.collection<Document & { _id: string }>("career_records").insertMany([legacyOnly, alreadyCanonical, compatibilityWriterRecord]);
      await installCanaryGate(db);

      monitorMigrationReads = true;
      for (const step of await careerPropertyLegacyBackfillSteps()) await step.run(db);
      monitorMigrationReads = false;
      expect(migrationFindBatchSizes.length).toBeGreaterThan(0);
      expect(migrationFindBatchSizes.every((size) => typeof size === "number" && size <= 100)).toBe(true);

      expect((await db.collection<Document & { _id: string }>("career_records").findOne({ _id: legacyOnly._id }))?.["propertyValues"]).toEqual(expectedValues);
      expect((await db.collection<Document & { _id: string }>("career_records").findOne({ _id: alreadyCanonical._id }))?.["propertyValues"]).toEqual(expectedValues);
      expect((await db.collection<Document & { _id: string }>("career_records").findOne({ _id: compatibilityWriterRecord._id }))?.["propertyValues"]).toEqual(typedDayCanonical);
      const storedCategory = await db.collection<Document & { _id: string }>("career_categories").findOne({ _id: categoryId });
      expect((storedCategory?.["propertyDefinitions"] as Document[]).find((definition) => definition["id"] === ids.tags)?.["config"]).toEqual({
        options: [" Java ", "Java", "java"].map((name) => ({ id: exactOptionId(ids.tags, name), name })),
      });
      expect(await db.collection<Document & { _id: string }>("career_property_migration_journal").countDocuments({ migration: "0012_career_property_values_backfill", kind: "document" })).toBe(2);

      const beforeRerun = {
        categories: await db.collection<Document & { _id: string }>("career_categories").find({}).sort({ _id: 1 }).toArray(),
        records: await db.collection<Document & { _id: string }>("career_records").find({}).sort({ _id: 1 }).toArray(),
        journal: await db.collection<Document & { _id: string }>("career_property_migration_journal").find({}).sort({ _id: 1 }).toArray(),
      };
      for (const step of await careerPropertyLegacyBackfillSteps()) await step.run(db);
      expect(await db.collection<Document & { _id: string }>("career_categories").find({}).sort({ _id: 1 }).toArray()).toEqual(beforeRerun.categories);
      expect(await db.collection<Document & { _id: string }>("career_records").find({}).sort({ _id: 1 }).toArray()).toEqual(beforeRerun.records);
      expect(await db.collection<Document & { _id: string }>("career_property_migration_journal").find({}).sort({ _id: 1 }).toArray()).toEqual(beforeRerun.journal);

      const recoveredJournal = await db.collection<Document & { _id: string }>("career_property_migration_journal").findOne({ migration: "0012_career_property_values_backfill", kind: "document" });
      await db.collection<Document & { _id: string }>("career_property_migration_journal").updateOne({ _id: recoveredJournal!._id }, { $set: { state: "planned" } });
      for (const step of await careerPropertyLegacyBackfillSteps()) await step.run(db);
      expect((await db.collection<Document & { _id: string }>("career_property_migration_journal").findOne({ _id: recoveredJournal!._id }))?.["state"]).toBe("applied");

      await db.collection<Document & { _id: string }>("career_property_migration_journal").updateOne({ _id: recoveredJournal!._id }, { $set: { state: "planned" } });
      await db.collection<Document & { _id: string }>(recoveredJournal!["collection"] as string).updateOne(
        { _id: recoveredJournal!["documentId"] },
        { $set: { crashRecoveryUserChange: true } },
      );
      await expect((async () => {
        for (const step of await careerPropertyLegacyBackfillSteps()) await step.run(db);
      })()).rejects.toThrow(/journal recovery conflict|복구 conflict/i);
      expect((await db.collection<Document & { _id: string }>(recoveredJournal!["collection"] as string).findOne({ _id: recoveredJournal!["documentId"] }))?.["crashRecoveryUserChange"]).toBe(true);
    } finally {
      try { await db.dropDatabase(); } finally { await client.close(); }
    }
  }, 60_000);

  it.each([
    ["canonical mismatch", (value: Document) => { value["propertyValues"] = [{ propertyDefinitionId: ids.note, type: "text", value: "다름" }]; }],
    ["unknown key", (value: Document) => { (value["properties"] as Document)["unknown"] = "값"; }],
    ["unsupported value", (value: Document) => { (value["properties"] as Document)["note"] = { nested: true }; }],
    ["non-finite number", (value: Document) => { (value["properties"] as Document)["score"] = Number.POSITIVE_INFINITY; }],
    ["oversized text", (value: Document) => { (value["properties"] as Document)["note"] = "가".repeat(50_001); }],
    ["whitespace-only tag", (value: Document) => { (value["properties"] as Document)["tags"] = ["   "]; }],
    ["invalid date", (value: Document) => { (value["properties"] as Document)["month"] = "2026-09-01"; }],
    ["date precision mismatch", (value: Document) => { (value["properties"] as Document)["month"] = { type: "date", value: { precision: "month", start: "2026-09-01", end: null } }; }],
    ["invalid select UUID in existing canonical value", (value: Document) => {
      (value["properties"] as Document)["select"] = { type: "select", value: "not-a-uuid" };
      value["propertyValues"] = [{ propertyDefinitionId: ids.select, type: "select", value: "not-a-uuid" }];
    }],
    ["oversized url", (value: Document) => { (value["properties"] as Document)["url"] = { type: "url", value: "a".repeat(2_001) }; }],
    ["oversized email", (value: Document) => { (value["properties"] as Document)["email"] = { type: "email", value: "a".repeat(2_001) }; }],
    ["oversized phone", (value: Document) => { (value["properties"] as Document)["phone"] = { type: "phone", value: "1".repeat(2_001) }; }],
    ["oversized multi-select", (value: Document) => { (value["properties"] as Document)["tags"] = { type: "multi_select", value: Array.from({ length: 101 }, () => randomUUID()) }; }],
    ["non-array file", (value: Document) => { (value["properties"] as Document)["file"] = { type: "file", value: randomUUID() }; }],
    ["invalid media UUID", (value: Document) => { (value["properties"] as Document)["media"] = { type: "media", value: ["not-a-uuid"] }; }],
    ["oversized file array", (value: Document) => { (value["properties"] as Document)["file"] = { type: "file", value: Array.from({ length: 101 }, () => randomUUID()) }; }],
    ["oversized media array", (value: Document) => { (value["properties"] as Document)["media"] = { type: "media", value: Array.from({ length: 101 }, () => randomUUID()) }; }],
  ])("aborts %s before changing any document", async (_label, mutate) => {
    const databaseName = `expresso_test_cp12_abort_${randomUUID().slice(0, 12).replaceAll("-", "")}`;
    const client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 3_000 });
    const db = client.db(databaseName);
    try {
      await client.connect();
      const storedCategory = category();
      const storedRecord = record({ note: "정상", tags: ["Java"], month: "2026-09" });
      mutate(storedRecord);
      await db.collection<Document & { _id: string }>("career_categories").insertOne(storedCategory);
      await db.collection<Document & { _id: string }>("career_records").insertOne(storedRecord);
      await installCanaryGate(db);
      const beforeCategory = await db.collection<Document & { _id: string }>("career_categories").findOne({ _id: categoryId });
      const beforeRecord = await db.collection<Document & { _id: string }>("career_records").findOne({ _id: storedRecord._id });

      await expect((async () => {
        for (const step of await careerPropertyLegacyBackfillSteps()) await step.run(db);
      })()).rejects.toThrow(/0012|conflict|지원|변환|알 수 없는|초과|공백|날짜/i);

      expect(await db.collection<Document & { _id: string }>("career_categories").findOne({ _id: categoryId })).toEqual(beforeCategory);
      expect(await db.collection<Document & { _id: string }>("career_records").findOne({ _id: storedRecord._id })).toEqual(beforeRecord);
      expect(await db.collection<Document & { _id: string }>("career_property_migration_journal").countDocuments({ kind: "document" })).toBe(0);
    } finally {
      try { await db.dropDatabase(); } finally { await client.close(); }
    }
  }, 60_000);

  it("requires explicit compatibility writer production canary evidence", async () => {
    const databaseName = `expresso_test_cp12_gate_${randomUUID().slice(0, 12).replaceAll("-", "")}`;
    const client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 3_000 });
    const db = client.db(databaseName);
    try {
      await client.connect();
      await db.collection<Document & { _id: string }>("career_categories").insertOne(category());
      await db.collection<Document & { _id: string }>("career_records").insertOne(record({ note: "미변환" }));
      await expect((async () => {
        for (const step of await careerPropertyLegacyBackfillSteps()) await step.run(db);
      })()).rejects.toThrow(/canary|gate|증거/i);
      expect(await db.collection<Document & { _id: string }>("career_records").findOne({})).not.toHaveProperty("propertyValues");
    } finally {
      try { await db.dropDatabase(); } finally { await client.close(); }
    }
  }, 60_000);
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

      await migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations: migrations.slice(0, 10) });

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

      const rerun = await migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations: migrations.slice(0, 10) });
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

      await migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations: migrations.slice(0, 9) });
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

      await expect(migrateMongo({ databaseUrl: mongoUrl!, databaseName, migrations: migrations.slice(0, 9) }))
        .rejects.toThrow(/conflicting propertyDefinitions.*475106fc-bf88-4a73-9c27-66c648733936/i);
      expect((await categories.findOne({ _id: "475106fc-bf88-4a73-9c27-66c648733936" }))?.["propertyDefinitions"])
        .toEqual(conflicting);
    } finally {
      try { await db.dropDatabase(); } finally { await client.close(); }
    }
  }, 60_000);
});
