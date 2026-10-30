import { randomUUID } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import type { CareerRecord } from "@expresso/contracts";
import { SpringCareerProductWriter } from "./spring-product-writer.js";
const userId=randomUUID(),recordId=randomUUID(),categoryId=randomUUID(),propertyId=randomUUID(),token=`exps_${"A".repeat(43)}`;
const record:CareerRecord={id:recordId,categoryId,title:"User title",status:"draft",origin:"manual",propertyValues:[],properties:{},bodyMd:"Document remains",version:2,updatedAt:new Date().toISOString()};
const business={id:recordId,userId,categoryId,title:record.title,status:record.status,propertyValues:[],version:2,updatedAt:record.updatedAt};
function fixture(transport:(url:string,init:RequestInit)=>Promise<Response>) {
 const reads={getRecord:vi.fn(async(_user:string,_record:string)=>record),version:vi.fn(async(_user:string,_record:string,_trashed:boolean)=>1),deleteImpact:vi.fn(async()=>({recordId,portfolioCount:0,blockCount:0,deletedAt:record.updatedAt,purgeAfter:new Date(Date.now()+86400000).toISOString()}))};
 return {reads,writer:new SpringCareerProductWriter("http://spring.internal",reads,transport)};
}
describe("product business commands use the Spring owner",()=>{
 it("forwards one combined CAS with exact decimal and no document/projection fields",async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  const {writer,reads}=fixture(async(url,init)=>{calls.push({url,init});return Response.json({data:business},{headers:{etag:'"v2"'}});});
  expect(await writer.patch(token,userId,recordId,1,{title:"New title",status:"organized",propertyValues:{set:[{propertyDefinitionId:propertyId,type:"number",value:"1.2300"}],unsetPropertyIds:[]}})).toBe(record);
  expect(calls).toHaveLength(1);expect(new Headers(calls[0]!.init.headers).get("if-match")).toBe('"v1"');expect(JSON.parse(String(calls[0]!.init.body))).toEqual({title:"New title",status:"organized",propertyValues:{set:[{propertyDefinitionId:propertyId,type:"number",value:"1.2300"}],unsetPropertyIds:[]}});
  expect(reads.getRecord).toHaveBeenCalledWith(userId,recordId);
 });
 it("never reads a claimed success belonging to a different user or record",async()=>{
  for(const data of [{...business,userId:randomUUID()},{...business,id:randomUUID()}]) {
   const {writer,reads}=fixture(async()=>Response.json({data},{headers:{etag:'"v2"'}}));
   await expect(writer.patch(token,userId,recordId,1,{title:"x"})).rejects.toMatchObject({statusCode:503});expect(reads.getRecord).not.toHaveBeenCalled();
  }
 });
 it("preserves stale and scoped lock errors while hiding transport exceptions",async()=>{
  const details={mutationId:randomUUID(),status:"failed",retryable:true};
  for(const [status,data] of [[412,undefined],[409,details]] as const) {
   const {writer,reads}=fixture(async()=>Response.json({error:{code:status===412?"PRECONDITION_FAILED":"CONFLICT",message:"owner rejected",requestId:"owner-request",...(data?{details:data}:{})}},{status}));
   await expect(writer.patch(token,userId,recordId,1,{title:"x"})).rejects.toMatchObject({statusCode:status,...(data?{publicDetails:data}:{})});expect(reads.getRecord).not.toHaveBeenCalled();
  }
  const {writer,reads}=fixture(async()=>{throw new Error("secret transport detail");});
  await expect(writer.patch(token,userId,recordId,1,{title:"x"})).rejects.toMatchObject({statusCode:503,message:"Career business owner is unavailable"});expect(reads.getRecord).not.toHaveBeenCalled();
 });
 it("preserves create receipt replay status and re-reads the product document",async()=>{
  for(const status of [201,200]) {
   const {writer}=fixture(async()=>Response.json({data:business},{status,headers:{etag:'"v2"'}}));
   expect(await writer.create(token,userId,"create-idempotency-key",{categoryId,title:"",propertyValues:[]})).toEqual({record,created:status===201});
  }
 });
 it("uses a fresh owned version for the legacy lifecycle API",async()=>{
  const calls:RequestInit[]=[];const {writer,reads}=fixture(async(_,init)=>{calls.push(init);return Response.json({data:business},{headers:{etag:'"v2"'}});});
  await writer.trash(token,userId,recordId);await writer.restore(token,userId,recordId);
  expect(reads.version.mock.calls).toEqual([[userId,recordId,false],[userId,recordId,true]]);
  expect(calls.map(init=>new Headers(init.headers).get("if-match"))).toEqual(['"v1"','"v1"']);
  expect(calls.map(init=>init.method)).toEqual(["DELETE","POST"]);
 });
 it("sends relation edits through the same scoped CAS owner",async()=>{
  let sent:RequestInit|undefined;const {writer}=fixture(async(_,init)=>{sent=init;return Response.json({data:business},{headers:{etag:'"v2"'}});});
  await writer.relation(token,userId,recordId,1,{propertyId,targetIds:[randomUUID()]});
  expect(sent!.method).toBe("PUT");expect(new Headers(sent!.headers).get("authorization")).toBe(`Bearer ${token}`);expect(new Headers(sent!.headers).get("if-match")).toBe('"v1"');
 });
 it("preserves legacy link response fields through the owner and rejects a mismatched target",async()=>{
  const target=randomUUID(),link=randomUUID();let sent:RequestInit|undefined;
  const {writer}=fixture(async(_,init)=>{sent=init;return Response.json({data:{id:link,recordId,relatedRecordId:target,relation:"parent",direction:"outgoing"}},{status:201,headers:{etag:'"v2"'}});});
  expect(await writer.createLink(token,userId,recordId,target,"parent")).toEqual({id:link,from_record_id:recordId,to_record_id:target,relation:"parent"});
  expect(sent!.method).toBe("POST");expect(new Headers(sent!.headers).get("if-match")).toBe('"v1"');expect(JSON.parse(String(sent!.body))).toEqual({toRecordId:target,relation:"parent"});
  const wrong=fixture(async()=>Response.json({data:{id:link,recordId,relatedRecordId:randomUUID(),relation:"parent",direction:"outgoing"}},{status:201,headers:{etag:'"v2"'}}));
  await expect(wrong.writer.createLink(token,userId,recordId,target,"parent")).rejects.toMatchObject({statusCode:503});
 });
 it("rejects a create receipt bound to another category before its product read",async()=>{
  const {writer,reads}=fixture(async()=>Response.json({data:{...business,categoryId:randomUUID()}},{status:201,headers:{etag:'"v2"'}}));
  await expect(writer.create(token,userId,randomUUID(),{categoryId,title:"",propertyValues:[]})).rejects.toMatchObject({statusCode:503});expect(reads.getRecord).not.toHaveBeenCalled();
 });
});
