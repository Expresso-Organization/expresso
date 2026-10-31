import { describe, expect, it } from "vitest";
import { CareerCategoryMovePreviewSchema } from "./career-properties.js";
const id="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
const preview={recordId:id,sourceCategoryId:id,targetCategoryId:other,recordVersion:1,sourceSchemaVersion:1,targetSchemaVersion:1,conversions:[],unmappedProperties:{},previewToken:"x".repeat(32)};
describe("exact canonical move preview",()=>{
 it("retains Decimal128 scale and exact canonical date while preserving legacy previews",()=>{
  const number={propertyDefinitionId:id,type:"number",value:"9007199254740993.00"},date={propertyDefinitionId:other,type:"date",value:{precision:"month",start:"2026-10",end:null}};
  expect(CareerCategoryMovePreviewSchema.parse({...preview,unmappedProperties:{[id]:number,[other]:date}}).unmappedProperties).toEqual({[id]:number,[other]:date});
  expect(CareerCategoryMovePreviewSchema.parse({...preview,unmappedProperties:{[id]:{type:"number",value:3}}}).unmappedProperties).toEqual({[id]:{type:"number",value:3}});
 });
 it("rejects a canonical envelope bound to another stable property ID",()=>{expect(CareerCategoryMovePreviewSchema.safeParse({...preview,unmappedProperties:{[id]:{propertyDefinitionId:other,type:"number",value:"3.00"}}}).success).toBe(false);});
});
