import type { CareerCategory, CareerPropertyDefinitionV2, CareerPropertyValueV2, CareerRecord, CareerRecordStatus, CareerViewConfiguration } from "@expresso/contracts";

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
  onCreate(initialProperties?: Record<string, unknown>, options?: { open?: boolean }): Promise<CareerRecord | null> | void;
  onFillMissing(recordId: string): void;
  onToggle(recordId: string): void;
  onViewChange(next: CareerViewConfiguration): void;
  onCellCommit?(recordId: string, definition: CareerPropertyDefinitionV2, value: CareerPropertyValueV2 | null): Promise<void>;
  onCellRetry?(recordId: string, propertyId: string): void;
  /** 상태는 속성 정의가 없는 기록 칸이라 셀 저장과 따로 둔다. 같은 기록 저장 순서를 따른다. */
  onStatusChange?(recordId: string, status: CareerRecordStatus): Promise<void>;
  onDuplicateRecord?(recordId: string): Promise<CareerRecord | null>;
  onDeleteRecord?(recordId: string): Promise<void>;
  cellIssues?: ReadonlyMap<string, string>;
}

export function propertyKey(category: CareerCategory, propertyId: string): string | null {
  return category.propertySchemaV2.find((item) => item.id === propertyId)?.key ?? null;
}
export function propertyName(category: CareerCategory, propertyId: string): string {
  return category.propertySchemaV2.find((item) => item.id === propertyId)?.name ?? propertyId.slice(0, 8);
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
