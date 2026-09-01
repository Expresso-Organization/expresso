import type { CareerCategory, CareerRecord, CareerViewConfiguration } from "@expresso/contracts";

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
  onCreate(): void;
  onToggle(recordId: string): void;
}

export function propertyKey(category: CareerCategory, propertyId: string): string | null {
  return category.propertySchemaV2?.find((item) => item.id === propertyId)?.key ?? Object.entries(category.propertySchema).find(([, item]) => item.id === propertyId)?.[0] ?? null;
}
export function propertyName(category: CareerCategory, propertyId: string): string {
  return category.propertySchemaV2?.find((item) => item.id === propertyId)?.name ?? Object.entries(category.propertySchema).find(([, item]) => item.id === propertyId)?.[1].label ?? propertyId.slice(0, 8);
}

export function rawValue(record: CareerRecord, key: string): unknown {
  const stored = record.properties[key];
  return stored && typeof stored === "object" && "value" in stored ? stored.value : stored;
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
