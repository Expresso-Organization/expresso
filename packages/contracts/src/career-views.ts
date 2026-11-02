import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";
import { CareerPropertyValueV2Schema } from "./career-properties.js";
import { CareerRecordSchema } from "./career.js";

export const CareerViewFilterV2Schema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.strictObject({ operator: z.enum(["and", "or"]), filters: z.array(CareerViewFilterV2Schema).min(1).max(20) }),
  z.strictObject({
    propertyId: UuidSchema,
    operator: z.enum(["eq", "neq", "contains", "not_contains", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"]),
    operand: CareerPropertyValueV2Schema.nullable(),
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

/** 뷰 필터 tree입니다. 스키마는 z.lazy라 unknown으로 추론되므로 모양을 따로 적습니다. */
export type CareerViewFilterV2 =
  | { operator: "and" | "or"; filters: CareerViewFilterV2[] }
  | { propertyId: string; operator: "eq" | "neq" | "contains" | "not_contains" | "gt" | "gte" | "lt" | "lte" | "is_empty" | "is_not_empty"; operand: unknown };

// 뷰 API 요청 · 응답 계약입니다. 백엔드 라우트와 웹 프록시가 함께 씁니다.
const viewServerFields = { id: true, categoryId: true, version: true, order: true, createdAt: true, updatedAt: true } as const;
export const CreateCareerViewConfigurationSchema = CareerViewConfigurationSchema.omit(viewServerFields);
export const UpdateCareerViewConfigurationSchema = CareerViewConfigurationSchema.omit(viewServerFields).partial()
  .refine((value) => Object.keys(value).length > 0, "at least one view field is required");
export const DuplicateCareerViewSchema = z.strictObject({ name: z.string().trim().min(1).max(120) });
export const ReorderCareerViewsSchema = z.strictObject({ orderedIds: z.array(UuidSchema).min(1).max(100) });
export const CareerViewQueryInputSchema = z.strictObject({ cursor: z.string().min(1).max(4096).nullable().default(null), limit: z.coerce.number().int().min(1).max(100).default(50) });
export const CareerViewResponseSchema = z.strictObject({ data: CareerViewConfigurationSchema });
export const CareerViewListResponseSchema = z.strictObject({ data: z.array(CareerViewConfigurationSchema) });
export const CareerViewPageResponseSchema = z.strictObject({
  data: z.array(CareerRecordSchema),
  page: z.strictObject({ hasNextPage: z.boolean(), nextCursor: z.string().nullable() }),
});
export type CreateCareerViewConfiguration = z.infer<typeof CreateCareerViewConfigurationSchema>;
export type UpdateCareerViewConfiguration = z.infer<typeof UpdateCareerViewConfigurationSchema>;
export type CareerViewPage = z.infer<typeof CareerViewPageResponseSchema>;
