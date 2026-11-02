import {randomUUID,createHash} from "node:crypto";
import {Decimal128} from "mongodb";
import {afterAll,beforeAll,describe,it,expect} from "vitest";
import {careerDocumentToBlockNote} from "@expresso/editor/blocknote";
import {syncBlockNoteDocument} from "../career-editor/blocknote-document.js";
import {mongoCollections} from "@expresso/database";
import {GenerationOutputSchema,type CareerPropertyDefinitionV2} from "@expresso/contracts";
import {createMongoFixture} from "../../../test/support/mongodb.js";
import {MongoIdentityService} from "../identity/index.js";
import {MaterialsService} from "../materials/index.js";
import {RecipeService} from "../recipe/index.js";
import {DeterministicRecipePlanner} from "../recipe/planner.js";
import {GenerationService} from "../generation/index.js";
import type {WriterContext} from "../generation/writer.js";
import {AccountLifecycleService} from "../account-lifecycle/index.js";
import {JobMarketService} from "../jobs/index.js";
import {JobAnalysisService} from "../job-analysis/index.js";
import {PortfolioEditingService} from "../portfolio-editing/service.js";
import {PageService} from "../page/index.js";
import {CareerDocumentService} from "../career-editor/service.js";
import {CanonicalCareerReadService} from "./canonical-reads.js";
import {recomputeMongoSkill} from "./mongo-skills.js";

const exact="12345678901234567890.123400",latest="Canonical evidence for platform",ownLabel="Kubernetes",foreignLabel="ForeignSecret";
const latestMarkdown=latest+"\n";
describe.skipIf(!process.env.TEST_MONGODB_URL)("canonical product read consumers",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,reader:CanonicalCareerReadService,userId:string,other:string,categoryId:string,recordId:string,trashId:string,skillId:string,amount:string,tags:string,option:string;
 beforeAll(async()=>{
  fixture=await createMongoFixture("canoncons");reader=new CanonicalCareerReadService(fixture.resource);const identity=new MongoIdentityService(fixture.resource),db=mongoCollections(fixture.resource.db),now=new Date();
  userId=(await identity.signup({email:`reads-${randomUUID()}@example.test`,displayName:"Owner",password:"correct-horse-battery"})).user.id;other=(await identity.signup({email:`reads-${randomUUID()}@example.test`,displayName:"Other",password:"correct-horse-battery"})).user.id;
  categoryId=randomUUID();amount=randomUUID();tags=randomUUID();option=randomUUID();const systemCategory=randomUUID();
  const defs:CareerPropertyDefinitionV2[]=[{id:amount,key:"amount",name:"Amount",type:"number",required:false,system:false,config:{},order:0,version:1,deletedAt:null},{id:tags,key:"tags",name:"Tags",type:"multi_select",required:false,system:false,config:{options:[],legacyFreeformTags:true},order:1,version:1,deletedAt:null}];
  for(const id of [categoryId,systemCategory])await db.careerCategories.insertOne({_id:id,userId,key:`read-${id}`,name:"Canonical",icon:"folder",defaultView:"table",propertySchemaV2:defs,schemaVersion:1,version:1,sortOrder:0,updatedAt:now});
  for(const [owner,label] of [[userId,ownLabel],[other,foreignLabel]] as const)await db.careerPropertyOptions.insertOne({_id:randomUUID(),userId:owner,categoryId,propertyId:tags,optionId:owner===userId?option:randomUUID(),rawLabel:label,version:1,createdAt:now});
  const docs=new CareerDocumentService(fixture.resource);
  async function record(category:string,title:string,trash=false){
   const id=randomUUID();
   const propertyValues=category===categoryId?[{propertyDefinitionId:amount,type:"number" as const,value:Decimal128.fromString(exact)},{propertyDefinitionId:tags,type:"multi_select" as const,value:[option]}]:[];
   await db.careerRecords.insertOne({_id:id,userId,categoryId:category,title,status:"organized",origin:"manual",properties:{},propertyValues,bodyMd:"Stale physical body",version:2,createdAt:now,updatedAt:now,deletedAt:null,purgeAfter:null});
   const bootstrap=await docs.bootstrap(userId,id),next=structuredClone(bootstrap.document);
   next.content[0]!.text=[{text:latest}];
   const bytes=syncBlockNoteDocument(Buffer.from(bootstrap.stateBase64!,"base64"),[],careerDocumentToBlockNote(next).blocks).update;
   await docs.appendUpdate(userId,{recordId:id,clientId:randomUUID(),clientSequence:1,expectedSequence:bootstrap.documentVersion,updateBase64:Buffer.from(bytes).toString("base64"),checksum:createHash("sha256").update(bytes).digest("hex")});
   // 이 fixture는 consumer를 검증합니다. 실제 Worker와 같은 projection 경로를 준비 단계에서 완료합니다.
   expect(await docs.projectBodyMarkdown(userId,id)).toBe(latestMarkdown);
   // 정상 문서 생성 뒤 legacy projection만 오염시켜 canonical/private-option 읽기 불변식을 유지합니다.
   await db.careerRecords.updateOne({_id:id},{$set:{properties:{amount:{type:"number",value:999},tags:{type:"multi_select",value:[foreignLabel]}},...(trash?{deletedAt:now,purgeAfter:new Date(now.getTime()+86400000)}:{})}});
   return id;
  }
  await record(categoryId,"Additional record");recordId=await record(categoryId,"Canonical record");trashId=await record(categoryId,"Trashed record",true);skillId=await record(systemCategory,"Skill source");
 },60000);
 afterAll(async()=>fixture?.dispose());
 it("ranks current document and exact owned tag labels instead of stale compatibility values",async()=>{
  const service=new MaterialsService(fixture.resource,reader),own=await service.createFreeBrew(userId,{title:"Own tags",brief:ownLabel,lengthPreset:"single"}),foreign=await service.createFreeBrew(userId,{title:"Foreign tags",brief:foreignLabel,lengthPreset:"single"}),body=await service.createFreeBrew(userId,{title:"Current body",brief:"Canonical evidence",lengthPreset:"single"});
  expect(own.materials.find(row=>row.recordId===recordId)?.score).toBe(10);expect(foreign.materials.find(row=>row.recordId===recordId)?.score).toBe(0);expect(body.materials.find(row=>row.recordId===recordId)?.score).toBe(20);expect(own.materials.some(row=>row.recordId===trashId)).toBe(false);
 });
 it("passes only current documentary text to the existing recipe planner contract",async()=>{
  const brew=await new MaterialsService(fixture.resource).createFreeBrew(userId,{title:"Recipe",brief:"platform",lengthPreset:"single"});
  const planner={async plan(context:Parameters<DeterministicRecipePlanner["plan"]>[0]){const source=context.sources.find(row=>row.id===recordId)!;expect(source.text).toBe(latestMarkdown);expect(source.text).not.toContain(exact);return new DeterministicRecipePlanner().plan(context);}};
  const recipe=await new RecipeService(fixture.resource,planner,null,reader).generate(userId,brew.brewId,randomUUID());expect(recipe.evidencePaths.some(path=>path.sourceId===recordId)).toBe(true);
 });
 it("gives the sentence writer current canonical document evidence with unchanged title/body field extent",async()=>{
  const brew=await new MaterialsService(fixture.resource).createFreeBrew(userId,{title:"Generation",brief:"platform",lengthPreset:"single"}),recipe=await new RecipeService(fixture.resource).generate(userId,brew.brewId,randomUUID()),template=await mongoCollections(fixture.resource.db).templates.findOne({isActive:true}),generation=new GenerationService(fixture.resource,null,reader),job=await generation.submit(userId,randomUUID(),{recipeId:recipe.id,templateId:template!._id});let seen:WriterContext|undefined;
  await expect(generation.process(job.generationJobId,{usesContract:false,async write(context){seen=context;throw new Error("consumer probe complete");}})).rejects.toThrow("consumer probe complete");expect(seen?.evidence.some(row=>row.sourceType==="record"&&row.text===`Canonical record\n${latestMarkdown}`)).toBe(true);expect(JSON.stringify(seen?.evidence)).not.toContain("Stale physical body");expect(JSON.stringify(seen?.evidence)).not.toContain(exact);
 });
 it("validates skill quotes against canonical documentary text while retaining existing owner/reference guards",async()=>{
  const skill=await recomputeMongoSkill(fixture.resource,userId,{name:"Platform",evidence:[{recordId:skillId,span:{source:"body_md",start:0,end:latest.length,quote:latest}}]},new Date(),reader);expect(skill.evidenceCount).toBe(1);await expect(recomputeMongoSkill(fixture.resource,other,{name:"Platform",evidence:[{recordId:skillId,span:{source:"body_md",start:0,end:latest.length,quote:latest}}]},new Date(),reader)).rejects.toMatchObject({statusCode:404});
 });
 async function portfolio(){
  const brew=await new MaterialsService(fixture.resource,reader).createFreeBrew(userId,{title:"Portfolio",brief:"platform",lengthPreset:"single"}),recipe=await new RecipeService(fixture.resource,undefined,null,reader).generate(userId,brew.brewId,randomUUID()),db=mongoCollections(fixture.resource.db),template=await db.templates.findOne({isActive:true}),generation=new GenerationService(fixture.resource,null,reader),job=await generation.submit(userId,randomUUID(),{recipeId:recipe.id,templateId:template!._id});
  const result=await generation.process(job.generationJobId,{usesContract:false,async write(context){return GenerationOutputSchema.parse({blocks:context.sections.flatMap(section=>section.items.map(item=>({recipeSectionId:section.recipeSectionId,kind:"paragraph",text:item.pointText,label:null,evidencePathIds:item.sourceNumbers.map(number=>context.evidence[number-1]?.id).filter(Boolean)})))});}});
  const section=await db.portfolioSections.findOne({userId,portfolioId:result.portfolioId!}),block=await db.blocks.findOne({userId,portfolioSectionId:section!._id});return{portfolioId:result.portfolioId!,blockId:block!._id};
 }
 it("computes job matching from current body and owned canonical option labels",async()=>{
  const market=new JobMarketService(fixture.resource,null,null,reader),submission=await market.submitPosting(userId,randomUUID(),{companyName:"Canonical",title:"Match",descriptionRaw:"Canonical requirements ".repeat(30)}),db=mongoCollections(fixture.resource.db);
  await db.jobPostings.updateOne({_id:submission.jobPostingId},{$set:{requirements:{technologies:[ownLabel,"Canonical evidence",foreignLabel],impacts:[],roles:[],conditions:[]}}});
  expect((await market.computeMatch(userId,submission.jobPostingId)).total).toBe(67);await expect(market.computeMatch(other,submission.jobPostingId)).rejects.toMatchObject({statusCode:409});
 });
 it("stores analysis coverage and matching against the same canonical owner snapshot",async()=>{
  const quotes=[ownLabel,"Canonical evidence",foreignLabel],source=quotes.join("\n")+"\n"+"Job description ".repeat(30),market=new JobMarketService(fixture.resource),submission=await market.submitPosting(userId,randomUUID(),{companyName:"Canonical",title:"Coverage",descriptionRaw:source});
  const result=await new JobAnalysisService(fixture.resource,reader).process(submission.jobAnalysisId,{async extract(input){return{requirements:quotes.map(quote=>({label:quote,kind:"must" as const,axis:"technology" as const,sourceSpan:{start:input.indexOf(quote),end:input.indexOf(quote)+quote.length,quote}})),normalized:{technologies:quotes,impacts:[],roles:[],conditions:[]}};}});
  expect(result.requirements.find(row=>row.label===ownLabel)?.coverage).toBe("covered");expect(result.requirements.find(row=>row.label==="Canonical evidence")?.coverage).toBe("covered");expect(result.requirements.find(row=>row.label===foreignLabel)?.coverage).toBe("missing");expect((await mongoCollections(fixture.resource.db).matchScores.findOne({userId,jobPostingId:submission.jobPostingId}))?.total.toString()).toBe("67");
 });
 it("previews portfolio record synchronization with current document content and existing owner guards",async()=>{
  const target=await portfolio(),service=new PortfolioEditingService(fixture.resource,null,null,reader),proposal=await service.preview(userId,target.portfolioId,target.blockId,{operation:"insert_record",recordId});
  expect(proposal.after).toMatchObject({content:{text:latestMarkdown}});await expect(service.preview(other,target.portfolioId,target.blockId,{operation:"insert_record",recordId})).rejects.toMatchObject({statusCode:404});
 });
 it("gives portfolio instruction editing canonical source text with unchanged prompt extent",async()=>{
  const target=await portfolio(),db=mongoCollections(fixture.resource.db);await db.blocks.updateOne({_id:target.blockId},{$set:{sourceRecordId:recordId,locked:false}});let seen:string|undefined;
  const service=new PortfolioEditingService(fixture.resource,{async edit(context){seen=context.sourceText;throw new Error("instruction probe complete");}},null,reader);
  await expect(service.preview(userId,target.portfolioId,target.blockId,{operation:"instruct",instruction:"Make clear"})).rejects.toThrow("instruction probe complete");expect(seen).toBe(latestMarkdown);expect(seen).not.toContain(exact);
 });
 it("gives page generation current owned documentary evidence without scalar prompt expansion",async()=>{
  const target=await portfolio(),service=new PageService(fixture.resource,null,null,reader);let evidence:unknown;
  await expect(service.generate(userId,target.portfolioId,{async generate(context){evidence=context.evidence;throw new Error("page probe complete");}})).rejects.toThrow("page probe complete");expect(JSON.stringify(evidence)).toContain(latest);expect(JSON.stringify(evidence)).not.toContain("Stale physical body");expect(JSON.stringify(evidence)).not.toContain(exact);await expect(service.generate(other,target.portfolioId,{async generate(){throw new Error("foreign generator called");}})).rejects.toMatchObject({statusCode:404});
 });
 it("exports current canonical exact values, private definitions and all owned trashed records without rewriting storage",async()=>{
  const db=mongoCollections(fixture.resource.db),before=await db.careerRecords.find({_id:{$in:[recordId,trashId]}}).sort({_id:1}).toArray(),category=await db.careerCategories.findOne({_id:categoryId}),exported=await new AccountLifecycleService(fixture.resource,reader).exportData(userId);
  for(const id of [recordId,trashId]){const record=exported.career.records.find(row=>row.id===id)!;expect(record.body_md).toBe(latestMarkdown);expect(record.properties).toMatchObject({amount:{type:"number",value:exact}});expect(record.property_values).toContainEqual({propertyDefinitionId:amount,type:"number",value:exact});}
  expect(JSON.stringify(exported.career.categories)).toContain(ownLabel);expect(JSON.stringify(exported.career.categories)).not.toContain(foreignLabel);expect(await db.careerRecords.find({_id:{$in:[recordId,trashId]}}).sort({_id:1}).toArray()).toEqual(before);expect(await db.careerCategories.findOne({_id:categoryId})).toEqual(category);expect(exported.career.records.some(row=>row.user_id===other)).toBe(false);
 });
});
