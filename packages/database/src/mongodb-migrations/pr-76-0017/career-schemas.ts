// 0017 실행 당시 contracts의 validator 정의를 고정합니다. 이후 계약 변경으로 과거 변환 규칙이 바뀌지 않습니다.
import { createRequire } from "node:module";
import type * as Contracts from "@expresso/contracts";
import timezonePolicy from "./career-business-timezones.json" with { type: "json" };
// contracts가 이미 선언한 Zod 의존성을 사용하므로 새 패키지를 설치하지 않습니다.
const { z } = createRequire(import.meta.resolve("@expresso/contracts"))("zod");
export const UuidSchema = z.uuid() as typeof Contracts.UuidSchema;
export const TimestampSchema = z.iso.datetime({ offset: true }) as typeof Contracts.TimestampSchema;
const MAX_BUSINESS_VERSION = Number.MAX_SAFE_INTEGER;

// Java와 JSON Schema가 사용하는 Unicode code point 길이를 맞춥니다.
const boundedText = (maxLength: number) => z.string()
  .refine((value: string) => Array.from(value).length <= maxLength, { message: `must contain at most ${maxLength} code points` })
  .meta({ maxLength });

export const CareerBusinessDecimalSchema = z.string().max(6_200)
  // Decimal128로 왕복하며 소수 자릿수도 보존할 수 있는 일반 십진 표기입니다.
  .regex(/^-?(?:0|[1-9][0-9]{0,33}|[1-9][0-9]{33}0{1,6111}|0\.(?=[0-9]{1,6176}$)0*(?:[1-9][0-9]{0,33})?|(?=(?:[0-9]\.?){1,34}$)[1-9][0-9]*\.[0-9]+)$/) as typeof Contracts.CareerBusinessDecimalSchema;

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
]).superRefine((value: Extract<Contracts.CareerBusinessPropertyValue, { type: "date" }>["value"], context: { addIssue(issue: { code: "custom"; path: string[]; message: string }): void }) => {
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
}) as typeof Contracts.CareerBusinessDateValueSchema;

export const CareerBusinessPropertyValueSchema = z.discriminatedUnion("type", [
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("text"), value: boundedText(50_000) }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("number"), value: CareerBusinessDecimalSchema }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("checkbox"), value: z.boolean() }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("select"), value: UuidSchema.nullable() }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("multi_select"), value: z.array(UuidSchema).max(100) }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.literal("date"), value: CareerBusinessDateValueSchema }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.enum(["url", "email", "phone"]), value: boundedText(2_000) }),
  z.strictObject({ propertyDefinitionId: UuidSchema, type: z.enum(["file", "media"]), value: z.array(UuidSchema).max(100) }),
]) as typeof Contracts.CareerBusinessPropertyValueSchema;

export const CareerPropertyTypeSchema = z.enum(["text", "number", "date", "tags", "boolean"]) as typeof Contracts.CareerPropertyTypeSchema;
export const CareerPropertyDefinitionSchema = z.strictObject({
  id: UuidSchema.optional(), label: z.string().trim().min(1).max(80), type: CareerPropertyTypeSchema,
  required: z.boolean().default(false), system: z.boolean().default(false),
}) as typeof Contracts.CareerPropertyDefinitionSchema;
export const CareerPropertySchemaSchema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), CareerPropertyDefinitionSchema,
) as typeof Contracts.CareerPropertySchemaSchema;
export const CareerPropertyTypeV2Schema = z.enum([
  "title", "text", "number", "select", "multi_select", "date", "checkbox", "url", "email",
  "phone", "file", "media", "relation", "formula", "rollup", "created_time", "updated_time",
]);
export const CareerPropertyDefinitionV2Schema = z.strictObject({
  id: UuidSchema, key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  name: z.string().trim().min(1).max(80), type: CareerPropertyTypeV2Schema, required: z.boolean(),
  system: z.boolean(), config: z.record(z.string(), z.unknown()), order: z.number().int().nonnegative(),
  version: z.number().int().positive(), deletedAt: TimestampSchema.nullable(),
}) as typeof Contracts.CareerPropertyDefinitionV2Schema;
