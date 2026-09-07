import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Decimal128, Long, MongoClient, type Document } from "mongodb";

import { loadMongoMigrations } from "./mongo-migrations.js";
import { migrateMongo } from "./mongo-migrate.js";
import { acquireMigrationLease, recoverMigrationLease } from "./migration-lease.js";
import { careerRecordSliceSteps } from "./mongodb-migrations/0009/migration.js";
import { careerRichBlockBodySteps } from "./mongodb-migrations/0010/migration.js";
import { careerPropertyCanonicalIdentitySteps } from "./mongodb-migrations/0011/migration.js";
import { legacy0009PropertyDefinitionId, officialPropertyDefinitionId } from "./career-property-canonical-mapping.js";

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
    expect(first).toHaveLength(11);
    expect(first.at(-1)).toMatchObject({
      version: "0011",
      name: "career_property_canonical_identity",
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
});

describe.skipIf(!mongoUrl)("Career property canonical identity migration 0011", () => {
  it("materializes official definitions and remaps every registered 0009 reference idempotently", async () => {
    const databaseName = `expresso_test_cp11_${randomUUID().slice(0, 16).replaceAll("-", "")}`;
    const client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 3_000 });
    const db = client.db(databaseName);
    const categoryId = "475106fc-bf88-4a73-9c27-66c648733936";
    const roleOfficialId = officialPropertyDefinitionId(categoryId, "role");
    const role0009Id = legacy0009PropertyDefinitionId(categoryId, "role");
    const sourceRecordId = randomUUID();
    const targetRecordId = randomUUID();
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
      const categoryIndexesBefore = await categories.listIndexes().toArray();
      const recordIndexesBefore = await records.listIndexes().toArray();

      for (const step of await careerPropertyCanonicalIdentitySteps()) await step.run(db);

      const migratedCategory = await categories.findOne({ _id: categoryId });
      const canonicalDefinitions = migratedCategory?.["propertyDefinitions"] as Document[];
      expect(canonicalDefinitions.find((definition) => definition["key"] === "role")).toMatchObject({
        id: roleOfficialId, key: "role", name: "역할", config: {}, order: expect.any(Number), version: 1, deletedAt: null,
      });
      expect(canonicalDefinitions.some((definition) => Object.hasOwn(definition, "label"))).toBe(false);
      expect(JSON.stringify(canonicalDefinitions)).not.toContain(role0009Id);
      expect(JSON.stringify(migratedCategory?.["propertySchemaV2"])).toContain(roleOfficialId);
      expect(JSON.stringify(migratedCategory?.["propertyMutationResults"])).toContain(roleOfficialId);
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
