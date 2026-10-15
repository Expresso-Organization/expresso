import { createHash } from "node:crypto";

import type { CareerPropertyDefinitionV2, CareerPropertySchema } from "@expresso/contracts";
import type { CareerCategoryDoc } from "@expresso/database";

/** v1 속성에 id가 없을 때 카테고리와 key로 항상 같은 UUID v5를 만듭니다. */
export function stablePropertyId(categoryId: string, key: string): string {
  const bytes = createHash("sha1").update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex")).update(`${categoryId}:${key}`).digest();
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 카테고리의 유효 v2 속성 정의입니다. `propertySchemaV2`가 없으면 v1 `propertySchema`에서 파생합니다.
 * 기본 카테고리와 스키마를 한 번도 바꾸지 않은 카테고리는 v1만 가지므로, 화면 · 저장 검증 · 보기가 모두 이 정의를 씁니다.
 */
export function careerPropertyDefinitions(
  categoryId: string,
  propertySchema: CareerPropertySchema,
  propertySchemaV2: readonly CareerPropertyDefinitionV2[] | undefined,
): CareerPropertyDefinitionV2[] {
  if (propertySchemaV2) return [...propertySchemaV2];
  return Object.entries(propertySchema).map(([key, property], order) => ({
    id: property.id ?? stablePropertyId(categoryId, key), key, name: property.label,
    type: property.type === "boolean" ? "checkbox" : property.type === "tags" ? "multi_select" : property.type,
    required: property.required, system: property.system, config: {}, order, version: 1, deletedAt: null,
  }));
}

export function careerCategoryDefinitions(category: CareerCategoryDoc): CareerPropertyDefinitionV2[] {
  return careerPropertyDefinitions(category._id, category.propertySchema, category.propertySchemaV2);
}
