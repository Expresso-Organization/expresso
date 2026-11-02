import { describe, expect, it } from "vitest";
import { CareerRecordSchema } from "./career.js";
const id="11111111-1111-4111-8111-111111111111";
const record={id,categoryId:id,title:"Pending relation",status:"draft",origin:"manual",properties:{},propertyValues:[],bodyMd:"Document stays writable",version:1,updatedAt:"2026-10-09T00:00:00.000Z"};
describe("relation projection pending contract",()=>{
 it("carries only affected property UUIDs without blocking unrelated business state",()=>{expect(CareerRecordSchema.parse({...record,pendingRelationPropertyIds:[id]})).toMatchObject({pendingRelationPropertyIds:[id]});expect(CareerRecordSchema.parse(record)).toEqual(record);});
 it("rejects private payloads, duplicate IDs and invalid identifiers",()=>{for(const value of[[id,id],["private-label"],[{id,userId:id,secret:"not-public"}]])expect(CareerRecordSchema.safeParse({...record,pendingRelationPropertyIds:value}).success).toBe(false);});
});
