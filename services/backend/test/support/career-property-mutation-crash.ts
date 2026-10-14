import { Worker } from "bullmq";
import { mongoCollections } from "@expresso/database";
import { createMongoResource } from "../../src/platform/mongodb.js";
import { CanonicalPropertyMutationWorker } from "../../src/modules/career/property-mutation.js";
import { createCareerPropertyMutationProcessor } from "../../src/worker/processors/career-property-mutation.js";

const context=createMongoResource(process.env.TEST_MONGODB_URL!,{databaseName:process.env.MUTATION_TEST_DB!});
const mutationWorker=new CanonicalPropertyMutationWorker(context,{
  async receipt(userId,mutationId,recordId,operationFingerprint) {
    const receipt=await mongoCollections(context.db).careerPropertyMutationReceipts.findOne({userId,mutationId,recordId,operationFingerprint});
    if(!receipt)throw new Error("durable receipt missing before process crash");
    process.send?.({kind:"receipt"});
    // 실제 claim과 receipt 확인 뒤 응답을 기다리는 프로세스를 부모가 강제 종료합니다.
    return new Promise<never>(()=>{});
  },
  async read(){throw new Error("receipt recovery must not read canonical inputs");},
  async commit(){throw new Error("receipt recovery must not commit canonical values");},
});
const worker=new Worker<Record<string,unknown>>(process.env.MUTATION_TEST_QUEUE!,createCareerPropertyMutationProcessor(mutationWorker),{connection:{url:process.env.TEST_REDIS_URL!},prefix:process.env.MUTATION_TEST_PREFIX!});
worker.on("error",error=>{process.stderr.write(error.message);process.exitCode=1;});