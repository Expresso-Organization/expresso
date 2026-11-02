import { describe,expect,it } from "vitest";
import type { MongoContext } from "../../platform/mongodb.js";
import { CareerService } from "./service.js";
const id="00000000-0000-4000-8000-000000000001";
describe("legacy business writer boundary",()=>{
 it("rejects canonical create before any Mongo transaction",async()=>{
  const legacy=new CareerService({} as MongoContext);
  await expect(legacy.createRecord(id,"boundary-create",{categoryId:id,title:"",bodyMd:"",properties:{},propertyValues:[]})).rejects.toMatchObject({statusCode:503,message:"canonical business writes require Spring"});
 });
 it("rejects canonical patch rather than ignoring its delta or bumping business version",async()=>{
  const legacy=new CareerService({} as MongoContext);
  await expect(legacy.updateRecord(id,id,1,{propertyValues:{set:[],unsetPropertyIds:[]}})).rejects.toMatchObject({statusCode:503,message:"canonical business writes require Spring"});
 });
});
