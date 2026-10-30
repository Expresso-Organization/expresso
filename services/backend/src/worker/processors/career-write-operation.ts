import {DelayedError,type Job,type Queue} from "bullmq";
import {CareerProducerScopeSchema,type CareerProducerScope,type CareerProducerIntent} from "@expresso/contracts";
import {mongoCollections} from "@expresso/database";
import type {MongoContext} from "../../platform/mongodb.js";
import {inTransaction} from "../../platform/mongo-transaction.js";
import {requireActiveUser} from "../../modules/identity/index.js";
import {CAREER_PRODUCER_COLLECTIONS,careerProducerSource,validateCareerProducerIntent} from "../../modules/career/index.js";

export type CareerWriteOperationExecutors=Record<CareerProducerScope["producer"],(scope:CareerProducerScope)=>Promise<CareerProducerIntent>>;
export interface CareerWriteOperationProcessorOptions{busyDelayMs?:number}
export interface CareerWriteOperationRecoveryOptions{intervalMs?:number;batchSize?:number;onError?:(error:unknown)=>void}
const matches=(intent:CareerProducerIntent,scope:CareerProducerScope)=>Object.entries(scope).every(([key,value])=>intent[key as keyof CareerProducerScope]===value);
const conflict=(message:string)=>Object.assign(new Error(message),{statusCode:409});
function ownedIntent(row:{_id:string;userId?:unknown;writerIntegration:unknown;writerIntegrationHistory?:unknown[]}|null,scope:CareerProducerScope){
 if(!row||row._id!==scope.sourceId||row.userId!==scope.userId)throw conflict("prepared source actor changed");
 const current=validateCareerProducerIntent(row.writerIntegration);
 if(current.userId!==row.userId||current.sourceId!==row._id||current.producer!==scope.producer)throw conflict("prepared source scope changed");
 if(matches(current,scope))return current;
 const history=(row.writerIntegrationHistory??[]).map(validateCareerProducerIntent).filter(intent=>matches(intent,scope));
 if(history.length!==1||history[0]!.state!=="completed")throw conflict("prepared source history changed");
 return history[0]!;
}
/** 현재 또는 검증된 완료 history만 실행하며 업무 내용은 각 owner가 씁니다. */
export function createCareerWriteOperationProcessor(context:MongoContext,executors:CareerWriteOperationExecutors,options:CareerWriteOperationProcessorOptions={}){
 const delay=options.busyDelayMs??30_000;if(!Number.isSafeInteger(delay)||delay<=0)throw new RangeError("write-operation busy delay must be positive");
 return async(job:Job<Record<string,unknown>>):Promise<Pick<CareerProducerIntent,"state"|"operationId">>=>{
  if(Object.keys(job.data).length!==1||!("scope"in job.data))throw conflict("write-operation payload is invalid");
  const scope=CareerProducerScopeSchema.strict().parse(job.data.scope);
  const read=async()=>ownedIntent(await careerProducerSource(context,scope).findOne({_id:scope.sourceId,userId:scope.userId}),scope);
  const initial=await read();await inTransaction(context,tx=>requireActiveUser(tx,scope.userId));
  const busy=async():Promise<never>=>{await job.moveToDelayed(Date.now()+delay,job.token);throw new DelayedError();};
  if(initial.state==="running"&&Date.parse(initial.leaseUntil!)>Date.now())return busy();
  if(initial.state==="blocked"||initial.state==="cancelled")throw conflict("prepared operation requires recovery");
  try{
   const result=validateCareerProducerIntent(await executors[scope.producer](scope));
   if(!matches(result,scope))throw conflict("prepared executor scope changed");return {state:result.state,operationId:result.operationId};
  }catch(error){
   // claim 경쟁에서 다른 worker가 lease를 얻었으면 같은 delivery를 늦춥니다.
   if(!(error instanceof DelayedError)){const latest=await read();if(latest.state==="running"&&Date.parse(latest.leaseUntil!)>Date.now())return busy();}
   throw error;
  }
 };
}
/** Mongo의 현재 intent만 재전달 대상으로 삼는 명시적 복구 루프입니다. */
export function createCareerWriteOperationRecovery(context:MongoContext,queue:Pick<Queue<Record<string,unknown>>,"add"|"getJob">,options:CareerWriteOperationRecoveryOptions={}){
 const intervalMs=options.intervalMs??5_000,batchSize=options.batchSize??25;
 if(!Number.isSafeInteger(intervalMs)||intervalMs<=0||!Number.isSafeInteger(batchSize)||batchSize<=0)throw new RangeError("write-operation recovery limits must be positive integers");
 let active=false,timer:ReturnType<typeof setTimeout>|undefined,inFlight:Promise<{delivered:number}>|undefined;
 async function sweep():Promise<{delivered:number}>{
  const now=new Date().toISOString(),rows=await Promise.all(Object.entries(CAREER_PRODUCER_COLLECTIONS).map(async([producer,collection])=>{
   const candidates=await context.db.collection(collection).aggregate<{_id:string;userId:string;updatedAt:Date;writerIntegration:unknown}>([
    {$match:{$or:[{"writerIntegration.state":{$in:["pending","retry"]}},{"writerIntegration.state":"running","writerIntegration.leaseUntil":{$lte:now}}]}},
    {$sort:{updatedAt:1,_id:1}},
    // 비활성 actor의 오래된 intent가 복구 batch를 가로막지 않도록 limit 전에 거릅니다.
    {$lookup:{from:"users",let:{actor:"$userId"},pipeline:[{$match:{$expr:{$eq:["$_id","$$actor"]},deletionRequestedAt:null}},{$project:{_id:1}}],as:"recoveryActor"}},
    {$match:{"recoveryActor.0":{$exists:true}}},{$limit:batchSize},{$project:{recoveryActor:0}},
   ]).toArray();return candidates.map(row=>({producer,row}));
  }));
  const candidates=rows.flat().sort((a,b)=>a.row.updatedAt.getTime()-b.row.updatedAt.getTime()||(a.row._id<b.row._id?-1:1)).slice(0,batchSize);let delivered=0;
  for(const {producer,row} of candidates){
   const intent=validateCareerProducerIntent(row.writerIntegration),scope=CareerProducerScopeSchema.parse(intent);
   if(intent.producer!==producer||row.userId!==scope.userId||row._id!==scope.sourceId||producer==="career-product"&&scope.operationId!==scope.sourceId)throw conflict("prepared recovery source changed");
   if(!await mongoCollections(context.db).users.findOne({_id:scope.userId,deletionRequestedAt:null},{projection:{_id:1}}))continue;
   const jobId=`career-write-${scope.producer}-${scope.operationId}-${intent.attempts}`,existing=await queue.getJob(jobId);
   if(!existing){await queue.add("career.write-operation",{scope},{jobId,attempts:5,backoff:{type:"exponential",delay:1_000},removeOnComplete:{age:86_400,count:10_000},removeOnFail:false});delivered++;}
   else{
    const state=await existing.getState();if(state==="failed"||state==="completed"){
     try{await existing.retry(state,{resetAttemptsMade:true});delivered++;}
     catch(error){const current=await existing.getState();if(current!=="waiting"&&current!=="active"&&current!=="delayed")throw error;}
    }
   }
  }
  return {delivered};
 }
 function pollOnce():Promise<{delivered:number}>{return inFlight??=sweep().finally(()=>{inFlight=undefined;});}
 const tick=async()=>{try{await pollOnce();}catch(error){options.onError?.(error);}finally{if(active)timer=setTimeout(()=>{void tick();},intervalMs);}};
 return {pollOnce,start(){if(active)return;active=true;void tick();},async stop(){active=false;if(timer)clearTimeout(timer);await inFlight?.catch(()=>{});}};
}