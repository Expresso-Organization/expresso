import { randomUUID } from "node:crypto";
import { mongoCollections, readCareerPropertyOptionSnapshot, type CareerCategoryDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { mutationJobPlan } from "./property-mutation-state.js";
import { mutationDelta } from "./canonical-property-mutation-values.js";
import { assertCanonicalMutationValue, effectiveCanonicalMutationOperation } from "./canonical-property-mutation-policy.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
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
      const plan=mutationJobPlan(job);let effective:ReturnType<typeof effectiveCanonicalMutationOperation>|undefined;
      if(job.cursor!==job.processedCount || job.skippedCount!==0 || job.cursor<0 || job.cursor>plan.recordIds.length)throw new Error("mutation checkpoint is inconsistent");
      for(let start=job.cursor;start<plan.recordIds.length;start+=BATCH_SIZE) {
        const end=Math.min(start+BATCH_SIZE,plan.recordIds.length);
        for(let cursor=start;cursor<end;cursor++) {
          await renew();const recordId=plan.recordIds[cursor]!;
          const receipt=await waitWithLease(()=>this.spring.receipt(job.userId,job._id,recordId,fingerprint),renew);
          if(!receipt) {
            if(!effective) {
              const policyDefinitions=plan.operation.source?[...plan.definitions,plan.operation.source]:plan.definitions;
              const legacyPrivate=job.privateOptionSnapshotJson===undefined && Boolean(await mongoCollections(this.context.db).careerPropertyOptions.findOne({userId:job.userId,categoryId:job.categoryId,propertyId:job.propertyId}));
              const policy=readCareerPropertyOptionSnapshot(job,policyDefinitions,legacyPrivate);
              effective=effectiveCanonicalMutationOperation(plan.operation,policy,{userId:job.userId,categoryId:job.categoryId});
            }
            let committed=false;
            for(let attempt=0;attempt<CAS_ATTEMPTS;attempt++) {
              await renew();
              const current=await waitWithLease(()=>this.spring.read(job.userId,job._id,recordId,leaseToken,fingerprint),renew);
              if(current.data.categoryId!==plan.categoryId)throw new Error("mutation record moved");
              if(current.data.userId!==job.userId || current.data.id!==recordId)throw new Error("mutation Spring record scope mismatch");
              const scope={mutationId:job._id,recordId,leaseToken,operationFingerprint:fingerprint,expectedVersion:current.data.version};
              let command:import("@expresso/contracts").CareerPropertyMutationCommit;
              if(plan.operation.target.type==="relation") {
                if(!("relation" in current))throw new Error("relation mutation requires relation Spring read");
                const {relation}=current;
                if(plan.operation.kind!=="deletion" && plan.operation.kind!=="restoration")throw new Error("relation mutation kind is protected");
                for(const edge of [...relation.edges,...relation.inverseEdges,...(relation.tombstone?.forwardEdges??[]),...(relation.tombstone?.inverseEdges??[])])if(edge.userId!==job.userId)throw new Error("relation mutation edge scope mismatch");
                const saved=relation.tombstone;
                if(saved && (saved.propertyId!==job.propertyId || (saved.forwardEdges.some(edge=>edge.sourceRecordId!==recordId || edge.sourcePropertyId!==job.propertyId) || saved.inverseEdges.some(edge=>edge.targetRecordId!==recordId || edge.inversePropertyId!==job.propertyId))))throw new Error("relation tombstone scope mismatch");
                const targetRecordIds=plan.operation.kind==="deletion"?[]:[...new Set([...(saved?.forwardEdges.map(edge=>edge.targetRecordId)??[]),...(saved?.inverseEdges.map(edge=>edge.sourceRecordId)??[])])].sort();
                command={...scope,relationChanges:{targetRecordIds,targetRecordVersions:relation.targetRecordVersions}};
              }else {
                if(!("tombstone" in current))throw new Error("scalar mutation requires scalar Spring read");
                assertCanonicalMutationValue(plan.operation.target,current.data.propertyValues.find(value=>value.propertyDefinitionId===job.propertyId));
                assertCanonicalMutationValue(plan.operation.target,current.tombstone);
                command={...scope,propertyValues:mutationDelta(effective,current.data.propertyValues,current.tombstone)};
              }
              try {
                await waitWithLease(()=>this.spring.commit(job.userId,command),renew);committed=true;break;
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
      await inTransaction(this.context,async tx=>{
        const db=mongoCollections(tx.db),time=new Date();
        const result=await db.careerPropertyMutations.updateOne({...owned(),cursor:plan.recordIds.length},{$set:{status:"completed",active:false,completedAt:time,updatedAt:time,leaseToken:null,leaseUntil:null},$inc:{commitFence:1}},{session:tx.session});
        if(result.matchedCount!==1)throw new Error("mutation lease lost before completion");
        // 작업 완료와 같은 트랜잭션에서 현재 business version을 기준으로 계산을 발행합니다.
        const records=await db.careerRecords.find({userId:job.userId,categoryId:job.categoryId,deletedAt:null},{session:tx.session}).project({_id:1,version:1}).limit(10_001).toArray();
        if(records.length>10_000)throw new Error("mutation completion computation limit exceeded");
        const changed=new Map(records.map(record=>[record._id,new Set([job.propertyId])]));
        if(plan.operation.target.type==="relation") {
          const members=new Set(plan.recordIds),options={session:tx.session};
          const journals=plan.operation.kind==="deletion"
            ?await db.careerRelationPropertyTombstones.find({userId:job.userId,categoryId:job.categoryId,propertyId:job.propertyId,deletionMutationId:job._id,definitionVersion:plan.operation.target.version,deletedAt:plan.operation.target.deletedAt!,categoryVersion:plan.categoryVersion,schemaVersion:plan.schemaVersion},options).limit(10_001).toArray()
            :await db.careerPropertyMutationReceipts.find({userId:job.userId,mutationId:job._id,operationFingerprint:job.operationFingerprint,"relationRestoration.propertyId":job.propertyId},options).limit(10_001).toArray();
          if(journals.length>10_000)throw new Error("mutation completion provenance limit exceeded");
          for(const journal of journals) {
            if(!members.has(journal.recordId))throw new Error("mutation completion provenance scope mismatch");
            const edges="forwardEdges" in journal?journal:journal.relationRestoration!;
            for(const edge of [...edges.forwardEdges,...edges.inverseEdges]) {
              if(edge.userId!==job.userId)throw new Error("mutation completion edge scope mismatch");
              for(const [recordId,propertyId] of [[edge.sourceRecordId,edge.sourcePropertyId],[edge.targetRecordId,edge.inversePropertyId]] as const) {
                if(!propertyId)continue;
                const ids=changed.get(recordId)??new Set<string>();ids.add(propertyId);changed.set(recordId,ids);
              }
            }
          }
          if(changed.size>10_000)throw new Error("mutation completion computation limit exceeded");
        }
        const affected=await db.careerRecords.find({_id:{$in:[...changed.keys()]},userId:job.userId,deletedAt:null},{session:tx.session}).project({_id:1,version:1,categoryId:1}).limit(10_001).toArray();
        const categories=new Map<string,CareerCategoryDoc|null>();
        for(const record of affected) {
          const changedPropertyIds=[...changed.get(record._id)!].sort();
          let definitions=plan.definitions,sourceSchemaVersion=plan.schemaVersion,sourceCategoryVersion=plan.categoryVersion;
          if(record.categoryId!==job.categoryId) {
            if(!categories.has(record.categoryId))categories.set(record.categoryId,await db.careerCategories.findOne({_id:record.categoryId,$or:[{userId:job.userId},{userId:null}],deletedAt:null},{session:tx.session}));
            const category=categories.get(record.categoryId);
            if(!category)continue;
            if(!category.propertySchemaV2 || !category.schemaVersion)throw new Error("mutation completion canonical schema missing");
            definitions=category.propertySchemaV2;sourceSchemaVersion=category.schemaVersion;sourceCategoryVersion=category.version;
          }
          const sourcePropertyVersions=Object.fromEntries(definitions.filter(definition=>changedPropertyIds.includes(definition.id)).map(definition=>[definition.id,definition.version]));
          await addMongoOutboxEvent(tx,{userId:job.userId,topic:"career.computation",idempotencyKey:"career-canonical-completed:"+job._id+":"+record._id,payload:{userId:job.userId,recordId:record._id,changedPropertyIds,sourceRecordVersion:record.version,sourcePropertyVersions,sourceSchemaVersion,sourceCategoryVersion}});
        }
      });
      return "completed";
    } catch(error) {
      // 값이나 인증 정보를 오류 metadata에 저장하지 않습니다.
      // 갱신 결과가 불확실하면 running을 보존해 만료 뒤 자동 복구가 새 lease를 얻습니다.
      if(!leaseUncertain)await this.jobs().updateOne(owned(),{$set:{status:"failed",lastError:"CANONICAL_MUTATION_FAILED",leaseToken:null,leaseUntil:null,updatedAt:new Date()},$inc:{commitFence:1}});
      throw error;
    }
  }
}
