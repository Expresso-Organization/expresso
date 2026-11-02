import { Decimal128, Long } from "mongodb";
import { CareerBusinessDecimalSchema, CareerBusinessPropertyValueSchema } from "./career-schemas.js";
import type { CareerBusinessPropertyValue } from "@expresso/contracts";

export function canonicalDecimalString(input: string): string {
  const match=/^(-?)(\d+)(?:\.(\d+))?(?:E([+-]?\d+))?$/i.exec(input);
  if(!match) throw new Error("finite BSON decimal required");
  const [,sign,whole,fraction="",exponent="0"]=match;
  const digits=whole!+fraction;const point=whole!.length+Number(exponent);
  if(!Number.isSafeInteger(point) || Math.abs(point)>6200) throw new Error("decimal exponent exceeds canonical range");
  const plain=point<=0?`0.${"0".repeat(-point)}${digits}`:point>=digits.length?digits+"0".repeat(point-digits.length):`${digits.slice(0,point)}.${digits.slice(point)}`;
  return CareerBusinessDecimalSchema.parse(sign+plain.replace(/^0+(?=\d)/,""));
}

/** Legacy properties를 canonical 값의 원본으로 사용하지 않습니다. */
export function readCanonicalCareerPropertyValues(record: { propertyValues?: unknown }): CareerBusinessPropertyValue[] {
  if(!Array.isArray(record.propertyValues)) throw new Error("CANONICAL_VALUES_NOT_PREPARED");
  return record.propertyValues.map(raw=>{
    if(!raw || typeof raw!=="object") throw new Error("invalid canonical BSON value");
    const value=raw as {type?:unknown;value?:unknown};
    if(value.type!=="number") return CareerBusinessPropertyValueSchema.parse(raw);
    const decimal=value.value;
    if(!(decimal instanceof Decimal128) && !Long.isLong(decimal) && !(typeof decimal==="number" && Number.isFinite(decimal))) throw new Error("canonical number must be BSON numeric");
    return CareerBusinessPropertyValueSchema.parse({...raw,value:canonicalDecimalString(String(decimal))});
  });
}
