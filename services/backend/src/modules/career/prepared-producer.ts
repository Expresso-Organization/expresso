import { createHash,randomUUID } from "node:crypto";
import { CareerProducerIntentSchema,CareerProducerScopeSchema,IdempotencyKeySchema,UuidSchema,type CareerProducerIntent,type CareerProducerScope,
 type CareerProducerCommitRequest,type CareerProducerBusinessResult,type CareerProducerDocumentResult } from "@expresso/contracts";
import type { Document } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction,type MongoTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";

type Input=Omit<CareerProducerScope,"fingerprint">&Pick<CareerProducerIntent,"business"|"document">;
function sorted(value:unknown):unknown{
 if(value===null)return ["null"];
 if(typeof value==="number"){
  if(!Number.isFinite(value))throw new Error("non-finite intent number");
  const bytes=Buffer.alloc(8);bytes.writeDoubleBE(value===0?0:value);return ["number",bytes.toString("hex")];
 }
 if(typeof value==="string")return ["string",value];
 if(typeof value==="boolean")return ["boolean",value];
 if(Array.isArray(value))return ["array",value.map(sorted)];
 if(typeof value==="object")return ["object",Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,sorted(item)])];
 throw new Error("invalid intent JSON value");
}
export function careerProducerInputFingerprint(value:unknown):string {
 return createHash("sha256").update(JSON.stringify(sorted(value))).digest("hex");
}
export function careerProducerOperationId(input:{producer:CareerProducerScope["producer"];userId:string;sourceId:string;kind:string;idempotencyKey:string}):string {
 CareerProducerScopeSchema.shape.producer.parse(input.producer);UuidSchema.parse(input.userId);UuidSchema.parse(input.sourceId);IdempotencyKeySchema.parse(input.idempotencyKey);
 if(!/^[a-z][a-z0-9-]{0,63}$/.test(input.kind))throw new Error("invalid producer action");
 const bytes=createHash("sha256").update(JSON.stringify(sorted(input))).digest().subarray(0,16);
 bytes[6]=(bytes[6]!&15)|80;bytes[8]=(bytes[8]!&63)|128;
 const hex=bytes.toString("hex");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function careerProducerFingerprint(input:Input):string{
 const {producer,userId,sourceId,operationId,business,document}=input;
 return createHash("sha256").update(JSON.stringify(sorted({producer,userId,sourceId,operationId,business,document}))).digest("hex");
}
export function createCareerProducerIntent(input:Input):CareerProducerIntent{
 const now=new Date().toISOString();
 const parsed=CareerProducerIntentSchema.parse({...input,fingerprint:"0".repeat(64),state:"pending",leaseToken:null,leaseUntil:null,attempts:0,fence:0,businessResult:null,documentResult:null,lastError:null,createdAt:now,updatedAt:now});
 return {...parsed,fingerprint:careerProducerFingerprint(parsed)};
}
export function validateCareerProducerIntent(raw:unknown):CareerProducerIntent{
 const intent=CareerProducerIntentSchema.parse(raw);
 if(careerProducerFingerprint(intent)!==intent.fingerprint)throw conflict("prepared intent payload changed");
 return intent;
}
export interface CareerProducerBusinessPort{commit(request:CareerProducerCommitRequest):Promise<CareerProducerBusinessResult>}
export interface CareerProducerDocumentPort{
 reserve(scope:CareerProducerScope):Promise<void>;
 commit(request:CareerProducerCommitRequest):Promise<CareerProducerDocumentResult>;
 cancel(scope:CareerProducerScope):Promise<void>;
 releaseBlocked?(scope:CareerProducerScope,tx:MongoTransaction):Promise<void>;
}
const conflict=(message:string)=>Object.assign(new Error(message),{statusCode:409});
const LEASE_MS=30000;
type Source=Document&{_id:string;writerIntegration:CareerProducerIntent;writerIntegrationHistory?:CareerProducerIntent[]};
export function careerProducerScopeFilter(scope:CareerProducerScope){return{
 _id:scope.sourceId,userId:scope.userId,"writerIntegration.producer":scope.producer,"writerIntegration.userId":scope.userId,
 "writerIntegration.sourceId":scope.sourceId,"writerIntegration.operationId":scope.operationId,"writerIntegration.fingerprint":scope.fingerprint,
};}
export const CAREER_PRODUCER_COLLECTIONS = {
 "ai-proposal": "career_ai_proposals", interview: "interview_career_operations", "career-product": "career_product_operations",
} as const;
export function careerProducerSource(context:MongoContext,scope:CareerProducerScope){
 return context.db.collection<Source>(CAREER_PRODUCER_COLLECTIONS[scope.producer]);
}
export interface CareerProducerRecoveryPolicy {
 maxAttempts:number;
 classify(error:unknown,intent:CareerProducerIntent):"retry"|"blocked";
}
/** Owner 결과는 각 owner가 자신의 쓰기와 원자적으로 저장합니다. 여기서는 source 상태만 갱신합니다. */
export class CareerProducerCoordinator{
 constructor(readonly context:MongoContext,private readonly business:CareerProducerBusinessPort,private readonly document:CareerProducerDocumentPort,private readonly recovery?:CareerProducerRecoveryPolicy){
  if(recovery && (!Number.isSafeInteger(recovery.maxAttempts)||recovery.maxAttempts<1||recovery.maxAttempts>1000))throw new RangeError("producer recovery attempt limit is invalid");
 }
 async pending(raw:CareerProducerScope):Promise<CareerProducerIntent>{
  const scope=CareerProducerScopeSchema.parse(raw);
  const row=await careerProducerSource(this.context,scope).findOne({_id:scope.sourceId,userId:scope.userId});
  const match=(intent:CareerProducerIntent)=>Object.entries(scope).every(([key,value])=>intent[key as keyof CareerProducerScope]===value);
  const intent=row?.writerIntegration && match(row.writerIntegration)?row.writerIntegration:row?.writerIntegrationHistory?.find(match);
  if(!intent)throw conflict("prepared source scope changed");
  return validateCareerProducerIntent(intent);
 }
 async execute(raw:CareerProducerScope,finalize?:(tx:MongoTransaction,intent:CareerProducerIntent)=>Promise<void>):Promise<CareerProducerIntent>{
  const scope=CareerProducerScopeSchema.parse(raw),initial=await this.pending(scope);
  if(initial.state==="completed"){await inTransaction(this.context,tx=>requireActiveUser(tx,scope.userId));return initial;}
  if(initial.state==="cancelled")throw conflict("prepared operation cancelled");
  if(initial.state==="blocked")throw Object.assign(conflict("prepared operation requires recovery"),{errorCode:"RECOVERY_REQUIRED"});
  const leaseToken=randomUUID(),time=new Date();
  const claim=await inTransaction(this.context,async tx=>{
   await requireActiveUser(tx,scope.userId);
   return careerProducerSource(tx,scope).findOneAndUpdate({...careerProducerScopeFilter(scope),$or:[
    {"writerIntegration.state":{$in:["pending","retry"]}},
    {"writerIntegration.state":"running","writerIntegration.leaseUntil":{$lte:time.toISOString()}},
   ]},{$set:{"writerIntegration.state":"running","writerIntegration.leaseToken":leaseToken,
    "writerIntegration.leaseUntil":new Date(time.getTime()+LEASE_MS).toISOString(),"writerIntegration.updatedAt":time.toISOString(),updatedAt:time},
    $inc:{"writerIntegration.attempts":1,"writerIntegration.fence":1}},{session:tx.session,returnDocument:"after"});
  });
  if(!claim)throw conflict("prepared operation busy or cancelled");
  const owned=()=>({...careerProducerScopeFilter(scope),"writerIntegration.state":"running","writerIntegration.leaseToken":leaseToken,
   "writerIntegration.leaseUntil":{$gt:new Date().toISOString()}});
  let uncertain=false;
  const renew=async()=>{
   try{
    const now=new Date();
    const result=await careerProducerSource(this.context,scope).updateOne(owned(),{$set:{"writerIntegration.leaseUntil":new Date(now.getTime()+LEASE_MS).toISOString(),"writerIntegration.updatedAt":now.toISOString()},$inc:{"writerIntegration.fence":1}});
    if(result.matchedCount!==1)throw conflict("prepared lease lost");
   }catch(error){uncertain=true;throw error;}
  };
  const wait=async<T>(action:()=>Promise<T>):Promise<T>=>{
   let timer:ReturnType<typeof setTimeout>|undefined,pending:Promise<void>|undefined,rejectLoss!:(error:unknown)=>void;
   let stopped=false;
   const loss=new Promise<never>((_,reject)=>{rejectLoss=reject;});
   const schedule=()=>{if(!stopped)timer=setTimeout(()=>{pending=renew().then(schedule,rejectLoss);},LEASE_MS/3);};
   schedule();
   try{return await Promise.race([action(),loss]);}
   finally{stopped=true;if(timer)clearTimeout(timer);await pending;if(timer)clearTimeout(timer);if(uncertain)throw conflict("prepared lease uncertain");}
  };
  try{
   let intent=validateCareerProducerIntent(claim.writerIntegration);
   if(intent.document && !intent.documentResult)await wait(()=>this.document.reserve(scope));
   if(intent.business && !intent.businessResult){
    await wait(()=>this.business.commit({...scope,leaseToken}));
    intent=await this.pending(scope);
    if(!intent.businessResult)throw conflict("business owner receipt missing");
   }
   if(intent.document && !intent.documentResult){
    await wait(()=>this.document.reserve(scope));
    await wait(()=>this.document.commit({...scope,leaseToken}));
    intent=await this.pending(scope);
    if(!intent.documentResult)throw conflict("document owner receipt missing");
   }
   return await inTransaction(this.context,async tx=>{
    await requireActiveUser(tx,scope.userId);
    const row=await careerProducerSource(tx,scope).findOne(owned(),{session:tx.session});
    if(!row)throw conflict("prepared lease lost before finalize");
    const current=validateCareerProducerIntent(row.writerIntegration);
    if((current.business && !current.businessResult)||(current.document && !current.documentResult))throw conflict("owner receipt incomplete");
    if(finalize)await finalize(tx,current);
    const now=new Date(),completed:CareerProducerIntent={...current,state:"completed",leaseToken:null,leaseUntil:null,lastError:null,updatedAt:now.toISOString()};
    const result=await careerProducerSource(tx,scope).updateOne(owned(),{$set:{writerIntegration:completed,updatedAt:now}},{session:tx.session});
    if(result.matchedCount!==1)throw conflict("prepared lease lost before completion");
    return completed;
   });
  }catch(error){
   // 외부 오류 본문·credential을 durable metadata에 남기지 않습니다.
   if(!uncertain)await inTransaction(this.context,async tx=>{
    const row=await careerProducerSource(tx,scope).findOne(owned(),{session:tx.session});
    if(!row)return;
    const current=validateCareerProducerIntent(row.writerIntegration);
    const conflictBlocked=this.recovery?.classify(error,current)==="blocked";
    // 응답만 유실되고 모든 owner receipt가 이미 있으면 다음 전달에서 finalize를 실행할 수 있습니다.
    const ownersComplete=(!current.business||Boolean(current.businessResult))&&(!current.document||Boolean(current.documentResult));
    const exhausted=Boolean(this.recovery && current.attempts>=this.recovery.maxAttempts && !ownersComplete);
    const blocked=conflictBlocked||exhausted;
    const result=await careerProducerSource(tx,scope).updateOne(owned(),{$set:{"writerIntegration.state":blocked?"blocked":"retry","writerIntegration.leaseToken":null,"writerIntegration.leaseUntil":null,"writerIntegration.lastError":conflictBlocked?"OWNER_CONFLICT":exhausted?"RECOVERY_ATTEMPTS_EXHAUSTED":"OWNER_CALL_FAILED","writerIntegration.updatedAt":new Date().toISOString()},$inc:{"writerIntegration.fence":1}},{session:tx.session});
    if(result.matchedCount===1 && blocked)await this.document.releaseBlocked?.(scope,tx);
   });
   throw error;
  }
 }
 async cancel(raw:CareerProducerScope):Promise<void>{
  const scope=CareerProducerScopeSchema.parse(raw);
  if(scope.producer==="interview")throw conflict("generic Interview cancellation is unsupported");
  const intent=await this.pending(scope);
  if(intent.document?.kind==="restore")throw conflict("prepared undo cancellation is unsupported");
  if(intent.document){await this.document.cancel(scope);return;}
  await inTransaction(this.context,async tx=>{
   await requireActiveUser(tx,scope.userId);
   const result=await careerProducerSource(tx,scope).updateOne({...careerProducerScopeFilter(scope),
    "writerIntegration.state":{$in:["pending","running","retry","blocked","cancelled"]},"writerIntegration.businessResult":null,"writerIntegration.documentResult":null},
    {$set:{"writerIntegration.state":"cancelled","writerIntegration.leaseToken":null,"writerIntegration.leaseUntil":null,"writerIntegration.updatedAt":new Date().toISOString()},$inc:{"writerIntegration.fence":1}},{session:tx.session});
   if(!result.matchedCount)throw conflict("committed owner operation cannot be cancelled");
  });
 }
}