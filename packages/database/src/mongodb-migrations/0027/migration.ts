import type { Db,Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";
const id={bsonType:"string",pattern:"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"};
const count={bsonType:["int","long","double"],minimum:0,maximum:Number.MAX_SAFE_INTEGER,multipleOf:1};
const scope={bsonType:"object",required:["producer","userId","sourceId","operationId","fingerprint"],properties:{
 producer:{enum:["ai-proposal","interview"]},userId:id,sourceId:id,operationId:id,fingerprint:{bsonType:"string",pattern:"^[a-f0-9]{64}$"},
}};
const intent={...scope,required:[...scope.required,"business","document","state","leaseToken","leaseUntil","attempts","fence","businessResult","documentResult","lastError","createdAt","updatedAt"],properties:{...scope.properties,
 business:{bsonType:["object","null"]},document:{bsonType:["object","null"]},state:{enum:["pending","running","retry","completed","cancelled"]},
 leaseToken:{bsonType:["string","null"]},leaseUntil:{bsonType:["string","null"]},attempts:count,fence:count,
 businessResult:{bsonType:["object","null"]},documentResult:{bsonType:["object","null"]},lastError:{bsonType:["string","null"]},
 createdAt:{bsonType:"string"},updatedAt:{bsonType:"string"},
}};
async function extend(db:Db,name:string,fields:Document){
 const info=await db.listCollections({name}).next();
 if(!info || !("options" in info) || !info.options?.validator?.$jsonSchema)throw new Error("producer source validator missing");
 const validator=structuredClone(info.options.validator) as Document;
 Object.assign(validator.$jsonSchema.properties,fields);
 await db.command({collMod:name,validator,validationLevel:"strict",validationAction:"error"});
}
export async function careerProducerPreparationSteps():Promise<MongoMigrationStep[]>{
 return [
 {id:"career_ai_proposals:durable_intent",async run(db){
  await extend(db,"career_ai_proposals",{writerIntegration:intent,writerIntegrationHistory:{bsonType:"array",items:intent}});
  // 준비용 intent는 완료·부분 성공 receipt를 보존하고 기존 Proposal만 원래 TTL을 사용합니다.
  const coll=db.collection("career_ai_proposals");
  if(await coll.indexExists("career_ai_proposal_expiry"))await coll.dropIndex("career_ai_proposal_expiry");
  await coll.createIndex({expiresAt:1},{name:"career_ai_proposal_expiry",expireAfterSeconds:0,partialFilterExpression:{writerIntegration:{$eq:null}}});
 }},
 {id:"interview_career_operations:collection",async run(db){
  const name="interview_career_operations";
  const properties:Document={_id:id,userId:id,sessionId:id,questionId:id,answerId:id,recordId:{bsonType:["string","null"]},
   expectedAnswerVersion:{...count,bsonType:["int","long","double","null"]},answerVersion:count,
   inputIdempotencyKey:{bsonType:"string",minLength:1,maxLength:128},requestHash:{bsonType:"string",pattern:"^[a-f0-9]{64}$"},
   kind:{enum:["answer","cleanup"]},input:{bsonType:"object"},active:{bsonType:"bool"},writerIntegration:intent,result:{bsonType:["object","null"]},
   createdAt:{bsonType:"date"},updatedAt:{bsonType:"date"}};
  const validator={$jsonSchema:{bsonType:"object",required:Object.keys(properties),additionalProperties:false,properties}};
  if(await db.listCollections({name}).hasNext())await db.command({collMod:name,validator,validationLevel:"strict",validationAction:"error"});
  else await db.createCollection(name,{validator,validationLevel:"strict",validationAction:"error"});
  await db.collection(name).createIndexes([
   {name:"interview_writer_input_key",key:{userId:1,inputIdempotencyKey:1},unique:true},
   {name:"interview_writer_active_question",key:{userId:1,questionId:1},unique:true,partialFilterExpression:{active:true}},
   {name:"interview_writer_recovery",key:{"writerIntegration.state":1,"writerIntegration.leaseUntil":1}},
  ]);
 }},
 {id:"answers:pending_writer",async run(db){await extend(db,"answers",{writerPending:{bsonType:"bool"},writerOperationId:id,writeVersion:count});await extend(db,"questions",{writeVersion:count});await extend(db,"interview_sessions",{writeVersion:count});}},
 {id:"career_records:document_reservation",async run(db){await extend(db,"career_records",{documentReservation:scope});}},
 ];
}