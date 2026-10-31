import {randomUUID} from "node:crypto";
import Fastify from "fastify";
import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {Decimal128} from "mongodb";
import {mongoCollections} from "@expresso/database";
import {createMongoFixture} from "../../../test/support/mongodb.js";
import {MongoIdentityService} from "../identity/index.js";
import {CareerService} from "../career/service.js";
import {CareerProducerCoordinator,CanonicalCareerReadService,careerProducerScopeFilter,validateCareerProducerIntent,type CareerProducerBusinessPort,type CareerProducerRecoveryPolicy} from "../career/index.js";
import {inTransaction} from "../../platform/mongo-transaction.js";
import {CareerDocumentService} from "./service.js";
import {PreparedCareerDocumentWriter} from "./prepared-document-writer.js";
import {ProductAiProposalIntegration} from "./product-ai-integration.js";
import {AiProposalService} from "./ai-proposals.js";
import {registerCareerDocumentRoutes} from "./routes.js";
import {registerErrorHandler} from "../../api/error-handler.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL??process.env.TEST_MONGODB_URL))("actual product AI producer integration",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,user:string,other:string;
 beforeAll(async()=>{fixture=await createMongoFixture("productai");const identity=new MongoIdentityService(fixture.resource);user=(await identity.signup({email:`product-ai-${randomUUID()}@example.test`,password:"correct-horse-battery",displayName:"AI"})).user.id;other=(await identity.signup({email:`product-ai-other-${randomUUID()}@example.test`,password:"correct-horse-battery",displayName:"다른 AI"})).user.id;},60000);
 afterAll(async()=>fixture?.dispose());
 async function scenario(mode:"business"|"mixed"="business",failure:"none"|"before"|"after"|"conflict"="none",requireBusinessOwner?:()=>void,recovery?:CareerProducerRecoveryPolicy){
  const property=randomUUID(),keep=randomUUID(),career=new CareerService(fixture.resource),category=await career.createCategory(user,{key:`pai_${randomUUID().replaceAll("-","")}`,name:"AI",icon:"folder",defaultView:"table",propertySchemaV2:[]});
  await mongoCollections(fixture.resource.db).careerCategories.updateOne({_id:category.id},{$set:{schemaVersion:1,propertySchemaV2:[{id:property,key:"note",name:"메모",type:"text",required:false,system:false,config:{},order:0,version:1,deletedAt:null},{id:keep,key:"exact",name:"정확한 수치",type:"number",required:false,system:false,config:{},order:1,version:1,deletedAt:null}]}});
  const record=(await career.createRecord(user,randomUUID(),{categoryId:category.id,title:"원본",properties:{note:{type:"text",value:"stale compatibility"}},bodyMd:"원문"})).record;
  await mongoCollections(fixture.resource.db).careerRecords.updateOne({_id:record.id},{$set:{propertyValues:[{propertyDefinitionId:property,type:"text",value:"before"},{propertyDefinitionId:keep,type:"number",value:Decimal128.fromString("12345678901234567890.123400")}]}});
  let block="",calls=0,fail=failure!="none";
  const docs=new CareerDocumentService(fixture.resource,"product-ai-secret",undefined,undefined,{async generate(input){expect(input.canonicalPropertyValues?.find(value=>value.propertyDefinitionId===keep)).toMatchObject({value:"12345678901234567890.123400"});block=input.selectionBlockIds[0]!;return{summary:"AI 준비",commands:mode==="mixed"?[{type:"setText" as const,blockId:block,text:"AI 본문"}]:[],propertyChanges:[{propertyId:property,canonicalPreviousValue:{propertyDefinitionId:property,type:"text" as const,value:"before"},canonicalNextValue:{propertyDefinitionId:property,type:"text" as const,value:"after"}}]};}});
  const business:CareerProducerBusinessPort={async commit(request){calls++;if(fail&&(failure==="before"||failure==="conflict")){fail=false;throw Object.assign(new Error("owner unavailable"),{statusCode:failure==="conflict"?412:503});}const result=await inTransaction(fixture.resource,async tx=>{const db=mongoCollections(tx.db),source=await db.careerAiProposals.findOne(careerProducerScopeFilter(request),{session:tx.session}),intent=validateCareerProducerIntent(source!.writerIntegration);if(intent.businessResult)return intent.businessResult;if(intent.business?.kind!=="patch")throw new Error("patch required");const patch=intent.business.patches[0]!,delta="propertyValues" in patch?patch.propertyValues:undefined;if(!delta)throw new Error("selected delta required");const before=await db.careerRecords.findOne({_id:record.id,userId:user,version:intent.business.expectedVersion},{session:tx.session});if(!before)throw Object.assign(new Error("stale"),{statusCode:412});const next=[...before.propertyValues!.filter(value=>!delta.set.some(item=>item.propertyDefinitionId===value.propertyDefinitionId)&&!delta.unsetPropertyIds.includes(value.propertyDefinitionId)),...delta.set];await db.careerRecords.updateOne({_id:record.id,userId:user,version:before.version},{$set:{propertyValues:next.map(value=>value.type==="number"&&typeof value.value==="string"?{...value,value:Decimal128.fromString(value.value)}:value) as never,updatedAt:new Date()},$inc:{version:1}},{session:tx.session});const receipt={data:{id:record.id,userId:user,categoryId:category.id,title:"원본",status:"draft" as const,version:before.version+1,propertyValues:next.map(value=>value.type==="number"?{...value,value:value.value.toString()}:value),updatedAt:new Date().toISOString()},replayed:false};await db.careerAiProposals.updateOne(careerProducerScopeFilter(request),{$set:{"writerIntegration.businessResult":receipt}},{session:tx.session});return receipt;});if(fail&&failure==="after"){fail=false;throw Object.assign(new Error("lost owner response"),{statusCode:503});}return result as never;}};
  const coordinator=new CareerProducerCoordinator(fixture.resource,business,new PreparedCareerDocumentWriter(fixture.resource),recovery);
  const integration=new ProductAiProposalIntegration(fixture.resource,docs,coordinator,new CanonicalCareerReadService(fixture.resource),{...(requireBusinessOwner?{requireBusinessOwner}:{})});docs.setProductAiIntegration(integration);
  const bootstrap=await docs.bootstrap(user,record.id),proposal=await docs.createAiProposal(user,record.id,{selection:{blockIds:[bootstrap.document.content[0]!.id]},prompt:"정리"});
  const input={recordId:record.id,proposalId:proposal.proposalId,expectedDocumentVersion:0,commandIndexes:mode==="mixed"?[0]:[],propertyChangeIndexes:[0]};return{record,property,keep,docs,integration,input,proposal,calls:()=>calls};
 }
 it("signals a proven selected-property rejection before preparation and allows a new body-only selection",async()=>{
  const s=await scenario("mixed"),db=mongoCollections(fixture.resource.db);
  await db.careerRecords.updateOne({_id:s.record.id},{$set:{"propertyValues.0.value":"human change"}});
  const before=await db.careerRecords.findOne({_id:s.record.id});
  await expect(s.docs.applyAiProposalOperation(user,s.record.id,s.input,"pre-prepare-refusal-key")).rejects.toMatchObject({statusCode:409,publicDetails:{aiApplyRejection:{recordId:s.record.id,proposalId:s.proposal.proposalId,state:"not-prepared"}}});
  const app=Fastify({logger:false});app.decorateRequest("auth",null);registerErrorHandler(app);registerCareerDocumentRoutes(app,{service:s.docs,authenticateRequest:async request=>{request.auth={user:{id:user}} as never;}});
  try {
   const response=await app.inject({method:"POST",url:`/v1/career/records/${s.record.id}/ai-proposals/${s.proposal.proposalId}/apply`,headers:{"idempotency-key":"pre-prepare-http-refusal-key"},payload:s.input});
   expect(response.statusCode).toBe(409);expect(response.json().error).toMatchObject({code:"CONFLICT",details:{aiApplyRejection:{recordId:s.record.id,proposalId:s.proposal.proposalId,state:"not-prepared"}}});
   expect(Object.keys(response.json().error.details)).toEqual(["aiApplyRejection"]);expect(response.body).not.toContain("human change");expect(response.body).not.toContain(user);
  } finally {await app.close();}
  expect((await db.careerAiProposals.findOne({_id:s.proposal.proposalId}))?.writerIntegration).toBeUndefined();expect(s.calls()).toBe(0);expect(await db.careerRecords.findOne({_id:s.record.id})).toEqual(before);
  expect((await s.docs.applyAiProposalOperation(user,s.record.id,{...s.input,propertyChangeIndexes:[]},"body-only-after-refusal-key")).status).toBe(200);
  expect(s.calls()).toBe(0);expect((await s.docs.bootstrap(user,s.record.id)).document.content[0]?.text?.[0]?.text).toBe("AI 본문");
  const after=await db.careerRecords.findOne({_id:s.record.id});expect(after?.propertyValues).toEqual(before?.propertyValues);expect(after?.version).toBe(before?.version);
 });
 it("returns the existing owner for a changed request instead of treating owner409 as pre-prepare rejection",async()=>{
  const s=await scenario("mixed","before"),db=mongoCollections(fixture.resource.db);
  expect((await s.docs.applyAiProposalOperation(user,s.record.id,s.input,"original-owner-key")).status).toBe(202);
  const before=await db.careerAiProposals.findOne({_id:s.proposal.proposalId});
  const error=await s.docs.applyAiProposalOperation(user,s.record.id,{...s.input,propertyChangeIndexes:[]},"changed-owner-key").catch(error=>error);
  expect(error).toMatchObject({statusCode:409,publicDetails:{operation:{operationId:before!.writerIntegration!.operationId,producer:"ai-proposal",recordId:s.record.id}}});expect(error.publicDetails.aiApplyRejection).toBeUndefined();
  expect((await db.careerAiProposals.findOne({_id:s.proposal.proposalId}))?.writerIntegration).toEqual(before?.writerIntegration);expect(s.calls()).toBe(1);
  expect((await s.docs.applyAiProposalOperation(user,s.record.id,s.input,"original-owner-key")).status).toBe(200);expect(s.calls()).toBe(2);
 });
 it("uses one canonical business owner, keeps exact unselected values and old completed response",async()=>{
  const s=await scenario(),legacy=vi.spyOn(AiProposalService.prototype,"apply");try{const first=await s.docs.applyAiProposalOperation(user,s.record.id,s.input);expect(first.status).toBe(200);expect(first.body).toMatchObject({data:{status:"applied",undoScope:"none",businessChangesRetained:true}});expect(await s.docs.applyAiProposalOperation(user,s.record.id,s.input)).toEqual(first);expect(s.calls()).toBe(1);expect(legacy).not.toHaveBeenCalled();const record=await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:s.record.id});expect(record?.version).toBe(2);expect(record?.properties.note).toEqual({type:"text",value:"stale compatibility"});expect(record?.propertyValues?.find(value=>value.propertyDefinitionId===s.keep)?.value?.toString()).toBe("12345678901234567890.123400");expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.countDocuments({recordId:s.record.id})).toBe(0);}finally{legacy.mockRestore();}
 });
 it("returns durable202 after a lost owner response and worker execute finalizes without another commit",async()=>{
  const s=await scenario("business","after"),pending=await s.docs.applyAiProposalOperation(user,s.record.id,s.input,"same-product-ai-key");expect(pending).toMatchObject({status:202,body:{data:{producer:"ai-proposal",state:"retry",owners:{business:"completed",document:"not-required"}}}});const row=await mongoCollections(fixture.resource.db).careerAiProposals.findOne({_id:s.proposal.proposalId});await s.integration.execute(row!.writerIntegration!);expect(s.calls()).toBe(1);expect((await s.docs.applyAiProposalOperation(user,s.record.id,s.input,"same-product-ai-key")).status).toBe(200);await expect(s.docs.applyAiProposalOperation(user,s.record.id,{...s.input,propertyChangeIndexes:[]},"same-product-ai-key")).rejects.toMatchObject({statusCode:400});expect((await s.docs.getAiProposal(user,s.record.id,s.proposal.proposalId)).status).toBe("applied");
 });
  it("does not publish a late A completion over newer B while receipt replay remains idempotent",async()=>{
  const s=await scenario("business","after"),live:string[]=[];s.docs.setAiProposalPublisher((_id,proposal)=>live.push(proposal.proposalId));
  const pending=await s.docs.applyAiProposalOperation(user,s.record.id,s.input,"late-A-completion-replay");expect(pending.status).toBe(202);
  const row=await mongoCollections(fixture.resource.db).careerAiProposals.findOne({_id:s.proposal.proposalId});
  const nextDocuments=new CareerDocumentService(fixture.resource,"late-B-proposal-secret",undefined,undefined,{async generate(input){return {summary:"Latest B",commands:[{type:"setText",blockId:input.selectionBlockIds[0]!,text:"Latest B"}],propertyChanges:[]};}}); const bootstrap=await s.docs.bootstrap(user,s.record.id),b=await nextDocuments.createAiProposal(user,s.record.id,{selection:{blockIds:[bootstrap.document.content[0]!.id]},prompt:"Latest B"});
  await mongoCollections(fixture.resource.db).careerAiProposals.updateOne({_id:b.proposalId},{$set:{createdAt:new Date(Date.parse(s.proposal.createdAt)+1000)}});
  live.length=0;await s.integration.execute(row!.writerIntegration!);
  expect(live).toEqual([]);expect(s.calls()).toBe(1);
  expect((await s.docs.getAiProposal(user,s.record.id,s.proposal.proposalId)).status).toBe("applied");
  expect((await s.docs.getAiProposal(user,s.record.id,b.proposalId)).status).toBe("ready");
  expect((await s.docs.applyAiProposalOperation(user,s.record.id,s.input,"late-A-completion-replay")).status).toBe(200);
  expect(s.calls()).toBe(1);expect((await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:s.record.id}))!.version).toBe(2);
 });
 it("reports no documentary undo target for business-only apply and keeps applied values",async()=>{
  const s=await scenario();await s.docs.applyAiProposalOperation(user,s.record.id,s.input);expect(await s.docs.undoAiProposalOperation(user,s.record.id,{recordId:s.record.id,proposalId:s.proposal.proposalId,expectedDocumentVersion:0})).toEqual({status:200,body:{data:{outcome:"no-document-target",scope:"none",businessChangesRetained:true}}});expect((await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:s.record.id}))?.version).toBe(2);expect((await s.docs.getAiProposal(user,s.record.id,s.proposal.proposalId)).status).toBe("applied");
 });
 it("mixed undo restores only the document owner and keeps applied canonical business changes",async()=>{
  const s=await scenario("mixed");expect((await s.docs.applyAiProposalOperation(user,s.record.id,s.input)).status).toBe(200);expect((await s.docs.bootstrap(user,s.record.id)).document.content[0]?.text?.[0]?.text).toBe("AI 본문");const undo={recordId:s.record.id,proposalId:s.proposal.proposalId,expectedDocumentVersion:1};const first=await s.docs.undoAiProposalOperation(user,s.record.id,undo);expect(first.status).toBe(200);expect(first.body).toHaveProperty("documentVersion",2);expect((await s.docs.bootstrap(user,s.record.id)).document.content[0]?.text?.[0]?.text).toBe("원문");expect((await s.docs.undoAiProposalOperation(user,s.record.id,undo)).status).toBe(200);expect(s.calls()).toBe(1);expect((await s.docs.getAiProposal(user,s.record.id,s.proposal.proposalId)).status).toBe("applied");expect((await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:s.record.id}))?.version).toBe(2);expect(await mongoCollections(fixture.resource.db).careerDocumentUpdates.countDocuments({recordId:s.record.id})).toBe(2);
 });
 it("allows cancellation before an owner receipt and rejects cancellation after partial commitment",async()=>{
  const before=await scenario("business","before");expect((await before.docs.applyAiProposalOperation(user,before.record.id,before.input)).status).toBe(202);await before.docs.cancelAiProposal(user,before.record.id,{recordId:before.record.id,proposalId:before.proposal.proposalId});expect((await before.docs.getAiProposal(user,before.record.id,before.proposal.proposalId)).status).toBe("cancelled");const after=await scenario("mixed","after");expect((await after.docs.applyAiProposalOperation(user,after.record.id,after.input)).status).toBe(202);await expect(after.docs.rejectAiProposal(user,after.record.id,{recordId:after.record.id,proposalId:after.proposal.proposalId})).rejects.toMatchObject({statusCode:409});await expect(after.docs.applyAiProposalOperation(other,after.record.id,after.input)).rejects.toMatchObject({statusCode:404});expect((await after.docs.getAiProposal(user,after.record.id,after.proposal.proposalId)).status).toBe("ready");
 });
 it("preserves exact selected Decimal128 pairs and rejects unrepresentable legacy previous values before intent",async()=>{
  const s=await scenario(),reads=new CanonicalCareerReadService(fixture.resource),bootstrap=await s.docs.bootstrap(user,s.record.id),selection={blockIds:[bootstrap.document.content[0]!.id]};
  const unsafe=new AiProposalService(fixture.resource,s.docs,{async generate(){return{summary:"손실 없는 검증",commands:[],propertyChanges:[{propertyId:s.keep,previousValue:{type:"number",value:12345678901234567000},nextValue:{type:"number",value:2}}]};}});unsafe.setProductWriter(reads);
  await expect(unsafe.create(user,s.record.id,{selection,prompt:"수치 변경"})).rejects.toMatchObject({statusCode:409});expect(await mongoCollections(fixture.resource.db).careerAiProposals.countDocuments({recordId:s.record.id,writerIntegration:{$exists:true}})).toBe(0);
  const previous={propertyDefinitionId:s.keep,type:"number" as const,value:"12345678901234567890.123400"},next={...previous,value:"12345678901234567890.123500"};const exact=new AiProposalService(fixture.resource,s.docs,{async generate(){return{summary:"정확한 수치",commands:[],propertyChanges:[{propertyId:s.keep,canonicalPreviousValue:previous,canonicalNextValue:next}]};}});exact.setProductWriter(reads);const proposal=await exact.create(user,s.record.id,{selection,prompt:"수치 변경"});expect(proposal.propertyChanges[0]).toMatchObject({canonicalPreviousValue:previous,canonicalNextValue:next});
  expect((await s.docs.applyAiProposalOperation(user,s.record.id,{...s.input,proposalId:proposal.proposalId})).status).toBe(200);expect((await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:s.record.id}))?.propertyValues?.find(value=>value.propertyDefinitionId===s.keep)?.value?.toString()).toBe(next.value);
 });
 it("uses only authenticated private options in prompt and generation validation",async()=>{
  const s=await scenario(),tags=randomUUID(),own=randomUUID(),foreign=randomUUID(),db=mongoCollections(fixture.resource.db),category=await db.careerCategories.findOne({_id:s.record.categoryId});await db.careerCategories.updateOne({_id:s.record.categoryId},{$set:{propertySchemaV2:[...category!.propertySchemaV2!,{id:tags,key:"tags",name:"태그",type:"multi_select",required:false,system:false,config:{options:[],legacyFreeformTags:true},order:2,version:1,deletedAt:null}]}});
  for(const [owner,option,label] of [[user,own," Own "],[other,foreign,"Foreign"]] as const)await db.careerPropertyOptions.insertOne({_id:randomUUID(),userId:owner,categoryId:s.record.categoryId,propertyId:tags,optionId:option,rawLabel:label,version:1,createdAt:new Date()});
  const bootstrap=await s.docs.bootstrap(user,s.record.id);for(const [option,accepted] of [[foreign,false],[own,true]] as const){const ai=new AiProposalService(fixture.resource,s.docs,{async generate(input){const definition=input.propertyDefinitions!.find(value=>value.id===tags)!;expect(JSON.stringify(definition.config)).toContain(own);expect(JSON.stringify(definition.config)).not.toContain(foreign);return{summary:"태그 제안",commands:[],propertyChanges:[{propertyId:tags,canonicalPreviousValue:null,canonicalNextValue:{propertyDefinitionId:tags,type:"multi_select",value:[option]}}]};}});ai.setProductWriter(new CanonicalCareerReadService(fixture.resource));const pending=ai.create(user,s.record.id,{selection:{blockIds:[bootstrap.document.content[0]!.id]},prompt:"태그"});if(!accepted)await expect(pending).rejects.toMatchObject({statusCode:409});else{const proposal=await pending;expect((await s.docs.applyAiProposalOperation(user,s.record.id,{...s.input,proposalId:proposal.proposalId})).status).toBe(200);}}
 });
 it("marks canonical-read generation failures conflicted without leaving streaming state",async()=>{
  const s=await scenario(),bootstrap=await s.docs.bootstrap(user,s.record.id),read=vi.spyOn(s.integration.reads,"getRecord").mockRejectedValueOnce(Object.assign(new Error("canonical read unavailable"),{statusCode:503}));
  try{await expect(s.docs.createAiProposal(user,s.record.id,{selection:{blockIds:[bootstrap.document.content[0]!.id]},prompt:"정리"})).rejects.toMatchObject({statusCode:503});const failed=await mongoCollections(fixture.resource.db).careerAiProposals.findOne({recordId:s.record.id,_id:{$ne:s.proposal.proposalId}});expect(failed).toMatchObject({status:"conflicted",progress:null});expect(failed?.writerIntegration).toBeUndefined();}finally{read.mockRestore();}
 });
 it("rejects missing business owner configuration before intent but allows document-only apply and undo",async()=>{
  const requireOwner=vi.fn(()=>{throw Object.assign(new Error("AI business owner unavailable"),{statusCode:503});}),s=await scenario("mixed","none",requireOwner);
  await expect(s.docs.applyAiProposalOperation(user,s.record.id,s.input)).rejects.toMatchObject({statusCode:503});expect((await mongoCollections(fixture.resource.db).careerAiProposals.findOne({_id:s.proposal.proposalId}))?.writerIntegration).toBeUndefined();expect((await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:s.record.id}))?.version).toBe(1);
  expect((await s.docs.applyAiProposalOperation(user,s.record.id,{...s.input,propertyChangeIndexes:[]})).status).toBe(200);expect(s.calls()).toBe(0);expect(requireOwner).toHaveBeenCalledTimes(1);expect((await s.docs.undoAiProposalOperation(user,s.record.id,{recordId:s.record.id,proposalId:s.proposal.proposalId,expectedDocumentVersion:1})).status).toBe(200);expect(requireOwner).toHaveBeenCalledTimes(1);
 });
 it("replays a frozen business receipt and finalizes its document despite later missing owner configuration",async()=>{
  let available=true;const requireOwner=vi.fn(()=>{if(!available)throw Object.assign(new Error("AI business owner unavailable"),{statusCode:503});}),s=await scenario("mixed","after",requireOwner);
  expect((await s.docs.applyAiProposalOperation(user,s.record.id,s.input,"existing-ai-operation")).status).toBe(202);available=false;expect((await s.docs.applyAiProposalOperation(user,s.record.id,s.input,"existing-ai-operation")).status).toBe(200);expect(s.calls()).toBe(1);expect(requireOwner).toHaveBeenCalledTimes(1);
 });
 it("returns terminal409 recovery-required for unsafe owner conflict and does not retry business or fall back",async()=>{
  const s=await scenario("mixed","conflict",undefined,{maxAttempts:3,classify:()=>"blocked"}),legacy=vi.spyOn(AiProposalService.prototype,"apply");
  try{for(let attempt=0;attempt<2;attempt++)await expect(s.docs.applyAiProposalOperation(user,s.record.id,s.input)).rejects.toMatchObject({statusCode:409,publicErrorCode:"RECOVERY_REQUIRED",publicDetails:{operation:{state:"recovery-required",retryable:false,owners:{business:"pending",document:"pending"}}}});expect(s.calls()).toBe(1);expect(legacy).not.toHaveBeenCalled();expect((await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:s.record.id}))?.version).toBe(1);await s.docs.cancelAiProposal(user,s.record.id,{recordId:s.record.id,proposalId:s.proposal.proposalId});expect((await s.docs.getAiProposal(user,s.record.id,s.proposal.proposalId)).status).toBe("cancelled");}finally{legacy.mockRestore();}
 });
 it("recovers a lost apply response using the frozen request after the document receipt advances its version",async()=>{
  const s=await scenario("mixed","after"),key="frozen-ai-response-key";
  const pending=await s.docs.applyAiProposalOperation(user,s.record.id,s.input,key);expect(pending.status).toBe(202);
  const db=mongoCollections(fixture.resource.db),row=await db.careerAiProposals.findOne({_id:s.proposal.proposalId});
  await s.integration.execute(row!.writerIntegration!);
  expect((await s.docs.bootstrap(user,s.record.id)).documentVersion).toBe(1);
  const before=await db.careerRecords.findOne({_id:s.record.id}),updates=await db.careerDocumentUpdates.countDocuments({recordId:s.record.id}),revisions=await db.careerRecordRevisions.countDocuments({recordId:s.record.id});
  expect((await s.docs.applyAiProposalOperation(user,s.record.id,s.input,key)).status).toBe(200);
  await expect(s.docs.applyAiProposalOperation(user,s.record.id,{...s.input,expectedDocumentVersion:1},key)).rejects.toMatchObject({statusCode:409});
  expect(await db.careerRecords.findOne({_id:s.record.id})).toEqual(before);expect(s.calls()).toBe(1);
  expect(await db.careerDocumentUpdates.countDocuments({recordId:s.record.id})).toBe(updates);
  expect(await db.careerRecordRevisions.countDocuments({recordId:s.record.id})).toBe(revisions);
 },30_000);});
