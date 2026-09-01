import type {
  CareerProperties,
  CareerPropertyDefinitionV2,
  CareerPropertySchema,
} from "@expresso/contracts";
import { CareerPropertyValueV2Schema } from "@expresso/contracts";

import { CareerError } from "./errors.js";

const MONTH_VALUE = /^\d{4}-(0[1-9]|1[0-2])$/;

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
      if (["formula", "rollup", "created_time", "updated_time"].includes(definitionV2.type)) throw new CareerError(400, `computed category property is read-only: ${key}`);
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
