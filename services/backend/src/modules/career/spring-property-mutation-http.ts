import { createHmac } from "node:crypto";
import { CareerPropertyMutationScopeSchema, CareerPropertyMutationServiceClaimsSchema,
  CareerPropertyMutationReceiptRequestSchema, CareerPropertyMutationReadRequestSchema, CareerPropertyMutationHttpCommitRequestSchema,
  CareerPropertyMutationReadSchema, CareerPropertyMutationResultSchema, type CareerPropertyMutationScope } from "@expresso/contracts";
import type { SpringPropertyMutationTransport } from "./spring-property-mutation-port.js";

export type CareerPropertyMutationCredentialProvider = (scope:CareerPropertyMutationScope)=>string|Promise<string>;
export type CareerPropertyMutationHttpTransport = (url:string,init:RequestInit)=>Promise<Response>;

/** 사용자 세션과 producer credential을 분리한 짧은 수명의 mutation credential입니다. */
export function createCareerPropertyMutationCredential(raw:CareerPropertyMutationScope,key:Uint8Array,ttlMs=60000,now=new Date()):string {
  const scope=CareerPropertyMutationScopeSchema.parse(raw);
  if(key.byteLength<32 || !Number.isSafeInteger(ttlMs) || ttlMs<=0 || ttlMs>300000)throw new Error("invalid mutation credential policy");
  const claims=CareerPropertyMutationServiceClaimsSchema.parse({...scope,audience:"career-property-mutation",expiresAt:new Date(now.getTime()+ttlMs).toISOString()});
  const payload=Buffer.from(JSON.stringify(claims)).toString("base64url");
  return "exmi."+payload+"."+createHmac("sha256",key).update(payload).digest("base64url");
}

/** runtime 등록은 호출자가 맡습니다. Spring 실패 시 business write fallback이 없습니다. */
export function createSpringPropertyMutationHttpTransport(baseUrl:string,credentialProvider:CareerPropertyMutationCredentialProvider,transport:CareerPropertyMutationHttpTransport=fetch):SpringPropertyMutationTransport {
  const base=new URL(baseUrl);
  if(!["http:","https:"].includes(base.protocol)||base.username||base.password)throw new Error("invalid Spring endpoint");
  return {async invoke(operation,userId,payload) {
    const request=operation==="receipt"?CareerPropertyMutationReceiptRequestSchema.parse(payload):operation==="read"?CareerPropertyMutationReadRequestSchema.parse(payload):CareerPropertyMutationHttpCommitRequestSchema.parse(payload);
    const scope=CareerPropertyMutationScopeSchema.parse({userId,mutationId:request.mutationId,recordId:request.recordId,operationFingerprint:request.operationFingerprint});
    let token:string;
    try {token=await credentialProvider(scope);}catch {throw Object.assign(new Error("service credential unavailable"),{statusCode:401});}
    if(!/^exmi\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))throw Object.assign(new Error("service credential invalid"),{statusCode:401});
    const headers:Record<string,string>={"content-type":"application/json",authorization:"Bearer "+token};
    if("expectedVersion" in request)headers["if-match"]='"v'+request.expectedVersion+'"';
    let response:Response;
    try {response=await transport(new URL("/internal/career/property-mutations/"+operation,base).toString(),{method:"POST",headers,body:JSON.stringify(request),signal:AbortSignal.timeout(60000)});}
    catch {throw Object.assign(new Error("Spring mutation response unavailable"),{statusCode:503});}
    if(!response.ok)throw Object.assign(new Error("Spring mutation command rejected"),{statusCode:response.status});
    let result;
    try {const raw:unknown=await response.json();result=operation==="receipt" && raw===null?null:operation==="read"?CareerPropertyMutationReadSchema.parse(raw):CareerPropertyMutationResultSchema.parse(raw);}
    catch {throw new Error("invalid Spring mutation response");}
    if(result===null)return null;
    if(result.data.userId!==userId||result.data.id!==scope.recordId)throw new Error("Spring mutation response scope mismatch");
    if(response.headers.get("etag")!=='"v'+result.data.version+'"')throw new Error("Spring mutation response ETag mismatch");
    return result;
  }};
}