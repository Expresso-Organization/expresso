import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {API_PREFIX,CareerPropertyOptionResponseSchema} from "@expresso/contracts";
import {mongoCollections} from "@expresso/database";
import {buildApi} from "../../api/build-app.js";
import type {RuntimeConfig} from "../../config/runtime-config.js";
import {MongoIdentityService} from "../identity/index.js";
import {createMongoFixture} from "../../../test/support/mongodb.js";
import {CareerService} from "./service.js";
const config:RuntimeConfig={nodeEnv:"test",host:"127.0.0.1",port:4000,logLevel:"silent",databaseUrl:"mysql://127.0.0.1:1/unused",redisUrl:"redis://127.0.0.1:1",outboxPollIntervalMs:1000,outboxBatchSize:25,outboxMaxAttempts:5,queuePrefix:"b2-option-test"};
describe.skipIf(!process.env.TEST_MONGODB_URL)("private freeform options actual authenticated API",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,app:ReturnType<typeof buildApi>,userA:string,userB:string,tokenA:string,tokenB:string,categoryId:string,propertyId:string;
 beforeAll(async()=>{
  fixture=await createMongoFixture("b2optionapi");const identity=new MongoIdentityService(fixture.resource);
  userA=(await identity.signup({email:`a-${randomUUID()}@example.com`,displayName:"A",password:"disposable-api-password"})).user.id;
  userB=(await identity.signup({email:`b-${randomUUID()}@example.com`,displayName:"B",password:"disposable-api-password"})).user.id;
  tokenA=(await identity.issueSession({userId:userA})).accessToken;tokenB=(await identity.issueSession({userId:userB})).accessToken;
  const category=await mongoCollections(fixture.resource.db).careerCategories.findOne({isSystem:true,"propertySchemaV2.type":"multi_select"});
  if(!category)throw new Error("prepared default tags fixture missing");categoryId=category._id;propertyId=category.propertySchemaV2!.find(definition=>definition.type==="multi_select" && definition.config.legacyFreeformTags===true)!.id;
  app=buildApi({config,identityService:identity,careerService:new CareerService(fixture.resource)});
 },30000);
 afterAll(async()=>{await app?.close();await fixture?.dispose();});
 const path=()=>`${API_PREFIX}/career/categories/${categoryId}/property-schema/${propertyId}/options`;
 async function register(token:string,label:string) {const result=await app.inject({method:"POST",url:path(),headers:{authorization:`Bearer ${token}`},payload:{label}});expect(result.statusCode).toBe(200);return CareerPropertyOptionResponseSchema.parse(result.json());}
 it("preserves raw labels, retries stable IDs and isolates simultaneous users without schema/record writes",async()=>{
  const db=mongoCollections(fixture.resource.db),before=await db.careerCategories.findOne({_id:categoryId});
  const count=await db.careerRecords.countDocuments({});
  const responses=await Promise.all(Array.from({length:6},()=>register(tokenA," Exact 😀 tag ")));
  expect(new Set(responses.map(response=>response.data.id)).size).toBe(1);expect(responses[0]!.data.name).toBe(" Exact 😀 tag ");
  const b=await register(tokenB," Exact 😀 tag ");expect(b.data.id).not.toBe(responses[0]!.data.id);
  expect(await fixture.resource.db.collection("career_property_options").countDocuments({userId:userA,categoryId,propertyId,rawLabel:" Exact 😀 tag "})).toBe(1);
  expect(await db.careerCategories.findOne({_id:categoryId})).toEqual(before);expect(await db.careerRecords.countDocuments({})).toBe(count);
 });
 it("rejects untrusted owner input and unauthenticated requests before option writes",async()=>{
  const count=await fixture.resource.db.collection("career_property_options").countDocuments({});
  expect((await app.inject({method:"POST",url:path(),headers:{authorization:`Bearer ${tokenA}`},payload:{label:"x",userId:userB}})).statusCode).toBe(400);
  expect((await app.inject({method:"POST",url:path(),payload:{label:"x"}})).statusCode).toBe(401);
  expect(await fixture.resource.db.collection("career_property_options").countDocuments({})).toBe(count);
 });
});
