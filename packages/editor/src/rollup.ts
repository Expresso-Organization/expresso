import type { FormulaComputedValue, FormulaPropertyValue } from "./formula/types.js";

export type CareerRollupAggregation = "count" | "unique_count" | "sum" | "average" | "min" | "max" | "earliest" | "latest" | "percent_checked" | "show_unique";

type RollupScalar = string | number | boolean;
function valuesOf(value: FormulaPropertyValue | null | undefined): readonly RollupScalar[] {
  if (!value) return [];
  const raw = value.type === "date" && value.value && typeof value.value === "object" ? (value.value as { start?: unknown }).start : value.value;
  if (raw === null || raw === undefined || raw === "") return [];
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return [raw];
  if (Array.isArray(raw)) return raw.filter((item): item is RollupScalar => typeof item === "string" || typeof item === "number" || typeof item === "boolean");
  return [];
}
function stable(value: RollupScalar): string { return `${typeof value}:${value}`; }
function result(value: FormulaComputedValue): FormulaPropertyValue { return { type: "rollup", value, diagnostics: [] }; }

/** 이미 소유권·삭제 필터를 통과한 projection만 받는 순수 집계 함수다. null은 삭제·미확인 대상을 표현한다. */
export function aggregateRollup(kind: CareerRollupAggregation, values: readonly (FormulaPropertyValue | null | undefined)[]): FormulaPropertyValue | null {
  const projected = values.flatMap(valuesOf);
  if (kind === "count") return result(projected.length);
  if (kind === "unique_count") return result(new Set(projected.map(stable)).size);
  if (kind === "show_unique") {
    const unique = new Map<string, RollupScalar>();
    projected.forEach((item) => unique.set(stable(item), item));
    return result([...unique.values()]);
  }
  if (kind === "percent_checked") {
    const booleans = projected.filter((item): item is boolean => typeof item === "boolean");
    return result(booleans.length ? (booleans.filter(Boolean).length / booleans.length) * 100 : null);
  }
  if (kind === "sum" || kind === "average") {
    const numbers = projected.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
    if (numbers.length !== projected.length || numbers.length === 0) return result(null);
    const sum = numbers.reduce((total, item) => total + item, 0);
    return result(kind === "sum" ? sum : sum / numbers.length);
  }
  if (kind === "min" || kind === "max") {
    const numbers = projected.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
    if (numbers.length !== projected.length || numbers.length === 0) return result(null);
    return result(kind === "min" ? Math.min(...numbers) : Math.max(...numbers));
  }
  const dates = projected.filter((item): item is string => typeof item === "string" && /^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/u.test(item));
  if (dates.length !== projected.length || dates.length === 0) return result(null);
  return result(kind === "earliest" ? [...dates].sort()[0]! : [...dates].sort().at(-1)!);
}
