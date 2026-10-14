import { randomUUID } from "node:crypto";
import { mongoCollections } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { mutationJobPlan } from "./property-mutation-state.js";
import { mutationDelta } from "./canonical-property-mutation-values.js";
import type { SpringPropertyMutationPort } from "./spring-property-mutation-port.js";

const LEASE_MS=30_000, BATCH_SIZE=100, CAS_ATTEMPTS=3;
/** 외부 응답을 기다리는 동안 소유 조건을 유지하고 다음 쓰기 전에 갱신을 종료합니다. */
async function waitWithLease<T>(action:()=>Promise<T>,renew:()=>Promise<void>):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined,pending:Promise<void>|undefined,lost:unknown;
  let rejectLoss!:(error:unknown)=>void;
  const loss=new Promise<never>((_resolve,reject)=>{rejectLoss=reject;});
  const schedule=()=>{timer=setTimeout(()=>{
    pending=renew().then(schedule,error=>{lost=error;rejectLoss(error);});
  },LEASE_MS/3);};
  schedule();
  try {return await Promise.race([action(),loss]);}
  finally {
    if(timer)clearTimeout(timer);
    await pending;
    // 갱신이 진행 중이었다면 그 콜백이 예약한 다음 갱신도 해제합니다.
    if(timer)clearTimeout(timer);
    if(lost)throw lost;
  }
}
/** durable orchestration만 소유합니다. CareerRecord collection을 쓰지 않습니다. */
export class CanonicalPropertyMutationWorker {
  constructor(private readonly context:MongoContext,private readonly spring:SpringPropertyMutationPort) {}
  private jobs() {return mongoCollections(this.context.db).careerPropertyMutations;}
  async resume(mutationId:string,fingerprint:string):Promise<void> {
    const job=await this.jobs().findOne({_id:mutationId});if(!job || job.operationFingerprint!==fingerprint)throw new Error("mutation fingerprint mismatch");mutationJobPlan(job);
    const result=await this.jobs().updateOne({_id:mutationId,operationFingerprint:fingerprint,status:"failed",active:true},{$set:{status:"pending",leaseToken:null,leaseUntil:null,lastError:null,updatedAt:new Date()}});
    if(result.matchedCount!==1)throw new Error("only failed mutation jobs can resume");
  }
  async run(mutationId:string,fingerprint:string):Promise<"completed"|"busy"> {
    const initial=await this.jobs().findOne({_id:mutationId});
    if(!initial || initial.operationFingerprint!==fingerprint)throw new Error("mutation fingerprint mismatch");
    mutationJobPlan(initial);if(initial.status==="completed")return "completed";
    if(initial.status==="failed")throw new Error("failed mutation requires explicit resume");
    const now=new Date(),leaseToken=randomUUID();
    const job=await this.jobs().findOneAndUpdate({_id:mutationId,operationFingerprint:fingerprint,active:true,$or:[{status:"pending"},{status:"running",leaseUntil:{$lte:now}}]},
      {$set:{status:"running",leaseToken,leaseUntil:new Date(now.getTime()+LEASE_MS),updatedAt:now},$inc:{attempts:1,commitFence:1}},{returnDocument:"after"});
    if(!job)return "busy";
    const owned=()=>({_id:mutationId,operationFingerprint:fingerprint,status:"running" as const,active:true,leaseToken,leaseUntil:{$gt:new Date()}});
    let leaseUncertain=false;
    const renew=async()=>{
      try {const time=new Date();const result=await this.jobs().updateOne(owned(),{$set:{leaseUntil:new Date(time.getTime()+LEASE_MS),updatedAt:time},$inc:{commitFence:1}});if(result.matchedCount!==1)throw new Error("mutation lease lost");}
      catch(error){leaseUncertain=true;throw error;}
    };
    try {
      const plan=mutationJobPlan(job);
      if(job.cursor!==job.processedCount || job.skippedCount!==0 || job.cursor<0 || job.cursor>plan.recordIds.length)throw new Error("mutation checkpoint is inconsistent");
      for(let start=job.cursor;start<plan.recordIds.length;start+=BATCH_SIZE) {
        const end=Math.min(start+BATCH_SIZE,plan.recordIds.length);
        for(let cursor=start;cursor<end;cursor++) {
          await renew();const recordId=plan.recordIds[cursor]!;
          const receipt=await waitWithLease(()=>this.spring.receipt(job.userId,job._id,recordId,fingerprint),renew);
          if(!receipt) {
            let committed=false;
            for(let attempt=0;attempt<CAS_ATTEMPTS;attempt++) {
              await renew();
              const current=await waitWithLease(()=>this.spring.read(job.userId,job._id,recordId,leaseToken,fingerprint),renew);
              if(current.data.categoryId!==plan.categoryId)throw new Error("mutation record moved");
              const propertyValues=mutationDelta(plan.operation,current.data.propertyValues,current.tombstone);
              try {
                await waitWithLease(()=>this.spring.commit(job.userId,{mutationId:job._id,recordId,leaseToken,operationFingerprint:fingerprint,expectedVersion:current.data.version,propertyValues}),renew);committed=true;break;
              } catch(error) {
                if((error as {statusCode?:number}).statusCode!==412 || attempt===CAS_ATTEMPTS-1)throw error;
              }
            }
            if(!committed)throw new Error("mutation CAS retries exhausted");
          }
          const result=await this.jobs().updateOne({...owned(),cursor},{$set:{cursor:cursor+1,updatedAt:new Date()},$inc:{processedCount:1,commitFence:1}});
          if(result.matchedCount!==1)throw new Error("mutation lease lost before checkpoint");
        }
      }
      const result=await this.jobs().updateOne({...owned(),cursor:plan.recordIds.length},{$set:{status:"completed",active:false,completedAt:new Date(),updatedAt:new Date(),leaseToken:null,leaseUntil:null},$inc:{commitFence:1}});
      if(result.matchedCount!==1)throw new Error("mutation lease lost before completion");return "completed";
    } catch(error) {
      // 값이나 인증 정보를 오류 metadata에 저장하지 않습니다.
      // 갱신 결과가 불확실하면 running을 보존해 만료 뒤 자동 복구가 새 lease를 얻습니다.
      if(!leaseUncertain)await this.jobs().updateOne(owned(),{$set:{status:"failed",lastError:"CANONICAL_MUTATION_FAILED",leaseToken:null,leaseUntil:null,updatedAt:new Date()},$inc:{commitFence:1}});
      throw error;
    }
  }
}
