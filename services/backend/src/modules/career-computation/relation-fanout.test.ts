import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CareerCategoryDoc, CareerRecordDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { MongoCareerComputationService } from "./service.js";

const state=vi.hoisted(()=>({edges:[] as {sourceRecordId:string;sourcePropertyId:string;targetRecordId:string;inversePropertyId:string|null}[],limits:[] as number[],activeRecord:vi.fn()}));
vi.mock("../../platform/mongo-transaction.js",()=>({inTransaction:async(context:MongoContext,work:(context:MongoContext)=>unknown)=>work(context)}));
vi.mock("./repository.js",()=>({MongoCareerComputationRepository:class {
 records(){return {findOne:async()=>null};}
 relations(){return {find:()=>({limit:(limit:number)=>{state.limits.push(limit);return {toArray:async()=>state.edges.slice(0,limit)};}})};}
 activeRecord=state.activeRecord;
}}));

function mirrored(count:number){
 const forward=Array.from({length:count},(_,index)=>({sourceRecordId:`source-${index}`,sourcePropertyId:"related",targetRecordId:"target",inversePropertyId:"inverse"}));
 return [...forward,...forward.map(edge=>({sourceRecordId:edge.targetRecordId,sourcePropertyId:edge.inversePropertyId,targetRecordId:edge.sourceRecordId,inversePropertyId:edge.sourcePropertyId}))];
}
async function refresh(kind:"lifecycle"|"value"){
 const context={} as MongoContext,service=new MongoCareerComputationService(context,"canonical");
 if(kind==="lifecycle")return service.invalidateTargetState("owner","target",1);
 const callable=service as unknown as {fanout(context:MongoContext,record:CareerRecordDoc,category:CareerCategoryDoc,changed:string[]):Promise<void>};
 return callable.fanout(context,{_id:"target",userId:"owner"} as CareerRecordDoc,{} as CareerCategoryDoc,["score"]);
}
beforeEach(()=>{state.edges=[];state.limits=[];state.activeRecord.mockReset().mockResolvedValue(null);});
describe("canonical mirrored relation fanout capacity",()=>{
 it.each(["lifecycle","value"] as const)("preserves 10000 logical connections for %s fanout",async kind=>{
  state.edges=mirrored(10000);
  await expect(refresh(kind)).resolves.toBeUndefined();
  expect(state.limits).toEqual([20001]);
  expect(state.activeRecord).toHaveBeenCalledTimes(10000);
  expect(new Set(state.activeRecord.mock.calls.map(call=>call[1])).size).toBe(10000);
 });
 it.each(["lifecycle","value"] as const)("rejects more than 10000 logical connections before %s projection writes",async kind=>{
  state.edges=Array.from({length:10001},(_,index)=>({sourceRecordId:`source-${index}`,sourcePropertyId:"related",targetRecordId:"target",inversePropertyId:null}));
  await expect(refresh(kind)).rejects.toThrow("fanout limit exceeded");
  expect(state.activeRecord).not.toHaveBeenCalled();
 });
});