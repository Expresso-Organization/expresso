import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Queue, Worker } from "bullmq";
import { Decimal128 } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mongoCollections, type CareerPropertyMutationDoc } from "@expresso/database";
import type { CareerBusinessRecord, CareerPropertyMutationCommit, CareerPropertyMutationResult } from "@expresso/contracts";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { SpringPropertyMutationPort } from "./spring-property-mutation-port.js";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { mutationCanonicalJson, mutationFingerprint } from "./property-mutation-state.js";
import { createCareerPropertyMutationProcessor } from "../../worker/processors/career-property-mutation.js";
import * as mutationProcessorModule from "../../worker/processors/career-property-mutation.js";

async function waitFor<T>(read:()=>Promise<T|undefined>,timeoutMs=5_000):Promise<T> {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline) {const value=await read();if(value!==undefined)return value;await new Promise(resolve=>setTimeout(resolve,25));}
  throw new Error("timed out waiting for mutation recovery");
}

describe.skipIf(!process.env.TEST_MONGODB_URL)("inactive canonical mutation worker",()=>{
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  beforeAll(async()=>{fixture=await createMongoFixture("prcworker");},60_000);
  afterAll(async()=>fixture?.dispose());
  async function setup(count=1) {
    const modulePath="./property-mutation.js";const module=await import(modulePath).catch(()=>({}));expect(module.CanonicalPropertyMutationWorker).toBeDefined();
    const userId=randomUUID(),categoryId=randomUUID(),propertyId=randomUUID(),unrelated=randomUUID();
    const target={id:propertyId,key:"p",name:"값",type:"number",required:false,system:false,config:{},order:0,version:2,deletedAt:null};
    const records=new Map<string,CareerBusinessRecord>();
    for(let i=0;i<count;i++) {const id=randomUUID();records.set(id,{id,userId,categoryId,title:"record",status:"draft",version:1,updatedAt:new Date(0).toISOString(),propertyValues:[{propertyDefinitionId:propertyId,type:"text",value:"42.1200"},{propertyDefinitionId:unrelated,type:"text",value:"preserve"}]});}
    const plan={userId,categoryId,categoryVersion:2,schemaVersion:2,definitions:[target],recordIds:[...records.keys()],operation:{kind:"conversion",source:{...target,type:"text",version:1},target,defaultValue:null,confirmLossy:false}};
    const now=new Date();const job: CareerPropertyMutationDoc={_id:randomUUID(),userId,categoryId,propertyId,planJson:mutationCanonicalJson(plan),operationFingerprint:mutationFingerprint(plan),status:"pending",active:true,cursor:0,processedCount:0,skippedCount:0,attempts:0,leaseToken:null,leaseUntil:null,lastError:null,commitFence:0,createdAt:now,updatedAt:now,completedAt:null};
    await mongoCollections(fixture.resource.db).careerPropertyMutations.insertOne(job);
    const receipts=new Map<string,CareerPropertyMutationResult>();let commits=0;let conflicts=0;let loseResponse=false;let readFailure=false;let takeover=false;
    const port={
      receipt:async(_user:string,_mutation:string,id:string)=>receipts.get(id)??null,
      read:async(_user:string,_mutation:string,id:string)=>{if(readFailure)throw new Error("record moved or unavailable");return {data:structuredClone(records.get(id)!),tombstone:null};},
      commit:async(_user:string,command:CareerPropertyMutationCommit)=>{
        if(takeover) {await mongoCollections(fixture.resource.db).careerPropertyMutations.updateOne({_id:job._id},{$set:{leaseToken:randomUUID(),leaseUntil:new Date(Date.now()+60_000)}});throw new Error("lease lost");}
        if(conflicts-->0) {const current=records.get(command.recordId)!;current.version++;current.title="concurrent edit";throw Object.assign(new Error("stale"),{statusCode:412});}
        const current=records.get(command.recordId)!;expect(command.expectedVersion).toBe(current.version);
        const values=current.propertyValues.map(v=>command.propertyValues.set.find(s=>s.propertyDefinitionId===v.propertyDefinitionId)??v);
        const result={data:{...current,propertyValues:values,version:current.version+1},changed:true,replayed:false};records.set(current.id,result.data);receipts.set(current.id,result);commits++;
        if(loseResponse) {loseResponse=false;records.get(current.id)!.title="edit after lost response";throw new Error("response lost after commit");}
        return result;
      },
    };
    return {job,records,port,Worker:module.CanonicalPropertyMutationWorker,get commits(){return commits;},conflict(){conflicts=1;},lose(){loseResponse=true;},fail(){readFailure=true;},takeover(){takeover=true;}};
  }
  async function durablePort(state:Awaited<ReturnType<typeof setup>>):Promise<SpringPropertyMutationPort> {
    const collections=mongoCollections(fixture.resource.db);
    for(const {id,...data} of state.records.values())await collections.careerRecords.insertOne({...data,_id:id,origin:"manual",properties:{sentinel:"preserve"},bodyMd:"document sentinel",deletedAt:null,updatedAt:new Date(data.updatedAt),propertyValues:data.propertyValues.map(value=>value.type==="number"?{...value,value:Decimal128.fromString(value.value)}:value)});
    function business(data:Pick<import("@expresso/database").CareerRecordDoc,"_id"|"userId"|"categoryId"|"title"|"status"|"propertyValues"|"version"|"updatedAt">):CareerBusinessRecord {
      return {id:data._id,userId:data.userId,categoryId:data.categoryId,title:data.title,status:data.status,version:data.version,updatedAt:data.updatedAt.toISOString(),propertyValues:(data.propertyValues??[]).map(value=>value.type==="number"?{...value,value:value.value.toString()}:value)};
    }
    return {
      async receipt(userId,mutationId,recordId,operationFingerprint) {
        const receipt=await collections.careerPropertyMutationReceipts.findOne({userId,mutationId,recordId,operationFingerprint});
        return receipt?{data:business(receipt.response),changed:receipt.changed,replayed:true}:null;
      },
      async read(userId,_mutationId,recordId) {
        const data=await collections.careerRecords.findOne({_id:recordId,userId});if(!data)throw new Error("canonical record unavailable");
        return {data:business(data),tombstone:null};
      },
      async commit(userId,command) {
        // Spring 외부 경계 대역만 실제 Mongo 트랜잭션으로 business commit을 소유합니다.
        return inTransaction(fixture.resource,async tx=>{
          const db=mongoCollections(tx.db);
          const existing=await db.careerPropertyMutationReceipts.findOne({userId,mutationId:command.mutationId,recordId:command.recordId,operationFingerprint:command.operationFingerprint},{session:tx.session});
          if(existing)return {data:business(existing.response),changed:existing.changed,replayed:true};
          const fence=await db.careerPropertyMutations.updateOne({_id:command.mutationId,userId,operationFingerprint:command.operationFingerprint,status:"running",active:true,leaseToken:command.leaseToken,leaseUntil:{$gt:new Date()}},{$inc:{commitFence:1}},{session:tx.session});
          if(fence.matchedCount!==1)throw new Error("canonical lease lost");
          const current=await db.careerRecords.findOne({_id:command.recordId,userId},{session:tx.session});if(!current)throw new Error("canonical record unavailable");
          expect(current.version).toBe(command.expectedVersion);
          const propertyValues=business(current).propertyValues.map(value=>command.propertyValues.set.find(set=>set.propertyDefinitionId===value.propertyDefinitionId)??value).filter(value=>!command.propertyValues.unsetPropertyIds.includes(value.propertyDefinitionId)).map(value=>value.type==="number"?{...value,value:Decimal128.fromString(value.value)}:value);
          const updatedAt=new Date();
          const result=await db.careerRecords.updateOne({_id:current._id,version:command.expectedVersion},{$set:{propertyValues,updatedAt},$inc:{version:1}},{session:tx.session});expect(result.matchedCount).toBe(1);
          const response={_id:current._id,userId,categoryId:current.categoryId,title:current.title,status:current.status,propertyValues,version:current.version+1,updatedAt};
          await db.careerPropertyMutationReceipts.insertOne({_id:randomUUID(),userId,mutationId:command.mutationId,recordId:command.recordId,operationFingerprint:command.operationFingerprint,response,changed:true,createdAt:updatedAt},{session:tx.session});
          await db.outboxEvents.insertOne({_id:randomUUID(),userId,topic:"career.record.updated",payload:{recordId:current._id},idempotencyKey:`record-commit-${current._id}`,state:"published",attempts:0,availableAt:updatedAt,createdAt:updatedAt,updatedAt},{session:tx.session});
          return {data:business(response),changed:true,replayed:false};
        });
      },
    };
  }
  it("checkpoints only acknowledged commits across more than one batch",async()=>{
    const state=await setup(101);await new state.Worker(fixture.resource,state.port).run(state.job._id,state.job.operationFingerprint);
    const job=await mongoCollections(fixture.resource.db).careerPropertyMutations.findOne({_id:state.job._id});expect(job).toMatchObject({status:"completed",active:false,cursor:101,processedCount:101,skippedCount:0});
    expect(state.commits).toBe(101);expect([...state.records.values()].every(r=>r.propertyValues[1]?.value==="preserve" && r.propertyValues[0]?.value==="42.1200")).toBe(true);
  },30_000);
  it("bounded CAS rereads and recalculates without overwriting a concurrent edit",async()=>{
    const state=await setup();state.conflict();await new state.Worker(fixture.resource,state.port).run(state.job._id,state.job.operationFingerprint);
    expect([...state.records.values()][0]).toMatchObject({title:"concurrent edit",version:3});expect(state.commits).toBe(1);
  });
  it("commit before checkpoint crash replays receipt and preserves a later edit",async()=>{
    const state=await setup();state.lose();const worker=new state.Worker(fixture.resource,state.port);
    await expect(worker.run(state.job._id,state.job.operationFingerprint)).rejects.toThrow("response lost");
    expect(await mongoCollections(fixture.resource.db).careerPropertyMutations.findOne({_id:state.job._id})).toMatchObject({status:"failed",cursor:0});
    await worker.resume(state.job._id,state.job.operationFingerprint);await worker.run(state.job._id,state.job.operationFingerprint);
    expect(state.commits).toBe(1);expect([...state.records.values()][0]).toMatchObject({title:"edit after lost response",version:2});
  });
  it("duplicate completed delivery does not commit again",async()=>{
    const state=await setup();const worker=new state.Worker(fixture.resource,state.port);await worker.run(state.job._id,state.job.operationFingerprint);await worker.run(state.job._id,state.job.operationFingerprint);expect(state.commits).toBe(1);
  });
  it("lease takeover prevents old worker checkpoint and failure writes",async()=>{
    const state=await setup();state.takeover();await expect(new state.Worker(fixture.resource,state.port).run(state.job._id,state.job.operationFingerprint)).rejects.toThrow("lease lost");
    expect(await mongoCollections(fixture.resource.db).careerPropertyMutations.findOne({_id:state.job._id})).toMatchObject({status:"running",cursor:0,lastError:null});
  });
  it("renews the lease throughout long receipt, read, and commit response waits",async()=>{
    const jobs=mongoCollections(fixture.resource.db).careerPropertyMutations;
    const states=await Promise.all([setup(),setup(),setup()]);
    const gates=states.map(()=>{let release!:()=>void,started!:()=>void;return {blocked:new Promise<void>(resolve=>{release=resolve;}),waiting:new Promise<void>(resolve=>{started=resolve;}),release:()=>release(),started:()=>started()};});
    const runs=states.map((state,index)=>{
      const gate=gates[index]!;
      const port={...state.port};
      if(index===0)port.receipt=async(...args)=>{gate.started();await gate.blocked;return state.port.receipt(...args);};
      if(index===1)port.read=async(...args)=>{gate.started();await gate.blocked;return state.port.read(...args);};
      if(index===2)port.commit=async(...args)=>{const result=await state.port.commit(...args);gate.started();await gate.blocked;return result;};
      return new state.Worker(fixture.resource,port).run(state.job._id,state.job.operationFingerprint).then(()=>null,(error:unknown)=>error);
    });
    try {
      await Promise.all(gates.map(gate=>gate.waiting));
      await new Promise(resolve=>setTimeout(resolve,31_000));
      for(const state of states) {
        const job=await jobs.findOne({_id:state.job._id});
        expect(job).toMatchObject({status:"running",cursor:0,attempts:1});
        expect(job!.leaseUntil!.getTime()).toBeGreaterThan(Date.now());
      }
      gates.forEach(gate=>gate.release());expect(await Promise.all(runs)).toEqual([null,null,null]);
      for(const state of states)expect(await jobs.findOne({_id:state.job._id})).toMatchObject({status:"completed",cursor:1,processedCount:1,attempts:1});
      expect(states.map(state=>state.commits)).toEqual([1,1,1]);
    } finally {gates.forEach(gate=>gate.release());await Promise.all(runs);}
  },45_000);
  it.skipIf(!process.env.TEST_REDIS_URL)("durably recovers an exhausted last delivery after commit acknowledgement loses its lease",async()=>{
    const state=await setup(),jobs=mongoCollections(fixture.resource.db).careerPropertyMutations;
    const prefix=`expresso-prc-exhausted-${randomUUID()}`,queueName="career-property-mutation";
    const queue=new Queue<Record<string,unknown>>(queueName,{connection:{url:process.env.TEST_REDIS_URL!},prefix});
    const receipts=mongoCollections(fixture.resource.db).careerPropertyMutationReceipts;
    const outbox=mongoCollections(fixture.resource.db).outboxEvents;
    const canonical=await durablePort(state);
    const port={...canonical,commit:async(userId:string,command:CareerPropertyMutationCommit)=>{
      const result=await canonical.commit(userId,command);
      // 응답이 돌아오기 전에 lease가 만료되어 checkpoint와 실패 저장 모두 거부됩니다.
      await jobs.updateOne({_id:state.job._id},{$set:{leaseUntil:new Date(Date.now()-1)}});
      await new Promise(resolve=>setTimeout(resolve,25));
      return result;
    }};
    type Recovery={start():void;stop():Promise<void>;pollOnce():Promise<unknown>};
    let recovery:Recovery|undefined,deliveryWorker:Worker<Record<string,unknown>>|undefined;
    const start=(workerPort:SpringPropertyMutationPort)=>new Worker<Record<string,unknown>>(queueName,createCareerPropertyMutationProcessor(new state.Worker(fixture.resource,workerPort)),{connection:{url:process.env.TEST_REDIS_URL!},prefix});
    try {
      deliveryWorker=start(port);
      const delivery=await queue.add("career.property-mutation",{mutationId:state.job._id,operationFingerprint:state.job.operationFingerprint},{attempts:1});
      const exhausted=await waitFor(async()=>{
        const job=await queue.getJob(delivery.id!);
        // getState는 Redis만 조회하므로 실패 전 객체의 attemptsMade를 갱신하지 않습니다.
        return await job?.getState()==="failed"?queue.getJob(delivery.id!):undefined;
      });
      expect(exhausted.attemptsMade).toBe(1);expect(exhausted.failedReason).toContain("lease lost before checkpoint");
      expect(await jobs.findOne({_id:state.job._id})).toMatchObject({status:"running",cursor:0,processedCount:0,attempts:1,lastError:null});
      await deliveryWorker.close();deliveryWorker=undefined;
      const createRecovery=mutationProcessorModule.createCareerPropertyMutationRecovery;
      expect(createRecovery).toBeTypeOf("function");
      recovery=createRecovery!(fixture.resource,queue,{intervalMs:25});
      deliveryWorker=start(canonical);recovery.start();
      await waitFor(async()=>{const job=await jobs.findOne({_id:state.job._id});return job?.status==="completed"?job:undefined;});
      await recovery.stop();recovery=undefined;
      expect(await jobs.findOne({_id:state.job._id})).toMatchObject({status:"completed",active:false,cursor:1,processedCount:1,attempts:2,lastError:null});
      expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:[...state.records.keys()][0]!})).toMatchObject({version:2,properties:{sentinel:"preserve"},bodyMd:"document sentinel"});
      expect(await receipts.countDocuments({mutationId:state.job._id})).toBe(1);
      expect(await outbox.countDocuments({idempotencyKey:`record-commit-${[...state.records.keys()][0]}`})).toBe(1);
      recovery=createRecovery!(fixture.resource,queue,{intervalMs:25});recovery.start();
      const duplicate=await queue.add("career.property-mutation",{mutationId:state.job._id,operationFingerprint:state.job.operationFingerprint},{attempts:1});
      await waitFor(async()=>{const job=await queue.getJob(duplicate.id!);return await job?.getState()==="completed"?job:undefined;});
      expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:[...state.records.keys()][0]!})).toMatchObject({version:2});expect(await jobs.findOne({_id:state.job._id})).toMatchObject({attempts:2,processedCount:1});
    } finally {await recovery?.stop();await deliveryWorker?.close();await queue.obliterate({force:true});await queue.close();}
  },15_000);
  it.skipIf(!process.env.TEST_REDIS_URL)("restarts recovery after a crashed claim and exhausted recovery delivery without touching live or failed jobs",async()=>{
    const states=await Promise.all([setup(),setup(),setup(),setup()]);
    const [crashed,live,failed,completed]=states;
    const jobs=mongoCollections(fixture.resource.db).careerPropertyMutations;
    const canonical=await durablePort(crashed!);
    const crashToken=randomUUID();
    await jobs.updateOne({_id:crashed!.job._id},{$set:{status:"running",attempts:1,leaseToken:crashToken,leaseUntil:new Date(Date.now()-1)}});
    await jobs.updateOne({_id:live!.job._id},{$set:{status:"running",attempts:1,leaseToken:randomUUID(),leaseUntil:new Date(Date.now()+60_000)}});
    await jobs.updateOne({_id:failed!.job._id},{$set:{status:"failed",lastError:"CANONICAL_MUTATION_FAILED"}});
    await new completed!.Worker(fixture.resource,completed!.port).run(completed!.job._id,completed!.job.operationFingerprint);
    const preserved=await Promise.all([live,failed,completed].map(state=>jobs.findOne({_id:state!.job._id})));
    const prefix=`expresso-prc-crash-${randomUUID()}`,queueName="career-property-mutation";
    const queue=new Queue<Record<string,unknown>>(queueName,{connection:{url:process.env.TEST_REDIS_URL!},prefix});
    const errors:unknown[]=[];
    let deliveryWorker:Worker<Record<string,unknown>>|undefined;
    const recoveries=[mutationProcessorModule.createCareerPropertyMutationRecovery(fixture.resource,queue,{intervalMs:25,onError:error=>errors.push(error)}),mutationProcessorModule.createCareerPropertyMutationRecovery(fixture.resource,queue,{intervalMs:25,onError:error=>errors.push(error)})];
    // 공유 DB의 다른 expired-running 작업도 복구 대상이며 큐 전체 개수는 이 작업의 불변식이 아닙니다.
    const inherited=await setup(),inheritedCanonical=await durablePort(inherited);
    await new inherited.Worker(fixture.resource,inheritedCanonical).run(inherited.job._id,inherited.job.operationFingerprint);
    await jobs.updateOne({_id:inherited.job._id},{$set:{status:"running",active:true,cursor:0,processedCount:0,attempts:1,leaseToken:randomUUID(),leaseUntil:new Date(Date.now()-1),completedAt:null}});
    try {
      // claim에 도달하기 전에 마지막 복구 전달도 실패한 상태를 만듭니다.
      deliveryWorker=new Worker<Record<string,unknown>>(queueName,async()=>{throw new Error("crash before durable claim");},{connection:{url:process.env.TEST_REDIS_URL!},prefix});
      const exhausted=await queue.add("career.property-mutation",{mutationId:crashed!.job._id,operationFingerprint:crashed!.job.operationFingerprint},{jobId:`career-mutation-recovery-${crashed!.job._id}-1`,attempts:1});
      await waitFor(async()=>{const job=await queue.getJob(exhausted.id!);return await job?.getState()==="failed"?job:undefined;});
      await deliveryWorker.close();deliveryWorker=undefined;
      expect(await exhausted.getState()).toBe("failed");
      deliveryWorker=new Worker<Record<string,unknown>>(queueName,createCareerPropertyMutationProcessor(new crashed!.Worker(fixture.resource,canonical)),{connection:{url:process.env.TEST_REDIS_URL!},prefix});
      recoveries.forEach(recovery=>recovery.start());
      await waitFor(async()=>{const completedJobs=await jobs.countDocuments({_id:{$in:[crashed!.job._id,inherited.job._id]},status:"completed"});return completedJobs===2?true:undefined;});
      await Promise.all(recoveries.map(recovery=>recovery.stop()));
      const job=await jobs.findOne({_id:crashed!.job._id});
      expect(job).toMatchObject({status:"completed",attempts:2,cursor:1,processedCount:1,lastError:null});
      expect(job!.leaseToken).toBeNull();
      expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:[...crashed!.records.keys()][0]!})).toMatchObject({version:2});
      expect(await mongoCollections(fixture.resource.db).careerPropertyMutationReceipts.countDocuments({mutationId:crashed!.job._id})).toBe(1);
      expect(await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({idempotencyKey:`record-commit-${[...crashed!.records.keys()][0]}`})).toBe(1);
      expect(await Promise.all([live,failed,completed].map(state=>jobs.findOne({_id:state!.job._id})))).toEqual(preserved);
      await waitFor(async()=>{
        const deliveries=await queue.getJobs(["completed"]);
        return [crashed!.job._id,inherited.job._id].every(id=>deliveries.some(delivery=>delivery.data.mutationId===id))?true:undefined;
      });
      const targetDeliveries=async()=> (await queue.getJobs(["completed","failed","waiting","active","delayed"])).filter(delivery=>delivery.data.mutationId===crashed!.job._id);
      const target=await targetDeliveries();
      expect(target.map(delivery=>delivery.id)).toEqual([exhausted.id]);
      expect(await target[0]!.getState()).toBe("completed");
      const settledDelivery=target[0]!.asJSON();
      // 새 sweep을 반복해도 완료된 Mongo 작업을 다시 등록하거나 같은 delivery를 retry하지 않습니다.
      for(let sweep=0;sweep<3;sweep++)await Promise.all(recoveries.map(recovery=>recovery.pollOnce()));
      expect((await targetDeliveries()).map(delivery=>delivery.id)).toEqual([exhausted.id]);
      expect((await queue.getJob(exhausted.id!))?.asJSON()).toEqual(settledDelivery);
      expect(await jobs.findOne({_id:crashed!.job._id})).toEqual(job);
      expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:[...inherited.records.keys()][0]!})).toMatchObject({version:2});
      expect(await mongoCollections(fixture.resource.db).careerPropertyMutationReceipts.countDocuments({mutationId:inherited.job._id})).toBe(1);
      expect(await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({idempotencyKey:`record-commit-${[...inherited.records.keys()][0]}`})).toBe(1);
      expect(errors).toEqual([]);
    } finally {await Promise.all(recoveries.map(recovery=>recovery.stop()));await deliveryWorker?.close();await queue.obliterate({force:true});await queue.close();}
  },15_000);
  it.skipIf(!process.env.TEST_REDIS_URL)("automatically replays a durable receipt after forcibly terminating a BullMQ worker process",async()=>{
    const state=await setup(),canonical=await durablePort(state),collections=mongoCollections(fixture.resource.db);
    const leaseToken=randomUUID(),recordId=[...state.records.keys()][0]!;
    await collections.careerPropertyMutations.updateOne({_id:state.job._id},{$set:{status:"running",leaseToken,leaseUntil:new Date(Date.now()+30_000),attempts:1}});
    await canonical.commit(state.job.userId,{mutationId:state.job._id,recordId,operationFingerprint:state.job.operationFingerprint,leaseToken,expectedVersion:1,propertyValues:{set:[{propertyDefinitionId:state.job.propertyId,type:"number",value:"42.1200"}],unsetPropertyIds:[]}});
    await collections.careerPropertyMutations.updateOne({_id:state.job._id},{$set:{leaseUntil:new Date(Date.now()-1)}});
    const prefix=`expresso-prc-process-crash-${randomUUID()}`,queueName="career-property-mutation";
    const queue=new Queue<Record<string,unknown>>(queueName,{connection:{url:process.env.TEST_REDIS_URL!},prefix});
    const child=fork(fileURLToPath(new URL("../../../test/support/career-property-mutation-crash.ts",import.meta.url)),[],{execPath:process.execPath,execArgv:["--import","tsx"],env:{...process.env,MUTATION_TEST_DB:fixture.resource.db.databaseName,MUTATION_TEST_PREFIX:prefix,MUTATION_TEST_QUEUE:queueName},stdio:["ignore","ignore","pipe","ipc"]});
    let stderr="";child.stderr?.on("data",chunk=>{stderr+=String(chunk);});
    const exit=new Promise<void>(resolve=>{child.once("exit",()=>resolve());});
    const held=new Promise<void>((resolve,reject)=>{
      child.on("message",message=>{if((message as {kind?:string}).kind==="receipt")resolve();});
      child.once("error",reject);child.once("exit",()=>reject(new Error(`worker child exited before receipt: ${stderr}`)));
    });
    let deliveryWorker:Worker<Record<string,unknown>>|undefined;
    const errors:unknown[]=[];
    const recovery=mutationProcessorModule.createCareerPropertyMutationRecovery(fixture.resource,queue,{intervalMs:25,onError:error=>errors.push(error)});
    try {
      await queue.add("career.property-mutation",{mutationId:state.job._id,operationFingerprint:state.job.operationFingerprint},{attempts:1});
      await held;
      const crashed=await collections.careerPropertyMutations.findOne({_id:state.job._id});
      expect(crashed).toMatchObject({status:"running",cursor:0,processedCount:0,attempts:2});expect(crashed!.leaseToken).not.toBe(leaseToken);
      // 정상 close 경로 없이 OS 프로세스를 종료합니다.
      expect(child.kill("SIGKILL")).toBe(true);await exit;
      await collections.careerPropertyMutations.updateOne({_id:state.job._id,leaseToken:crashed!.leaseToken},{$set:{leaseUntil:new Date(Date.now()-1)}});
      deliveryWorker=new Worker<Record<string,unknown>>(queueName,createCareerPropertyMutationProcessor(new state.Worker(fixture.resource,canonical)),{connection:{url:process.env.TEST_REDIS_URL!},prefix});
      recovery.start();
      await waitFor(async()=>{const job=await collections.careerPropertyMutations.findOne({_id:state.job._id});return job?.status==="completed"?job:undefined;});
      await recovery.stop();
      expect(await collections.careerPropertyMutations.findOne({_id:state.job._id})).toMatchObject({status:"completed",attempts:3,cursor:1,processedCount:1,lastError:null});
      expect(await collections.careerRecords.findOne({_id:recordId})).toMatchObject({version:2,properties:{sentinel:"preserve"},bodyMd:"document sentinel"});
      expect(await collections.careerPropertyMutationReceipts.countDocuments({mutationId:state.job._id})).toBe(1);
      expect(await collections.outboxEvents.countDocuments({idempotencyKey:`record-commit-${recordId}`})).toBe(1);expect(errors).toEqual([]);
    } finally {child.kill("SIGKILL");await exit;await recovery.stop();await deliveryWorker?.close();await queue.obliterate({force:true});await queue.close();}
  },30_000);
  it.skipIf(!process.env.TEST_REDIS_URL)("recovers after an uncertain heartbeat without turning the durable job into an explicit failure",async()=>{
    const state=await setup(),canonical=await durablePort(state),jobs=mongoCollections(fixture.resource.db).careerPropertyMutations;
    let release!:()=>void,waiting!:()=>void,renewals=0;
    const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{waiting=resolve;});
    // 네트워크 경계 오류만 주입합니다. claim과 상태 조회·쓰기에는 실제 Mongo를 씁니다.
    const db=new Proxy(fixture.resource.db,{get(target,key){
      if(key==="collection")return (name:string)=>{
        const collection=target.collection(name);
        if(name!=="career_property_mutations")return collection;
        return new Proxy(collection,{get(collection,key){
          if(key==="updateOne")return async(...args:Parameters<typeof jobs.updateOne>)=>{
            if(args[0]._id===state.job._id && "$set" in args[1] && args[1].$set?.leaseUntil && ++renewals===2)throw new Error("heartbeat acknowledgement uncertain");
            return jobs.updateOne(...args);
          };
          const member=Reflect.get(collection,key);return typeof member==="function"?member.bind(collection):member;
        }});
      };
      const member=Reflect.get(target,key);return typeof member==="function"?member.bind(target):member;
    }});
    const port={...canonical,receipt:async(...args:Parameters<SpringPropertyMutationPort["receipt"]>)=>{waiting();await gate;return canonical.receipt(...args);}};
    const run=new state.Worker({...fixture.resource,db},port).run(state.job._id,state.job.operationFingerprint).then(()=>null,(error:unknown)=>error);
    const prefix=`expresso-prc-heartbeat-error-${randomUUID()}`,queueName="career-property-mutation";
    const queue=new Queue<Record<string,unknown>>(queueName,{connection:{url:process.env.TEST_REDIS_URL!},prefix});
    const recovery=mutationProcessorModule.createCareerPropertyMutationRecovery(fixture.resource,queue,{intervalMs:25});
    let deliveryWorker:Worker<Record<string,unknown>>|undefined;
    try {
      await started;expect(await run).toMatchObject({message:"heartbeat acknowledgement uncertain"});
      expect(await jobs.findOne({_id:state.job._id})).toMatchObject({status:"running",attempts:1,cursor:0,lastError:null});
      await jobs.updateOne({_id:state.job._id},{$set:{leaseUntil:new Date(Date.now()-1)}});
      deliveryWorker=new Worker<Record<string,unknown>>(queueName,createCareerPropertyMutationProcessor(new state.Worker(fixture.resource,canonical)),{connection:{url:process.env.TEST_REDIS_URL!},prefix});
      recovery.start();await waitFor(async()=>{const job=await jobs.findOne({_id:state.job._id});return job?.status==="completed"?job:undefined;});
      expect(await jobs.findOne({_id:state.job._id})).toMatchObject({status:"completed",attempts:2,cursor:1,processedCount:1,lastError:null});
      expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:[...state.records.keys()][0]!})).toMatchObject({version:2});
    } finally {release();await run;await recovery.stop();await deliveryWorker?.close();await queue.obliterate({force:true});await queue.close();}
  },20_000);
  it.skipIf(!process.env.TEST_REDIS_URL)("busy delivery survives worker restart and automatically recovers an expired dead-worker lease",async()=>{
    const state=await setup(),jobs=mongoCollections(fixture.resource.db).careerPropertyMutations;
    let releaseA!:()=>void;
    const blocked=new Promise<void>(resolve=>{releaseA=resolve;});
    const workerA=new state.Worker(fixture.resource,{...state.port,receipt:async()=>{await blocked;return null;}});
    const staleResult=workerA.run(state.job._id,state.job.operationFingerprint).then(()=>null,(error:unknown)=>error as Error);
    await waitFor(async()=>{const job=await jobs.findOne({_id:state.job._id});return job?.status==="running"?job:undefined;});
    const prefix=`expresso-prc-recovery-${randomUUID()}`,queueName="career-property-mutation";
    const queue=new Queue<Record<string,unknown>>(queueName,{connection:{url:process.env.TEST_REDIS_URL!},prefix});
    const processor=createCareerPropertyMutationProcessor(new state.Worker(fixture.resource,state.port));
    let deliveryWorker:Worker<Record<string,unknown>>|undefined;
    const errors:Error[]=[];
    const start=()=>{const worker=new Worker<Record<string,unknown>>(queueName,processor,{connection:{url:process.env.TEST_REDIS_URL!},prefix});worker.on("error",error=>errors.push(error));return worker;};
    try {
      deliveryWorker=start();
      const delivery=await queue.add("mutation",{mutationId:state.job._id,operationFingerprint:state.job.operationFingerprint},{attempts:1});
      const first=await waitFor(async()=>{const job=await queue.getJob(delivery.id!);const status=await job?.getState();return status==="delayed"||status==="completed"?{job,status}:undefined;});
      expect(first.status).toBe("delayed");expect(first.job?.attemptsMade).toBe(0);
      expect(await jobs.findOne({_id:state.job._id})).toMatchObject({status:"running",cursor:0,processedCount:0,attempts:1,lastError:null});expect(state.commits).toBe(0);
      await deliveryWorker.close();deliveryWorker=undefined;
      await jobs.updateOne({_id:state.job._id},{$set:{leaseUntil:new Date(Date.now()-1)}});
      deliveryWorker=start();
      await waitFor(async()=>{const job=await queue.getJob(delivery.id!);return await job?.getState()==="completed"?job:undefined;},40_000);
      const completed=await jobs.findOne({_id:state.job._id});
      expect(completed).toMatchObject({status:"completed",active:false,cursor:1,processedCount:1,attempts:2,lastError:null});expect(state.commits).toBe(1);
      releaseA();expect(await staleResult).toBeInstanceOf(Error);
      expect(await jobs.findOne({_id:state.job._id})).toEqual(completed);expect(errors).toEqual([]);
    } finally {releaseA();await staleResult;await deliveryWorker?.close();await queue.obliterate({force:true});await queue.close();}
  },60_000);
  it("a stale worker cannot checkpoint an acknowledged commit after another worker completes",async()=>{
    const state=await setup(),jobs=mongoCollections(fixture.resource.db).careerPropertyMutations;
    let committed!:()=>void,acknowledge!:()=>void;
    const commitStarted=new Promise<void>(resolve=>{committed=resolve;}),response=new Promise<void>(resolve=>{acknowledge=resolve;});
    const workerA=new state.Worker(fixture.resource,{...state.port,commit:async(userId:string,command:CareerPropertyMutationCommit)=>{const result=await state.port.commit(userId,command);committed();await response;return result;}});
    const staleResult=workerA.run(state.job._id,state.job.operationFingerprint).then(()=>null,(error:unknown)=>error as Error);
    try {
      await commitStarted;expect(await jobs.findOne({_id:state.job._id})).toMatchObject({cursor:0,processedCount:0,status:"running"});
      await jobs.updateOne({_id:state.job._id},{$set:{leaseUntil:new Date(Date.now()-1)}});
      await new state.Worker(fixture.resource,state.port).run(state.job._id,state.job.operationFingerprint);
      const completed=await jobs.findOne({_id:state.job._id});
      acknowledge();expect(await staleResult).toMatchObject({message:"mutation lease lost before checkpoint"});
      expect(await jobs.findOne({_id:state.job._id})).toEqual(completed);expect(state.commits).toBe(1);
    } finally {acknowledge();await staleResult;}
  });
  it("unavailable records fail explicitly and isolate other jobs",async()=>{
    const failed=await setup();failed.fail();await expect(new failed.Worker(fixture.resource,failed.port).run(failed.job._id,failed.job.operationFingerprint)).rejects.toThrow("unavailable");
    const other=await setup();await new other.Worker(fixture.resource,other.port).run(other.job._id,other.job.operationFingerprint);
    expect(await mongoCollections(fixture.resource.db).careerPropertyMutations.findOne({_id:failed.job._id})).toMatchObject({status:"failed",cursor:0,skippedCount:0});expect(other.commits).toBe(1);
  });
  it("immutable plan tampering and mismatched envelope fail before Spring",async()=>{
    const state=await setup();await mongoCollections(fixture.resource.db).careerPropertyMutations.updateOne({_id:state.job._id},{$set:{planJson:state.job.planJson+" "}});
    await expect(new state.Worker(fixture.resource,state.port).run(state.job._id,state.job.operationFingerprint)).rejects.toThrow("fingerprint");expect(state.commits).toBe(0);
  });
});
