import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import type { CareerApi } from "./index.js";
import type { IdentityPrincipal } from "../identity/index.js";
import { registerCareerRoutes } from "./routes.js";
import { registerErrorHandler } from "../../api/error-handler.js";
const recordId=randomUUID(),categoryId=randomUUID();
const record=(title:string)=>({id:recordId,categoryId,title,status:"draft",origin:"manual",properties:{},propertyValues:[],bodyMd:"",version:1,updatedAt:new Date().toISOString()});
describe("Career request-local session forwarding",()=>{
 it("binds each authenticated owner session once without reaching an unbound business service",async()=>{
  const a=randomUUID(),b=randomUUID(),tokenA=`exps_${"A".repeat(43)}`,tokenB=`exps_${"B".repeat(43)}`;
  const unbound=vi.fn(async()=>{throw new Error("unbound writer must not be reached");});
  const forSession=vi.fn((token:string,userId:string)=>({getRecord:async(owner:string,id:string)=>{expect(owner).toBe(userId);expect(id).toBe(recordId);return record(token===tokenA?"A":"B");}} as unknown as CareerApi));
  const app=Fastify({logger:false});app.decorateRequest("auth",null);registerErrorHandler(app);
  registerCareerRoutes(app,{careerService:{getRecord:unbound,forSession} as unknown as CareerApi,authenticateRequest:async request=>{const bearer=request.headers.authorization;request.auth={sessionId:randomUUID(),user:{id:bearer===`Bearer ${tokenA}`?a:b}} as IdentityPrincipal;}});
  try {
   const replies=await Promise.all([tokenA,tokenB].map(token=>app.inject({url:`/v1/career/records/${recordId}`,headers:{authorization:`Bearer ${token}`}})));
   expect(replies.map(reply=>reply.statusCode)).toEqual([200,200]);expect(replies.map(reply=>reply.json().data.title)).toEqual(["A","B"]);
   expect(forSession.mock.calls).toEqual([[tokenA,a],[tokenB,b]]);expect(unbound).not.toHaveBeenCalled();
  }finally{await app.close();}
 });
 it("forwards owned write-operation status without exposing an unbound facade",async()=>{
  const userId=randomUUID(),operationId=randomUUID(),token=`exps_${"C".repeat(43)}`,lookup=vi.fn(async(owner:string,id:string)=>{expect(owner).toBe(userId);expect(id).toBe(operationId);return{data:{operationId,producer:"career-product",state:"retry",recordId:null,owners:{business:"pending",document:"not-required"},statusUrl:"/v1/career/write-operations/"+operationId,retryable:true,updatedAt:new Date().toISOString()}};});
  const app=Fastify({logger:false});app.decorateRequest("auth",null);registerErrorHandler(app);registerCareerRoutes(app,{careerService:{forSession:()=>({getWriteOperation:lookup})}as unknown as CareerApi,authenticateRequest:async request=>{request.auth={sessionId:randomUUID(),user:{id:userId}}as IdentityPrincipal;}});
  try{const response=await app.inject({url:"/v1/career/write-operations/"+operationId,headers:{authorization:"Bearer "+token}});expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({data:{operationId,state:"retry"}});expect(lookup).toHaveBeenCalledOnce();}finally{await app.close();}
 });
 it("never binds a producer credential or an unauthenticated request to a user writer",async()=>{
  const forSession=vi.fn();const app=Fastify({logger:false});app.decorateRequest("auth",null);registerErrorHandler(app);
  registerCareerRoutes(app,{careerService:{forSession} as unknown as CareerApi,authenticateRequest:async request=>{if(request.headers.authorization)request.auth={sessionId:randomUUID(),user:{id:randomUUID()}} as IdentityPrincipal;}});
  try {
   expect((await app.inject({url:`/v1/career/records/${recordId}`})).statusCode).toBe(401);
   expect((await app.inject({url:`/v1/career/records/${recordId}`,headers:{authorization:"Bearer exmi_background_credential"}})).statusCode).toBe(401);
   expect(forSession).not.toHaveBeenCalled();
  }finally{await app.close();}
 });
});
