import { z } from "zod";
import { CareerRecordStatusSchema } from "./career.js";
import { TimestampSchema, UuidSchema } from "./common.js";
import timezonePolicy from "./career-business-timezones.json" with { type: "json" };

const MAX_BUSINESS_VERSION = Number.MAX_SAFE_INTEGER;

// Java와 JSON Schema가 사용하는 Unicode code point 길이를 맞춥니다.
const boundedText = (maxLength: number) => z.string()
  .refine((value) => Array.from(value).length <= maxLength, { message: `must contain at most ${maxLength} code points` })
  .meta({ maxLength });

export const CareerBusinessDecimalSchema = z.string().max(6_200)
  // Decimal128로 왕복하며 소수 자릿수도 보존할 수 있는 일반 십진 표기입니다.
  .regex(/^-?(?:0|[1-9][0-9]{0,33}|[1-9][0-9]{33}0{1,6111}|0\.(?=[0-9]{1,6176}$)0*(?:[1-9][0-9]{0,33})?|(?=(?:[0-9]\.?){1,34}$)[1-9][0-9]*\.[0-9]+)$/);

const month = z.string().regex(/^[0-9]{4}-(?:0[1-9]|1[0-2])$/);
const datetime = z.iso.datetime({ offset: true })
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?(?:Z|[+-](?:(?:0[0-9]|1[0-7]):[0-5][0-9]|18:00))$/);
// Java도 이 계약 목록에서 생성한 상수를 사용하며, alias나 대소문자를 정규화하지 않습니다.
const timezone = z.enum(timezonePolicy.identifiers);

function epochNanos(value: string): bigint | null {
  const fraction = /\.([0-9]+)(?=Z|[+-])/u.exec(value)?.[1] ?? "";
  const seconds = Date.parse(value.replace(/\.[0-9]+(?=Z|[+-])/u, "")) / 1_000;
  if (!Number.isFinite(seconds)) return null;
  return BigInt(seconds) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
}

export const CareerBusinessDateValueSchema = z.discriminatedUnion("precision", [
  z.strictObject({ precision: z.literal("month"), start: month, end: month.nullable() }),
  z.strictObject({ precision: z.literal("day"), start: z.iso.date(), end: z.iso.date().nullable() }),
  z.strictObject({ precision: z.literal("datetime"), start: datetime, end: datetime.nullable(), timezone: timezone.nullable() }),
]).superRefine((value, context) => {
  if (value.end === null) return;
  let outOfOrder: boolean;
  if (value.precision === "datetime") {
    const start = epochNanos(value.start);
    const end = epochNanos(value.end);
    if (start === null || end === null) return;
    outOfOrder = end < start;
  } else {
    outOfOrder = value.end < value.start;
  }
  if (outOfOrder) context.addIssue({ code: "custom", path: ["end"], message: "date end must follow start" });
});

export const CareerBusinessPropertyValueSchema = z.discriminatedUnion("type", [
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("text"), value: boundedText(50_000) }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("number"), value: CareerBusinessDecimalSchema }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("checkbox"), value: z.boolean() }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("select"), value: UuidSchema.nullable() }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("multi_select"), value: z.array(UuidSchema).max(100) }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("date"), value: CareerBusinessDateValueSchema }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.enum(["url", "email", "phone"]), value: boundedText(2_000) }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.enum(["file", "media"]), value: z.array(UuidSchema).max(100) }),
]);

export const CareerBusinessRecordSchema = z.strictObject({
  id: UuidSchema,
  userId: UuidSchema,
  categoryId: UuidSchema,
  title: boundedText(300),
  propertyValues: z.array(CareerBusinessPropertyValueSchema).max(50),
  status: CareerRecordStatusSchema,
  version: z.number().int().min(1).max(MAX_BUSINESS_VERSION),
  updatedAt: TimestampSchema,
}).superRefine((record, context) => {
  const ids = new Set<string>();
  record.propertyValues.forEach((value, index) => {
    if (ids.has(value.propertyDefinitionId)) {
      context.addIssue({ code: "custom", path: ["propertyValues", index, "propertyDefinitionId"], message: "duplicate propertyDefinitionId" });
    }
    ids.add(value.propertyDefinitionId);
  });
});

export const CareerBusinessRecordResponseSchema = z.strictObject({ data: CareerBusinessRecordSchema });

export type CareerBusinessPropertyValue = z.infer<typeof CareerBusinessPropertyValueSchema>;
export type CareerBusinessRecord = z.infer<typeof CareerBusinessRecordSchema>;
export type CareerBusinessRecordResponse = z.infer<typeof CareerBusinessRecordResponseSchema>;
