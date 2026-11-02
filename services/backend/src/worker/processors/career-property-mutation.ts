import { DelayedError, type Job, type Queue } from "bullmq";
import { mongoCollections } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import type { CanonicalPropertyMutationWorker } from "../../modules/career/index.js";

/** 제품 runtime이 등록한 canonical worker로만 business 변경을 위임합니다. */
export function createCareerPropertyMutationProcessor(worker:CanonicalPropertyMutationWorker) {
  return async(job:Job<Record<string,unknown>>)=>{
    const {mutationId,operationFingerprint}=job.data;
    if(typeof mutationId!=="string" || typeof operationFingerprint!=="string" || !/^[a-f0-9]{64}$/.test(operationFingerprint))throw new Error("career.property-mutation payload is invalid");
    const result=await worker.run(mutationId,operationFingerprint);
    if(result==="busy") {
      // 살아 있는 lease는 건드리지 않고, 재시도 횟수를 소모하지 않는 동일 delivery를 보존합니다.
      await job.moveToDelayed(Date.now()+30_000,job.token);
      throw new DelayedError();
    }
    return result;
  };
}

export interface CareerPropertyMutationRecoveryOptions {
  intervalMs?:number;
  batchSize?:number;
  onError?:(error:unknown)=>void;
}

/** 제품 runtime이 명시적으로 시작하며 Mongo 작업이 재전달 의도를 소유합니다. */
export function createCareerPropertyMutationRecovery(
  context:MongoContext,
  queue:Pick<Queue<Record<string,unknown>>, "add"|"getJob">,
  options:CareerPropertyMutationRecoveryOptions={},
) {
  const intervalMs=options.intervalMs??5_000,batchSize=options.batchSize??25;
  if(!Number.isSafeInteger(intervalMs)||intervalMs<=0||!Number.isSafeInteger(batchSize)||batchSize<=0)throw new RangeError("mutation recovery limits must be positive integers");
  let active=false,timer:ReturnType<typeof setTimeout>|undefined,inFlight:Promise<{delivered:number}>|undefined;
  async function sweep():Promise<{delivered:number}> {
    const candidates=await mongoCollections(context.db).careerPropertyMutations.find({active:true,$or:[{status:"pending"},{status:"running",leaseUntil:{$lte:new Date()}}]}).sort({status:1,leaseUntil:1,_id:1}).limit(batchSize).toArray();
    let delivered=0;
    for(const job of candidates) {
      // 같은 Mongo 시도에는 같은 큐 ID를 사용합니다. claim 뒤에는 새 세대가 됩니다.
      const jobId=`career-mutation-recovery-${job._id}-${job.attempts}`;
      const delivery=await queue.getJob(jobId);
      if(!delivery) {
        await queue.add("career.property-mutation",{mutationId:job._id,operationFingerprint:job.operationFingerprint},{jobId,attempts:5,backoff:{type:"exponential",delay:1_000},removeOnComplete:{age:86_400,count:10_000},removeOnFail:false});
        delivered++;
      } else {
        const state=await delivery.getState();
        if(state==="failed"||state==="completed") {
          try {await delivery.retry(state,{resetAttemptsMade:true});delivered++;}
          catch(error) {
            // 다른 복구 루프가 먼저 재전달한 경우 그 전달을 그대로 보존합니다.
            const current=await delivery.getState();
            if(current!=="waiting"&&current!=="active"&&current!=="delayed")throw error;
          }
        }
      }
    }
    return {delivered};
  }
  function pollOnce():Promise<{delivered:number}> {
    return inFlight??=sweep().finally(()=>{inFlight=undefined;});
  }
  const tick=async()=>{
    try {await pollOnce();}catch(error){options.onError?.(error);}
    finally {if(active)timer=setTimeout(()=>{void tick();},intervalMs);}
  };
  return {
    pollOnce,
    start() {if(active)return;active=true;void tick();},
    async stop() {active=false;if(timer)clearTimeout(timer);await inFlight?.catch(()=>{});},
  };
}