import { describe,expect,it } from "vitest";
import type { CareerBusinessPropertyValue,CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { canonicalRecordReadDefinitions } from "./canonical-read-context.js";
const id="00000000-0000-4000-8000-000000000001";
const source:CareerPropertyDefinitionV2={id,key:"note",name:"Note",type:"text",config:{},system:false,required:false,order:0,version:1,deletedAt:null};
const oldValue:CareerBusinessPropertyValue={propertyDefinitionId:id,type:"text",value:"old readable value"};
describe("in-flight canonical schema reads",()=>{
 it("uses the frozen source definition while conversion has not reached a record",()=>{
  const target={...source,type:"number" as const,version:2};
  expect(canonicalRecordReadDefinitions([target],[oldValue],source)).toEqual([source]);
  expect(canonicalRecordReadDefinitions([target],[{propertyDefinitionId:id,type:"number",value:"1.2300"}],source)).toEqual([target]);
 });
 it("preserves the readable source during deletion without changing the published schema",()=>{
  const target={...source,deletedAt:"2026-10-09T00:00:00Z",version:2};
  const input=structuredClone(target);
  expect(canonicalRecordReadDefinitions([target],[oldValue],source)).toEqual([source]);
  expect(target).toEqual(input);
  expect(canonicalRecordReadDefinitions([target],[],source)).toEqual([target]);
 });
 it("uses frozen source option bindings for an unfinished same-type option removal",()=>{
  const kept="00000000-0000-4000-8000-000000000002",removed="00000000-0000-4000-8000-000000000003";
  const old={...source,type:"multi_select" as const,config:{options:[{id:kept,name:"kept"},{id:removed,name:"removed"}]}},target={...old,version:2,config:{options:[{id:kept,name:"kept"}]}};
  expect(canonicalRecordReadDefinitions([target],[{propertyDefinitionId:id,type:"multi_select",value:[kept,removed]}],old)).toEqual([old]);
  expect(canonicalRecordReadDefinitions([target],[{propertyDefinitionId:id,type:"multi_select",value:[kept]}],old)).toEqual([target]);
 });
 it("does not relax unrelated invalid values or change definitions outside an active source",()=>{
  const target={...source,type:"number" as const,version:2};
  expect(canonicalRecordReadDefinitions([target],[oldValue],null)).toEqual([target]);
  expect(canonicalRecordReadDefinitions([target],[{...oldValue,propertyDefinitionId:"00000000-0000-4000-8000-000000000002"}],source)).toEqual([target]);
 });
});
