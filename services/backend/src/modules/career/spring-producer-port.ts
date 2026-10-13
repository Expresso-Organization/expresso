import { createHmac } from "node:crypto";
import { CareerProducerCommitRequestSchema,CareerProducerBusinessResultSchema,CareerProducerScopeSchema,CareerProducerServiceClaimsSchema,
 type CareerProducerScope } from "@expresso/contracts";
import type { MongoContext } from "../../platform/mongodb.js";
import { careerProducerSource,validateCareerProducerIntent,type CareerProducerBusinessPort } from "./prepared-producer.js";
export type CareerProducerCredentialProvider=(scope:CareerProducerScope)=>string|Promise<string>;
export type CareerProducerHttpTransport=(url:string,init:RequestInit)=>Promise<Response>;

/** 호출자가 보유한 key로 operation마다 짧은 수명의 별도 credential을 생성합니다. */
export function createCareerProducerCredential(raw:CareerProducerScope,key:Uint8Array,ttlMs=60000,now=new Date()):string{
 const scope=CareerProducerScopeSchema.parse(raw);
 if(key.byteLength<32 || ttlMs<=0 || ttlMs>300000)throw new Error("invalid prepared credential policy");
 const claims=CareerProducerServiceClaimsSchema.parse({...scope,audience:"career-producer",expiresAt:new Date(now.getTime()+ttlMs).toISOString()});
 const payload=Buffer.from(JSON.stringify(claims)).toString("base64url");
 return "expi."+payload+"."+createHmac("sha256",key).update(payload).digest("base64url");
}
/** 현재 runtime 등록 없이 호출자가 주입하며 Spring 장애 때 Mongo business fallback을 사용하지 않습니다. */
export function createSpringCareerProducerPort(context:MongoContext,baseUrl:string,credential:CareerProducerCredentialProvider,transport:CareerProducerHttpTransport=fetch):CareerProducerBusinessPort{
 const base=new URL(baseUrl);
 if(!["http:","https:"].includes(base.protocol)||base.username||base.password)throw new Error("invalid Spring endpoint");
 return {async commit(raw){
  const request=CareerProducerCommitRequestSchema.parse(raw),scope=CareerProducerScopeSchema.parse(request);
  const source=await careerProducerSource(context,scope).findOne({_id:scope.sourceId,userId:scope.userId});
  const candidates=[source?.writerIntegration,...(source?.writerIntegrationHistory??[])];
  const stored=candidates.find(item=>item && item.operationId===scope.operationId && item.fingerprint===scope.fingerprint);
  const intent=validateCareerProducerIntent(stored);
  if(!intent.business)throw new Error("business command missing");
  let token:string;
  try{token=await credential(scope);}catch{throw Object.assign(new Error("service credential unavailable"),{statusCode:401});}
  if(!/^expi\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Object.assign(new Error("service credential invalid"),{statusCode:401});
  const headers:Record<string,string>={"content-type":"application/json",authorization:"Bearer "+token};
  if(intent.business.kind==="patch")headers["if-match"]='"v'+intent.business.expectedVersion+'"';
  let response:Response;
  try{response=await transport(new URL("/internal/career/integration/business",base).toString(),{method:"POST",headers,body:JSON.stringify(request),signal:AbortSignal.timeout(60000)});}
  catch{throw Object.assign(new Error("Spring producer response unavailable"),{statusCode:503});}
  if(!response.ok)throw Object.assign(new Error("Spring producer command rejected"),{statusCode:response.status});
  let parsed;
  try{parsed=CareerProducerBusinessResultSchema.parse(await response.json());}catch{throw new Error("invalid Spring business response");}
  if(parsed.data.userId!==scope.userId || (intent.business.kind==="patch" && parsed.data.id!==intent.business.recordId))throw new Error("Spring response scope mismatch");
  if(response.headers.get("etag")!=='"v'+parsed.data.version+'"')throw new Error("Spring response ETag mismatch");
  return parsed;
 }};
}