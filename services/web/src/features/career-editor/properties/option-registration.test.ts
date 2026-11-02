import { afterEach,describe,expect,it,vi } from "vitest";
import type { CareerCategory } from "@expresso/contracts";
import { ensureCareerPropertyOption,withCareerPropertyOption } from "./option-registration";
const categoryId="00000000-0000-4000-8000-000000000001",propertyId="00000000-0000-4000-8000-000000000002",optionId="00000000-0000-4000-8000-000000000003";
const category:CareerCategory={id:categoryId,key:"project",name:"프로젝트",icon:"note",defaultView:"table",propertySchemaV2:[{id:propertyId,key:"tags",name:"태그",type:"multi_select",required:false,system:false,config:{legacyFreeformTags:true,options:[]},order:0,version:1,deletedAt:null}],schemaVersion:1,version:1,sortOrder:0,recordCount:0};
afterEach(()=>vi.unstubAllGlobals());
describe("private freeform option registration",()=>{
 it("sends the exact label without user credentials or owner fields",async()=>{
  const fetch=vi.fn(async(_url:string,_init?:RequestInit)=>Response.json({data:{id:optionId,name:"  C++  "},version:1}));vi.stubGlobal("fetch",fetch);
  expect(await ensureCareerPropertyOption(categoryId,propertyId,"  C++  ")).toEqual({id:optionId,name:"  C++  "});
  expect(fetch).toHaveBeenCalledWith(`/api/career/categories/${categoryId}/property-schema/${propertyId}/options`,expect.objectContaining({method:"POST",body:JSON.stringify({label:"  C++  "})}));
  expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("authorization");
 });
 it("retains a registered label in the local category without schema changes or duplicate retry",()=>{
  const updated=withCareerPropertyOption(category,propertyId,{id:optionId,name:"  C++  "});
  expect(updated.propertySchemaV2?.[0]?.config.options).toEqual([{id:optionId,label:"  C++  ",name:"  C++  "}]);
  expect(updated.schemaVersion).toBe(1);expect(updated.version).toBe(1);
  expect(withCareerPropertyOption(updated,propertyId,{id:optionId,name:"  C++  "})).toEqual(updated);
  expect(category.propertySchemaV2?.[0]?.config.options).toEqual([]);
  expect(()=>withCareerPropertyOption(updated,propertyId,{id:"00000000-0000-4000-8000-000000000004",name:"  C++  "})).toThrow();
 });
 it("rejects registration failures without fabricating a local option",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:409})));
  await expect(ensureCareerPropertyOption(categoryId,propertyId,"tag")).rejects.toThrow();
 });
});
