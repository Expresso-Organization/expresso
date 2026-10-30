import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";
import { CareerPropertyValueV2Schema } from "./career-properties.js";
import { CareerBusinessPropertyValueSchema } from "./career-business.js";

/** 기존 저장 뷰를 유지하며 정본 숫자·날짜의 정밀한 필터 값을 허용합니다. */
export const CareerViewOperandSchema = z.union([
  CareerPropertyValueV2Schema,
  CareerBusinessPropertyValueSchema.options[1].omit({ propertyDefinitionId: true }),
  CareerBusinessPropertyValueSchema.options[5].omit({ propertyDefinitionId: true }),
]);
export type CareerViewOperand = z.infer<typeof CareerViewOperandSchema>;

export const CareerViewFilterV2Schema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.strictObject({ operator: z.enum(["and", "or"]), filters: z.array(CareerViewFilterV2Schema).min(1).max(20) }),
  z.strictObject({
    propertyId: UuidSchema,
    operator: z.enum(["eq", "neq", "contains", "not_contains", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"]),
    operand: CareerViewOperandSchema.nullable(),
  }),
]));
export const CareerSortV2Schema = z.strictObject({ propertyId: UuidSchema, direction: z.enum(["asc", "desc"]), nulls: z.enum(["first", "last"]) });
export const CareerViewConfigurationSchema = z.strictObject({
  id: UuidSchema, categoryId: UuidSchema, name: z.string().trim().min(1).max(120),
  type: z.enum(["table", "list", "gallery", "board", "timeline"]), version: z.number().int().positive(),
  order: z.number().int().nonnegative(), filter: CareerViewFilterV2Schema.nullable(),
  sorts: z.array(CareerSortV2Schema).max(10), groupPropertyId: UuidSchema.nullable(), groupOrder: z.array(z.string().max(200)).max(100),
  recordOrder: z.array(UuidSchema).max(2_000).default([]),
  visiblePropertyIds: z.array(UuidSchema).max(100), propertyOrder: z.array(UuidSchema).max(100),
  columnWidths: z.record(UuidSchema, z.number().int().min(80).max(2_000)),
  gallery: z.strictObject({ coverPropertyId: UuidSchema.nullable(), previewPropertyIds: z.array(UuidSchema).max(10) }).nullable(),
  board: z.strictObject({ hiddenGroupIds: z.array(z.string().max(200)).max(100), cardOrder: z.record(z.string(), z.array(UuidSchema).max(2_000)) }).nullable(),
  timeline: z.strictObject({ startPropertyId: UuidSchema, endPropertyId: UuidSchema.nullable(), axisStart: z.iso.date().nullable(), axisEnd: z.iso.date().nullable() }).nullable(),
  createdAt: TimestampSchema, updatedAt: TimestampSchema,
});
export type CareerViewConfiguration = z.infer<typeof CareerViewConfigurationSchema>;
