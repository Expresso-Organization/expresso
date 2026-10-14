import { Decimal128 } from "mongodb";
import { canonicalDecimalString } from "@expresso/database";
import { CareerBusinessPropertyValueSchema, CareerPropertyMutationPlanSchema,
  type CareerBusinessPropertyValue, type CareerPropertyDefinitionV2, type CareerPropertyMutationPlan } from "@expresso/contracts";

type Conversion = { kind: "exact" | "safe" | "lossy"; value: CareerBusinessPropertyValue } | { kind: "unmapped" };
const conversionText=(input:string)=>input.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g,"");

// Decimal128의 지수를 일반 십진 표기로 되돌립니다. 값을 JS number로 변환하지 않습니다.
export function canonicalDecimal(input: string): string {
  const text=conversionText(input);
  const match=/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if(!match || !(match[2] || match[3]))throw new Error("finite decimal text required");
  const whole=(match[2]||"0").replace(/^0+(?=\d)/,"");const fraction=match[3]??"";
  const exponent=Number(match[4]??"0");if(!Number.isInteger(exponent) || Math.abs(exponent)>2_147_483_647)throw new Error("decimal exponent exceeds BigDecimal range");
  const zero=!/[1-9]/.test(whole+fraction);const scale=fraction.length-exponent;
  // Java BigDecimal의 plain 표현과 scale을 Decimal128 파싱 전에 검증합니다.
  const original=zero?canonicalDecimalString(scale<=0?"0":scale<=6176?`0.${"0".repeat(scale)}`:"invalid"):
    canonicalDecimalString(`${match[1]==="-"?"-":""}${whole}${fraction?`.${fraction}`:""}E${exponent}`);
  const exact=canonicalDecimalString(Decimal128.fromString(original).toString());
  if(original!==exact)throw new Error("decimal fractional scale would be lost");return exact;
}

export function convertCanonicalPropertyValue(before: CareerBusinessPropertyValue, target: CareerPropertyDefinitionV2): Conversion {
  const value = CareerBusinessPropertyValueSchema.parse(before);
  const candidate = (raw: unknown, kind: "exact" | "safe" | "lossy"): Conversion => {
    const parsed = CareerBusinessPropertyValueSchema.safeParse({ propertyDefinitionId: target.id, type: target.type, value: raw });
    return parsed.success ? { kind, value: parsed.data } : { kind: "unmapped" };
  };
  const options = new Set(Array.isArray(target.config.options) ? target.config.options.map(item => (item as { id: string }).id) : []);
  if ((value.type === "select" || value.type === "multi_select") && (target.type === "select" || target.type === "multi_select")) {
    const ids = value.type === "select" ? value.value === null ? [] : [value.value] : value.value;
    const kept = ids.filter(id => options.has(id));
    const lossy = kept.length !== ids.length || (target.type === "select" && kept.length > 1);
    return candidate(target.type === "select" ? kept[0] ?? null : kept, lossy ? "lossy" : value.type === target.type ? "exact" : "safe");
  }
  if (value.type === target.type) return candidate(value.value, "exact");
  if ((value.type === "file" || value.type === "media") && (target.type === "file" || target.type === "media")) return candidate(value.value, "safe");
  if (target.type === "number") {
    if (value.type === "checkbox") return candidate(value.value ? "1" : "0", "safe");
    if (["text", "url", "email", "phone"].includes(value.type) && typeof value.value === "string" && value.value.length) {
      try { return candidate(canonicalDecimal(value.value), "safe"); } catch { return { kind: "unmapped" }; }
    }
  }
  if (target.type === "checkbox") {
    if (value.type === "number") return candidate(/[1-9]/.test(value.value), "lossy");
    if (typeof value.value === "string" && /^(true|false)$/i.test(conversionText(value.value))) return candidate(conversionText(value.value).toLowerCase() === "true", "safe");
  }
  if (target.type === "date" && typeof value.value === "string" && /^\d{4}-(?:0[1-9]|1[0-2])(?:-\d{2})?$/.test(value.value)) {
    return candidate({ precision: "day", start: value.value.length === 7 ? `${value.value}-01` : value.value, end: null }, value.value.length === 7 ? "lossy" : "safe");
  }
  if (["text", "url", "email", "phone"].includes(target.type)) {
    if (typeof value.value === "string" || typeof value.value === "boolean") return candidate(String(value.value), "safe");
    if (value.type === "date") return candidate(value.value.start, value.value.end === null && (value.value.precision !== "datetime" || value.value.timezone === null) ? "safe" : "lossy");
    if (Array.isArray(value.value)) return candidate(value.value.join(", "), "lossy");
  }
  if ((target.type === "select" || target.type === "multi_select") && typeof value.value === "string" && options.has(value.value)) {
    return candidate(target.type === "select" ? value.value : [value.value], "lossy");
  }
  return { kind: "unmapped" };
}

export function mutationDelta(raw: CareerPropertyMutationPlan, values: readonly CareerBusinessPropertyValue[], tombstone: CareerBusinessPropertyValue | null) {
  const plan = CareerPropertyMutationPlanSchema.parse(raw); const id = plan.target.id;
  const current = values.find(value => value.propertyDefinitionId === id);
  if (plan.kind === "deletion") {if(current && !plan.confirmLossy)throw new Error("lossy deletion requires confirmation");return {set:[],unsetPropertyIds:[id]};}
  if (plan.kind === "default") return { set: current ? [] : [plan.defaultValue!], unsetPropertyIds: [] };
  if (plan.kind === "restoration") {
    if (current || !tombstone) return { set: [], unsetPropertyIds: [] };
    const restored = convertCanonicalPropertyValue(tombstone, plan.target);
    if (restored.kind !== "exact") throw new Error("restoration definition no longer matches tombstone");
    return { set: [restored.value], unsetPropertyIds: [] };
  }
  if (!current) return { set: [], unsetPropertyIds: [] };
  if (current.type !== plan.source!.type && current.type !== plan.target.type) throw new Error("conversion source type changed");
  const result = convertCanonicalPropertyValue(current, plan.target);
  if (result.kind === "unmapped") throw new Error("property value cannot be converted");
  if (result.kind === "lossy" && !plan.confirmLossy) throw new Error("lossy conversion requires confirmation");
  return { set: [result.value], unsetPropertyIds: [] };
}
