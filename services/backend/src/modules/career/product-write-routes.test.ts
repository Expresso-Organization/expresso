import {randomUUID} from "node:crypto";
import Fastify from "fastify";
import {describe,expect,it,vi} from "vitest";
import {CareerWriteOperationResponseSchema,CareerRecordResponseSchema} from "@expresso/contracts";
import type {CareerApi} from "./index.js";
import type {IdentityPrincipal} from "../identity/index.js";
import {registerCareerRoutes} from "./routes.js";
import {registerErrorHandler} from "../../api/error-handler.js";
const userId=randomUUID(),recordId=randomUUID(),categoryId=randomUUID(),operationId=randomUUID();
const record={id:recordId,categoryId,title:"Canonical",status:"draft",origin:"manual",properties:{},propertyValues:[],bodyMd:"Document",version:2,updatedAt:new Date().toISOString()};
const completed=()=>CareerRecordResponseSchema.parse({data:record,resource:{version:record.version,updatedAt:record.updatedAt}});
const pendingAt=new Date().toISOString();
const pending=()=>CareerWriteOperationResponseSchema.parse({data:{operationId,producer:"career-product",state:"retry",recordId:null,owners:{business:"completed",document:"pending"},retryable:true,updatedAt:pendingAt,statusUrl:"/v1/career/write-operations/"+operationId}});
function fixture(status:200|201|202){const legacy=vi.fn(async()=>{throw new Error("legacy business writer must never be reached");}),create=vi.fn(async()=>status===202?{status,body:pending()}:{status,body:completed()}),patch=vi.fn(async()=>status===202?{status,body:pending()}:{status:200,body:completed()}),app=Fastify({logger:false,genReqId:()=>randomUUID()});app.decorateRequest("auth",null);registerErrorHandler(app);registerCareerRoutes(app,{careerService:{createRecordOperation:create,updateRecordOperation:patch,createRecord:legacy,updateRecord:legacy}as unknown as CareerApi,authenticateRequest:async request=>{request.auth={sessionId:randomUUID(),user:{id:userId}}as IdentityPrincipal;}});return{app,legacy,create,patch};}
describe("product record owner HTTP outcomes",()=>{
 it("returns202 statusURL only while owner work is unfinished without ETag or legacy writes",async()=>{
  const f=fixture(202);try{for(const request of [{method:"POST"as const,url:"/v1/career/records",headers:{"idempotency-key":randomUUID()},payload:{categoryId,title:"New",bodyMd:"Document"}},{method:"PATCH"as const,url:"/v1/career/records/"+recordId,headers:{"if-match":'"v1"'},payload:{bodyMd:"Document"}}]){const response=await f.app.inject(request);expect(response.statusCode).toBe(202);expect(CareerWriteOperationResponseSchema.parse(response.json())).toEqual(pending());expect(response.headers.location).toBe(pending().data.statusUrl);expect(response.headers.etag).toBeUndefined();}expect(f.legacy).not.toHaveBeenCalled();expect(f.patch.mock.calls[0]).toEqual([userId,recordId,1,{bodyMd:"Document"}]);}finally{await f.app.close();}
 });
 it("keeps completed create201/replay200 and patch200 contracts and ETag",async()=>{
  for(const status of [201,200]as const){const f=fixture(status);try{const response=await f.app.inject({method:"POST",url:"/v1/career/records",headers:{"idempotency-key":randomUUID()},payload:{categoryId}});expect(response.statusCode).toBe(status);expect(CareerRecordResponseSchema.parse(response.json())).toEqual(completed());expect(response.headers.etag).toBe('"v2"');const patch=await f.app.inject({method:"PATCH",url:"/v1/career/records/"+recordId,headers:{"if-match":'"v1"'},payload:{title:"Canonical"}});expect(patch.statusCode).toBe(200);expect(patch.headers.etag).toBe('"v2"');expect(f.legacy).not.toHaveBeenCalled();}finally{await f.app.close();}}
 });
});