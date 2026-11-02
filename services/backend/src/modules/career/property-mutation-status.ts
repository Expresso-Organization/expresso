import { CareerPropertyMutationStatusResponseSchema } from "@expresso/contracts";
import { mongoCollections,type CareerPropertyMutationDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction,type MongoTransaction } from "../../platform/mongo-transaction.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { requireActiveUser } from "../identity/index.js";
import { CareerError } from "./errors.js";
import { mutationCanonicalJson,mutationJobPlan } from "./property-mutation-state.js";
function response(job:CareerPropertyMutationDoc) {
 const plan=mutationJobPlan(job);
 return CareerPropertyMutationStatusResponseSchema.parse({data:{id:job._id,categoryId:job.categoryId,propertyId:job.propertyId,status:job.status,active:job.active,processedCount:job.processedCount,totalCount:plan.recordIds.length,retryable:job.status==="failed"&&job.active,updatedAt:job.updatedAt.toISOString(),completedAt:job.completedAt?.toISOString()??null}});
}
async function owned(context:MongoContext|MongoTransaction,userId:string,mutationId:string) {
 const options="session" in context?{session:context.session}:{},db=mongoCollections(context.db);
 const job=await db.careerPropertyMutations.findOne({_id:mutationId,userId},options);
 if(!job)throw new CareerError(404,"property mutation not found");
 const category=await db.careerCategories.findOne({_id:job.categoryId,userId},options);
 if(!category)throw new CareerError(404,"property mutation not found");
 return {job,category};
}
export async function readCareerPropertyMutationStatus(context:MongoContext,userId:string,mutationId:string) {
 const {job}=await owned(context,userId,mutationId);return response(job);
}
/** 동일 실패 세대만 재개하며 재전달 의도를 상태 변경과 같은 transaction에 저장합니다. */
export async function resumeCareerPropertyMutation(context:MongoContext,userId:string,mutationId:string) {
 return inTransaction(context,async tx=>{
  await requireActiveUser(tx,userId);
  const {job,category}=await owned(tx,userId,mutationId),plan=mutationJobPlan(job),db=mongoCollections(tx.db);
  if(job.status!=="failed"||!job.active)throw new CareerError(409,"only failed mutations can resume");
  const target=category.propertySchemaV2?.find(definition=>definition.id===job.propertyId);
  if(category.schemaVersion!==plan.schemaVersion||category.version!==plan.categoryVersion||!target||mutationCanonicalJson(target)!==mutationCanonicalJson(plan.operation.target))throw new CareerError(409,"mutation schema changed; operator recovery is required");
  const guarded=await db.careerCategories.updateOne({_id:category._id,userId,version:category.version,schemaVersion:category.schemaVersion},{$inc:{writeVersion:1}},{session:tx.session});
  if(guarded.matchedCount!==1)throw new CareerError(409,"mutation schema changed");
  const now=new Date();
  const changed=await db.careerPropertyMutations.findOneAndUpdate({_id:job._id,userId,active:true,status:"failed",commitFence:job.commitFence,operationFingerprint:job.operationFingerprint},{$set:{status:"pending",leaseToken:null,leaseUntil:null,lastError:null,updatedAt:now},$inc:{commitFence:1}},{session:tx.session,returnDocument:"after"});
  if(!changed)throw new CareerError(409,"mutation state changed");
  await addMongoOutboxEvent(tx,{userId,topic:"career.property-mutation",idempotencyKey:`career-canonical-resume:${job._id}:${changed.commitFence}`,payload:{mutationId:job._id,operationFingerprint:job.operationFingerprint}});
  return response(changed);
 });
}
