import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { convertCanonicalPropertyValue,mutationDelta } from "./canonical-property-mutation-values.js";
import type { CareerBusinessPropertyValue,CareerPropertyDefinitionV2,CareerPropertyMutationPlan } from "@expresso/contracts";

describe("canonical mutation value conversion", () => {
  it("converts the shared canonical cases without legacy properties or JS number loss", async () => {
    const cases = JSON.parse(readFileSync(new URL("../../../../../packages/contracts/openapi/fixtures/career-property-mutation-v1.json", import.meta.url), "utf8"));
    for (const entry of cases) expect(convertCanonicalPropertyValue(entry.before, entry.target), entry.name).toEqual(entry.result);
  });
  it.each(["text", "url", "email", "phone"] as const)("requires confirmation for datetime timezone loss to %s while preserving the start string", type => {
    const id = "00000000-0000-4000-8000-000000000011";
    const start = "2026-09-01T03:02:01.123456789+09:00";
    const source: CareerPropertyDefinitionV2 = { id, key: "p", name: "p", type: "date", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null };
    const target = { ...source, type, version: 2 };
    const before: CareerBusinessPropertyValue = { propertyDefinitionId: id, type: "date", value: { precision: "datetime", start, end: null, timezone: "Asia/Seoul" } };
    const plan: CareerPropertyMutationPlan = { kind: "conversion", source, target, defaultValue: null, confirmLossy: false };
    const after = { propertyDefinitionId: id, type, value: start };
    expect(convertCanonicalPropertyValue(before, target)).toEqual({ kind: "lossy", value: after });
    expect(() => mutationDelta(plan, [before], null)).toThrow("confirmation");
    expect(mutationDelta({ ...plan, confirmLossy: true }, [before], null)).toEqual({ set: [after], unsetPropertyIds: [] });
    const withoutTimezone: CareerBusinessPropertyValue = { ...before, value: { precision: "datetime", start, end: null, timezone: null } };
    expect(convertCanonicalPropertyValue(withoutTimezone, target)).toEqual({ kind: "safe", value: after });
    expect(mutationDelta(plan, [withoutTimezone], null)).toEqual({ set: [after], unsetPropertyIds: [] });
  });
  it.each([false, true])("rejects unsupported datetime conversions even with confirmLossy=%s", confirmLossy => {
    const id = "00000000-0000-4000-8000-000000000011";
    const source: CareerPropertyDefinitionV2 = { id, key: "p", name: "p", type: "date", required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null };
    const target: CareerPropertyDefinitionV2 = { ...source, type: "number", version: 2 };
    const before: CareerBusinessPropertyValue = { propertyDefinitionId: id, type: "date", value: { precision: "datetime", start: "2026-09-01T03:02:01.123456789+09:00", end: null, timezone: "Asia/Seoul" } };
    expect(convertCanonicalPropertyValue(before, target)).toEqual({ kind: "unmapped" });
    expect(() => mutationDelta({ kind: "conversion", source, target, defaultValue: null, confirmLossy }, [before], null)).toThrow("cannot be converted");
  });
  it("preserves current values on default/restore and requires explicit loss confirmation",()=>{
    const id="00000000-0000-4000-8000-000000000011";const target:CareerPropertyDefinitionV2={id,key:"p",name:"p",type:"text",required:false,system:false,config:{},order:0,version:2,deletedAt:null};
    const value={propertyDefinitionId:id,type:"text" as const,value:"existing"};
    const plan:CareerPropertyMutationPlan={kind:"default",source:null,target,defaultValue:{...value,value:"default"},confirmLossy:false};
    expect(mutationDelta(plan,[],null).set).toEqual([plan.defaultValue]);expect(mutationDelta(plan,[value],null).set).toEqual([]);
    const restore:CareerPropertyMutationPlan={kind:"restoration",source:{...target,deletedAt:new Date().toISOString()},target,defaultValue:null,confirmLossy:false};
    expect(mutationDelta(restore,[value],{...value,value:"backup"}).set).toEqual([]);expect(mutationDelta(restore,[],value).set).toEqual([value]);
    const deletion:CareerPropertyMutationPlan={kind:"deletion",source:target,target:{...target,deletedAt:new Date().toISOString()},defaultValue:null,confirmLossy:false};
    expect(()=>mutationDelta(deletion,[value],null)).toThrow("confirmation");expect(mutationDelta({...deletion,confirmLossy:true},[value],null)).toEqual({set:[],unsetPropertyIds:[id]});
  });
});
