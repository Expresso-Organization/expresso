import type { CareerBusinessPropertyValue, CareerPropertyDefinitionV2, CareerPropertyMutationPlan } from "@expresso/contracts";
import { overlayCareerPropertyOptionSnapshot, type CareerCategoryPropertyOptionScope, type CareerPropertyOptionPolicy } from "@expresso/database";
/** 표시용/변환용 복사본만 바꾸며 raw schema와 tombstone provenance를 유지합니다. */
export function effectiveCanonicalMutationDefinition(definition: CareerPropertyDefinitionV2, policy: readonly CareerPropertyOptionPolicy[], scope: CareerCategoryPropertyOptionScope): CareerPropertyDefinitionV2 {
  const result = overlayCareerPropertyOptionSnapshot([definition], policy.filter(row => row.propertyId === definition.id), scope)[0]!;
  return !result.system && ["created_time", "updated_time"].includes(result.type) ? { ...result, type: "date" } : result;
}
export function effectiveCanonicalMutationOperation(operation: CareerPropertyMutationPlan, policy: readonly CareerPropertyOptionPolicy[], scope: CareerCategoryPropertyOptionScope): CareerPropertyMutationPlan {
  return { ...operation, source: operation.source ? effectiveCanonicalMutationDefinition(operation.source, policy, scope) : null, target: effectiveCanonicalMutationDefinition(operation.target, policy, scope) };
}
export function assertCanonicalMutationValue(definition: CareerPropertyDefinitionV2, value: CareerBusinessPropertyValue | null | undefined): void {
  if(value && !definition.system && ["created_time","updated_time"].includes(definition.type) && (value.type!=="date" || value.value.precision!=="datetime" || value.value.end!==null))throw new Error("custom timestamp requires one canonical datetime");
}