import {createHash,randomUUID} from "node:crypto";
import {Binary} from "mongodb";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {createEmptyCareerDocument,encodeDocumentAsYUpdate,encodeDocumentStateVector} from "@expresso/editor";
import {mongoCollections,type CareerRecordDoc} from "@expresso/database";
import type {CareerPropertyDefinitionV2} from "@expresso/contracts";
import {createMongoFixture} from "../../../test/support/mongodb.js";
import {MongoIdentityService} from "../identity/index.js";
import {CanonicalCareerReadService,CareerProducerCoordinator} from "../career/index.js";
import {PreparedCareerDocumentWriter} from "../career-editor/index.js";
import {MongoJobMarketService} from "../jobs/index.js";
import {InterviewService,InterviewProductCareerIntegration,PreparedInterviewCareerWriter} from "./index.js";
import type {QuestionContext,QuestionWriter} from "./question-writer.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("canonical Interview question grounding",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,reader:CanonicalCareerReadService,userId:string,other:string,ownerCalls=0;
 beforeAll(async()=>{fixture=await createMongoFixture("b2intground");reader=new CanonicalCareerReadService(fixture.resource);const identity=new MongoIdentityService(fixture.resource);userId=(await identity.signup({email:randomUUID()+"@example.test",password:"correct-horse-battery",displayName:"Owner"})).user.id;other=(await identity.signup({email:randomUUID()+"@example.test",password:"correct-horse-battery",displayName:"Other"})).user.id;},60000);
 afterAll(async()=>fixture?.dispose());
 function service(writer:QuestionWriter|null=null){const owner={async commit():Promise<never>{ownerCalls++;throw new Error("Question grounding must not invoke a business owner");}},coordinator=new CareerProducerCoordinator(fixture.resource,owner,new PreparedCareerDocumentWriter(fixture.resource)),product=new InterviewProductCareerIntegration(fixture.resource,new PreparedInterviewCareerWriter(fixture.resource,coordinator),reader);return new InterviewService(fixture.resource,writer,null,null,product);}
 async function setup(withRequirements=false,firstMetric=false){
  const db=mongoCollections(fixture.resource.db),now=new Date(),categoryId=randomUUID(),propertyId=randomUUID(),option=randomUUID(),metricOption=randomUUID(),brewId=randomUUID(),records:string[]=[];
  const definition:CareerPropertyDefinitionV2={id:propertyId,key:"tags",name:"Tags",type:"multi_select",required:false,system:false,config:{options:[],legacyFreeformTags:true},order:0,version:1,deletedAt:null};
  await db.careerCategories.insertOne({_id:categoryId,userId,key:"ground-"+categoryId,name:"Grounding",icon:"folder",defaultView:"table",propertySchemaV2:[definition],schemaVersion:1,version:1,sortOrder:0,updatedAt:now});
  await db.careerPropertyOptions.insertMany([{_id:randomUUID(),userId,categoryId,propertyId,optionId:option,rawLabel:"JavaScript",version:1,createdAt:now},{_id:randomUUID(),userId,categoryId,propertyId,optionId:metricOption,rawLabel:"Measured 15%",version:1,createdAt:now},{_id:randomUUID(),userId:other,categoryId,propertyId,optionId:option,rawLabel:"ForeignSecret 99%",version:1,createdAt:now}]);
  for(const [rank,title]of["Alpha work","Beta work","Gamma work"].entries()){
   const recordId=randomUUID();records.push(recordId);const record:CareerRecordDoc={_id:recordId,userId,categoryId,title,status:"organized",origin:"manual",properties:{tags:{type:"multi_select",value:[randomUUID()]}},propertyValues:[{propertyDefinitionId:propertyId,type:"multi_select",value:[rank===0&&firstMetric?metricOption:option]}],bodyMd:"Stale physical metric 99%",version:1,createdAt:now,updatedAt:now,deletedAt:null,documentVersion:1};await db.careerRecords.insertOne(record);
   const document=createEmptyCareerDocument();document.content[0]!.text=[{text:"Built reliable workflows"}];const bytes=encodeDocumentAsYUpdate(document);await db.careerDocumentSnapshots.insertOne({_id:randomUUID(),userId,recordId,documentVersion:1,schemaVersion:1,content:JSON.parse(JSON.stringify(document)),stateVector:new Binary(encodeDocumentStateVector(document)),serverSequence:0,checksum:createHash("sha256").update(bytes).digest("hex"),actor:"user",createdAt:now});
  }
  let analysisId:string=randomUUID();const requirementIds:string[]=[];
  if(withRequirements){const quotes=["Database reliability experience is required.","Reliable collaboration is needed."],descriptionRaw=quotes.join("\n")+"\n"+"Role description ".repeat(30),submission=await new MongoJobMarketService(fixture.resource).submitPosting(userId,randomUUID(),{companyName:"Grounding",title:"Platform",descriptionRaw});analysisId=submission.jobAnalysisId;await db.jobAnalyses.updateOne({_id:analysisId},{$set:{status:"done",progressStage:"done",resultVersion:1}});for(const [orderNo,quote]of quotes.entries()){const requirementId=randomUUID(),start=descriptionRaw.indexOf(quote);requirementIds.push(requirementId);await db.jobPostingRequirements.insertOne({_id:requirementId,jobPostingId:submission.jobPostingId,orderNo,label:quote,kind:"must",sourceSpan:{start,end:start+quote.length,quote},extractorVersion:1,extractedAt:now});await db.requirementCoverages.insertOne({_id:userId+":"+requirementId,userId,requirementId,coverage:orderNo===0?"missing":"partial",coveredBy:[],computedAt:now});}}
  else await db.jobAnalyses.insertOne({_id:analysisId,userId,jobPostingId:null,inputType:"free",status:"done",progressStage:"done",resultVersion:1,targetVersion:1,attempts:0,attachments:[]});
  await db.brews.insertOne({_id:brewId,userId,jobAnalysisId:analysisId,mode:"solo",status:"draft",lengthPreset:"single",createdAt:now,updatedAt:now});await db.brewSources.insertMany(records.map((recordId,rank)=>({_id:randomUUID(),userId,brewId,recordId,rank,selectedBy:"auto" as const,excludedReason:null,score:0,reasonText:"Grounded",isSelected:true,updatedAt:now})));
  return{brewId,records,categoryId,requirementIds};
 }
 it("starts from nonmetric owned tag labels rather than UUID digits or foreign labels without owner writes",async()=>{
  const item=await setup(),db=mongoCollections(fixture.resource.db),before=await db.careerRecords.find({_id:{$in:item.records}}).sort({_id:1}).toArray(),category=await db.careerCategories.findOne({_id:item.categoryId}),outbox=await db.outboxEvents.countDocuments({userId});
  const started=await service().start(userId,item.brewId,"canonical-grounding-"+randomUUID());expect(started.questions).toHaveLength(3);expect(started.questions.every(question=>question.basis.type==="record_gap"&&item.records.includes(question.basis.recordId))).toBe(true);expect(ownerCalls).toBe(0);expect(await db.careerRecords.find({_id:{$in:item.records}}).sort({_id:1}).toArray()).toEqual(before);expect(await db.careerCategories.findOne({_id:item.categoryId})).toEqual(category);expect(await db.outboxEvents.countDocuments({userId})).toBe(outbox);
  await expect(service().start(other,item.brewId,"foreign-grounding-"+randomUUID())).rejects.toMatchObject({statusCode:404});
 });
 it("retains requirement deficits and uses the same label-bearing metric policy for writer bases",async()=>{
  const item=await setup(true,true);let seen:QuestionContext|undefined;const writer:QuestionWriter={async draft(context){seen=context;return context.options.slice(0,3).map((_,optionIndex)=>({optionIndex,text:"어떤 결과를 확인했나요?",rationale:"실제 근거를 보완합니다."}));},async rewrite(){return{text:"어떤 변화가 있었나요?",rationale:"근거를 보완합니다."};}};
  const result=await service(writer).start(userId,item.brewId,"canonical-requirements-"+randomUUID());expect(result.questions).toHaveLength(3);expect(seen?.options.filter(option=>option.basis.type==="requirement").map(option=>option.basis)).toEqual(expect.arrayContaining(item.requirementIds.map((requirementId,index)=>expect.objectContaining({requirementId,coverage:index===0?"missing":"partial"}))));const gaps=seen!.options.filter(option=>option.basis.type==="record_gap").map(option=>option.basis.type==="record_gap"?option.basis.recordId:"");expect(gaps).not.toContain(item.records[0]);expect(gaps).toEqual(item.records.slice(1));expect(JSON.stringify(seen)).not.toContain("ForeignSecret");expect(JSON.stringify(seen)).not.toContain("Stale physical");expect(ownerCalls).toBe(0);
 });
 it("preserves question generation in explicit legacy mode",async()=>{const item=await setup();await mongoCollections(fixture.resource.db).careerRecords.updateMany({_id:{$in:item.records}},{$set:{properties:{},bodyMd:"Built reliable workflows"}});expect((await new InterviewService(fixture.resource).start(userId,item.brewId,"legacy-grounding-"+randomUUID())).questions).toHaveLength(3);});
});