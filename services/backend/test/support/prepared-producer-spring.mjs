import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient,Decimal128 } from "mongodb";
import { mongoCollections } from "@expresso/database";
import { CareerService,CareerProducerCoordinator,createSpringCareerProducerPort,createCareerProducerCredential } from "../../dist/modules/career/index.js";
import { CareerDocumentService,PreparedCareerDocumentWriter,PreparedAiProposalService } from "../../dist/modules/career-editor/index.js";
import { MongoIdentityService } from "../../dist/modules/identity/index.js";
import { PreparedInterviewCareerWriter } from "../../dist/modules/interview/index.js";
const [uri,database,baseUrl,aiKey,interviewKey]=process.argv.slice(2);
const client=new MongoClient(uri);
await client.connect();
try{
 const context={client,db:client.db(database)},db=mongoCollections(context.db);
 const userId=(await new MongoIdentityService(context).signup({email:"bridge-"+randomUUID()+"@example.com",password:"correct-horse-battery",displayName:"실제 통합"})).user.id;
 const career=new CareerService(context),documents=new CareerDocumentService(context),docOwner=new PreparedCareerDocumentWriter(context);
 let loseNext=false;
 const port=createSpringCareerProducerPort(context,baseUrl,scope=>createCareerProducerCredential(scope,Buffer.from(scope.producer==="ai-proposal"?aiKey:interviewKey)),
  async(url,init)=>{const response=await fetch(url,init);if(loseNext && response.ok){loseNext=false;throw new Error("disposable lost acknowledgement");}return response;});
 const coordinator=new CareerProducerCoordinator(context,port,docOwner),ai=new PreparedAiProposalService(context,documents,coordinator);
 const propertyId=randomUUID(),keepId=randomUUID();
 const category=await career.createCategory(userId,{key:"bridge_"+randomUUID().replaceAll("-",""),name:"통합",icon:"folder",defaultView:"table",propertySchemaV2:[]});
 const definition=(id,key,type,order)=>({id,key,name:key,type,required:false,system:false,config:{},order,version:1,deletedAt:null});
 await db.careerCategories.updateOne({_id:category.id},{$set:{propertySchemaV2:[definition(propertyId,"note","text",0),definition(keepId,"keep","number",1)]}});
 const aiResults=[];
 for(const kind of ["business","document","mixed"]){
  const record=(await career.createRecord(userId,randomUUID(),{categoryId:category.id,title:"기록",properties:{note:{type:"text",value:"legacy"}},bodyMd:"원문"})).record;
  await db.careerRecords.updateOne({_id:record.id},{$set:{propertyValues:[{propertyDefinitionId:propertyId,type:"text",value:"before"},{propertyDefinitionId:keepId,type:"number",value:Decimal128.fromString("12345678901234567890.123400")}]}});
  const bootstrap=await documents.bootstrap(userId,record.id),blockId=bootstrap.document.content[0].id,proposalId=randomUUID(),now=new Date();
  await db.careerAiProposals.insertOne({_id:proposalId,userId,recordId:record.id,status:"ready",baseDocumentVersion:0,selection:{blockIds:[blockId]},prompt:"통합",summary:"통합",commands:[{type:"setText",blockId,text:"문서 변경"}],propertyChanges:[{propertyId,previousValue:{type:"text",value:"before"},nextValue:{type:"text",value:"after"}}],progress:null,beforeSnapshotId:null,afterSnapshotId:null,beforeChecksum:null,afterChecksum:null,revisionId:null,appliedDocumentVersion:null,expiresAt:new Date(Date.now()+3600000),createdAt:now,updatedAt:now});
  const scope=await ai.prepare(userId,record.id,{recordId:record.id,proposalId,operationId:randomUUID(),expectedDocumentVersion:0,commandIndexes:kind==="business"?[]:[0],propertyChangeIndexes:kind==="document"?[]:[0]});
  if(kind==="mixed"){loseNext=true;await assert.rejects(ai.execute(scope));assert.equal((await coordinator.pending(scope)).state,"retry");}
  const result=await ai.execute(scope);
  assert.equal(result.state,"completed");
  await ai.execute(scope);
  const after=await db.careerRecords.findOne({_id:record.id});
  assert.equal(after.version,kind==="document"?1:2);
  assert.equal(after.documentVersion,kind==="business"?0:1);
  assert.equal(after.propertyValues.find(v=>v.propertyDefinitionId===keepId).value.toString(),"12345678901234567890.123400");
  assert.equal(after.properties.note.value,"legacy");
  assert.equal(after.bodyMd.trim(),kind==="business"?"원문":"문서 변경");
  aiResults.push({kind,state:result.state,recordId:record.id,sourceId:proposalId,version:after.version,documentVersion:after.documentVersion});
 }
 // Spring fixture가 기본 seed를 지웠어도 인터뷰의 system category를 테스트 내부에서 준비합니다.
 const experience=(await career.listCategories(userId)).find(category=>category.key==="experience");
 await db.careerCategories.updateOne({_id:experience.id},{$set:{propertySchemaV2:[]}});
 const sessionId=randomUUID(),questionId=randomUUID(),now=new Date();
 await db.interviewSessions.insertOne({_id:sessionId,userId,brewId:randomUUID(),status:"open",questionCount:3,currentOrder:0,answeredCount:0,version:1,createdAt:now,updatedAt:now});
 await db.questions.insertOne({_id:questionId,userId,interviewSessionId:sessionId,orderNo:0,text:"경험?",skipped:false,basis:{},active:true,variant:0,createdAt:now});
 await db.questions.insertMany([1,2].map(orderNo=>({_id:randomUUID(),userId,interviewSessionId:sessionId,orderNo,text:"추가 질문",skipped:false,basis:{},active:true,variant:0,createdAt:now})));
 const interview=new PreparedInterviewCareerWriter(context,coordinator);
 const input={inputType:"text",transcript:"a".repeat(119)+"😀"};
 const operation=await interview.prepareAnswer(userId,sessionId,questionId,"bridge-answer-"+randomUUID(),input);
 loseNext=true;
 await assert.rejects(interview.executeAnswer(userId,operation._id));
 assert.equal((await db.answers.findOne({_id:operation.answerId})).writerPending,true);
 assert.equal((await db.interviewSessions.findOne({_id:sessionId})).answeredCount,0);
 const first=await interview.retryAnswer(userId,operation._id);
 assert.deepEqual(await interview.executeAnswer(userId,operation._id),first);
 const created=await db.careerRecords.findOne({_id:first.answer.createdRecordId});
 assert.equal(created.origin,"interview");assert.equal(created.title,"a".repeat(119));assert.equal(created.version,1);assert.equal(created.documentVersion,1);assert.equal(created.bodyMd.trim(),input.transcript);
 const secondOp=await interview.prepareAnswer(userId,sessionId,questionId,"bridge-revision-"+randomUUID(),{inputType:"text",transcript:"a".repeat(118)+"😀"});
 const second=await interview.executeAnswer(userId,secondOp._id);
 assert.deepEqual(await interview.executeAnswer(userId,operation._id),first);
 const prior=await db.careerRecords.findOne({_id:created._id}),docVersion=prior.documentVersion;
 assert.equal(prior.title,"a".repeat(118)+"😀");
 const clean=await interview.prepareCleanup(userId,operation.answerId,"bridge-cleanup-"+randomUUID(),second.answer.version,
 {kind:"patch",recordId:created._id,expectedVersion:prior.version,expectedCategoryVersion:1,patches:[{title:"정리된 제목"},{status:"organized"}]});
 await interview.executeCleanup(userId,clean._id);
 const final=await db.careerRecords.findOne({_id:created._id});
 assert.equal(final.status,"organized");assert.equal(final.documentVersion,docVersion);assert.equal(final.bodyMd,prior.bodyMd);
 assert.equal(await db.answers.countDocuments({questionId}),1);
 assert.equal((await db.interviewSessions.findOne({_id:sessionId})).answeredCount,1);
 console.log(JSON.stringify({userId,ai:aiResults,interview:{state:"completed",recordId:created._id,sourceId:operation._id,answerId:operation.answerId,version:final.version,documentVersion:final.documentVersion},receipts:await context.db.collection("career_command_idempotency").countDocuments({userId})}));
}finally{await client.close();}