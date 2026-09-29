import type { CareerCategory, CareerPropertyDefinitionV2, CareerRecord, CareerViewConfiguration, WritableCareerPropertyValue } from "@expresso/contracts";

import { rawPropertyValue, type CareerPropertyEditorValue } from "../properties/canonical-property-values";

export interface CareerViewRendererProps {
  records: readonly CareerRecord[];
  view: CareerViewConfiguration;
  category: CareerCategory;
  /** roving tabindex가 머무는 기록 */
  activeId: string | null;
  /** 드로워에 실제로 열린 기록 */
  openId: string | null;
  selectedIds: ReadonlySet<string>;
  onActivate(recordId: string): void;
  onCreate(initialPropertyValues?: readonly WritableCareerPropertyValue[], options?: { open?: boolean }): Promise<CareerRecord | null> | void;
  onFillMissing?(recordId: string): void;
  onToggle(recordId: string): void;
  onViewChange(next: CareerViewConfiguration): void;
  onCellCommit?(recordId: string, definition: CareerPropertyDefinitionV2, value: CareerPropertyEditorValue | null): Promise<void>;
  onCellRetry?(recordId: string, propertyId: string): void;
  onDuplicateRecord?(recordId: string): Promise<CareerRecord | null>;
  onDeleteRecord?(recordId: string): Promise<void>;
  cellIssues?: ReadonlyMap<string, string>;
}

export function propertyKey(category: CareerCategory, propertyId: string): string | null {
  return propertyDefinition(category, propertyId)?.key ?? null;
}
export function propertyDefinition(category: CareerCategory, propertyId: string): CareerPropertyDefinitionV2 | null {
  const canonical = category.propertySchemaV2?.find((item) => item.id === propertyId);
  if (canonical) return canonical;
  const legacy = Object.entries(category.propertySchema).find(([, item]) => item.id === propertyId);
  if (!legacy) return null;
  const [key, item] = legacy;
  if (!item.id) return null;
  const type = item.type === "tags" ? "multi_select" : item.type === "boolean" ? "checkbox" : item.type;
  return { id: item.id, key, name: item.label, type, required: item.required, system: true, config: {}, order: 0, version: 1, deletedAt: null };
}
export function propertyDefinitionByKey(category: CareerCategory, key: string): CareerPropertyDefinitionV2 | null {
  const canonical = category.propertySchemaV2?.find((item) => item.key === key && item.deletedAt === null);
  if (canonical) return canonical;
  const legacy = Object.entries(category.propertySchema).find(([candidate]) => candidate === key);
  if (!legacy?.[1].id) return null;
  return propertyDefinition(category, legacy[1].id);
}
export function propertyName(category: CareerCategory, propertyId: string): string {
  return category.propertySchemaV2?.find((item) => item.id === propertyId)?.name ?? Object.entries(category.propertySchema).find(([, item]) => item.id === propertyId)?.[1].label ?? propertyId.slice(0, 8);
}

export function rawValue(record: CareerRecord, definition: CareerPropertyDefinitionV2): unknown {
  return rawPropertyValue(record, definition);
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map((item) => typeof item === "object" && item && "title" in item ? String(item.title) : String(item)).join(", ") || "—";
  if (typeof value === "object" && "start" in value) { const range=value as {start:unknown;end?:unknown}; return `${String(range.start)}${range.end ? ` – ${String(range.end)}` : ""}`; }
  return String(value);
}

export function keyboardActivate(event: React.KeyboardEvent, recordId: string, records: readonly CareerRecord[], onActivate: (id: string) => void) {
  const index = records.findIndex((record) => record.id === recordId);
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate(recordId); return; }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
  event.preventDefault();
  const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
  onActivate(records[Math.max(0, Math.min(records.length - 1, index + direction))]?.id ?? recordId);
}
