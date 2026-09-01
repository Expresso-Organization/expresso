import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

export const CareerPropertyTypeV2Schema = z.enum([
  "title", "text", "number", "select", "multi_select", "date", "checkbox", "url", "email",
  "phone", "file", "media", "relation", "formula", "rollup", "created_time", "updated_time",
]);
export const CareerFormulaDiagnosticSchema = z.strictObject({
  code: z.string().min(1).max(80), message: z.string().min(1).max(500),
  severity: z.enum(["error", "warning"]), start: z.number().int().nonnegative(), end: z.number().int().nonnegative(),
}).refine((value) => value.end >= value.start, { message: "diagnostic end must follow start" });
export const CareerComputedValueSchema = z.union([
  z.string().max(50_000), z.number().finite(), z.boolean(), z.iso.date(),
  z.array(z.union([z.string().max(5_000), z.number().finite(), z.boolean(), UuidSchema])).max(1_000), z.null(),
]);
const DateRangeSchema = z.strictObject({
  start: z.union([z.iso.date(), z.iso.datetime({ offset: true })]),
  end: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).nullable(),
  timezone: z.string().min(1).max(64).nullable(),
}).refine((value) => value.end === null || value.end >= value.start, { message: "date end must follow start" });
export const CareerRelationTargetSchema = z.strictObject({ recordId: UuidSchema, title: z.string().max(300) });
export const CareerPropertyValueV2Schema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("title"), value: z.string().max(300) }),
  z.strictObject({ type: z.literal("text"), value: z.string().max(50_000) }),
  z.strictObject({ type: z.literal("number"), value: z.number().finite() }),
  z.strictObject({ type: z.literal("select"), value: UuidSchema.nullable() }),
  z.strictObject({ type: z.literal("multi_select"), value: z.array(UuidSchema).max(100) }),
  z.strictObject({ type: z.literal("date"), value: DateRangeSchema }),
  z.strictObject({ type: z.literal("checkbox"), value: z.boolean() }),
  z.strictObject({ type: z.enum(["url", "email", "phone"]), value: z.string().max(2_000) }),
  z.strictObject({ type: z.enum(["file", "media"]), value: z.array(UuidSchema).max(100) }),
  z.strictObject({ type: z.literal("relation"), value: z.array(CareerRelationTargetSchema).max(1_000) }),
  z.strictObject({ type: z.enum(["formula", "rollup"]), value: CareerComputedValueSchema, diagnostics: z.array(CareerFormulaDiagnosticSchema).max(50) }),
  z.strictObject({ type: z.enum(["created_time", "updated_time"]), value: TimestampSchema }),
]);
export const CareerPropertyDefinitionV2Schema = z.strictObject({
  id: UuidSchema, key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  name: z.string().trim().min(1).max(80), type: CareerPropertyTypeV2Schema, required: z.boolean(),
  system: z.boolean(), config: z.record(z.string(), z.unknown()), order: z.number().int().nonnegative(),
  version: z.number().int().positive(), deletedAt: TimestampSchema.nullable(),
});
export const CareerRelationCardinalitySchema = z.enum(["single", "multiple"]);
export const CareerRelationDefinitionSchema = z.strictObject({
  targetCategoryId: UuidSchema, inversePropertyId: UuidSchema.nullable(),
  cardinality: CareerRelationCardinalitySchema, deletePolicy: z.enum(["restrict", "nullify"]),
});
export const CareerRelationSchema = z.strictObject({
  id: UuidSchema, sourceRecordId: UuidSchema, sourcePropertyId: UuidSchema,
  targetRecordId: UuidSchema, inversePropertyId: UuidSchema.nullable(), version: z.number().int().positive(),
});
/** 한 관계형 프로퍼티의 대상 목록을 통째로 교체한다. */
export const ReplaceCareerRelationTargetsSchema = z.strictObject({
  propertyId: UuidSchema,
  targetIds: z.array(UuidSchema).max(1_000),
});
export const ListCareerRelationTargetsQuerySchema = z.strictObject({ propertyId: UuidSchema });
export const PreviewCareerCategoryMoveSchema = z.strictObject({
  targetCategoryId: UuidSchema,
});
export const CareerPropertyConversionSchema = z.strictObject({
  sourcePropertyId: UuidSchema, targetPropertyId: UuidSchema.nullable(),
  kind: z.enum(["exact", "safe", "lossy", "unmapped"]), sampleBefore: z.unknown().optional(), sampleAfter: z.unknown().optional(),
});
export const CareerCategoryMovePreviewSchema = z.strictObject({
  recordId: UuidSchema, sourceCategoryId: UuidSchema, targetCategoryId: UuidSchema,
  recordVersion: z.number().int().positive(), sourceSchemaVersion: z.number().int().positive(),
  targetSchemaVersion: z.number().int().positive(), conversions: z.array(CareerPropertyConversionSchema).max(200),
  unmappedProperties: z.record(UuidSchema, CareerPropertyValueV2Schema), previewToken: z.string().min(32).max(4096),
});
export const CareerCategoryMoveCommitSchema = z.strictObject({
  recordId: UuidSchema, targetCategoryId: UuidSchema, previewToken: z.string().min(32).max(4096),
  expectedVersion: z.number().int().positive(), discardUnmappedPropertyIds: z.array(UuidSchema).max(200).default([]),
});
/** recordId는 route parameter에서 주입한다. 웹 클라이언트 body에는 포함하지 않는다. */
export const CommitCareerCategoryMoveRequestSchema = CareerCategoryMoveCommitSchema.omit({ recordId: true });
export const CareerFormulaSchema = z.strictObject({
  source: z.string().max(4_000), ast: z.unknown().nullable(), diagnostics: z.array(CareerFormulaDiagnosticSchema).max(50),
}).refine((value) => !/\b(?:eval|Function|import|require)\s*\(/u.test(value.source), { message: "unsafe formula expression" });
export const CareerRollupAggregationSchema = z.enum([
  "count", "unique_count", "sum", "average", "min", "max", "earliest", "latest", "percent_checked", "show_unique",
]);
export const CareerRollupSchema = z.strictObject({
  relationPropertyId: UuidSchema, targetPropertyId: UuidSchema, aggregation: CareerRollupAggregationSchema,
});

export type CareerPropertyDefinitionV2 = z.infer<typeof CareerPropertyDefinitionV2Schema>;
export type CareerPropertyValueV2 = z.infer<typeof CareerPropertyValueV2Schema>;
export type CareerRollupAggregation = z.infer<typeof CareerRollupAggregationSchema>;
export type CareerCategoryMovePreview = z.infer<typeof CareerCategoryMovePreviewSchema>;
export type CareerRelationDefinition = z.infer<typeof CareerRelationDefinitionSchema>;
export type CareerRelationTarget = z.infer<typeof CareerRelationTargetSchema>;
export type ReplaceCareerRelationTargets = z.infer<typeof ReplaceCareerRelationTargetsSchema>;
export type PreviewCareerCategoryMove = z.infer<typeof PreviewCareerCategoryMoveSchema>;
export type CommitCareerCategoryMoveRequest = z.infer<typeof CommitCareerCategoryMoveRequestSchema>;

export const CareerPropertySchemaChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("create"), property: CareerPropertyDefinitionV2Schema.omit({ id: true, version: true, deletedAt: true, order: true }).extend({ id: UuidSchema.optional(), order: z.number().int().nonnegative().optional() }) }),
  z.strictObject({ kind: z.literal("reorder"), propertyId: UuidSchema, order: z.number().int().nonnegative() }),
  z.strictObject({ kind: z.literal("rename"), propertyId: UuidSchema, name: z.string().trim().min(1).max(80) }),
  z.strictObject({ kind: z.literal("type-change"), propertyId: UuidSchema, type: CareerPropertyTypeV2Schema, config: z.record(z.string(), z.unknown()).optional() }),
  z.strictObject({ kind: z.literal("delete"), propertyId: UuidSchema }),
  z.strictObject({ kind: z.literal("restore"), propertyId: UuidSchema }),
]);
export const CareerPropertyChangeImpactSchema = z.strictObject({
  affectedRecordCount: z.number().int().nonnegative(), convertibleCount: z.number().int().nonnegative(),
  lossyExamples: z.array(z.strictObject({ recordId: UuidSchema, before: z.unknown(), after: z.unknown().optional() })).max(20),
  dependentViews: z.array(UuidSchema).max(100), dependentFormulas: z.array(UuidSchema).max(100), dependentRollups: z.array(UuidSchema).max(100),
});
export const CareerPropertyChangePreviewSchema = z.strictObject({ categoryId: UuidSchema, categoryVersion: z.number().int().positive(), change: CareerPropertySchemaChangeSchema, impact: CareerPropertyChangeImpactSchema, previewToken: z.string().min(32).max(4096) });
export const ApplyCareerPropertyChangeSchema = z.strictObject({ change: CareerPropertySchemaChangeSchema, previewToken: z.string().min(32).max(4096), confirmLossy: z.boolean().default(false) });
export type CareerPropertySchemaChange = z.infer<typeof CareerPropertySchemaChangeSchema>;
export type CareerPropertyChangePreview = z.infer<typeof CareerPropertyChangePreviewSchema>;
export type ApplyCareerPropertyChange = z.infer<typeof ApplyCareerPropertyChangeSchema>;
