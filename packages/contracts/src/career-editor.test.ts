import { describe, expect, it } from "vitest";
import { AiProposalApplyRequestSchema } from "./career-ai.js";
import { CareerDocumentBootstrapSchema, CareerSocketClientMessageSchema } from "./career-editor.js";
import { CanonicalCareerPropertyDefinitionSchema, CareerFormulaPreviewSchema, CareerFormulaSchema, CareerPropertyDefinitionV2Schema, CareerPropertySchemaChangeSchema, CareerPropertyValueV2Schema, CareerRollupAggregationSchema, PreviewCareerFormulaSchema, PreviewCareerRollupSchema, WritableCareerPropertyValueSchema } from "./career-properties.js";
import { CareerViewConfigurationSchema } from "./career-views.js";
import { expressoOpenApiDocument } from "./openapi.js";

describe("career editor contracts", () => {
  it("strictly rejects extra socket/bootstrap fields and oversized updates", () => {
    expect(() => CareerSocketClientMessageSchema.parse({ protocolVersion: 1, recordId: crypto.randomUUID(), sessionId: crypto.randomUUID(), type: "ack", sequence: 1, extra: true })).toThrow();
    expect(() => CareerSocketClientMessageSchema.parse({ protocolVersion: 1, recordId: crypto.randomUUID(), sessionId: crypto.randomUUID(), type: "update", clientId: crypto.randomUUID(), clientSequence: 1, updateBase64: "A".repeat(1_398_105) })).toThrow();
    expect(CareerDocumentBootstrapSchema).toBeDefined();
  });

  it("keeps property values discriminated and computed values read-only shaped", () => {
    expect(CareerPropertyDefinitionV2Schema.parse({ id: crypto.randomUUID(), key: "startedAt", name: "시작일", type: "date", required: false, system: false, config: {}, order: 1, version: 1, deletedAt: null }).type).toBe("date");
    expect(() => CareerPropertyValueV2Schema.parse({ type: "checkbox", value: "yes" })).toThrow();
    expect(() => CareerPropertyValueV2Schema.parse({ type: "select", value: "missing-option" })).toThrow();
  });

  it("contracts canonical definitions and writable values separately from computed values", () => {
    const propertyDefinitionId = "6c663539-48c1-5d12-939d-f100fac993c1";
    expect(CanonicalCareerPropertyDefinitionSchema.parse({
      id: propertyDefinitionId,
      key: "role",
      name: "역할",
      type: "text",
      required: false,
      system: true,
      config: {},
      order: 0,
      version: 1,
      deletedAt: null,
    }).name).toBe("역할");
    expect(WritableCareerPropertyValueSchema.parse({
      propertyDefinitionId,
      type: "text",
      value: "가".repeat(50_000),
    }).type).toBe("text");
    expect(() => WritableCareerPropertyValueSchema.parse({
      propertyDefinitionId,
      type: "title",
      value: "중복 title",
    })).toThrow();
    expect(() => CanonicalCareerPropertyDefinitionSchema.parse({
      id: propertyDefinitionId,
      key: "title",
      name: "제목",
      type: "title",
      required: true,
      system: true,
      config: {},
      order: 0,
      version: 1,
      deletedAt: null,
    })).toThrow();
  });

  it("preserves date precision and exact select option names", () => {
    const propertyDefinitionId = "10000000-0000-4000-8000-000000000002";
    const definition = CanonicalCareerPropertyDefinitionSchema.parse({
      id: propertyDefinitionId,
      key: "technologies",
      name: "기술",
      type: "multi_select",
      required: false,
      system: true,
      config: {
        options: [
          { id: "20000000-0000-4000-8000-000000000001", name: "Java" },
          { id: "20000000-0000-4000-8000-000000000002", name: "java" },
          { id: "20000000-0000-4000-8000-000000000003", name: " Java " },
        ],
      },
      order: 0,
      version: 1,
      deletedAt: null,
    });
    expect((definition.config.options as Array<{ name: string }>).map(({ name }) => name)).toEqual(["Java", "java", " Java "]);

    expect(WritableCareerPropertyValueSchema.parse({
      propertyDefinitionId,
      type: "date",
      value: { precision: "month", start: "2026-09", end: null },
    }).value).toEqual({ precision: "month", start: "2026-09", end: null });
    expect(() => WritableCareerPropertyValueSchema.parse({
      propertyDefinitionId,
      type: "date",
      value: { precision: "month", start: "2026-09-01", end: null },
    })).toThrow();
  });

  it("keeps canonical numbers as plain decimal strings without JS number coercion", () => {
    const propertyDefinitionId = "10000000-0000-4000-8000-000000000004";

    expect(WritableCareerPropertyValueSchema.parse({
      propertyDefinitionId,
      type: "number",
      value: "123.4500",
    }).value).toBe("123.4500");
    for (const value of [123.45, "1e3", "NaN", "Infinity"]) {
      expect(() => WritableCareerPropertyValueSchema.parse({
        propertyDefinitionId,
        type: "number",
        value,
      })).toThrow();
    }
  });

  it("rejects config that does not match the canonical definition type", () => {
    const base = {
      id: "6c663539-48c1-5d12-939d-f100fac993c1",
      key: "role",
      name: "역할",
      required: false,
      system: true,
      order: 0,
      version: 1,
      deletedAt: null,
    };

    expect(() => CanonicalCareerPropertyDefinitionSchema.parse({
      ...base,
      type: "text",
      config: { unknown: true },
    })).toThrow();
    expect(CanonicalCareerPropertyDefinitionSchema.parse({
      ...base,
      type: "relation",
      config: {
        targetCategoryId: "54e2b29a-d2ba-4c80-a4bc-1c1d08740497",
        inversePropertyId: null,
        cardinality: "multiple",
        deletePolicy: "nullify",
      },
    }).type).toBe("relation");
  });

  it("uses the approved formula and rollup boundaries", () => {
    expect(() => CareerFormulaSchema.parse({ source: "eval('x')", ast: null, diagnostics: [] })).toThrow(/unsafe/);
    expect(CareerRollupAggregationSchema.options).toEqual(["count", "unique_count", "sum", "average", "min", "max", "earliest", "latest", "percent_checked", "show_unique"]);
  });

  it("contracts formula and rollup previews and computed configuration updates", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(PreviewCareerFormulaSchema.parse({ categoryId: id, source: "1 + 2" }).source).toBe("1 + 2");
    expect(CareerFormulaPreviewSchema.parse({ source: "1 + 2", ast: null, diagnostics: [], value: { type: "formula", value: 3, diagnostics: [] }, dependencies: [] }).value?.value).toBe(3);
    expect(PreviewCareerRollupSchema.parse({ categoryId: id, relationPropertyId: id, targetPropertyId: id, aggregation: "count" }).aggregation).toBe("count");
    expect(CareerPropertySchemaChangeSchema.parse({ kind: "configure", propertyId: id, config: { source: "1 + 2" } }).kind).toBe("configure");
  });

  it("rejects AI changes outside allowed stable IDs", () => {
    expect(() => AiProposalApplyRequestSchema.parse({ recordId: crypto.randomUUID(), proposalId: crypto.randomUUID(), expectedDocumentVersion: 1, commandIndexes: [], propertyChangeIndexes: [], categoryId: crypto.randomUUID() })).toThrow();
  });

  it("strictly parses all five saved view types and registers the API matrix", () => {
    const base = { id: crypto.randomUUID(), categoryId: crypto.randomUUID(), name: "기본", version: 1, order: 0, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], recordOrder: [], visiblePropertyIds: [], propertyOrder: [], columnWidths: {}, gallery: null, board: null, timeline: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };
    for (const type of ["table", "list", "gallery", "board", "timeline"] as const) expect(CareerViewConfigurationSchema.parse({ ...base, type }).type).toBe(type);
    expect(Object.keys(expressoOpenApiDocument.paths)).toEqual(expect.arrayContaining(["/v1/career/records/{recordId}/document", "/v1/career/views", "/v1/career/records/{recordId}/ai-proposals"]));
  });
});
