import type { CareerPropertySchemaChange } from "@expresso/contracts";

const SPRING_PROPERTY_CREATE_TYPES = new Set([
  "text",
  "number",
  "checkbox",
  "select",
  "multi_select",
  "date",
  "url",
  "email",
  "phone",
  "file",
  "media",
  "relation",
  "formula",
  "rollup",
]);

export function usesSpringPropertyMutation(change: CareerPropertySchemaChange): boolean {
  if (change.kind === "rename" || change.kind === "reorder") return true;
  return change.kind === "create" && SPRING_PROPERTY_CREATE_TYPES.has(change.property.type);
}

export function isCareerPropertyMutationEnabledForMvp(change: CareerPropertySchemaChange): boolean {
  if (change.kind === "type-change" || change.kind === "delete" || change.kind === "restore" || change.kind === "configure") return false;
  if (change.kind === "create" && Object.hasOwn(change.property.config, "defaultValue")) return false;
  return true;
}
