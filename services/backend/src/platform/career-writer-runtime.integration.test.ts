import {randomUUID} from "node:crypto";
import {beforeAll,afterAll,describe,expect,it} from "vitest";
import {mongoCollections} from "@expresso/database";
import {createMongoFixture} from "../../test/support/mongodb.js";
import {MongoIdentityService} from "../modules/identity/index.js";
import {CareerService} from "../modules/career/index.js";
import {CareerDocumentService} from "../modules/career-editor/index.js";
import {loadRuntimeConfig} from "../config/runtime-config.js";
import {createCareerWriterRuntime} from "./career-writer-runtime.js";
describe.skipIf(!process.env.TEST_MONGODB_URL)("Career actual runtime owner graph",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,userId:string,token:string;
 beforeAll(async()=>{fixture=await createMongoFixture("b2runtime");const identity=await new MongoIdentityService(fixture.resource).signup({email:randomUUID()+"@example.com",displayName:"Runtime",password:"correct-horse-battery"});userId=identity.user.id;token=identity.session.accessToken;},60000);afterAll(async()=>fixture?.dispose());
 it("fails closed before product intent/business writes when owner configuration is absent",async()=>{
  const legacy=new CareerService(fixture.resource),category=await legacy.createCategory(userId,{key:"r_"+randomUUID().replaceAll("-",""),name:"Runtime",icon:"folder",defaultView:"table",propertySchemaV2:[]}),db=mongoCollections(fixture.resource.db);await db.careerCategories.updateOne({_id:category.id},{$set:{schemaVersion:1,propertySchemaV2:[]}});
  const record=(await legacy.createRecord(userId,randomUUID(),{categoryId:category.id,title:"Preserved",properties:{},bodyMd:"Document"})).record;
  await db.careerRecords.updateOne({_id:record.id},{$set:{propertyValues:[]}});const before=await db.careerRecords.findOne({_id:record.id});
  const runtime=createCareerWriterRuntime(fixture.resource,loadRuntimeConfig({}),new CareerDocumentService(fixture.resource));const service=runtime.career.forSession!(token,userId);
  await expect(service.createRecordOperation!(userId,randomUUID(),{categoryId:category.id,title:"New",properties:{},bodyMd:"Body"})).rejects.toMatchObject({statusCode:503});
  await expect(service.updateRecordOperation!(userId,record.id,1,{title:"Forbidden fallback"})).rejects.toMatchObject({statusCode:503});
  expect(await db.careerRecords.findOne({_id:record.id})).toEqual(before);expect(await db.careerProductOperations.countDocuments({userId})).toBe(0);expect(await db.careerRecords.countDocuments({userId})).toBe(1);
 });
});