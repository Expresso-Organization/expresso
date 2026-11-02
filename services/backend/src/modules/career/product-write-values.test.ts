import { describe,expect,it } from "vitest";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { translateCareerProductProperties } from "./product-write-values.js";
const categoryId="00000000-0000-4000-8000-000000000001",numberId="00000000-0000-4000-8000-000000000002",dateId="00000000-0000-4000-8000-000000000003",tagId="00000000-0000-4000-8000-000000000004",optionId="00000000-0000-4000-8000-000000000005",relationId="00000000-0000-4000-8000-000000000006";
const definition=(id:string,key:string,type:CareerPropertyDefinitionV2["type"]):CareerPropertyDefinitionV2=>({id,key,name:key,type,required:false,system:false,config:{},order:0,version:1,deletedAt:null});
const definitions=[definition(numberId,"amount","number"),definition(dateId,"period","date"),{...definition(tagId,"tags","multi_select"),config:{legacyFreeformTags:true,options:[{id:optionId,label:"  React  ",name:"  React  "}]}}, {...definition(relationId,"related","relation"),config:{targetCategoryId:categoryId,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict"}}];
describe("legacy product input to canonical owner commands",()=>{
 it("preserves exact decimal strings/trailing zero and date precision/offset",()=>{
  const start="2026-10-01T12:00:00.123456789+09:00";
  expect(translateCareerProductProperties(categoryId,definitions,{amount:"12345678901234567890.123400",period:{type:"date",value:{start,end:null,timezone:"Asia/Seoul"}}})).toEqual({propertyValues:[{propertyDefinitionId:numberId,type:"number",value:"12345678901234567890.123400"},{propertyDefinitionId:dateId,type:"date",value:{precision:"datetime",start,end:null,timezone:"Asia/Seoul"}}],relations:[]});
 });
 it("maps exact raw tags to registered IDs, including a raw string that looks like a UUID",()=>{
  expect(translateCareerProductProperties(categoryId,definitions,{tags:["  React  "]}).propertyValues).toEqual([{propertyDefinitionId:tagId,type:"multi_select",value:[optionId]}]);
  expect(()=>translateCareerProductProperties(categoryId,definitions,{tags:["React"]})).toThrow();
 });
 it("keeps relation changes separate from the eleven scalar business types",()=>{
  const result=translateCareerProductProperties(categoryId,definitions,{related:{type:"relation",value:[{recordId:optionId,title:"Untrusted card title"}]}});
  expect(result).toEqual({propertyValues:[],relations:[{propertyId:relationId,targetIds:[optionId]}]});
 });
 it("rejects unknown, deleted and readonly property writes instead of silently dropping them",()=>{
  expect(()=>translateCareerProductProperties(categoryId,definitions,{unknown:"value"})).toThrow();
  expect(()=>translateCareerProductProperties(categoryId,[{...definitions[0]!,deletedAt:"2026-10-01T00:00:00Z"}],{amount:3})).toThrow();
  expect(()=>translateCareerProductProperties(categoryId,[definition(numberId,"total","formula")],{total:{type:"formula",value:{result:3,formatted:"3",error:null}}})).toThrow();
 });
});
