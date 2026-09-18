import { describe, expect, it } from "vitest";
import type { Document } from "mongodb";

import { exactOptionId, officialPropertyDefinitionId } from "./career-property-canonical-mapping.js";
import { careerPropertyReferenceLocations, inspectCareerPropertyMigration, type CareerPropertyInventoryDb } from "./career-property-inventory.js";

const SYSTEM_CATEGORY_ID = "475106fc-bf88-4a73-9c27-66c648733936";
const CUSTOM_CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const ROLE_ID = "6c663539-48c1-5d12-939d-f100fac993c1";
const ROLE_0009_ID = "1c768bad-2c1f-5cee-86c5-a43574f0e256";
const TAGS_ID = "2d912898-0be3-5661-bf9b-39ca255d6e6e";
const TAGS_0009_ID = "03e2f530-4140-523d-8670-c0e1d6385788";
const DATE_ID = "dc2ea2ae-d9cf-5591-9b1f-28e966109a0d";
const DATE_0009_ID = "9c2c92da-b51c-5b6b-8bea-2cc3440619f3";
const ORPHAN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function legacyDefinition(id: string, key: string, label: string, type: string): Document {
  return { id, key, label, type, required: false, system: false };
}

function v2Definition(id: string, key: string, name: string, type: string, order: number): Document {
  return { id, key, name, type, required: false, system: false, config: {}, order, version: 1, deletedAt: null };
}

function readOnlyDb(collections: Record<string, Document[]>): { db: CareerPropertyInventoryDb; writes: string[] } {
  const writes: string[] = [];
  const forbidden = (operation: string) => () => {
    writes.push(operation);
    throw new Error(`read-only inventory attempted ${operation}`);
  };
  return {
    db: {
      collection(name: string) {
        return {
          find() {
            const values = structuredClone(collections[name] ?? []);
            return {
              batchSize() { return this; },
              async toArray() { return values; },
              async *[Symbol.asyncIterator]() { yield* values; },
            };
          },
          insertOne: forbidden("insertOne"), insertMany: forbidden("insertMany"),
          updateOne: forbidden("updateOne"), updateMany: forbidden("updateMany"),
          deleteOne: forbidden("deleteOne"), deleteMany: forbidden("deleteMany"),
          bulkWrite: forbidden("bulkWrite"), findOneAndUpdate: forbidden("findOneAndUpdate"),
        };
      },
      command: forbidden("command"), createCollection: forbidden("createCollection"),
    } as unknown as CareerPropertyInventoryDb,
    writes,
  };
}

function fixtureCollections(): Record<string, Document[]> {
  return {
    career_categories: [
      {
        _id: SYSTEM_CATEGORY_ID, userId: null, isSystem: true,
        propertySchema: {
          role: { id: ROLE_ID, type: "text", label: "역할", required: false, system: false },
          tags: { id: TAGS_ID, type: "tags", label: "기술", required: false, system: false },
          date: { id: DATE_ID, type: "date", label: "기간", required: false, system: false },
        },
        propertySchemaV2: [
          v2Definition(ROLE_ID, "role", "역할", "text", 0),
          v2Definition(TAGS_ID, "tags", "기술", "multi_select", 1),
          v2Definition(DATE_ID, "date", "기간", "date", 2),
        ],
        propertyDefinitions: [
          legacyDefinition(ROLE_0009_ID, "role", "역할", "text"),
          legacyDefinition(TAGS_0009_ID, "tags", "기술", "tags"),
          legacyDefinition(DATE_0009_ID, "date", "기간", "date"),
        ],
      },
      {
        _id: CUSTOM_CATEGORY_ID, userId: "22222222-2222-4222-8222-222222222222", isSystem: false,
        propertySchema: { note: { id: "45ff40b9-64a5-593c-b326-3283e0b9d642", type: "text", label: "메모", required: false, system: false } },
        propertySchemaV2: [v2Definition("45ff40b9-64a5-593c-b326-3283e0b9d642", "note", "메모", "text", 0)],
      },
    ],
    career_records: [
      {
        _id: "33333333-3333-4333-8333-333333333333", userId: "22222222-2222-4222-8222-222222222222", categoryId: SYSTEM_CATEGORY_ID,
        properties: { role: "Backend", tags: ["Java", "java", " Java "], date: "2026-09" },
        propertyValues: [{ propertyDefinitionId: ROLE_0009_ID, type: "text", value: "Backend" }],
        propertyValueTombstones: { [ROLE_ID]: { type: "text", value: "old" } },
      },
      {
        _id: "44444444-4444-4444-8444-444444444444", userId: "22222222-2222-4222-8222-222222222222", categoryId: SYSTEM_CATEGORY_ID,
        properties: { role: "가".repeat(50_001), tags: ["   ", "x".repeat(81)], date: "09/2026", unknown: "orphan" },
        unmappedProperties: { [ROLE_ID]: { type: "text", value: "source category unknown" } },
      },
    ],
    career_views: [{
      _id: "55555555-5555-4555-8555-555555555555", categoryId: SYSTEM_CATEGORY_ID,
      configuration: { filter: { propertyId: ORPHAN_ID, operator: "eq", operand: null }, sorts: [{ propertyId: ROLE_ID }], visiblePropertyIds: [ROLE_ID], propertyOrder: [ROLE_ID], groupPropertyId: null, gallery: null, timeline: null },
    }],
    career_record_relations: [{
      _id: "66666666-6666-4666-8666-666666666666", sourceRecordId: "33333333-3333-4333-8333-333333333333", sourcePropertyId: ROLE_ID,
      targetRecordId: "44444444-4444-4444-8444-444444444444", inversePropertyId: ORPHAN_ID,
    }],
    career_ai_proposals: [{ _id: "77777777-7777-4777-8777-777777777777", recordId: "33333333-3333-4333-8333-333333333333", propertyChanges: [{ propertyId: ROLE_ID, previousValue: null, nextValue: null }] }],
    outbox_events: [{ _id: "88888888-8888-4888-8888-888888888888", topic: "career.computation", payload: { recordId: "33333333-3333-4333-8333-333333333333", changedPropertyIds: [ROLE_ID], sourcePropertyVersions: { [ROLE_ID]: 1 } } }],
  };
}

describe("career property canonical identity", () => {
  it("matches migration 0006 UUIDs and preserves exact option strings", () => {
    expect(officialPropertyDefinitionId(SYSTEM_CATEGORY_ID, "role")).toBe(ROLE_ID);
    expect([exactOptionId(ROLE_ID, "Java"), exactOptionId(ROLE_ID, "java"), exactOptionId(ROLE_ID, " Java ")]).toEqual([
      "5c054d88-6715-5c47-a5af-a3c75726e4e0", "65e13c8d-db68-53f7-bf34-f13d26b90afd", "f8404291-d539-5fee-ada7-5eab89f53677",
    ]);
  });
});

describe("career property read-only inventory", () => {
  it("registers every known persisted PropertyDefinition reference family", () => {
    expect(new Set(careerPropertyReferenceLocations.map(({ collection }) => collection))).toEqual(new Set([
      "career_categories", "career_records", "career_views", "career_record_relations", "career_ai_proposals", "outbox_events",
    ]));
  });

  it("reports mappings, references and migration blockers without issuing writes", async () => {
    const fixture = readOnlyDb(fixtureCollections());
    const report = await inspectCareerPropertyMigration(fixture.db);
    expect(fixture.writes).toEqual([]);
    expect(report.summary).toMatchObject({ categories: 2, systemCategories: 1, customCategories: 1, records: 2 });
    expect(report.idMappings).toContainEqual(expect.objectContaining({ categoryId: SYSTEM_CATEGORY_ID, key: "role", officialId: ROLE_ID, legacy0009Id: ROLE_0009_ID }));
    expect(report.summary.references).toBeGreaterThanOrEqual(8);
    expect(report.distributions).toMatchObject({ textOver50000: 1, whitespaceOnlyTags: 1, legacyMonthDates: 1, nonstandardDates: 1, unknownLegacyKeys: 1 });
    expect(report.conflicts.map(({ reason }) => reason)).toEqual(expect.arrayContaining([
      "legacy_text_too_long", "whitespace_only_tag", "legacy_tag_too_long", "nonstandard_legacy_date", "unknown_legacy_property_key", "orphan_property_reference", "ambiguous_property_reference",
    ]));
    const longTagConflict = report.conflicts.find(({ reason }) => reason === "legacy_tag_too_long");
    expect(longTagConflict?.locations[0]).toMatch(/length=81,digest=[0-9a-f]{16}/);
    expect(JSON.stringify(longTagConflict)).not.toContain("x".repeat(81));
    expect(report.canMigrate).toBe(false);
    expect(report.conflicts.every(({ count }) => count > 0)).toBe(true);
    expect(report.conflicts.every(({ message }) => message.length > 0)).toBe(true);
  });

  it("preserves a custom V2 identity instead of requiring a newly computed UUID", async () => {
    const customPropertyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
    const fixture = readOnlyDb({
      career_categories: [{
        _id: CUSTOM_CATEGORY_ID, userId: "22222222-2222-4222-8222-222222222222", isSystem: false,
        propertySchema: {
          note: { id: customPropertyId, type: "text", label: "메모", required: false, system: false },
        },
        propertySchemaV2: [v2Definition(customPropertyId, "note", "사용자 메모", "text", 0)],
      }],
    });

    const report = await inspectCareerPropertyMigration(fixture.db);

    expect(report.idMappings).toContainEqual(expect.objectContaining({
      categoryId: CUSTOM_CATEGORY_ID, key: "note", officialId: customPropertyId,
    }));
    expect(report.conflicts.map(({ reason }) => reason)).not.toContain("official_property_id_mismatch");
    expect(report.canMigrate).toBe(true);
  });

  it("uses payload.categoryId to validate property mutation outbox references in every lifecycle state", async () => {
    const collections = fixtureCollections();
    collections.career_records = [];
    collections.career_views = [];
    collections.career_record_relations = [];
    collections.career_ai_proposals = [];
    const topics = ["career.property-conversion", "career.property-default", "career.property-deletion"];
    collections.outbox_events = ["pending", "published", "dead_letter"].map((state, index) => ({
      _id: `88888888-8888-4888-8888-88888888888${index}`,
      topic: topics[index],
      state,
      payload: { categoryId: SYSTEM_CATEGORY_ID, propertyId: ROLE_0009_ID },
    }));

    const report = await inspectCareerPropertyMigration(readOnlyDb(collections).db);

    expect(report.conflicts.map(({ reason }) => reason)).not.toContain("ambiguous_property_reference");
    expect(report.conflicts.map(({ reason }) => reason)).not.toContain("orphan_property_reference");
    expect(report.summary.references).toBe(3);
    expect(report.canMigrate).toBe(true);
  });

  it("treats equal old and official values as one semantic value but rejects different values", async () => {
    function collections(officialValue: string): Record<string, Document[]> {
      return {
        career_categories: [{
          _id: SYSTEM_CATEGORY_ID, userId: null, isSystem: true,
          propertySchema: {
            role: { id: ROLE_ID, type: "text", label: "역할", required: false, system: true },
          },
          propertySchemaV2: [v2Definition(ROLE_ID, "role", "역할", "text", 0)],
          propertyDefinitions: [legacyDefinition(ROLE_0009_ID, "role", "역할", "text")],
        }],
        career_records: [{
          _id: "33333333-3333-4333-8333-333333333333", categoryId: SYSTEM_CATEGORY_ID, properties: {},
          propertyValues: [
            { propertyDefinitionId: ROLE_0009_ID, type: "text", value: "Backend" },
            { propertyDefinitionId: ROLE_ID, type: "text", value: officialValue },
          ],
        }],
      };
    }

    const equal = await inspectCareerPropertyMigration(readOnlyDb(collections("Backend")).db);
    const different = await inspectCareerPropertyMigration(readOnlyDb(collections("Frontend")).db);

    expect(equal.conflicts.map(({ reason }) => reason)).not.toContain("canonical_property_value_conflict");
    expect(equal.canMigrate).toBe(true);
    expect(different.conflicts.map(({ reason }) => reason)).toContain("canonical_property_value_conflict");
  });
});
