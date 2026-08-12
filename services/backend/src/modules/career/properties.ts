import type {
  CareerProperties,
  CareerPropertySchema,
} from "@expresso/contracts";

import { CareerError } from "./errors.js";

const MONTH_VALUE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function validateCareerProperties(
  schema: CareerPropertySchema,
  properties: CareerProperties,
): void {
  for (const [key, value] of Object.entries(properties)) {
    const definition = schema[key];
    if (!definition) {
      throw new CareerError(400, `unknown category property: ${key}`);
    }

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
}
