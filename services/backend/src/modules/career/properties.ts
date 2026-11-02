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

/**
 * 관계 값은 관계 원장(career_record_relations)이 원본입니다. 기록 생성 · 수정으로 들어온 관계 값은 저장하지 않습니다.
 * 응답에는 원장 값을 붙여 보내므로, 화면이 받은 속성을 그대로 돌려보내도 관계가 두 곳에 갈라지지 않게 합니다.
 */
export function withoutRelationValues(definitions: readonly CareerPropertyDefinitionV2[], properties: CareerProperties): CareerProperties {
  const relationKeys = new Set(definitions.filter((definition) => definition.type === "relation").map((definition) => definition.key));
  return Object.fromEntries(Object.entries(properties).filter(([key]) => !relationKeys.has(key))) as CareerProperties;
}
