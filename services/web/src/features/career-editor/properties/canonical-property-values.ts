import {
  CareerPropertyValueV2Schema,
  WritableCareerPropertyValueSchema,
  type CareerPropertyDefinitionV2,
  type CareerPropertyValueV2,
  type CareerRecord,
  type WritableCareerPropertyValue,
} from "@expresso/contracts";

type WritableEditorValue = WritableCareerPropertyValue extends infer Value
  ? Value extends { propertyDefinitionId: string }
    ? Omit<Value, "propertyDefinitionId">
    : never
  : never;

export type CareerPropertyEditorValue = WritableEditorValue | CareerPropertyValueV2;

function legacyValue(definition: CareerPropertyDefinitionV2, raw: unknown): CareerPropertyEditorValue | null {
  const parsed = CareerPropertyValueV2Schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (raw === null || raw === undefined) return null;
  const value = raw && typeof raw === "object" && "value" in raw ? (raw as { value: unknown }).value : raw;
  if (definition.type === "number" && typeof value === "number" && Number.isFinite(value)) {
    return { type: "number", value: String(value) };
  }
  if (definition.type === "checkbox" && typeof value === "boolean") return { type: "checkbox", value };
  if (definition.type === "multi_select" && Array.isArray(value)) {
    return { type: "multi_select", value: value.filter((item): item is string => typeof item === "string") };
  }
  if (definition.type === "date" && typeof value === "string") {
    if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) return { type: "date", value: { precision: "month", start: value, end: null } };
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { type: "date", value: { precision: "day", start: value, end: null } };
  }
  if (["text", "title", "url", "email", "phone"].includes(definition.type) && typeof value === "string") {
    return { type: definition.type as "text" | "title" | "url" | "email" | "phone", value };
  }
  return null;
}

export function propertyValueForDefinition(record: CareerRecord, definition: CareerPropertyDefinitionV2): CareerPropertyEditorValue | null {
  if (definition.key === "title") return { type: "title", value: record.title };
  if (definition.system && definition.type === "created_time") return { type: "created_time", value: record.createdAt ?? record.updatedAt };
  if (definition.system && definition.type === "updated_time") return { type: "updated_time", value: record.updatedAt };
  if (definition.type === "formula" || definition.type === "rollup") {
    return legacyValue(definition, record.computedProperties?.[definition.key]);
  }
  if (definition.type === "relation") return legacyValue(definition, record.properties[definition.key]);

  if (record.propertyValues !== undefined) {
    const found = record.propertyValues.find((item) => item.propertyDefinitionId === definition.id);
    if (!found) return null;
    const { propertyDefinitionId: _propertyDefinitionId, ...value } = found;
    return value;
  }

  return legacyValue(definition, record.properties[definition.key]);
}

export function rawPropertyValue(record: CareerRecord, definition: CareerPropertyDefinitionV2): unknown {
  const value = propertyValueForDefinition(record, definition);
  return value?.value ?? null;
}

export function replaceCanonicalPropertyValue(
  record: CareerRecord,
  definition: CareerPropertyDefinitionV2,
  value: CareerPropertyEditorValue | null,
): WritableCareerPropertyValue[] {
  if (record.propertyValues === undefined) {
    throw new Error("canonical propertyValues snapshot이 없어 속성을 수정할 수 없습니다.");
  }
  const remaining = record.propertyValues.filter((item) => item.propertyDefinitionId !== definition.id);
  if (value === null) return remaining;

  const parsed = WritableCareerPropertyValueSchema.safeParse({ propertyDefinitionId: definition.id, ...value });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "속성 값을 확인해 주세요.");
  const index = record.propertyValues.findIndex((item) => item.propertyDefinitionId === definition.id);
  if (index < 0) return [...record.propertyValues, parsed.data];
  return record.propertyValues.map((item, currentIndex) => currentIndex === index ? parsed.data : item);
}
