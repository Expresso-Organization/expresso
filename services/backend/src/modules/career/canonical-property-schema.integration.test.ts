import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mongoCollections, registerCareerPropertyOption } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "./service.js";
import { CareerViewService } from "./views.js";
import { CanonicalCareerReadService } from "./canonical-reads.js";
import { MongoCanonicalCareerPropertySchemaService } from "./canonical-property-schema.js";
import type { CareerPropertyDefinitionV2, CareerPropertySchemaChange } from "@expresso/contracts";
import { mutationCanonicalJson,mutationFingerprint } from "./property-mutation-state.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("inactive canonical schema orchestration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;let api: MongoCanonicalCareerPropertySchemaService;let userId: string;let categoryId: string;let propertyId: string;
  const secret="prc-preview-secret-with-at-least-32-bytes";
  beforeAll(async () => {
    fixture=await createMongoFixture("prcschema");
    const identity=new MongoIdentityService(fixture.resource);
    userId=(await identity.signup({email:`${randomUUID()}@example.test`,password:"correct-horse-battery",displayName:"test"})).user.id;
  },60_000);
  afterAll(async()=>fixture?.dispose());
  async function setup() {
    propertyId=randomUUID();const legacy=new CareerService(fixture.resource);
    const category=await legacy.createCategory(userId,{key:`prc_${randomUUID().replaceAll("-","")}`,name:"test",icon:"folder",defaultView:"table",propertySchemaV2:[{id:propertyId,key:"p",name:"속성",type:"text",required:false,system:false,config:{},order:0,version:1,deletedAt:null}]});categoryId=category.id;
    const definition: CareerPropertyDefinitionV2={id:propertyId,key:"p",name:"속성",type:"text",required:false,system:false,config:{},order:0,version:1,deletedAt:null};
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[definition],schemaVersion:1}});
    const id=randomUUID();await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").insertOne({_id:id,userId,categoryId,title:"record",status:"draft",origin:"manual",properties:{p:"legacy sentinel"},bodyMd:"doc sentinel",blockBody:[{opaque:true}],documentVersion:7,latestSnapshotId:randomUUID(),version:1,updatedAt:new Date(0),deletedAt:null,propertyValues:[{propertyDefinitionId:propertyId,type:"text",value:"42.1200"}]});
    api=new MongoCanonicalCareerPropertySchemaService(fixture.resource,secret);return id;
  }
  async function apply(change: CareerPropertySchemaChange,confirmLossy=false) {const preview=await api.previewChange(userId,categoryId,change);return api.applyChange(userId,categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy});}
  it.each(["select","multi_select"] as const)("preserves main %s option configuration and rejects option removal and foreign ownership", async type => {
    const recordId=await setup(),db=mongoCollections(fixture.resource.db),optionId=randomUUID(),addedId=randomUUID();
    const original=(await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2[0]!;
    await db.careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[{...original,type,config:{options:[{id:optionId,name:"Original"}]}}]}});
    await db.careerRecords.updateOne({_id:recordId},{$set:{propertyValues:[type==="select"?{propertyDefinitionId:propertyId,type,value:optionId}:{propertyDefinitionId:propertyId,type,value:[optionId]}]}});
    const before=await db.careerRecords.findOne({_id:recordId}),change:CareerPropertySchemaChange={kind:"configure",propertyId,config:{options:[{id:addedId,name:"Added"},{id:optionId,name:"Renamed"}]}};
    await apply(change);
    expect((await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2[0]!.config.options).toEqual(change.config.options);
    expect(await db.careerRecords.findOne({_id:recordId})).toEqual(before);
    expect(await db.careerPropertyMutations.countDocuments({categoryId})).toBe(0);
    const configured=await db.careerCategories.findOne({_id:categoryId});
    await expect(api.previewChange(userId,categoryId,{kind:"configure",propertyId,config:{options:[{id:addedId,name:"Added"}]}})).rejects.toMatchObject({statusCode:409});
    await expect(api.previewChange(randomUUID(),categoryId,change)).rejects.toMatchObject({statusCode:404});
    expect(await db.careerCategories.findOne({_id:categoryId})).toEqual(configured);
  });
  it.each(["created_time","updated_time"] as const)("preserves main system %s creation and display lifecycle without allowing value/type changes",async type=>{
    const recordId=await setup(),db=mongoCollections(fixture.resource.db),stampId=randomUUID();
    const before=await db.careerRecords.findOne({_id:recordId});
    await apply({kind:"create",property:{id:stampId,key:"record_stamp",name:"Record timestamp",type,required:false,system:true,config:{}}});
    await apply({kind:"rename",propertyId:stampId,name:"Timestamp renamed"});
    await apply({kind:"reorder",propertyId:stampId,order:3});
    await expect(api.previewChange(userId,categoryId,{kind:"type-change",propertyId:stampId,type:"text"})).rejects.toMatchObject({statusCode:403});
    await expect(api.previewChange(userId,categoryId,{kind:"configure",propertyId:stampId,config:{defaultValue:{type:"date",value:{precision:"datetime",start:"2026-10-29T00:00:00Z",end:null,timezone:"UTC"}}}})).rejects.toMatchObject({statusCode:403});
    await apply({kind:"delete",propertyId:stampId});
    expect((await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2.find(def=>def.id===stampId)?.deletedAt).toEqual(expect.any(String));
    await apply({kind:"restore",propertyId:stampId});
    expect((await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2.find(def=>def.id===stampId)).toMatchObject({type,system:true,name:"Timestamp renamed",order:3,deletedAt:null});
    expect(await db.careerRecords.findOne({_id:recordId})).toEqual(before);
    expect(await db.careerPropertyMutations.countDocuments({categoryId})).toBe(0);
  });
  it("schema-only rename and reorder preserve the entire record and create no migration job",async()=>{
    const id=await setup();const before=await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").findOne({_id:id});
    await apply({kind:"rename",propertyId,name:"새 이름"});await apply({kind:"reorder",propertyId,order:3});
    expect(await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").findOne({_id:id})).toEqual(before);
    expect(await mongoCollections(fixture.resource.db).careerPropertyMutations.countDocuments({categoryId})).toBe(0);
  });
  it("type apply publishes an immutable job without rewriting canonical or legacy values",async()=>{
    const id=await setup();const before=await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").findOne({_id:id});
    const change: CareerPropertySchemaChange={kind:"type-change",propertyId,type:"number"};const preview=await api.previewChange(userId,categoryId,change);
    expect(preview.impact).toMatchObject({affectedRecordCount:1,convertibleCount:1});await apply(change);
    expect(await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").findOne({_id:id})).toEqual(before);
    const job=await mongoCollections(fixture.resource.db).careerPropertyMutations.findOne({categoryId});expect(job?.status).toBe("pending");
    expect(JSON.parse(job!.planJson).recordIds).toEqual([id]);
    await expect(apply({kind:"rename",propertyId,name:"blocked"})).rejects.toMatchObject({statusCode:409});
  });
  it("uses private option metadata for preview while the raw schema and immutable job stay unchanged", async () => {
    const id = await setup(), db = mongoCollections(fixture.resource.db);
    const source = (await db.careerCategories.findOne({ _id: categoryId }))!.propertySchemaV2![0]!;
    const definition = { ...source, type: "multi_select" as const, config: { legacyFreeformTags: true, options: [] } };
    await db.careerCategories.updateOne({ _id: categoryId }, { $set: { propertySchemaV2: [definition] } });
    const option = await registerCareerPropertyOption(fixture.resource.db, { userId, categoryId, propertyId }, " Private ");
    await db.careerRecords.updateOne({ _id: id }, { $set: { propertyValues: [{ propertyDefinitionId: propertyId, type: "multi_select", value: [option.optionId] }] } });
    const change: CareerPropertySchemaChange = { kind: "type-change", propertyId, type: "select" };
    const preview = await api.previewChange(userId, categoryId, change);
    expect(preview.impact).toMatchObject({ affectedRecordCount: 1, convertibleCount: 1, lossyExamples: [] });
    const response = await api.applyChange(userId, categoryId, preview.categoryVersion, randomUUID(), { change, previewToken: preview.previewToken, confirmLossy: false });
    expect(response.propertySchemaV2?.[0]?.config.options).toContainEqual(expect.objectContaining({ id: option.optionId, name: " Private ", label: " Private " }));
    const category = (await db.careerCategories.findOne({ _id: categoryId }))!;
    expect(category.propertySchemaV2?.[0]?.config.options).toEqual([]);
    const job = (await db.careerPropertyMutations.findOne({ categoryId, active: true }))!;
    const plan = JSON.parse(job.planJson);
    expect(plan.operation.source).toEqual(definition);
    expect(plan.operation.target).toEqual(category.propertySchemaV2![0]);
    expect(plan.operation.target.config.options).toEqual([]);
    expect(mutationFingerprint(plan)).toBe(job.operationFingerprint);
  });
  it("defers schema conversion computation refresh until the mutation job completes", async () => {
    const id = await setup(), db = mongoCollections(fixture.resource.db);
    await apply({ kind: "type-change", propertyId, type: "number" });
    expect(await db.careerPropertyMutations.findOne({ categoryId, active: true })).not.toBeNull();
    expect(await db.outboxEvents.countDocuments({ topic: "career.computation", "payload.recordId": id })).toBe(0);
  });
  it.each(["created_time", "updated_time"] as const)("schedules a custom %s datetime default without changing the raw schema alias", async (type) => {
    const id = await setup(), db = mongoCollections(fixture.resource.db), createdId = randomUUID();
    const value = { precision: "datetime" as const, start: "2026-10-09T12:34:56.123456789+09:00", end: null, timezone: "Asia/Seoul" };
    await apply({ kind: "create", property: { id: createdId, key: "custom_stamp", name: "시각", type, required: false, system: false, config: { defaultValue: { type: "date", value } } } });
    const job = (await db.careerPropertyMutations.findOne({ categoryId, active: true }))!;
    const plan = JSON.parse(job.planJson);
    expect(plan.operation.target.type).toBe(type);
    expect(plan.operation.defaultValue).toEqual({ propertyDefinitionId: createdId, type: "date", value });
    expect(plan.recordIds).toEqual([id]);
  });
  it("publishes relation deletion jobs from canonical edges while leaving all business data unchanged",async()=>{
    const id=await setup(),db=mongoCollections(fixture.resource.db),source=(await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2![0]!;
    const relation={...source,type:"relation" as const,config:{targetCategoryId:categoryId,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict"}};
    await db.careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[relation]}});
    await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[]}});
    const target=randomUUID(),record=(await db.careerRecords.findOne({_id:id}))!;
    await db.careerRecords.insertOne({...record,_id:target,title:"target"});
    const now=new Date(),edge={_id:randomUUID(),userId,sourceRecordId:id,sourcePropertyId:propertyId,targetRecordId:target,cardinality:"multiple" as const,deletePolicy:"restrict" as const,createdBy:"user" as const,createdAt:now,updatedAt:now};
    await db.careerRecordRelations.insertOne(edge);
    const recordsBefore=await db.careerRecords.find({categoryId}).sort({_id:1}).toArray();
    const preview=await api.previewChange(userId,categoryId,{kind:"delete",propertyId});
    expect(preview.impact).toMatchObject({affectedRecordCount:1,convertibleCount:1});
    expect(preview.impact.lossyExamples[0]?.before).toEqual([target]);
    await expect(api.applyChange(userId,categoryId,preview.categoryVersion,randomUUID(),{change:{kind:"delete",propertyId},previewToken:preview.previewToken,confirmLossy:false})).rejects.toMatchObject({statusCode:409});
    await apply({kind:"delete",propertyId},true);
    const job=(await db.careerPropertyMutations.findOne({categoryId,active:true}))!,plan=JSON.parse(job.planJson);
    expect(plan.operation).toMatchObject({kind:"deletion",source:relation,target:{type:"relation",deletedAt:expect.any(String)}});
    expect(plan.recordIds).toEqual([id]);
    expect(await db.careerRecordRelations.findOne({_id:edge._id})).toEqual(edge);
    expect(await db.careerRecords.find({categoryId}).sort({_id:1}).toArray()).toEqual(recordsBefore);
    expect(await db.careerRelationPropertyTombstones.countDocuments({categoryId})).toBe(0);
    expect(await db.outboxEvents.countDocuments({topic:"career.computation","payload.recordId":id})).toBe(0);
  });
  it("includes incoming-only inverse relation owners in deletion impact and immutable jobs",async()=>{
    const id=await setup(),db=mongoCollections(fixture.resource.db),otherCategory=randomUUID(),otherId=randomUUID(),otherProperty=randomUUID(),original=(await db.careerCategories.findOne({_id:categoryId}))!;
    const relation:CareerPropertyDefinitionV2={...original.propertySchemaV2![0]!,type:"relation",config:{targetCategoryId:otherCategory,inversePropertyId:otherProperty,cardinality:"multiple",deletePolicy:"restrict"}};
    const forward={...relation,id:otherProperty,key:"forward",config:{targetCategoryId:categoryId,inversePropertyId:propertyId,cardinality:"multiple",deletePolicy:"restrict"}};
    await db.careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[relation]}});
    await db.careerCategories.insertOne({...original,_id:otherCategory,key:"inverse-impact-"+otherCategory,propertySchemaV2:[forward]});
    await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[]}});
    await db.careerRecords.insertOne({...((await db.careerRecords.findOne({_id:id}))!),_id:otherId,categoryId:otherCategory});
    const now=new Date(),edge={_id:randomUUID(),userId,sourceRecordId:otherId,sourcePropertyId:otherProperty,targetRecordId:id,inversePropertyId:propertyId,cardinality:"multiple" as const,deletePolicy:"restrict" as const,createdBy:"user" as const,createdAt:now,updatedAt:now};
    await db.careerRecordRelations.insertOne(edge);
    const change:CareerPropertySchemaChange={kind:"delete",propertyId},preview=await api.previewChange(userId,categoryId,change);
    expect(preview.impact).toMatchObject({affectedRecordCount:1,convertibleCount:1,lossyExamples:[{recordId:id,before:[otherId]}]});
    await api.applyChange(userId,categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy:true});
    const job=(await db.careerPropertyMutations.findOne({categoryId,active:true}))!;
    expect(JSON.parse(job.planJson).recordIds).toEqual([id]);
    expect(await db.careerRecordRelations.findOne({_id:edge._id})).toEqual(edge);
  });
  it("rejects stale relation restoration generation before schema or job writes",async()=>{
    const id=await setup(),db=mongoCollections(fixture.resource.db),now=new Date(),definition=(await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2![0]!;
    const source={...definition,type:"relation" as const,config:{targetCategoryId:categoryId,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict"}},deleted={...source,version:2,deletedAt:now.toISOString()},deletionMutationId=randomUUID();
    await db.careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[deleted],version:2,schemaVersion:2}});
    await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[],version:3}});
    const plan={userId,categoryId,categoryVersion:2,schemaVersion:2,definitions:[deleted],recordIds:[id],operation:{kind:"deletion",source,target:deleted,defaultValue:null,confirmLossy:true}};
    await db.careerPropertyMutations.insertOne({_id:deletionMutationId,userId,categoryId,propertyId,planJson:mutationCanonicalJson(plan),operationFingerprint:mutationFingerprint(plan),status:"completed",active:false,cursor:1,processedCount:1,skippedCount:0,attempts:1,leaseToken:null,leaseUntil:null,lastError:null,commitFence:1,createdAt:now,updatedAt:now,completedAt:now});
    await db.careerRelationPropertyTombstones.insertOne({_id:randomUUID(),userId,categoryId,propertyId,recordId:id,deletionMutationId,definitionVersion:2,deletedAt:deleted.deletedAt,categoryVersion:2,schemaVersion:2,config:source.config,sourceRecordVersion:2,forwardEdges:[],inverseEdges:[],inverseDefinitionBindings:[],inverseRecordVersions:{},inverseRecordReferenceVersions:{},createdAt:now});
    const before=await db.careerCategories.findOne({_id:categoryId});
    await expect(apply({kind:"restore",propertyId},true)).rejects.toMatchObject({statusCode:409});
    expect(await db.careerCategories.findOne({_id:categoryId})).toEqual(before);
    expect(await db.careerPropertyMutations.countDocuments({categoryId,active:true})).toBe(0);
    expect(await db.careerRelationPropertyTombstones.countDocuments({categoryId})).toBe(1);
  });
  it("accepts exact label option spelling and rejects conflicting name/label metadata",async()=>{
    await setup();const optionId=randomUUID(),createdId=randomUUID(),change:CareerPropertySchemaChange={kind:"create",property:{id:createdId,key:"pick",name:"pick",type:"select",required:false,system:false,config:{options:[{id:optionId,label:"Exact"}]}}};
    await apply(change);
    expect((await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:categoryId}))!.propertySchemaV2!.find(definition=>definition.id===createdId)!.config.options).toEqual([{id:optionId,name:"Exact"}]);
    const records=await mongoCollections(fixture.resource.db).careerRecords.find({categoryId}).toArray();
    await apply({kind:"configure",propertyId:createdId,config:{options:[{id:optionId,label:" Renamed ",color:"blue"}]}});
    expect((await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:categoryId}))!.propertySchemaV2.find(d=>d.id===createdId)!.config.options).toEqual([{id:optionId,name:" Renamed ",color:"blue"}]);
    await apply({kind:"type-change",propertyId:createdId,type:"multi_select",config:{options:[{id:optionId,label:" Renamed ",name:" Renamed ",color:"blue"}]}});
    expect((await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:categoryId}))!.propertySchemaV2.find(d=>d.id===createdId)!.config.options).toEqual([{id:optionId,name:" Renamed ",color:"blue"}]);
    expect(await mongoCollections(fixture.resource.db).careerRecords.find({categoryId}).toArray()).toEqual(records);
    const invalid:CareerPropertySchemaChange={kind:"create",property:{...change.property,id:randomUUID(),key:"conflict",config:{options:[{id:optionId,label:"A",name:"B"}]}}};
    const before=await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:categoryId});
    await expect(apply(invalid)).rejects.toMatchObject({statusCode:400});
    expect(await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:categoryId})).toEqual(before);
  });
  it("binds preview to the exact private option snapshot without changing shared schema on registration",async()=>{
    const id=await setup(),db=mongoCollections(fixture.resource.db),source=(await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2![0]!;
    await db.careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[{...source,type:"multi_select",config:{options:[],legacyFreeformTags:true}}]}});
    const option=await registerCareerPropertyOption(fixture.resource.db,{userId,categoryId,propertyId},"A");
    await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[{propertyDefinitionId:propertyId,type:"multi_select",value:[option.optionId]}]}});
    const change:CareerPropertySchemaChange={kind:"type-change",propertyId,type:"select"},preview=await api.previewChange(userId,categoryId,change),before=await db.careerCategories.findOne({_id:categoryId});
    await registerCareerPropertyOption(fixture.resource.db,{userId,categoryId,propertyId},"B");
    expect(await db.careerCategories.findOne({_id:categoryId})).toEqual(before);
    await expect(api.applyChange(userId,categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy:false})).rejects.toMatchObject({statusCode:409});
    expect(await db.careerCategories.findOne({_id:categoryId})).toEqual(before);
    expect(await db.careerPropertyMutations.countDocuments({categoryId})).toBe(0);
  });
  it("stale preview detects same-version option/config tampering",async()=>{
    await setup();const change: CareerPropertySchemaChange={kind:"rename",propertyId,name:"next"};const preview=await api.previewChange(userId,categoryId,change);
    await mongoCollections(fixture.resource.db).careerCategories.updateOne({_id:categoryId},{$set:{"propertySchemaV2.0.config":{tampered:true}}});
    await expect(api.applyChange(userId,categoryId,preview.categoryVersion,randomUUID(),{change,previewToken:preview.previewToken,confirmLossy:false})).rejects.toMatchObject({statusCode:409});
  });
  it("deletion requires confirmation and stores ISO definition deletion without touching records",async()=>{
    const id=await setup();const before=await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").findOne({_id:id});
    await expect(apply({kind:"delete",propertyId})).rejects.toMatchObject({statusCode:409});await apply({kind:"delete",propertyId},true);
    const category=await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:categoryId});expect(category!.propertySchemaV2![0]!.deletedAt).toMatch(/^\d{4}-/);
    expect(await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").findOne({_id:id})).toEqual(before);
  });
  it("adds schema only without a default and materializes defaults only for missing stable IDs",async()=>{
    const id=await setup();const db=mongoCollections(fixture.resource.db);const before=await db.careerRecords.findOne({_id:id});const createdId=randomUUID();
    await apply({kind:"create",property:{id:createdId,key:"new",name:"new",type:"text",required:false,system:false,config:{}}});
    expect(await db.careerRecords.findOne({_id:id})).toEqual(before);expect(await db.careerPropertyMutations.countDocuments({categoryId})).toBe(0);
    await expect(apply({kind:"create",property:{key:"required",name:"required",type:"text",required:true,system:false,config:{}}})).rejects.toMatchObject({statusCode:409});
    const defaultId=randomUUID();await apply({kind:"create",property:{id:defaultId,key:"default",name:"default",type:"number",required:false,system:false,config:{defaultValue:{type:"number",value:"1.2300"}}}});
    const job=await db.careerPropertyMutations.findOne({categoryId});expect(JSON.parse(job!.planJson).operation.defaultValue).toEqual({propertyDefinitionId:defaultId,type:"number",value:"1.2300"});expect(await db.careerRecords.findOne({_id:id})).toEqual(before);
  });
  it("option label/order changes need no migration; removing an ID selects only affected values",async()=>{
    const id=await setup();const db=mongoCollections(fixture.resource.db),a=randomUUID(),b=randomUUID();const option=(id:string,label:string,order:number)=>({id,name:label,order});
    const definition=(await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2![0]!;
    await db.careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[{...definition,type:"select",config:{options:[option(a,"a",0),option(b,"b",1)]}}]}});
    await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[{propertyDefinitionId:propertyId,type:"select",value:a}]}});
    const source=(await db.careerRecords.findOne({_id:id}))!;await db.careerRecords.insertOne({...source,_id:randomUUID(),propertyValues:[{propertyDefinitionId:propertyId,type:"select",value:b}]});
    await apply({kind:"type-change",propertyId,type:"select",config:{options:[option(b,"B",0),option(a,"A",1)]}});expect(await db.careerPropertyMutations.countDocuments({categoryId})).toBe(0);
    const change: CareerPropertySchemaChange={kind:"type-change",propertyId,type:"select",config:{options:[option(b,"B",0)]}};
    const preview=await api.previewChange(userId,categoryId,change);expect(preview.impact.affectedRecordCount).toBe(1);await expect(apply(change)).rejects.toMatchObject({statusCode:409});await apply(change,true);
    expect(JSON.parse((await db.careerPropertyMutations.findOne({categoryId}))!.planJson).recordIds).toEqual([id]);
  });
  it("rejects unsupported conversion even when lossy confirmation is supplied",async()=>{
    await setup();const change: CareerPropertySchemaChange={kind:"type-change",propertyId,type:"file"};const preview=await api.previewChange(userId,categoryId,change);expect(preview.impact.convertibleCount).toBe(0);await expect(apply(change,true)).rejects.toMatchObject({statusCode:409});
  });
  it("restore rejects a changed tombstone type before publishing schema or job",async()=>{
    const id=await setup();const db=mongoCollections(fixture.resource.db);await db.careerCategories.updateOne({_id:categoryId},{$set:{"propertySchemaV2.0.deletedAt":new Date().toISOString()}});
    await fixture.resource.db.collection<import("mongodb").Document & {_id:string}>("career_records").updateOne({_id:id},{$set:{propertyValues:[],[`propertyValueTombstones.${propertyId}`]:{propertyDefinitionId:propertyId,type:"checkbox",value:true}}});
    await expect(apply({kind:"restore",propertyId},true)).rejects.toMatchObject({statusCode:409});
  });
  it("restore schedules consumption of a matching generation tombstone even when the current value exists",async()=>{
    const id=await setup(),db=mongoCollections(fixture.resource.db),deletionMutationId=randomUUID(),now=new Date();
    const source=(await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2![0]!;
    const deleted={...source,version:2,deletedAt:now.toISOString()};
    await db.careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[deleted],version:2,schemaVersion:2}});
    const plan={userId,categoryId,categoryVersion:2,schemaVersion:2,definitions:[deleted],recordIds:[id],operation:{kind:"deletion",source,target:deleted,defaultValue:null,confirmLossy:true}};
    await db.careerPropertyMutations.insertOne({_id:deletionMutationId,userId,categoryId,propertyId,planJson:mutationCanonicalJson(plan),operationFingerprint:mutationFingerprint(plan),status:"completed",active:false,cursor:1,processedCount:1,skippedCount:0,attempts:1,leaseToken:null,leaseUntil:null,lastError:null,commitFence:1,createdAt:now,updatedAt:now,completedAt:now});
    const backup={propertyDefinitionId:propertyId,deletionMutationId,definitionVersion:2,type:"text",config:{},categoryId,categoryVersion:2,schemaVersion:2,deletedAt:deleted.deletedAt,value:{propertyDefinitionId:propertyId,type:"text",value:"old"}};
    await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[{propertyDefinitionId:propertyId,type:"text",value:"new"}],[`propertyValueTombstones.${propertyId}`]:backup}} as never);
    await apply({kind:"restore",propertyId});
    const job=await db.careerPropertyMutations.findOne({categoryId,active:true});expect(JSON.parse(job!.planJson).recordIds).toEqual([id]);
    expect((await db.careerRecords.findOne({_id:id}))?.propertyValues?.[0]).toMatchObject({value:"new"});
  });
  it("formula config emits recomputation but never a canonical mutation job",async()=>{
    const id=await setup();const formulaId=randomUUID();await apply({kind:"create",property:{id:formulaId,key:"derived",name:"derived",type:"formula",required:false,system:false,config:{source:`prop("${propertyId}")`,ast:null,diagnostics:[]}}});
    expect(await mongoCollections(fixture.resource.db).careerPropertyMutations.countDocuments({categoryId})).toBe(0);expect(await mongoCollections(fixture.resource.db).outboxEvents.findOne({topic:"career.computation","payload.recordId":id})).toMatchObject({payload:{changedPropertyIds:[formulaId]}});
  });
  it("rejects decimal scale loss before publishing schema or leaving an active job lock",async()=>{
    const id=await setup();const db=mongoCollections(fixture.resource.db);await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[{propertyDefinitionId:propertyId,type:"text",value:"1."+"0".repeat(34)}]}});
    const before=await db.careerCategories.findOne({_id:categoryId});const change:CareerPropertySchemaChange={kind:"type-change",propertyId,type:"number"};expect((await api.previewChange(userId,categoryId,change)).impact.convertibleCount).toBe(0);
    await expect(apply(change,true)).rejects.toMatchObject({statusCode:409});expect(await db.careerCategories.findOne({_id:categoryId})).toEqual(before);expect(await db.careerPropertyMutations.countDocuments({categoryId})).toBe(0);
  });
  it("rejects view reorder atomically while a frozen schema job is pending or failed",async()=>{
    const id=await setup(),views=new CareerViewService(fixture.resource),db=mongoCollections(fixture.resource.db);
    const view=await views.create(userId,categoryId,1,{name:"View",type:"table",filter:null,sorts:[],groupPropertyId:null,groupOrder:[],recordOrder:[],visiblePropertyIds:[propertyId],propertyOrder:[propertyId],columnWidths:{},gallery:null,board:null,timeline:null});
    await apply({kind:"type-change",propertyId,type:"number"});
    const job=(await db.careerPropertyMutations.findOne({userId,categoryId,active:true}))!,before=(await db.careerCategories.findOne({_id:categoryId}))!,viewBefore=await db.careerViews.findOne({_id:view.id});
    for(const status of ["pending","failed"] as const){
      await db.careerPropertyMutations.updateOne({_id:job._id},{$set:{status}});
      await expect(views.reorder(userId,categoryId,before.version,[view.id])).rejects.toMatchObject({statusCode:409,publicDetails:{mutationId:job._id,status}});
      expect(await db.careerCategories.findOne({_id:categoryId})).toEqual(before);expect(await db.careerViews.findOne({_id:view.id})).toEqual(viewBefore);
      expect((await new CanonicalCareerReadService(fixture.resource).getRecord(userId,id)).properties.p).toMatchObject({value:"42.1200"});
      expect((await db.careerPropertyMutations.findOne({_id:job._id}))!.operationFingerprint).toBe(job.operationFingerprint);
    }
    await db.careerPropertyMutations.updateOne({_id:job._id},{$set:{status:"completed",active:false}});
    expect(await views.reorder(userId,categoryId,before.version,[view.id])).toHaveLength(1);
  });
  it("keeps pending and failed conversion view filters aligned with both stored business types",async()=>{
    const id=await setup(),views=new CareerViewService(fixture.resource),db=mongoCollections(fixture.resource.db);
    const base={name:"Pending read",type:"table" as const,sorts:[],groupPropertyId:null,groupOrder:[],recordOrder:[],visiblePropertyIds:[propertyId],propertyOrder:[propertyId],columnWidths:{},gallery:null,board:null,timeline:null};
    const nonempty=await views.create(userId,categoryId,1,{...base,filter:{propertyId,operator:"is_not_empty",operand:null}});
    const contains=await views.create(userId,categoryId,1,{...base,name:"Pending contains",filter:{propertyId,operator:"contains",operand:{type:"text",value:"42"}}});
    await apply({kind:"type-change",propertyId,type:"number"});
    const job=(await db.careerPropertyMutations.findOne({userId,categoryId,active:true}))!;
    const convertedId=randomUUID(),original=(await db.careerRecords.findOne({_id:id}))!;
    const {Decimal128}=await import("mongodb");
    await db.careerRecords.insertOne({...original,_id:convertedId,propertyValues:[{propertyDefinitionId:propertyId,type:"number",value:Decimal128.fromString("42.1200")}]});
    for(const status of ["pending","failed"] as const){
      await db.careerPropertyMutations.updateOne({_id:job._id},{$set:{status}});
      const page=await views.query(userId,nonempty.id,null,10);
      expect(page.data.map(row=>row.id).sort()).toEqual([id,convertedId].sort());
      expect(page.data.every(row=>row.properties.p?.value==="42.1200")).toBe(true);
      expect(page.data.every(row=>row.pendingPropertyMutation?.status===status)).toBe(true);
      expect((await views.query(userId,contains.id,null,10)).data.map(row=>row.id)).toEqual([id]);
    }
  });
  it("keeps same-type removed options readable until their canonical value is converted",async()=>{
    const id=await setup(),db=mongoCollections(fixture.resource.db),a=randomUUID(),b=randomUUID(),original=(await db.careerCategories.findOne({_id:categoryId}))!.propertySchemaV2![0]!;
    await db.careerCategories.updateOne({_id:categoryId},{$set:{propertySchemaV2:[{...original,type:"multi_select",config:{options:[{id:a,label:"A"},{id:b,label:" B exact "}]}}]}});
    await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[{propertyDefinitionId:propertyId,type:"multi_select",value:[b]}]}});
    const views=new CareerViewService(fixture.resource),base={name:"Removed option",type:"table" as const,sorts:[],groupPropertyId:null,groupOrder:[],recordOrder:[],visiblePropertyIds:[propertyId],propertyOrder:[propertyId],columnWidths:{},gallery:null,board:null,timeline:null};
    const contains=await views.create(userId,categoryId,1,{...base,filter:{propertyId,operator:"contains",operand:{type:"multi_select",value:[b]}}}),empty=await views.create(userId,categoryId,1,{...base,name:"Option empty",filter:{propertyId,operator:"is_empty",operand:null}});
    await apply({kind:"type-change",propertyId,type:"multi_select",config:{options:[{id:a,label:"A"}]}},true);
    const job=(await db.careerPropertyMutations.findOne({userId,categoryId,active:true}))!;
    await db.careerPropertyMutations.updateOne({_id:job._id},{$set:{status:"failed"}});
    const page=await views.query(userId,contains.id,null,10);expect(page.data.map(row=>row.id)).toEqual([id]);expect(page.data[0]!.pendingPropertyMutation?.sourceProperty?.config.options).toContainEqual({id:b,label:" B exact "});expect((await views.query(userId,empty.id,null,10)).data).toHaveLength(0);
    await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[{propertyDefinitionId:propertyId,type:"multi_select",value:[]}]}});
    expect((await views.query(userId,contains.id,null,10)).data).toHaveLength(0);expect((await views.query(userId,empty.id,null,10)).data.map(row=>row.id)).toEqual([id]);
  });
  it("preserves a deleted property view source until each value has been tombstoned",async()=>{
    const id=await setup(),views=new CareerViewService(fixture.resource),db=mongoCollections(fixture.resource.db),view=await views.create(userId,categoryId,1,{name:"Deleting property",type:"table",filter:{propertyId,operator:"is_not_empty",operand:null},sorts:[],groupPropertyId:null,groupOrder:[],recordOrder:[],visiblePropertyIds:[propertyId],propertyOrder:[propertyId],columnWidths:{},gallery:null,board:null,timeline:null});
    await apply({kind:"delete",propertyId},true);
    expect((await views.query(userId,view.id,null,10)).data.map(row=>row.id)).toEqual([id]);
    await db.careerRecords.updateOne({_id:id},{$set:{propertyValues:[]}});
    expect((await views.query(userId,view.id,null,10)).data).toHaveLength(0);
  });
});
