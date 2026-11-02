import { randomUUID } from "node:crypto";
import { describe,expect,it } from "vitest";
import { createSpringPropertyMutationPort } from "./spring-property-mutation-port.js";
describe("inactive Spring transport boundary",()=>{
  const user=randomUUID(),record=randomUUID(),job=randomUUID(),lease=randomUUID(),fingerprint="a".repeat(64);
  const data={id:record,userId:user,categoryId:randomUUID(),title:"test",status:"draft",propertyValues:[],version:1,updatedAt:new Date(0).toISOString()};
  it("parses receipt/read/commit and preserves null receipt",async()=>{
    const port=createSpringPropertyMutationPort({invoke:async(operation)=>operation==="receipt"?null:operation==="read"?{data,tombstone:null}:{data,changed:false,replayed:false}});
    expect(await port.receipt(user,job,record,fingerprint)).toBeNull();expect(await port.read(user,job,record,lease,fingerprint)).toEqual({data,tombstone:null});
    expect(await port.commit(user,{mutationId:job,recordId:record,expectedVersion:1,leaseToken:lease,operationFingerprint:fingerprint,propertyValues:{set:[],unsetPropertyIds:[]}})).toMatchObject({changed:false});
  });
  it("rejects body-bearing or cross-user responses",async()=>{
    const body=createSpringPropertyMutationPort({invoke:async()=>({data:{...data,blockBody:[]},tombstone:null})});await expect(body.read(user,job,record,lease,fingerprint)).rejects.toThrow();
    const scoped=createSpringPropertyMutationPort({invoke:async()=>({data:{...data,userId:randomUUID()},changed:false,replayed:true})});await expect(scoped.receipt(user,job,record,fingerprint)).rejects.toThrow("scope");
  });
  it("propagates Spring failure without Mongo fallback",async()=>{
    const port=createSpringPropertyMutationPort({invoke:async()=>{throw new Error("Spring unavailable");}});await expect(port.read(user,job,record,lease,fingerprint)).rejects.toThrow("Spring unavailable");
  });
});
