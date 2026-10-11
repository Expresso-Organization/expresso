import { CareerBusinessPropertyValueSchema, CareerProductPropertyDeltaSchema, type CareerBusinessPropertyValue, type CareerProductPropertyDelta, type CareerPropertyDefinitionV2, type CareerPropertyValueV2, type CareerRecord } from "@expresso/contracts";

export type CareerCellValue = CareerPropertyValueV2 | CareerBusinessPropertyValue | null;

const canonicalTypes = new Set(["text", "number", "checkbox", "select", "multi_select", "date", "url", "email", "phone", "file", "media"]);
export function canonicalEditableDefinition(definition: CareerPropertyDefinitionV2): boolean {
  return canonicalTypes.has(definition.type) || (!definition.system && (definition.type === "created_time" || definition.type === "updated_time"));
}
export function canonicalPropertyValue(record: CareerRecord, definition: Pick<CareerPropertyDefinitionV2, "id">): CareerBusinessPropertyValue | null {
  return record.propertyValues?.find((value) => value.propertyDefinitionId === definition.id) ?? null;
}
function canonicalDefinitionMatches(value: CareerBusinessPropertyValue, definition: CareerPropertyDefinitionV2): boolean {
  if (definition.type === value.type) {
    if (value.type !== "select" && value.type !== "multi_select") return true;
    const options = Array.isArray(definition.config.options) ? definition.config.options : [];
    const ids = new Set(options.flatMap(option => option && typeof option === "object" && "id" in option && typeof option.id === "string" ? [option.id] : []));
    return value.type === "select" ? value.value === null || ids.has(value.value) : value.value.every(id => ids.has(id));
  }
  return !definition.system && (definition.type === "created_time" || definition.type === "updated_time")
    && value.type === "date" && value.value.precision === "datetime" && value.value.end === null;
}

/** 변경 대상 정의가 먼저 공개되어도 원본 값은 동결한 원래 정의로 표시합니다. */
export function canonicalReadDefinition(record: CareerRecord, definition: CareerPropertyDefinitionV2): CareerPropertyDefinitionV2 {
  const value = canonicalPropertyValue(record, definition);
  const source = record.pendingPropertyMutation?.sourceProperty;
  if (value && source?.id === definition.id && canonicalDefinitionMatches(value, source)
    && (definition.deletedAt !== null || !canonicalDefinitionMatches(value, definition))) return { ...source, deletedAt: null };
  return definition;
}

export function canonicalReadDefinitions(record: CareerRecord, definitions: readonly CareerPropertyDefinitionV2[]): CareerPropertyDefinitionV2[] {
  const visible = definitions.map(definition => canonicalReadDefinition(record, definition)).filter(definition => definition.deletedAt === null);
  const source = record.pendingPropertyMutation?.sourceProperty;
  const value = source ? canonicalPropertyValue(record, source) : null;
  if (source && value && canonicalDefinitionMatches(value, source) && !visible.some(definition => definition.id === source.id)) visible.push({ ...source, deletedAt: null });
  return visible.sort((left, right) => left.order - right.order);
}
export function canonicalDisplayValue(definition: CareerPropertyDefinitionV2, value: CareerBusinessPropertyValue | null): string {
  if (!value) return "비어 있음";
  const options = Array.isArray(definition.config.options) ? definition.config.options : [];
  const label = (id: string) => {
    const option = options.find((item) => item && typeof item === "object" && "id" in item && item.id === id);
    if (!option || typeof option !== "object") return id;
    if ("name" in option && typeof option.name === "string") return option.name;
    return "label" in option && typeof option.label === "string" ? option.label : id;
  };
  if (value.type === "checkbox") return value.value ? "예" : "아니요";
  if (value.type === "select") return value.value === null ? "선택 안 함" : label(value.value);
  if (value.type === "multi_select") return value.value.map(label).join(", ") || "선택 안 함";
  if (value.type === "file" || value.type === "media") return value.value.join(", ") || "비어 있음";
  if (value.type === "date") return value.value.start + (value.value.end ? " – " + value.value.end : "") + (value.value.precision === "datetime" && value.value.timezone ? " (" + value.value.timezone + ")" : "");
  return typeof value.value === "string" ? value.value : value.value.join(", ");
}

export function propertyMutationHint(record: CareerRecord): string | null {
  const pending = record.pendingPropertyMutation;
  if (!pending) return null;
  if (pending.status === "failed") return "속성 변경이 중단되었습니다. " + (pending.retryable ? "작업을 다시 시작하면 속성을 편집할 수 있습니다. " : "변경 작업을 확인한 뒤 속성을 편집할 수 있습니다. ") + "본문은 계속 편집할 수 있습니다.";
  return (pending.status === "pending" ? "속성 변경을 기다리고 있습니다. " : "속성을 변경하고 있습니다. ") + "작업이 끝나면 속성을 편집할 수 있습니다. 본문은 계속 편집할 수 있습니다.";
}

export function canonicalCellValue(definition: CareerPropertyDefinitionV2, value: CareerCellValue): CareerBusinessPropertyValue | null {
  if (value === null) return null;
  if ("propertyDefinitionId" in value && value.propertyDefinitionId !== definition.id) throw new Error("속성 ID가 일치하지 않습니다.");
  if (definition.type === "created_time" || definition.type === "updated_time") {
    if (value.type === "date") return CareerBusinessPropertyValueSchema.parse({ ...value, propertyDefinitionId: definition.id });
    if (value.type === definition.type) return CareerBusinessPropertyValueSchema.parse({ propertyDefinitionId: definition.id, type: "date", value: { precision: "datetime", start: value.value, end: null, timezone: null } });
  }
  if (value.type !== definition.type) throw new Error("속성 유형이 일치하지 않습니다.");
  return CareerBusinessPropertyValueSchema.parse({ ...value, propertyDefinitionId: definition.id });
}
export function canonicalPropertyDelta(definition: CareerPropertyDefinitionV2, value: CareerCellValue): CareerProductPropertyDelta {
  const canonical = canonicalCellValue(definition, value);
  return CareerProductPropertyDeltaSchema.parse(canonical === null ? { set: [], unsetPropertyIds: [definition.id] } : { set: [canonical], unsetPropertyIds: [] });
}
export function applyCareerCellValue<T extends CareerRecord>(record: T, definition: CareerPropertyDefinitionV2, value: CareerCellValue): T {
  if (definition.key === "title") return { ...record, title: value?.type === "title" ? value.value : "" };
  if (record.propertyValues !== undefined && canonicalEditableDefinition(definition)) {
    const next = canonicalCellValue(definition, value);
    const values = record.propertyValues.filter((item) => item.propertyDefinitionId !== definition.id);
    if (next !== null) values.push(next);
    return { ...record, propertyValues: values };
  }
  const properties = { ...record.properties };
  if (value === null) delete properties[definition.key];
  else if (!("propertyDefinitionId" in value)) properties[definition.key] = value;
  else throw new Error("원본 속성 배열이 없는 기록입니다.");
  return { ...record, properties };
}

/** 부호·정수 길이·소수 자릿수를 문자열로 비교하여 Number 정밀도 손실을 피합니다. */
export function compareDecimalStrings(left: string, right: string): number {
  const parts = (value: string) => {
    const negative = value.startsWith("-");
    const [integer = "0", fraction = ""] = (negative ? value.slice(1) : value).split(".");
    return { negative: negative && /[1-9]/.test(integer + fraction), integer, fraction };
  };
  const a = parts(left), b = parts(right);
  if (a.negative !== b.negative) return a.negative ? -1 : 1;
  const length = Math.max(a.fraction.length, b.fraction.length);
  const magnitude = a.integer.length !== b.integer.length ? Math.sign(a.integer.length - b.integer.length) : a.integer !== b.integer ? (a.integer < b.integer ? -1 : 1) : a.fraction.padEnd(length, "0") === b.fraction.padEnd(length, "0") ? 0 : a.fraction.padEnd(length, "0") < b.fraction.padEnd(length, "0") ? -1 : 1;
  return a.negative ? -magnitude : magnitude;
}

/** 일·월은 표기 순서로, datetime은 원래 offset과 나노초를 포함한 시점으로 비교합니다. */
export function compareDateStrings(left: string, right: string): number {
  if (!/T/i.test(left) || !/T/i.test(right)) return left.localeCompare(right);
  const nanos = (value: string): bigint => {
    const fraction = /\.([0-9]+)(?=Z|[+-])/i.exec(value)?.[1] ?? "";
    const seconds = Date.parse(value.replace(/\.[0-9]+(?=Z|[+-])/i, "")) / 1_000;
    return BigInt(seconds) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  };
  const a = nanos(left), b = nanos(right);
  return a === b ? 0 : a < b ? -1 : 1;
}
