import type {
  CanonicalCareerPropertyDefinition,
  CareerProperties,
  CareerPropertyDefinitionV2,
  CareerPropertySchema,
  CareerPropertyValueV2,
  WritableCareerPropertyType,
  WritableCareerPropertyValue,
} from "@expresso/contracts";
import {
  CanonicalCareerPropertyDefinitionSchema,
  CareerPropertyValueV2Schema,
  WritableCareerPropertyValueSchema,
} from "@expresso/contracts";
import { exactOptionId, officialPropertyDefinitionId, type CareerCategoryDoc, type CareerPropertyValueDoc, type CareerRecordDoc } from "@expresso/database";
import { Decimal128, type ClientSession } from "mongodb";

import type { MongoContext } from "../../platform/mongodb.js";
import { decimal128ToCanonicalPlain } from "./canonical-decimal.js";
import { CareerError } from "./errors.js";

const MONTH_VALUE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_VALUE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const WRITABLE_TYPES = new Set([
  "text", "number", "checkbox", "select", "multi_select", "date", "url", "email", "phone", "file", "media",
]);

function isWritableDefinition(
  definition: CareerPropertyDefinitionV2,
): definition is CareerPropertyDefinitionV2 & { type: WritableCareerPropertyType } {
  return WRITABLE_TYPES.has(definition.type);
}

function canonicalConfig(definition: CareerPropertyDefinitionV2): Record<string, unknown> {
  if (definition.type === "select" || definition.type === "multi_select") {
    return { options: Array.isArray(definition.config.options) ? definition.config.options : [] };
  }
  if (definition.type === "relation" || definition.type === "formula" || definition.type === "rollup") return definition.config;
  return {};
}

/** V2 identity/의미를 장기 canonical Definition 저장 shape로 투영합니다. */
export function toCanonicalPropertyDefinitions(
  definitions: readonly CareerPropertyDefinitionV2[],
): CanonicalCareerPropertyDefinition[] {
  return definitions
    .filter((definition) => definition.type !== "title")
    .map((definition) => CanonicalCareerPropertyDefinitionSchema.parse({
      ...definition,
      config: canonicalConfig(definition),
    }));
}

/** legacy schema만 있는 Category에도 0006과 같은 공식 ID 계보의 V2 Definition을 만듭니다. */
export function legacySchemaToV2Definitions(
  categoryId: string,
  schema: CareerPropertySchema,
  previous: readonly CareerPropertyDefinitionV2[] = [],
): CareerPropertyDefinitionV2[] {
  const previousByKey = new Map(previous.map((definition) => [definition.key, definition]));
  return Object.entries(schema).map(([key, property], order) => {
    const existing = previousByKey.get(key);
    const type = property.type === "boolean" ? "checkbox" : property.type === "tags" ? "multi_select" : property.type;
    return {
      id: property.id ?? existing?.id ?? officialPropertyDefinitionId(categoryId, key),
      key,
      name: property.label,
      type,
      required: property.required,
      system: property.system,
      config: existing?.type === type ? existing.config : type === "multi_select" ? { options: [] } : {},
      order: existing?.order ?? order,
      version: existing && (existing.name !== property.label || existing.type !== type || existing.required !== property.required)
        ? existing.version + 1
        : existing?.version ?? 1,
      deletedAt: null,
    };
  });
}

/** 읽기 경계는 canonical Definition을 우선하고, 전환 전 Category만 V2/legacy로 내립니다. */
export function careerCategoryDefinitions(
  category: Pick<CareerCategoryDoc, "_id" | "propertySchema" | "propertySchemaV2" | "propertyDefinitions">,
): CareerPropertyDefinitionV2[] {
  if (category.propertyDefinitions !== undefined) return category.propertyDefinitions.map((definition) => ({ ...definition }));
  return category.propertySchemaV2?.map((definition) => ({ ...definition }))
    ?? legacySchemaToV2Definitions(category._id, category.propertySchema);
}

/** title은 root field이며, 기존 View field reference를 위해서만 V2 virtual Definition을 합성합니다. */
export function careerCategoryApiDefinitions(category: CareerCategoryDoc): CareerPropertyDefinitionV2[] {
  const definitions = careerCategoryDefinitions(category);
  if (category.propertyDefinitions === undefined) return definitions;
  const virtualTitles = category.propertySchemaV2?.filter((definition) => definition.type === "title") ?? [];
  return [...virtualTitles, ...definitions];
}

function dataIntegrity(message: string): never {
  throw new CareerError(500, message);
}

function legacyCompatibleValue(
  category: Pick<CareerCategoryDoc, "propertySchema">,
  definition: CareerPropertyDefinitionV2,
  propertyValue: CareerPropertyValueDoc,
): CareerProperties[string] {
  const legacyType = category.propertySchema[definition.key]?.type;
  const matchingLegacyType = propertyValue.type === "checkbox" ? "boolean"
    : propertyValue.type === "multi_select" ? "tags" : propertyValue.type;
  if (propertyValue.type === "number" && legacyType === "number") {
    if (typeof propertyValue.value === "number") return propertyValue.value;
    dataIntegrity(`legacy number 응답이 Decimal128 값을 lossless하게 표현할 수 없습니다: ${definition.key}`);
  }
  if ((propertyValue.type === "text" || propertyValue.type === "checkbox")
    && legacyType === matchingLegacyType) {
    return propertyValue.value;
  }
  if (propertyValue.type === "multi_select") {
    const options = Array.isArray(definition.config.options) ? definition.config.options : [];
    const namesById = new Map(options.flatMap((option) => option !== null && typeof option === "object"
      && typeof (option as { id?: unknown }).id === "string" && typeof (option as { name?: unknown }).name === "string"
      ? [[(option as { id: string }).id, (option as { name: string }).name] as const]
      : []));
    const names = propertyValue.value.map((optionId) => namesById.get(optionId));
    if (legacyType === "tags" && names.every((name): name is string => name !== undefined)) return names;
    return { type: "multi_select", value: [...propertyValue.value] };
  }
  if (propertyValue.type === "date") {
    if (legacyType === "date" && propertyValue.value.precision === "month") {
      if (propertyValue.value.end !== null) dataIntegrity(`legacy 응답이 month range를 표현할 수 없습니다: ${definition.key}`);
      return propertyValue.value.start;
    }
    const value = {
      start: propertyValue.value.start,
      end: propertyValue.value.end,
      timezone: propertyValue.value.precision === "datetime" ? propertyValue.value.timezone : null,
    };
    return { type: "date", value } satisfies CareerPropertyValueV2;
  }
  return { type: propertyValue.type, value: propertyValue.value } as CareerPropertyValueV2;
}

/**
 * 기존 Web 응답을 위한 key projection입니다.
 * propertyValues 필드가 존재하면 빈 배열도 canonical snapshot이며 key별 legacy fallback을 하지 않습니다.
 */
function projectCareerProperties(
  category: CareerCategoryDoc,
  record: Pick<CareerRecordDoc, "properties" | "propertyValues">,
  projectValue: (definition: CareerPropertyDefinitionV2, propertyValue: CareerPropertyValueDoc) => CareerProperties[string],
): CareerProperties {
  const entries = canonicalPropertyEntries(category, record);
  if (entries === undefined) return record.properties;
  const projected: CareerProperties = {};
  for (const { definition, propertyValue } of entries) {
    projected[definition.key] = projectValue(definition, propertyValue);
  }
  return projected;
}

function storedPropertyValue(rawValue: unknown): CareerPropertyValueDoc {
  if (rawValue === null || typeof rawValue !== "object" || !("type" in rawValue)) {
    dataIntegrity("canonical PropertyValue shape가 올바르지 않습니다");
  }
  if (rawValue.type === "number") {
    const shape = WritableCareerPropertyValueSchema.safeParse({ ...rawValue, value: "0" });
    const storedNumber = "value" in rawValue ? rawValue.value : undefined;
    const decimalText = storedNumber instanceof Decimal128 ? storedNumber.toString() : null;
    if (!shape.success || !(typeof storedNumber === "number" && Number.isFinite(storedNumber)
      || decimalText !== null && !["NaN", "Infinity", "-Infinity"].includes(decimalText))) {
      dataIntegrity("canonical number PropertyValue 저장 shape가 올바르지 않습니다");
    }
    return rawValue as CareerPropertyValueDoc;
  }
  const parsed = WritableCareerPropertyValueSchema.safeParse(rawValue);
  if (!parsed.success) dataIntegrity("canonical PropertyValue shape가 올바르지 않습니다");
  if (parsed.data.type === "number") dataIntegrity("canonical number PropertyValue 저장 shape가 올바르지 않습니다");
  return parsed.data;
}

type CanonicalPropertyEntry = {
  definition: CareerPropertyDefinitionV2;
  propertyValue: CareerPropertyValueDoc;
};

function canonicalPropertyEntries(
  category: CareerCategoryDoc,
  record: Pick<CareerRecordDoc, "properties" | "propertyValues">,
): CanonicalPropertyEntry[] | undefined {
  const propertyValues: unknown = record.propertyValues;
  if (propertyValues === undefined) return undefined;
  if (!Array.isArray(propertyValues)) dataIntegrity("canonical propertyValues 저장 shape가 올바르지 않습니다");
  if (propertyValues.length > 50) dataIntegrity("canonical propertyValues는 최대 50개까지 허용됩니다");

  const definitions = careerCategoryDefinitions(category).filter((definition) => definition.deletedAt === null);
  const definitionsById = new Map<string, CareerPropertyDefinitionV2>();
  const definitionKeys = new Set<string>();
  for (const definition of definitions) {
    if (definitionsById.has(definition.id) || definitionKeys.has(definition.key)) {
      dataIntegrity("canonical PropertyDefinition identity가 중복되었습니다");
    }
    definitionsById.set(definition.id, definition);
    definitionKeys.add(definition.key);
  }

  const entries: CanonicalPropertyEntry[] = [];
  const seenPropertyIds = new Set<string>();
  for (const rawValue of propertyValues) {
    const propertyValue = storedPropertyValue(rawValue);
    if (seenPropertyIds.has(propertyValue.propertyDefinitionId)) dataIntegrity("canonical PropertyValue identity가 중복되었습니다");
    seenPropertyIds.add(propertyValue.propertyDefinitionId);
    const definition = definitionsById.get(propertyValue.propertyDefinitionId);
    if (!definition) dataIntegrity("canonical PropertyValue가 active Definition을 참조하지 않습니다");
    if (definition.type !== propertyValue.type) dataIntegrity(`canonical PropertyValue type이 Definition과 다릅니다: ${definition.key}`);
    entries.push({ definition, propertyValue });
  }
  return entries;
}

function canonicalWirePropertyValue(propertyValue: CareerPropertyValueDoc): WritableCareerPropertyValue {
  const candidate = propertyValue.type === "number"
    ? {
      ...propertyValue,
      value: propertyValue.value instanceof Decimal128
        ? decimal128ToCanonicalPlain(propertyValue.value)
        : String(propertyValue.value),
    }
    : propertyValue;
  const parsed = WritableCareerPropertyValueSchema.safeParse(candidate);
  if (!parsed.success) dataIntegrity("canonical PropertyValue wire shape가 올바르지 않습니다");
  return parsed.data;
}

/** Fastify CareerRecord 응답에 저장된 canonical snapshot을 lossless wire 값으로 노출합니다. */
export function projectCanonicalCareerPropertyValues(
  category: CareerCategoryDoc,
  record: Pick<CareerRecordDoc, "properties" | "propertyValues">,
): WritableCareerPropertyValue[] | undefined {
  return canonicalPropertyEntries(category, record)?.map(({ propertyValue }) => canonicalWirePropertyValue(propertyValue));
}

/**
 * 전환 중인 기존 consumer용 key projection입니다.
 * canonical 값이 legacy shape로 lossless하게 표현되지 않으면 stale 값이나 축소값 대신 해당 key를 생략합니다.
 */
export function projectCareerResponseProperties(
  category: CareerCategoryDoc,
  record: Pick<CareerRecordDoc, "properties" | "propertyValues">,
): CareerProperties {
  const entries = canonicalPropertyEntries(category, record);
  if (entries === undefined) return record.properties;

  const projected: CareerProperties = {};
  for (const { definition, propertyValue } of entries) {
    if (propertyValue.type === "number" && propertyValue.value instanceof Decimal128) continue;
    if (propertyValue.type === "date" && propertyValue.value.precision === "month" && propertyValue.value.end !== null) continue;
    projected[definition.key] = legacyCompatibleValue(category, definition, propertyValue);
  }
  return projected;
}

export function projectLegacyCareerProperties(
  category: CareerCategoryDoc,
  record: Pick<CareerRecordDoc, "properties" | "propertyValues">,
): CareerProperties {
  return projectCareerProperties(category, record, (definition, propertyValue) => legacyCompatibleValue(category, definition, propertyValue));
}

/** Category Move 같은 내부 변환에는 canonical type 정보를 V2 wrapper로 유지합니다. */
export function projectTypedCareerProperties(
  category: CareerCategoryDoc,
  record: Pick<CareerRecordDoc, "properties" | "propertyValues">,
): CareerProperties {
  return projectCareerProperties(category, record, (definition, propertyValue) => {
    if (propertyValue.type === "number") {
      if (typeof propertyValue.value === "number") {
        return { type: "number", value: propertyValue.value } satisfies CareerPropertyValueV2;
      }
      dataIntegrity(`내부 V2 number가 Decimal128 값을 lossless하게 표현할 수 없습니다: ${definition.key}`);
    }
    if (propertyValue.type === "date") {
      if (propertyValue.value.precision === "month") {
        if (propertyValue.value.end !== null) dataIntegrity(`내부 V2 값이 month range를 표현할 수 없습니다: ${definition.key}`);
        return propertyValue.value.start;
      }
      return { type: "date", value: {
        start: propertyValue.value.start,
        end: propertyValue.value.end,
        timezone: propertyValue.value.precision === "datetime" ? propertyValue.value.timezone : null,
      } };
    }
    return { type: propertyValue.type, value: propertyValue.value } as CareerPropertyValueV2;
  });
}

function canonicalDate(value: { start: string; end: string | null; timezone: string | null }) {
  if (value.start.includes("T")) return { precision: "datetime" as const, ...value };
  if (DAY_VALUE.test(value.start)) return { precision: "day" as const, start: value.start, end: value.end };
  throw new CareerError(400, "date PropertyValue의 날짜 정밀도를 판별할 수 없습니다");
}

function canonicalValue(
  definition: Pick<CanonicalCareerPropertyDefinition, "id" | "key"> & { type: WritableCareerPropertyType },
  rawValue: unknown,
): CareerPropertyValueDoc {
  const parsedV2 = CareerPropertyValueV2Schema.safeParse(rawValue);
  if (definition.type === "number") {
    const number = parsedV2.success && parsedV2.data.type === "number"
      ? parsedV2.data.value
      : typeof rawValue === "number" && Number.isFinite(rawValue)
        ? rawValue
        : null;
    if (number === null) {
      throw new CareerError(400, `canonical PropertyValue로 변환할 수 없습니다: ${definition.key}`);
    }
    return {
      propertyDefinitionId: definition.id,
      type: "number",
      value: number,
    };
  }
  let value: unknown;
  if (parsedV2.success) {
    if (parsedV2.data.type !== definition.type) throw new CareerError(400, `PropertyValue 타입이 Definition과 일치하지 않습니다: ${definition.key}`);
    value = parsedV2.data.type === "date" ? canonicalDate(parsedV2.data.value) : parsedV2.data.value;
  } else if (definition.type === "multi_select" && Array.isArray(rawValue) && rawValue.every((item) => typeof item === "string")) {
    if (rawValue.some((item) => item.trim().length === 0)) throw new CareerError(400, `공백만 있는 tag는 저장할 수 없습니다: ${definition.key}`);
    value = rawValue.map((item) => exactOptionId(definition.id, item));
  } else if (definition.type === "date" && typeof rawValue === "string" && MONTH_VALUE.test(rawValue)) {
    value = { precision: "month", start: rawValue, end: null };
  } else {
    value = rawValue;
  }
  const parsed = WritableCareerPropertyValueSchema.safeParse({ propertyDefinitionId: definition.id, type: definition.type, value });
  if (!parsed.success) throw new CareerError(400, `canonical PropertyValue로 변환할 수 없습니다: ${definition.key}`);
  if (parsed.data.type === "number") throw new CareerError(400, `canonical PropertyValue로 변환할 수 없습니다: ${definition.key}`);
  return parsed.data;
}

/** 한 legacy properties snapshot 전체를 같은 시점의 canonical propertyValues로 만듭니다. */
export function toCanonicalPropertyValues(
  category: Pick<CareerCategoryDoc, "_id" | "propertySchema" | "propertySchemaV2" | "propertyDefinitions">,
  properties: CareerProperties,
  definitionsOverride?: readonly CareerPropertyDefinitionV2[],
): CareerPropertyValueDoc[] {
  const v2Definitions = definitionsOverride
    ?? careerCategoryDefinitions(category);
  const storedIdByKey = new Map((definitionsOverride ? [] : category.propertyDefinitions ?? []).filter((definition) => definition.deletedAt === null).map((definition) => [definition.key, definition.id]));
  const canonicalDefinitions = v2Definitions
    .filter((definition): definition is CareerPropertyDefinitionV2 & { type: WritableCareerPropertyType } => definition.deletedAt === null && isWritableDefinition(definition))
    .map((definition) => ({ ...definition, id: storedIdByKey.get(definition.key) ?? definition.id }));
  const definitionByKey = new Map(canonicalDefinitions.map((definition) => [definition.key, definition]));
  const values: CareerPropertyValueDoc[] = [];
  for (const [key, rawValue] of Object.entries(properties)) {
    const definition = definitionByKey.get(key);
    if (!definition || !WRITABLE_TYPES.has(definition.type)) continue;
    values.push(canonicalValue(definition, rawValue));
  }
  return values;
}

/**
 * legacy tag 문자열을 canonical option으로 등록합니다.
 * 호출자는 이 작업과 Record write를 반드시 같은 Mongo transaction 안에서 수행해야 합니다.
 */
export async function materializeLegacyTagOptions(
  context: MongoContext,
  session: ClientSession,
  category: Pick<CareerCategoryDoc, "_id" | "propertySchema" | "propertySchemaV2" | "propertyDefinitions">,
  propertySnapshots: readonly CareerProperties[],
  definitionsOverride?: readonly CareerPropertyDefinitionV2[],
): Promise<void> {
  const v2Definitions = definitionsOverride
    ?? careerCategoryDefinitions(category);
  const canonicalByKey = new Map((category.propertyDefinitions ?? []).map((definition) => [definition.key, definition]));

  for (const definition of v2Definitions) {
    if (definition.type !== "multi_select" || definition.deletedAt !== null) continue;
    const canonicalDefinition = canonicalByKey.get(definition.key);
    const propertyDefinitionId = canonicalDefinition?.id ?? definition.id;
    const names = new Set<string>();
    for (const properties of propertySnapshots) {
      const rawValue = properties[definition.key];
      if (!Array.isArray(rawValue) || !rawValue.every((item) => typeof item === "string")) continue;
      for (const name of rawValue) {
        if (name.trim().length === 0) throw new CareerError(400, `공백만 있는 tag는 저장할 수 없습니다: ${definition.key}`);
        names.add(name);
      }
    }
    if (names.size === 0) continue;

    const options = [...names].map((name) => ({ id: exactOptionId(propertyDefinitionId, name), name }));
    const storedOptions = Array.isArray(canonicalDefinition?.config.options)
      ? canonicalDefinition.config.options.filter((option): option is { id: string; name: string } => Boolean(
        option && typeof option === "object" && typeof (option as { id?: unknown }).id === "string" && typeof (option as { name?: unknown }).name === "string",
      ))
      : [];
    for (const option of options) {
      if (storedOptions.some((stored) => (stored.id === option.id && stored.name !== option.name) || (stored.name === option.name && stored.id !== option.id))) {
        throw new CareerError(409, `tag option identity가 기존 Definition과 충돌합니다: ${definition.key}`);
      }
    }
    const result = await context.db.collection<CareerCategoryDoc>("career_categories").updateOne(
      { _id: category._id, "propertyDefinitions.id": propertyDefinitionId },
      { $addToSet: { "propertyDefinitions.$[definition].config.options": { $each: options } } },
      { session, arrayFilters: [{ "definition.id": propertyDefinitionId }] },
    );
    if (result.matchedCount !== 1) throw new CareerError(409, `canonical PropertyDefinition을 찾을 수 없습니다: ${definition.key}`);
  }
}

export function validateCareerProperties(
  schema: CareerPropertySchema,
  properties: CareerProperties,
  schemaV2: readonly CareerPropertyDefinitionV2[] = [],
): void {
  for (const [key, value] of Object.entries(properties)) {
    const definition = schema[key];
    const definitionV2 = schemaV2.find((item) => item.key === key && item.deletedAt === null);
    if (!definition && !definitionV2) {
      throw new CareerError(400, `unknown category property: ${key}`);
    }

    const parsedV2 = CareerPropertyValueV2Schema.safeParse(value);
    if (parsedV2.success) {
      if (!definitionV2 || parsedV2.data.type !== definitionV2.type) throw new CareerError(400, `invalid value for category property: ${key}`);
      const protectedTime = ["created_time", "updated_time"].includes(definitionV2.type) && definitionV2.system;
      if (["formula", "rollup"].includes(definitionV2.type) || protectedTime) throw new CareerError(400, `computed category property is read-only: ${key}`);
      continue;
    }

    if (!definition) throw new CareerError(400, `v2 value is required for category property: ${key}`);
    const valid = definition.type === "text"
      ? typeof value === "string"
      : definition.type === "number"
        ? typeof value === "number" && Number.isFinite(value)
        : definition.type === "boolean"
          ? typeof value === "boolean"
          : definition.type === "tags"
            ? Array.isArray(value) && value.every((item) => typeof item === "string")
            : typeof value === "string" && MONTH_VALUE.test(value);
    if (!valid) {
      throw new CareerError(400, `invalid value for category property: ${key}`);
    }
  }

  for (const [key, definition] of Object.entries(schema)) {
    if (definition.required && !Object.hasOwn(properties, key)) {
      throw new CareerError(400, `required category property is missing: ${key}`);
    }
  }
  for (const definition of schemaV2) {
    if (definition.required && definition.deletedAt === null && !Object.hasOwn(properties, definition.key)) throw new CareerError(400, `required category property is missing: ${definition.key}`);
  }
}

/** v2 값은 저장 전에 타입별 Zod 계약으로 검증해 임의 JSON이 스키마를 우회하지 못하게 합니다. */
export function validateCareerPropertyValueV2(value: unknown) {
  return CareerPropertyValueV2Schema.parse(value);
}
