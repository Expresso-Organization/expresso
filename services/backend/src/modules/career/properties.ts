import type {
  CanonicalCareerPropertyDefinition,
  CareerProperties,
  CareerPropertyDefinitionV2,
  CareerPropertySchema,
  WritableCareerPropertyType,
  WritableCareerPropertyValue,
} from "@expresso/contracts";
import {
  CanonicalCareerPropertyDefinitionSchema,
  CareerPropertyValueV2Schema,
  WritableCareerPropertyValueSchema,
} from "@expresso/contracts";
import { exactOptionId, officialPropertyDefinitionId, type CareerCategoryDoc } from "@expresso/database";
import type { ClientSession } from "mongodb";

import type { MongoContext } from "../../platform/mongodb.js";
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

function canonicalDate(value: { start: string; end: string | null; timezone: string | null }) {
  if (value.start.includes("T")) return { precision: "datetime" as const, ...value };
  if (DAY_VALUE.test(value.start)) return { precision: "day" as const, start: value.start, end: value.end };
  throw new CareerError(400, "date PropertyValue의 날짜 정밀도를 판별할 수 없습니다");
}

function canonicalValue(
  definition: Pick<CanonicalCareerPropertyDefinition, "id" | "key"> & { type: WritableCareerPropertyType },
  rawValue: unknown,
): WritableCareerPropertyValue {
  const parsedV2 = CareerPropertyValueV2Schema.safeParse(rawValue);
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
  return parsed.data;
}

/** 한 legacy properties snapshot 전체를 같은 시점의 canonical propertyValues로 만듭니다. */
export function toCanonicalPropertyValues(
  category: Pick<CareerCategoryDoc, "_id" | "propertySchema" | "propertySchemaV2" | "propertyDefinitions">,
  properties: CareerProperties,
  definitionsOverride?: readonly CareerPropertyDefinitionV2[],
): WritableCareerPropertyValue[] {
  const v2Definitions = definitionsOverride
    ?? category.propertySchemaV2
    ?? legacySchemaToV2Definitions(category._id, category.propertySchema);
  const storedIdByKey = new Map((definitionsOverride ? [] : category.propertyDefinitions ?? []).filter((definition) => definition.deletedAt === null).map((definition) => [definition.key, definition.id]));
  const canonicalDefinitions = v2Definitions
    .filter((definition): definition is CareerPropertyDefinitionV2 & { type: WritableCareerPropertyType } => definition.deletedAt === null && isWritableDefinition(definition))
    .map((definition) => ({ ...definition, id: storedIdByKey.get(definition.key) ?? definition.id }));
  const definitionByKey = new Map(canonicalDefinitions.map((definition) => [definition.key, definition]));
  const values: WritableCareerPropertyValue[] = [];
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
    ?? category.propertySchemaV2
    ?? legacySchemaToV2Definitions(category._id, category.propertySchema);
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
