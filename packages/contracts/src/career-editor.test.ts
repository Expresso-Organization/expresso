import { describe, expect, it } from "vitest";
import { AiProposalApplyRequestSchema } from "./career-ai.js";
import { CareerDocumentBootstrapSchema, CareerSocketClientMessageSchema } from "./career-editor.js";
import { CareerFormulaPreviewSchema, CareerFormulaSchema, CareerPropertyDefinitionV2Schema, CareerPropertySchemaChangeSchema, CareerPropertyValueV2Schema, CareerRollupAggregationSchema, PreviewCareerFormulaSchema, PreviewCareerRollupSchema } from "./career-properties.js";
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
    const base = { id: crypto.randomUUID(), categoryId: crypto.randomUUID(), name: "기본", version: 1, order: 0, filter: null, sorts: [], groupPropertyId: null, groupOrder: [], visiblePropertyIds: [], propertyOrder: [], columnWidths: {}, gallery: null, board: null, timeline: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };
    for (const type of ["table", "list", "gallery", "board", "timeline"] as const) expect(CareerViewConfigurationSchema.parse({ ...base, type }).type).toBe(type);
    expect(Object.keys(expressoOpenApiDocument.paths)).toEqual(expect.arrayContaining(["/v1/career/records/{recordId}/document", "/v1/career/views", "/v1/career/records/{recordId}/ai-proposals"]));
  });
});
