import { z } from "zod";
import { UuidSchema, TimestampSchema } from "./common.js";
import { CareerRecordStatusSchema } from "./career.js";
import { CareerBusinessPropertyValueSchema, CareerBusinessRecordSchema } from "./career-business.js";

const values = z.array(CareerBusinessPropertyValueSchema).max(50).refine(
  (values) => new Set(values.map((value) => value.propertyDefinitionId)).size === values.length,
  { message: "duplicate propertyDefinitionId" },
);
const groupedValue = z.union([
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("select"), value: UuidSchema }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("multi_select"), value: z.array(UuidSchema).length(1) }),
]);
export const CareerWriterCreateSchema = z.union([
  z.strictObject({ categoryId: UuidSchema }),
  z.strictObject({ categoryId: UuidSchema, propertyValues: z.array(groupedValue).max(1) }),
  z.strictObject({ categoryId: UuidSchema, title: CareerBusinessRecordSchema.shape.title, propertyValues: values }),
]);
export const CareerWriterPropertyDeltaSchema = z.strictObject({
  set: values,
  unsetPropertyIds: z.array(UuidSchema).max(50).refine((ids) => new Set(ids).size === ids.length,
    { message: "duplicate unsetPropertyIds" }),
}).refine((delta) => !delta.set.some((value) => delta.unsetPropertyIds.includes(value.propertyDefinitionId)),
  { message: "set and unsetPropertyIds must not overlap" })
  .describe("Upsert set values; remove unsetPropertyIds; preserve omitted IDs. Unsetting an absent canonical ID is a no-op. Duplicate or overlapping IDs are rejected.");
export const CareerWriterPatchSchema = z.union([
  z.strictObject({ status: CareerRecordStatusSchema }),
  z.strictObject({ title: CareerBusinessRecordSchema.shape.title, propertyValues: CareerWriterPropertyDeltaSchema.optional() }),
  z.strictObject({ propertyValues: CareerWriterPropertyDeltaSchema }),
]);
// 숫자 상한을 문자열 pattern에도 표현하여 OpenAPI와 Java의 ETag 경계를 맞춥니다.
const upperBound = String(Number.MAX_SAFE_INTEGER);
const boundedDigits = upperBound.split("").flatMap((digit, index) => {
  const low = index === 0 ? 1 : 0;
  const high = Number(digit) - 1;
  if (high < low) return [];
  const range = low === high ? String(low) : `[${low}-${high}]`;
  const suffix = upperBound.length - index - 1;
  return [`${upperBound.slice(0, index)}${range}${suffix ? `[0-9]{${suffix}}` : ""}`];
});
export const CareerWriterIfMatchSchema = z.string().regex(new RegExp(`^"v(?:[1-9][0-9]{0,14}|${boundedDigits.join("|")}|${upperBound})"$`));
export const CareerWriterMovePreviewInputSchema = z.strictObject({ targetCategoryId: UuidSchema });
export const CareerWriterMoveSchema = z.strictObject({ targetCategoryId: UuidSchema, previewToken: z.string().min(32).max(4096) });
export const CareerWriterRelationSchema = z.strictObject({ propertyId: UuidSchema, targetIds: z.array(UuidSchema).max(1000) });
export const CareerWriterRestoreSchema = z.strictObject({});
export const CareerWriterMovePreviewResponseSchema = z.strictObject({ data: z.strictObject({
  previewToken: z.string().min(32).max(4096), targetCategoryId: UuidSchema,
  version: CareerBusinessRecordSchema.shape.version, expiresAt: TimestampSchema,
  conversions: z.array(z.strictObject({ sourcePropertyId: UuidSchema, targetPropertyId: UuidSchema.nullable(),
    kind: z.enum(["exact", "safe", "lossy", "unmapped"]), sampleBefore: CareerBusinessPropertyValueSchema,
    sampleAfter: CareerBusinessPropertyValueSchema.nullable() })).max(50),
  unmappedPropertyIds: z.array(UuidSchema).max(200),
}) });
export type CareerWriterCreate = z.infer<typeof CareerWriterCreateSchema>;
export type CareerWriterPatch = z.infer<typeof CareerWriterPatchSchema>;
export type CareerWriterMove = z.infer<typeof CareerWriterMoveSchema>;
export type CareerWriterRelation = z.infer<typeof CareerWriterRelationSchema>;
export type CareerWriterMovePreviewResponse = z.infer<typeof CareerWriterMovePreviewResponseSchema>;
