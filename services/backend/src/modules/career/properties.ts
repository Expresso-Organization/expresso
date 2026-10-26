import type {
  CareerProperties,
  CareerPropertyDefinitionV2,
} from "@expresso/contracts";
import { CareerPropertyValueV2Schema } from "@expresso/contracts";

import { CareerError } from "./errors.js";

/** 값마다 카테고리의 살아 있는 정의가 있고 타입이 맞는지 본다. 계산 속성은 쓸 수 없다. */
export function validateCareerProperties(
  definitions: readonly CareerPropertyDefinitionV2[],
  properties: CareerProperties,
): void {
  for (const [key, value] of Object.entries(properties)) {
    const definition = definitions.find((item) => item.key === key && item.deletedAt === null);
    if (!definition) throw new CareerError(400, `unknown category property: ${key}`);
    if (value.type !== definition.type) throw new CareerError(400, `invalid value for category property: ${key}`);
    const protectedTime = ["created_time", "updated_time"].includes(definition.type) && definition.system;
    if (["formula", "rollup"].includes(definition.type) || protectedTime) throw new CareerError(400, `computed category property is read-only: ${key}`);
  }
  for (const definition of definitions) {
    if (definition.required && definition.deletedAt === null && !Object.hasOwn(properties, definition.key)) throw new CareerError(400, `required category property is missing: ${definition.key}`);
  }
}

/** v2 값은 저장 전에 타입별 Zod 계약으로 검증해 임의 JSON이 스키마를 우회하지 못하게 합니다. */
export function validateCareerPropertyValueV2(value: unknown) {
  return CareerPropertyValueV2Schema.parse(value);
}
