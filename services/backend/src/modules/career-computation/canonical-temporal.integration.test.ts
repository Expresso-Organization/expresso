import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { mongoCollections,type CareerRecordDoc } from "@expresso/database";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoCareerComputationService } from "./service.js";
describe.skipIf(!process.env.TEST_MONGODB_URL)("canonical temporal derived input",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,userId:string;
 beforeAll(async()=>{fixture=await createMongoFixture("b2temporal");userId=(await new MongoIdentityService(fixture.resource).signup({email:`${randomUUID()}@example.test`,displayName:"Temporal",password:"disposable-temporal-password"})).user.id;},60_000);
 afterAll(async()=>fixture?.dispose());
 it.each(["created_time","updated_time","date"] as const)("uses exact custom %s canonical values and chronological offset/precision order",async type=>{
  const db=mongoCollections(fixture.resource.db),categoryId=randomUUID(),dateId=randomUUID(),relationId=randomUUID(),sourceId=randomUUID(),targetIds=[randomUUID(),randomUUID()],now=new Date();
  const base={required:false,system:false,order:0,version:1,deletedAt:null};
  const definitions:CareerPropertyDefinitionV2[]=[{...base,id:dateId,key:"chosenTime",name:"Chosen",type,config:{}},{...base,id:relationId,key:"related",name:"Related",type:"relation",config:{targetCategoryId:categoryId,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict"}}];
  await db.careerCategories.insertOne({_id:categoryId,userId,key:`time_${categoryId}`,name:"Temporal",icon:"note",defaultView:"table",propertySchemaV2:definitions,schemaVersion:1,version:1,sortOrder:0,updatedAt:now});
  const starts=["2020-01-01T12:00:00.000000002+09:00","2020-01-01T04:00:00.000000001Z"];
  const record=(id:string,index?:number):CareerRecordDoc=>({_id:id,userId,categoryId,title:"Record",status:"draft",origin:"manual",properties:{chosenTime:{type:"updated_time",value:"1999-01-01T00:00:00Z"}},propertyValues:index===undefined?[]:[{propertyDefinitionId:dateId,type:"date",value:{precision:"datetime",start:starts[index]!,end:null,timezone:null}}],bodyMd:"sentinel",version:1,createdAt:now,updatedAt:now,deletedAt:null,purgeAfter:null});
  await db.careerRecords.insertMany([record(sourceId),...targetIds.map((id,index)=>record(id,index))]);
  await db.careerRecordRelations.insertMany(targetIds.map(targetRecordId=>({_id:randomUUID(),userId,sourceRecordId:sourceId,sourcePropertyId:relationId,targetRecordId,inversePropertyId:null,cardinality:"multiple" as const,deletePolicy:"restrict" as const,createdBy:"user" as const,createdAt:now,updatedAt:now})));
  const service=new MongoCareerComputationService(fixture.resource,"canonical"),input={categoryId,recordId:sourceId,relationPropertyId:relationId,targetPropertyId:dateId};
  const before=await db.careerRecords.find({categoryId}).sort({_id:1}).toArray();
  expect((await service.previewRollup(userId,{...input,aggregation:"earliest"})).value).toMatchObject({type:"rollup",value:starts[0]});
  expect((await service.previewRollup(userId,{...input,aggregation:"latest"})).value).toMatchObject({type:"rollup",value:starts[1]});
  if(type==="date") {
   await db.careerRecords.updateOne({_id:targetIds[0]!},{$set:{propertyValues:[{propertyDefinitionId:dateId,type:"date",value:{precision:"month",start:"2019-12",end:null}}]}});
   expect((await service.previewRollup(userId,{...input,aggregation:"earliest"})).value).toMatchObject({type:"rollup",value:"2019-12"});
  }else expect(await db.careerRecords.find({categoryId}).sort({_id:1}).toArray()).toEqual(before);
 });
});
