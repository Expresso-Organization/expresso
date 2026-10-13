import { CareerBusinessPropertyValueSchema } from "./career-schemas.js";
import type { CareerBusinessPropertyValue, CareerPropertyDefinitionV2 } from "@expresso/contracts";

export type CareerProductPropertyValue = CareerBusinessPropertyValue extends infer Value ? Value extends { propertyDefinitionId: string } ? Omit<Value, "propertyDefinitionId"> : never : never;
export type CareerProductProperties = Record<string, CareerProductPropertyValue>;

/** canonical 입력만 키 기반 표시값으로 바꿉니다. 계산·관계·시스템 메타데이터는 별도 읽기 소유입니다. */
export function projectCanonicalCareerProductProperties(definitions: readonly CareerPropertyDefinitionV2[], values: readonly CareerBusinessPropertyValue[]): CareerProductProperties {
  const byId = new Map<string, CareerPropertyDefinitionV2>();
  const keys = new Set<string>();
  for (const definition of definitions) {
    if (byId.has(definition.id) || keys.has(definition.key)) throw new Error("DUPLICATE_CANONICAL_DEFINITION");
    byId.set(definition.id, definition);
    keys.add(definition.key);
  }
  const result: CareerProductProperties = {};
  const seen = new Set<string>();
  for (const raw of values) {
    const value = CareerBusinessPropertyValueSchema.parse(raw);
    if (seen.has(value.propertyDefinitionId)) throw new Error("DUPLICATE_CANONICAL_VALUE");
    seen.add(value.propertyDefinitionId);
    const definition = byId.get(value.propertyDefinitionId);
    if (!definition || definition.deletedAt !== null) throw new Error("CANONICAL_DEFINITION_NOT_FOUND");
    const timestampAlias = !definition.system && (definition.type === "created_time" || definition.type === "updated_time") && value.type === "date" && value.value.precision === "datetime" && value.value.end === null;
    if (definition.type !== value.type && !timestampAlias) throw new Error("CANONICAL_TYPE_MISMATCH");
    const { propertyDefinitionId: _id, ...display } = value;
    result[definition.key] = display;
  }
  return result;
}