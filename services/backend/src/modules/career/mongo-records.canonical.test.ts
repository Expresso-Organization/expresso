import { Decimal128 } from "mongodb";
import { describe, expect, it } from "vitest";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import type { CareerRecordDoc } from "@expresso/database";
import { mapMongoRecord } from "./mongo-records.js";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const definition=(n:number,key:string,type:CareerPropertyDefinitionV2["type"]):CareerPropertyDefinitionV2=>({id:id(n),key,name:key,type,required:false,system:false,config:{},order:n,version:1,deletedAt:null});
const definitions=[definition(1,"amount","number"),definition(2,"period","date"),definition(3,"note","text")];
function record(values?:unknown):CareerRecordDoc {return {_id:id(10),userId:id(11),categoryId:id(12),title:"record",status:"draft",origin:"manual",properties:{amount:999,note:"stale legacy"},bodyMd:"document remains",version:2,createdAt:new Date("2026-10-09T00:00:00Z"),updatedAt:new Date("2026-10-09T00:00:00Z"),deletedAt:null,purgeAfter:null,...(values===undefined?{}:{propertyValues:values})} as unknown as CareerRecordDoc;}
describe("canonical product record mapping",()=>{
 it("reads exact BSON canonical values and never stale physical properties",()=>{
  const value=[{propertyDefinitionId:id(1),type:"number",value:Decimal128.fromString("12345678901234567890.123400")},{propertyDefinitionId:id(2),type:"date",value:{precision:"month",start:"2026-10",end:null}},{propertyDefinitionId:id(3),type:"text",value:" note "}];
  const result=mapMongoRecord(record(value),undefined,{definitions,requireCanonical:true});
  expect(result.propertyValues).toEqual([{...value[0],value:"12345678901234567890.123400"},value[1],value[2]]);
  expect(result.properties).toEqual({amount:"12345678901234567890.123400",period:"2026-10",note:" note "});
  expect(result).toMatchObject({bodyMd:"document remains",version:2});
 });
 it("rejects missing canonical arrays rather than fabricating empty values",()=>{
  expect(()=>mapMongoRecord(record(),undefined,{definitions,requireCanonical:true})).toThrow("CANONICAL_VALUES_NOT_PREPARED");
  expect(mapMongoRecord(record([]),undefined,{definitions,requireCanonical:true})).toMatchObject({propertyValues:[],properties:{}});
 });
 it("keeps nullable options and exact datetime range in compatible display",()=>{
  const defs=[definition(1,"option","select"),definition(2,"period","date")];
  const range={precision:"datetime",start:"2026-10-09T01:00:00.123456789+09:00",end:"2026-10-09T02:00:00.123456789+09:00",timezone:"Asia/Seoul"};
  const values=[{propertyDefinitionId:id(1),type:"select",value:null},{propertyDefinitionId:id(2),type:"date",value:range}];
  expect(mapMongoRecord(record(values),undefined,{definitions:defs,requireCanonical:true})).toMatchObject({propertyValues:values,properties:{option:{type:"select",value:null},period:{type:"date",value:{start:range.start,end:range.end,timezone:range.timezone}}}});
 });
 it("rejects unknown canonical definitions and requires definitions",()=>{
  const value=[{propertyDefinitionId:id(99),type:"text",value:"x"}];
  expect(()=>mapMongoRecord(record(value),undefined,{definitions,requireCanonical:true})).toThrow("CANONICAL_DEFINITION_NOT_FOUND");
  expect(()=>mapMongoRecord(record([]))).toThrow("CANONICAL_DEFINITIONS_NOT_PREPARED");
 });
});
