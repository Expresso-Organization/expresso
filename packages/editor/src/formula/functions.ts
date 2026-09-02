import type { FormulaDateValue, FormulaRuntimeValue } from "./types.js";

export type FormulaStaticType = "unknown" | "null" | "text" | "number" | "boolean" | "date" | "list";
export interface FormulaFunctionSignature { readonly minArgs: number; readonly maxArgs: number; readonly args?: readonly FormulaStaticType[]; readonly result: FormulaStaticType }
export interface FormulaFunction { readonly signature: FormulaFunctionSignature; readonly invoke: (args: readonly FormulaRuntimeValue[]) => FormulaRuntimeValue }

function isDate(value: FormulaRuntimeValue): value is FormulaDateValue { return Boolean(value && typeof value === "object" && !Array.isArray(value) && "kind" in value && value.kind === "date"); }
function date(value: FormulaRuntimeValue, name: string): FormulaDateValue {
  if (!isDate(value)) throw new TypeError(`${name}에는 날짜가 필요합니다`);
  return value;
}
function number(value: FormulaRuntimeValue, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name}에는 유한한 숫자가 필요합니다`);
  return value;
}
function text(value: FormulaRuntimeValue, name: string): string {
  if (typeof value !== "string") throw new TypeError(`${name}에는 텍스트가 필요합니다`);
  return value;
}
function list(value: FormulaRuntimeValue, name: string): readonly FormulaRuntimeValue[] {
  if (!Array.isArray(value)) throw new TypeError(`${name}에는 목록이 필요합니다`);
  return value;
}
function comparable(value: FormulaRuntimeValue, name: string): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  if (isDate(value)) return value.value;
  throw new TypeError(`${name}에는 텍스트, 숫자 또는 날짜가 필요합니다`);
}
function shiftedDate(value: FormulaDateValue, days: number): FormulaDateValue {
  const instant = new Date(`${value.value}T00:00:00.000Z`);
  if (Number.isNaN(instant.getTime())) throw new TypeError("날짜 형식이 올바르지 않습니다");
  instant.setUTCDate(instant.getUTCDate() + days);
  return { kind: "date", value: instant.toISOString().slice(0, 10) };
}
function dateOnly(value: FormulaRuntimeValue, name: string): FormulaDateValue {
  const source = text(value, name);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(source) || Number.isNaN(new Date(`${source}T00:00:00.000Z`).getTime())) throw new TypeError("날짜는 YYYY-MM-DD 형식이어야 합니다");
  return { kind: "date", value: source };
}

/** 함수 이름과 구현을 같은 immutable allow-list에 둔다. 사용자 수식은 이 표 밖을 호출할 수 없다. */
const FORMULA_FUNCTION_DEFINITIONS = {
  abs: { signature: { minArgs: 1, maxArgs: 1, args: ["number"], result: "number" }, invoke: ([item]) => Math.abs(number(item ?? null, "abs")) },
  ceil: { signature: { minArgs: 1, maxArgs: 1, args: ["number"], result: "number" }, invoke: ([item]) => Math.ceil(number(item ?? null, "ceil")) },
  floor: { signature: { minArgs: 1, maxArgs: 1, args: ["number"], result: "number" }, invoke: ([item]) => Math.floor(number(item ?? null, "floor")) },
  round: { signature: { minArgs: 1, maxArgs: 1, args: ["number"], result: "number" }, invoke: ([item]) => Math.round(number(item ?? null, "round")) },
  concat: { signature: { minArgs: 0, maxArgs: 100, result: "text" }, invoke: (items) => items.map((item) => text(item, "concat")).join("") },
  lower: { signature: { minArgs: 1, maxArgs: 1, args: ["text"], result: "text" }, invoke: ([item]) => text(item ?? null, "lower").toLocaleLowerCase("ko-KR") },
  upper: { signature: { minArgs: 1, maxArgs: 1, args: ["text"], result: "text" }, invoke: ([item]) => text(item ?? null, "upper").toLocaleUpperCase("ko-KR") },
  length: { signature: { minArgs: 1, maxArgs: 1, result: "number" }, invoke: ([item]) => typeof item === "string" || Array.isArray(item) ? item.length : (() => { throw new TypeError("length에는 텍스트 또는 목록이 필요합니다"); })() },
  contains: { signature: { minArgs: 2, maxArgs: 2, result: "boolean" }, invoke: ([whole, needle]) => typeof whole === "string" ? whole.includes(text(needle ?? null, "contains")) : list(whole ?? null, "contains").some((item) => stable(item) === stable(needle ?? null)) },
  date: { signature: { minArgs: 1, maxArgs: 1, args: ["text"], result: "date" }, invoke: ([item]) => dateOnly(item ?? null, "date") },
  dateAdd: { signature: { minArgs: 2, maxArgs: 2, args: ["date", "number"], result: "date" }, invoke: ([item, days]) => shiftedDate(date(item ?? null, "dateAdd"), number(days ?? null, "dateAdd")) },
  dateDiff: { signature: { minArgs: 2, maxArgs: 2, args: ["date", "date"], result: "number" }, invoke: ([left, right]) => Math.round((new Date(`${date(left ?? null, "dateDiff").value}T00:00:00.000Z`).getTime() - new Date(`${date(right ?? null, "dateDiff").value}T00:00:00.000Z`).getTime()) / 86_400_000) },
  if: { signature: { minArgs: 3, maxArgs: 3, args: ["boolean"], result: "unknown" }, invoke: ([condition, whenTrue, whenFalse]) => condition === true ? whenTrue ?? null : condition === false ? whenFalse ?? null : (() => { throw new TypeError("if의 첫 인수는 boolean이어야 합니다"); })() },
  coalesce: { signature: { minArgs: 1, maxArgs: 100, result: "unknown" }, invoke: (items) => items.find((item) => item !== null) ?? null },
  join: { signature: { minArgs: 1, maxArgs: 2, args: ["list", "text"], result: "text" }, invoke: ([items, separator = ", "]) => list(items ?? null, "join").map((item) => text(item, "join")).join(text(separator, "join")) },
  sum: { signature: { minArgs: 1, maxArgs: 1, args: ["list"], result: "number" }, invoke: ([items]) => list(items ?? null, "sum").reduce<number>((total, item) => total + number(item, "sum"), 0) },
  average: { signature: { minArgs: 1, maxArgs: 1, args: ["list"], result: "number" }, invoke: ([items]) => { const values = list(items ?? null, "average").map((item) => number(item, "average")); return values.length ? values.reduce((total, item) => total + item, 0) / values.length : null; } },
  min: { signature: { minArgs: 1, maxArgs: 1, args: ["list"], result: "unknown" }, invoke: ([items]) => extremum(list(items ?? null, "min"), -1, "min") },
  max: { signature: { minArgs: 1, maxArgs: 1, args: ["list"], result: "unknown" }, invoke: ([items]) => extremum(list(items ?? null, "max"), 1, "max") },
} satisfies Record<string, FormulaFunction>;
for (const definition of Object.values(FORMULA_FUNCTION_DEFINITIONS)) {
  Object.freeze(definition.signature);
  Object.freeze(definition);
}
export const FORMULA_FUNCTIONS: Readonly<Record<string, FormulaFunction>> = Object.freeze(FORMULA_FUNCTION_DEFINITIONS);

function stable(value: FormulaRuntimeValue): string { return value === null ? "null" : Array.isArray(value) ? `[${value.map(stable).join(",")}]` : isDate(value) ? `date:${value.value}` : `${typeof value}:${value}`; }
function extremum(items: readonly FormulaRuntimeValue[], direction: 1 | -1, name: string): FormulaRuntimeValue {
  if (!items.length) return null;
  return items.reduce((best, current) => {
    const bestValue = comparable(best, name); const currentValue = comparable(current, name);
    if (typeof bestValue !== typeof currentValue) throw new TypeError(`${name}의 목록 타입이 섞여 있습니다`);
    return (currentValue > bestValue ? 1 : currentValue < bestValue ? -1 : 0) === direction ? current : best;
  });
}

export function runFormulaBuiltin(name: string, args: readonly FormulaRuntimeValue[]): FormulaRuntimeValue {
  const definition = FORMULA_FUNCTIONS[name];
  if (!definition) throw new TypeError(`허용하지 않는 함수 ${name}입니다`);
  if (args.length < definition.signature.minArgs || args.length > definition.signature.maxArgs) throw new TypeError(`${name} 함수의 인수 개수가 올바르지 않습니다`);
  const value = definition.invoke(args);
  if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("수식 결과는 유한한 숫자여야 합니다");
  return value;
}
