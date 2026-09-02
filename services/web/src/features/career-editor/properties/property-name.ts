import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";

type NamedProperty = Pick<CareerPropertyDefinitionV2, "name" | "deletedAt">;

export function propertyNameBase(name: string): string {
  return name.trim().replace(/\s+\d+$/u, "").trim() || "속성";
}

export function nextNumberedPropertyName(baseName: string, definitions: readonly NamedProperty[]): string {
  const base = propertyNameBase(baseName);
  const used = new Set(definitions.filter((definition) => definition.deletedAt === null).map((definition) => definition.name.trim()));
  let sequence = 1;
  while (used.has(`${base} ${sequence}`)) sequence += 1;
  return `${base} ${sequence}`;
}
