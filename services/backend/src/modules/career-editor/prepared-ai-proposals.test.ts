import { randomUUID } from "node:crypto";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { Decimal128 } from "mongodb";
import { describe, expect, it } from "vitest";
import { selectAiCanonicalDelta } from "./prepared-ai-proposals.js";

const id = randomUUID();
const otherId = randomUUID();
function definition(type: CareerPropertyDefinitionV2["type"]): CareerPropertyDefinitionV2 {
  return { id, key: "selected", name: "선택", type, required: false, system: false, config: {}, order: 0, version: 1, deletedAt: null };
}
describe("prepared AI canonical selection", () => {
  it("updates only the selected canonical ID and ignores stale compatibility values", () => {
    const delta = selectAiCanonicalDelta([definition("text")], [{ propertyDefinitionId: id, type: "text", value: "canonical" }, { propertyDefinitionId: otherId, type: "number", value: Decimal128.fromString("12345678901234567890.123400") }], [{ propertyId: id, previousValue: { type: "text", value: "canonical" }, nextValue: { type: "text", value: "changed" } }]);
    expect(delta).toEqual({ set: [{ propertyDefinitionId: id, type: "text", value: "changed" }], unsetPropertyIds: [] });
  });
  it("keeps canonical absence distinct from a nullable select value", () => {
    const optionId = randomUUID();
    expect(selectAiCanonicalDelta([definition("select")], [], [{ propertyId: id, previousValue: null, nextValue: { type: "select", value: null } }])).toEqual({ set: [{ propertyDefinitionId: id, type: "select", value: null }], unsetPropertyIds: [] });
    expect(selectAiCanonicalDelta([definition("select")], [{ propertyDefinitionId: id, type: "select", value: optionId }], [{ propertyId: id, previousValue: { type: "select", value: optionId }, nextValue: null }])).toEqual({ set: [], unsetPropertyIds: [id] });
  });
  it("preserves exact decimal digits and trailing zeros through an explicit selected override", () => {
    const previous = { propertyDefinitionId: id, type: "number" as const, value: "12345678901234567890.123400" };
    const next = { propertyDefinitionId: id, type: "number" as const, value: "12345678901234567890.123500" };
    expect(selectAiCanonicalDelta([definition("number")], [{ ...previous, value: Decimal128.fromString(previous.value) }], [{ propertyId: id, previousValue: { type: "number", value: 1 }, nextValue: { type: "number", value: 2 } }], [{ propertyId: id, previousValue: previous, nextValue: next }])).toEqual({ set: [next], unsetPropertyIds: [] });
  });
  it("requires a canonical override when the selected Decimal128 cannot fit V2", () => {
    expect(() => selectAiCanonicalDelta([definition("number")], [{ propertyDefinitionId: id, type: "number", value: Decimal128.fromString("12345678901234567890.123400") }], [{ propertyId: id, previousValue: { type: "number", value: 1 }, nextValue: { type: "number", value: 2 } }])).toThrow(/canonical/i);
  });
  it("requires a canonical override for selected month ranges", () => {
    expect(() => selectAiCanonicalDelta([definition("date")], [{ propertyDefinitionId: id, type: "date", value: { precision: "month", start: "2024-01", end: "2024-02" } }], [{ propertyId: id, previousValue: null, nextValue: null }])).toThrow(/canonical/i);
  });
  it("rejects an override of an unselected ID or a changed canonical before value", () => {
    const change = { propertyId: id, previousValue: null, nextValue: { type: "text" as const, value: "new" } };
    expect(() => selectAiCanonicalDelta([definition("text")], [], [change], [{ propertyId: otherId, previousValue: null, nextValue: null }])).toThrow();
    expect(() => selectAiCanonicalDelta([definition("text")], [{ propertyDefinitionId: id, type: "text", value: "external" }], [change])).toThrow();
  });
  it("rejects duplicate IDs and nonwritable definition types", () => {
    const change = { propertyId: id, previousValue: null, nextValue: null };
    expect(() => selectAiCanonicalDelta([definition("text")], [], [change, change])).toThrow();
    expect(() => selectAiCanonicalDelta([definition("relation")], [], [change])).toThrow();
  });
});
it("freezes canonical-only exact decimal and month changes without client overrides",()=>{
 const previous={propertyDefinitionId:id,type:"number" as const,value:"12345678901234567890.123400"},next={...previous,value:"12345678901234567890.123500"};
 expect(selectAiCanonicalDelta([definition("number")],[{...previous,value:Decimal128.fromString(previous.value)}],[{propertyId:id,canonicalPreviousValue:previous,canonicalNextValue:next}])).toEqual({set:[next],unsetPropertyIds:[]});
 const month={propertyDefinitionId:id,type:"date" as const,value:{precision:"month" as const,start:"2026-01",end:"2026-02"}};
 expect(selectAiCanonicalDelta([definition("date")],[month],[{propertyId:id,canonicalPreviousValue:month,canonicalNextValue:null}])).toEqual({set:[],unsetPropertyIds:[id]});
});it("preserves editable custom timestamp aliases and rejects system or range aliases",()=>{
 const previous={propertyDefinitionId:id,type:"date" as const,value:{precision:"datetime" as const,start:"2025-06-01T02:03:04.123456789+09:00",end:null,timezone:"Asia/Seoul"}},next={...previous,value:{...previous.value,start:"2025-07-01T02:03:04.987654321+09:00"}},change={propertyId:id,canonicalPreviousValue:previous,canonicalNextValue:next};
 for(const type of ["created_time","updated_time"] as const){const custom=definition(type);expect(selectAiCanonicalDelta([custom],[previous],[change])).toEqual({set:[next],unsetPropertyIds:[]});expect(()=>selectAiCanonicalDelta([{...custom,system:true}],[previous],[change])).toThrow();expect(()=>selectAiCanonicalDelta([custom],[previous],[{...change,canonicalNextValue:{...next,value:{...next.value,end:"2025-07-02T02:03:04.987654321+09:00"}}}])).toThrow();}
});