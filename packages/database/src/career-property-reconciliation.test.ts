import { randomUUID } from "node:crypto";

import { Decimal128, MongoClient, type Document } from "mongodb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { exactOptionId, legacy0009PropertyDefinitionId, officialPropertyDefinitionId } from "./career-property-canonical-mapping.js";
import { reconcileCareerProperties } from "./career-property-reconciliation.js";

const mongoUrl = process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL;
type StringIdDocument = Document & { _id: string };

describe.skipIf(!mongoUrl)("career property reconciliation gate", () => {
  const databaseName = `expresso_test_reconciliation_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(mongoUrl ?? "mongodb://127.0.0.1", { serverSelectionTimeoutMS: 3_000, monitorCommands: true });
  const db = client.db(databaseName);
  const categoryId = "475106fc-bf88-4a73-9c27-66c648733936";
  const ids = Object.fromEntries(["note", "score", "active", "tags", "month", "relation"].map((key) => [key, officialPropertyDefinitionId(categoryId, key)])) as Record<string, string>;
  const oldNoteId = legacy0009PropertyDefinitionId(categoryId, "note");

  function definition(key: string, legacyType: string, order: number, required = false): { legacy: Document; canonical: Document } {
    const type = legacyType === "boolean" ? "checkbox" : legacyType === "tags" ? "multi_select" : legacyType;
    const config = type === "multi_select"
      ? { options: [" Java ", "Java", "java"].map((name) => ({ id: exactOptionId(ids[key]!, name), name })) }
      : {};
    return {
      legacy: { id: ids[key], type: legacyType, label: key, required, system: true },
      canonical: { id: ids[key], key, name: key, type, required, system: true, config, order, version: 1, deletedAt: null },
    };
  }

  function category(requiredNote = false): StringIdDocument {
    const entries = [
      definition("note", "text", 0, requiredNote),
      definition("score", "number", 1),
      definition("active", "boolean", 2),
      definition("tags", "tags", 3),
      definition("month", "date", 4),
    ];
    const relation = {
      id: ids.relation, key: "relation", name: "relation", type: "relation",
      required: false, system: true, config: {}, order: 5, version: 1, deletedAt: null,
    };
    return {
      _id: categoryId,
      isSystem: true,
      propertySchema: Object.fromEntries(entries.map(({ legacy }, index) => [["note", "score", "active", "tags", "month"][index], legacy])),
      propertySchemaV2: [...entries.map(({ canonical }) => canonical), relation],
      propertyDefinitions: [...entries.map(({ canonical }) => canonical), relation],
    };
  }

  function record(properties: Document, propertyValues?: Document[]): StringIdDocument {
    return {
      _id: randomUUID(),
      categoryId,
      properties,
      ...(propertyValues === undefined ? {} : { propertyValues }),
    };
  }

  async function appliedMigrations(): Promise<void> {
    await db.collection<StringIdDocument>("schema_migrations").insertMany([
      { _id: "0011", name: "career_property_canonical_identity", state: "applied" },
      { _id: "0012", name: "career_property_values_backfill", state: "applied" },
    ]);
  }

  beforeEach(async () => {
    await client.connect();
    await db.dropDatabase();
  });

  afterEach(async () => {
    await db.dropDatabase();
  });

  it("passes only when independently decoded legacy and canonical values have identical semantics without writing", async () => {
    const decimal = Decimal128.fromString("123.450");
    const tagNames = ["Java", "java", " Java ", "Java"];
    await db.collection<StringIdDocument>("career_categories").insertOne(category());
    await db.collection<StringIdDocument>("career_records").insertOne(record(
      { note: "", score: decimal, active: true, tags: tagNames, month: "2026-09" },
      [
        { propertyDefinitionId: ids.note, type: "text", value: "" },
        { propertyDefinitionId: ids.score, type: "number", value: decimal },
        { propertyDefinitionId: ids.active, type: "checkbox", value: true },
        { propertyDefinitionId: ids.tags, type: "multi_select", value: tagNames.map((name) => exactOptionId(ids.tags!, name)) },
        { propertyDefinitionId: ids.month, type: "date", value: { precision: "month", start: "2026-09", end: null } },
      ],
    ));
    await appliedMigrations();

    const commands: string[] = [];
    const listener = ({ commandName }: { commandName: string }) => commands.push(commandName);
    client.on("commandStarted", listener);
    const report = await reconcileCareerProperties(db);
    client.off("commandStarted", listener);

    expect(report.canCutover).toBe(true);
    expect(report.mismatches).toEqual([]);
    expect(report.summary).toMatchObject({ categories: 1, records: 1, comparedValues: 5, requiredMissing: 0 });
    expect(report.semanticDigests.legacy).toBe(report.semanticDigests.canonical);
    expect(commands.some((command) => ["insert", "update", "delete", "findAndModify", "create", "drop"].includes(command))).toBe(false);
    expect(JSON.stringify(report)).not.toContain("Java");
  });

  it("reports missing, empty, order, precision, identity, orphan and invalid-value differences without exposing values", async () => {
    const records = [
      record({ note: "" }, []),
      record({ tags: ["Java", "java"] }, [{ propertyDefinitionId: ids.tags, type: "multi_select", value: [exactOptionId(ids.tags!, "java"), exactOptionId(ids.tags!, "Java")] }]),
      record({ month: "2026-09" }, [{ propertyDefinitionId: ids.month, type: "date", value: { precision: "day", start: "2026-09-01", end: null } }]),
      record({ unknown: "secret-user-value" }, []),
      record({}, [{ propertyDefinitionId: randomUUID(), type: "text", value: "secret-user-value" }]),
      record({ note: "same" }, [{ propertyDefinitionId: oldNoteId, type: "text", value: "same" }]),
      record({ note: { unsupported: true } }, []),
      record({ note: "text" }, [{ propertyDefinitionId: ids.note, type: "text", value: 42 }]),
      record({}),
    ];
    await db.collection<StringIdDocument>("career_categories").insertOne(category());
    await db.collection<StringIdDocument>("career_records").insertMany(records);
    await appliedMigrations();

    const report = await reconcileCareerProperties(db);
    const reasons = report.mismatches.map(({ reason }) => reason);

    expect(report.canCutover).toBe(false);
    expect(reasons).toEqual(expect.arrayContaining([
      "missing_canonical_value",
      "semantic_value_mismatch",
      "unknown_legacy_property_key",
      "orphan_canonical_property_id",
      "stale_property_definition_id",
      "invalid_legacy_value",
      "invalid_canonical_value",
      "missing_canonical_property_values",
    ]));
    expect(report.mismatches.every(({ count }) => count > 0)).toBe(true);
    expect(JSON.stringify(report)).not.toContain("secret-user-value");
  });

  it("reports required omissions separately without treating missing as an empty value", async () => {
    await db.collection<StringIdDocument>("career_categories").insertOne(category(true));
    await db.collection<StringIdDocument>("career_records").insertOne(record({}, []));
    await appliedMigrations();

    const report = await reconcileCareerProperties(db);

    expect(report.summary.requiredMissing).toBe(1);
    expect(report.mismatches).toEqual([]);
    expect(report.canCutover).toBe(true);
  });

  it("counts an incomplete canonical definition once instead of also reporting it as missing", async () => {
    const incompleteCategory = category();
    incompleteCategory["propertyDefinitions"] = (incompleteCategory["propertyDefinitions"] as Document[]).map((item) => ({
      id: item["id"],
      key: item["key"],
      type: item["type"],
    }));
    await db.collection<StringIdDocument>("career_categories").insertOne(incompleteCategory);
    await appliedMigrations();

    const report = await reconcileCareerProperties(db);

    expect(report.mismatches).toEqual([
      expect.objectContaining({ reason: "definition_identity_mismatch", count: 6 }),
    ]);
    expect(report.canCutover).toBe(false);
  });

  it("blocks cutover when 0011 or 0012 is not applied or a migration journal is unfinished", async () => {
    await db.collection<StringIdDocument>("career_categories").insertOne(category());
    await db.collection<StringIdDocument>("career_records").insertOne(record({}, []));
    await db.collection<StringIdDocument>("schema_migrations").insertOne({ _id: "0011", state: "applied" });
    await db.collection<StringIdDocument>("career_property_migration_journal").insertMany([
      { _id: "0011:planned", migration: "0011_career_property_canonical_identity", state: "planned" },
      { _id: "0012:planned", migration: "0012_career_property_values_backfill", kind: "document", state: "planned" },
    ]);

    const report = await reconcileCareerProperties(db);

    expect(report.canCutover).toBe(false);
    expect(report.mismatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "migration_not_applied", count: 1 }),
      expect.objectContaining({ reason: "unfinished_migration_journal", count: 2 }),
    ]));
  });
});
