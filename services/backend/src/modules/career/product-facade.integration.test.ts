import {randomUUID} from "node:crypto";
import Fastify from "fastify";
import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {ApiErrorResponseSchema,CareerProducerIntentSchema,type CareerProducerBusinessCommand,type CareerProducerDocumentCommand,type CareerProducerScope} from "@expresso/contracts";
import {Decimal128} from "mongodb";
import {mongoCollections} from "@expresso/database";
import {createMongoFixture} from "../../../test/support/mongodb.js";
import {MongoIdentityService,type IdentityPrincipal} from "../identity/index.js";
import {registerErrorHandler} from "../../api/error-handler.js";
import {registerCareerRoutes} from "./routes.js";
import {CareerError} from "./errors.js";
import {createCanonicalCareerCategory} from "./product-metadata.js";
import {createCareerProductFacade,type CareerProductPreparedWrites} from "./product-facade.js";
describe.skipIf(!process.env.TEST_MONGODB_URL)("explicit product facade on disposable Mongo",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>,userId:string,foreign:string;
 const token=`exps_${"P".repeat(43)}`,now=new Date("2026-10-09T00:00:00Z");
 beforeAll(async()=>{fixture=await createMongoFixture("b2pfacade");const identity=new MongoIdentityService(fixture.resource);userId=(await identity.signup({email:randomUUID()+"@example.test",password:"product-facade-password",displayName:"A"})).user.id;foreign=(await identity.signup({email:randomUUID()+"@example.test",password:"product-facade-password",displayName:"B"})).user.id;},60000);
 afterAll(async()=>fixture?.dispose());
 async function setup(){
  const category=await createCanonicalCareerCategory(fixture.resource,userId,{key:"facade_"+randomUUID().replaceAll("-",""),name:"Facade",icon:"note",defaultView:"table",propertySchema:{amount:{label:"Amount",type:"number",system:false,required:false},note:{label:"Note",type:"text",system:false,required:false}}}),recordId=randomUUID(),targetId=randomUUID(),relationId=randomUUID();
  const amount=category.propertySchemaV2!.find(def=>def.key==="amount")!.id,note=category.propertySchemaV2!.find(def=>def.key==="note")!.id;
  await mongoCollections(fixture.resource.db).careerCategories.updateOne({_id:category.id},{$push:{propertySchemaV2:{id:relationId,key:"related",name:"Related",type:"relation",system:false,required:false,config:{targetCategoryId:category.id,inversePropertyId:null,cardinality:"multiple",deletePolicy:"restrict"},order:2,version:1,deletedAt:null}}});
  const raw={_id:recordId,userId,categoryId:category.id,title:"Original",status:"draft" as const,origin:"manual" as const,properties:{note:"physical sentinel"},propertyValues:[{propertyDefinitionId:amount,type:"number" as const,value:Decimal128.fromString("123456789012345678901234567890.2300")},{propertyDefinitionId:note,type:"text" as const,value:"Canonical note"}],bodyMd:"Document sentinel",version:1,createdAt:now,updatedAt:now,deletedAt:null};
  await mongoCollections(fixture.resource.db).careerRecords.insertMany([raw,{...raw,_id:targetId,title:"Target",propertyValues:[]}]);
  const business={id:recordId,userId,categoryId:category.id,title:raw.title,status:raw.status,propertyValues:[{propertyDefinitionId:amount,type:"number",value:"123456789012345678901234567890.2300"},{propertyDefinitionId:note,type:"text",value:"Canonical note"}],version:1,updatedAt:now.toISOString()};
  const calls:{url:string;init:RequestInit}[]=[],transport=vi.fn(async(url:string,init:RequestInit)=>{calls.push({url,init});return Response.json({data:business},{status:init.method==="POST"&&url.endsWith("/records")?201:200,headers:{etag:'"v1"'}});});
  const factory=(preparedWrites?:CareerProductPreparedWrites)=>createCareerProductFacade(fixture.resource,{springBaseUrl:"http://spring.internal",transport,...(preparedWrites?{preparedWrites}:{})});
  return{category,recordId,targetId,relationId,amount,note,raw,business,calls,transport,factory};
 }
 it("requires an ephemeral bound session for business commands and never calls an owner for a mismatched actor",async()=>{
  const state=await setup(),unbound=state.factory();await expect(unbound.updateRecord(userId,state.recordId,1,{title:"New"})).rejects.toMatchObject({statusCode:401});
  const bound=unbound.forSession!(token,userId);await expect(bound.updateRecord(foreign,state.recordId,1,{title:"New"})).rejects.toMatchObject({statusCode:403});expect(state.transport).not.toHaveBeenCalled();
 });
 it("sends canonical deltas unchanged and keyed scalar replacements as explicit sets/unsets while preserving omitted relations",async()=>{
  const state=await setup(),api=state.factory().forSession!(token,userId);
  await api.updateRecord(userId,state.recordId,1,{title:"New",propertyValues:{set:[{propertyDefinitionId:state.amount,type:"number",value:"1.2300"}],unsetPropertyIds:[]}});
  expect(JSON.parse(String(state.calls[0]!.init.body))).toEqual({title:"New",propertyValues:{set:[{propertyDefinitionId:state.amount,type:"number",value:"1.2300"}],unsetPropertyIds:[]}});
  await api.updateRecord(userId,state.recordId,1,{properties:{note:"Changed"}});
  expect(JSON.parse(String(state.calls[1]!.init.body))).toEqual({propertyValues:{set:[{propertyDefinitionId:state.note,type:"text",value:"Changed"}],unsetPropertyIds:[state.amount]}});
  expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:state.recordId})).toEqual(state.raw);
 });
 it("sends copied relation envelopes with scalar create values in one owner command",async()=>{
  const state=await setup(),api=state.factory().forSession!(token,userId);
  await api.createRecord(userId,randomUUID(),{categoryId:state.category.id,title:"Copy",properties:{note:"Copied",related:{type:"relation",value:[{recordId:state.targetId,title:"stale display"}]}},bodyMd:""});
  expect(state.calls).toHaveLength(1);expect(JSON.parse(String(state.calls[0]!.init.body))).toEqual({categoryId:state.category.id,title:"Copy",propertyValues:[{propertyDefinitionId:state.note,type:"text",value:"Copied"}],initialRelations:[{propertyId:state.relationId,targetIds:[state.targetId]}]});
 });
 it("fails closed on owner outages and missing document coordination before any business or document write",async()=>{
  const state=await setup(),api=state.factory().forSession!(token,userId);state.transport.mockRejectedValue(new Error("owner outage"));
  await expect(api.updateRecord(userId,state.recordId,1,{status:"organized"})).rejects.toMatchObject({statusCode:503});
  expect(state.calls).toHaveLength(0);
  await expect(api.updateRecord(userId,state.recordId,1,{bodyMd:"New document"})).rejects.toMatchObject({statusCode:503,message:"Career product document coordination is unavailable"});
  expect(state.transport).toHaveBeenCalledOnce();expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:state.recordId})).toEqual(state.raw);
 });
 it("returns a clear bulk-schema 409 through the existing API and preserves both schema and records",async()=>{
  const state=await setup(),before=(await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:state.category.id}))!,app=Fastify({logger:false,genReqId:()=>randomUUID()});app.decorateRequest("auth",null);registerErrorHandler(app);registerCareerRoutes(app,{careerService:state.factory(),authenticateRequest:async request=>{request.auth={sessionId:randomUUID(),user:{id:userId}}as IdentityPrincipal;}});
  try{const response=await app.inject({method:"PATCH",url:"/v1/career/categories/"+state.category.id+"/property-schema",headers:{authorization:"Bearer "+token,"if-match":'"v1"'},payload:{propertySchema:{},confirmValueRemoval:true}});expect(response.statusCode).toBe(409);expect(ApiErrorResponseSchema.parse(response.json()).error).toMatchObject({code:"BULK_SCHEMA_CHANGE_UNSUPPORTED",message:"Bulk schema changes are unsupported; use the documented preview/apply/restore operations",details:{reasonCode:"BULK_SCHEMA_CHANGE_UNSUPPORTED",supportedOperations:{preview:"/v1/career/categories/"+state.category.id+"/property-schema/preview",apply:"/v1/career/categories/"+state.category.id+"/property-schema/apply",restore:"/v1/career/categories/"+state.category.id+"/property-schema/:propertyId/restore"}}});}
  finally{await app.close();}
  expect(await mongoCollections(fixture.resource.db).careerCategories.findOne({_id:state.category.id})).toEqual(before);expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:state.recordId})).toEqual(state.raw);expect(state.transport).not.toHaveBeenCalled();
 });
 function prepared(state:Awaited<ReturnType<typeof setup>>,status:"completed"|"retry"|"blocked"="completed"){
  let command:CareerProducerBusinessCommand|null=null,document:CareerProducerDocumentCommand|null=null;const scope:CareerProducerScope={producer:"career-product",userId,sourceId:randomUUID(),operationId:randomUUID(),fingerprint:"a".repeat(64)};
  const port:CareerProductPreparedWrites={prepareWithStatus:vi.fn(async(_user,_key,_hash,business,body)=>{command=business;document=body;return{scope,created:true};}),execute:vi.fn(async()=>CareerProducerIntentSchema.parse({...scope,business:command,document,state:status,leaseToken:null,leaseUntil:null,attempts:1,fence:1,businessResult:command?{data:state.business,replayed:false}:null,documentResult:status==="completed"&&document?{recordId:state.recordId,documentVersion:1,beforeSnapshotId:randomUUID(),afterSnapshotId:randomUUID(),revisionId:randomUUID()}:null,lastError:status==="blocked"?"OWNER_CONFLICT":status==="retry"?"OWNER_CALL_FAILED":null,createdAt:now.toISOString(),updatedAt:now.toISOString()}))};return{port,scope};
 }
 it("coordinates mixed inputs without persisting a user session and rereads only completed owner results",async()=>{
  const state=await setup(),runner=prepared(state),api=state.factory(runner.port).forSession!(token,userId);
  const result=await api.updateRecordOperation!(userId,state.recordId,1,{title:"Mixed",bodyMd:"New body"});expect(result.status).toBe(200);
  const args=vi.mocked(runner.port.prepareWithStatus).mock.calls[0]!;expect(args[0]).toBe(userId);expect(args[2]).toMatch(/^[a-f0-9]{64}$/);expect(args[3]).toMatchObject({kind:"patch",recordId:state.recordId,expectedVersion:1,expectedCategoryVersion:1,patches:[{title:"Mixed"}]});expect(args[4]).toMatchObject({kind:"markdown",recordId:state.recordId,expectedVersion:0,markdown:"New body"});expect(JSON.stringify(args)).not.toContain(token);expect(state.transport).not.toHaveBeenCalled();
 });
 it("returns public202 only while an owner is pending and returns recovery-required conflicts without a legacy fallback",async()=>{
  for(const status of["retry","blocked"]as const){const state=await setup(),runner=prepared(state,status),api=state.factory(runner.port).forSession!(token,userId);
   if(status==="retry"){const result=await api.updateRecordOperation!(userId,state.recordId,1,{bodyMd:"New body"});expect(result).toMatchObject({status:202,body:{data:{operationId:runner.scope.operationId,state:"retry",owners:{business:"not-required",document:"pending"}}}});await expect(api.updateRecord(userId,state.recordId,1,{bodyMd:"New body"})).rejects.toMatchObject({statusCode:409});}
   else await expect(api.updateRecordOperation!(userId,state.recordId,1,{bodyMd:"New body"})).rejects.toMatchObject({statusCode:409,publicDetails:{operation:{state:"recovery-required"}}});
   expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({_id:state.recordId})).toEqual(state.raw);expect(state.transport).not.toHaveBeenCalled();
  }
 });
 it("binds create201/200 to durable insertion status rather than a persisted owner receipt flag",async()=>{
  const state=await setup(),runner=prepared(state),api=state.factory(runner.port).forSession!(token,userId),key=randomUUID(),input={categoryId:state.category.id,title:"Copy",properties:{note:"Raw label"},bodyMd:"Copied document"};
  expect((await api.createRecordOperation!(userId,key,input)).status).toBe(201);
  const scope=runner.scope;vi.mocked(runner.port.prepareWithStatus).mockResolvedValue({scope,created:false});
  expect((await api.createRecordOperation!(userId,key,input)).status).toBe(200);
  const first=vi.mocked(runner.port.prepareWithStatus).mock.calls[0]!,second=vi.mocked(runner.port.prepareWithStatus).mock.calls[1]!;
  expect(second[2]).toBe(first[2]);expect(first[3]).toMatchObject({kind:"create",expectedCategoryVersion:1,input:{categoryId:state.category.id,title:"Copy",propertyValues:[{propertyDefinitionId:state.note,type:"text",value:"Raw label"}]}});if(first[3]?.kind!=="create")throw new Error("expected create command");expect(first[3].input).not.toHaveProperty("initialRelations");expect(first[4]).toMatchObject({recordId:null,expectedVersion:0,markdown:"Copied document"});expect(JSON.stringify(first)).not.toContain(token);
 });
 it("combines an explicit relation envelope with a keyed scalar replacement in one CAS",async()=>{
  const state=await setup(),api=state.factory().forSession!(token,userId);
  await api.updateRecord(userId,state.recordId,1,{status:"organized",properties:{amount:"1.2300",related:{type:"relation",value:[{recordId:state.targetId,title:"not trusted"}]}}});
  expect(state.calls).toHaveLength(1);expect(JSON.parse(String(state.calls[0]!.init.body))).toEqual({status:"organized",propertyValues:{set:[{propertyDefinitionId:state.amount,type:"number",value:"1.2300"}],unsetPropertyIds:[state.note]},relations:[{propertyId:state.relationId,targetIds:[state.targetId]}]});
 });
 it("bridges an exact canonical move preview and preserves explicit discards on commit",async()=>{
  const state=await setup(),target=await createCanonicalCareerCategory(fixture.resource,userId,{key:"move_"+randomUUID().replaceAll("-",""),name:"Target",icon:"note",defaultView:"table",propertySchema:{}}),previewToken="P".repeat(64),sample={propertyDefinitionId:state.amount,type:"number",value:"123456789012345678901234567890.2300"};
  state.transport.mockImplementationOnce(async()=>Response.json({data:{targetCategoryId:target.id,version:1,expiresAt:new Date(Date.now()+60000).toISOString(),previewToken,conversions:[{sourcePropertyId:state.amount,targetPropertyId:null,kind:"unmapped",sampleBefore:sample,sampleAfter:null}],unmappedPropertyIds:[state.amount]}}));
  const api=state.factory().forSession!(token,userId),preview=await api.previewCategoryMove!(userId,state.recordId,target.id);
  expect(preview).toMatchObject({recordId:state.recordId,sourceCategoryId:state.category.id,targetCategoryId:target.id,recordVersion:1,sourceSchemaVersion:1,targetSchemaVersion:1,unmappedProperties:{[state.amount]:sample}});
  await api.commitCategoryMove!(userId,state.recordId,{recordId:state.recordId,targetCategoryId:target.id,previewToken,expectedVersion:1,discardUnmappedPropertyIds:[state.amount]});
  expect(JSON.parse(String(state.calls.at(-1)!.init.body))).toEqual({targetCategoryId:target.id,previewToken,discardUnmappedPropertyIds:[state.amount]});
 });
 it("passes an original mixed-request CAS to durable replay after its business owner already advanced the record",async()=>{
  const state=await setup(),runner=prepared(state),api=state.factory(runner.port).forSession!(token,userId);
  await mongoCollections(fixture.resource.db).careerRecords.updateOne({_id:state.recordId},{$set:{title:"Mixed"},$inc:{version:1}});
  const original=vi.mocked(runner.port.prepareWithStatus).getMockImplementation()!;vi.mocked(runner.port.prepareWithStatus).mockImplementation(async(...args)=>({...await original(...args),created:false}));
  const result=await api.updateRecordOperation!(userId,state.recordId,1,{title:"Mixed",bodyMd:"New body"});expect(result.status).toBe(200);
  expect(runner.port.prepareWithStatus).toHaveBeenCalledWith(userId,expect.any(String),expect.any(String),expect.objectContaining({expectedVersion:1}),expect.any(Object),expect.objectContaining({expectedBusinessVersion:1}));
 });
 it("replays a frozen mixed source before translating a keyed input against a later schema",async()=>{
  const state=await setup(),runner=prepared(state),command={kind:"patch"as const,recordId:state.recordId,expectedVersion:1,expectedCategoryVersion:1,patches:[{propertyValues:{set:[{propertyDefinitionId:state.note,type:"text"as const,value:"Original request"}],unsetPropertyIds:[]}}]},document={kind:"markdown"as const,recordId:state.recordId,expectedVersion:0,markdown:"New body",summary:"본문"};
  await mongoCollections(fixture.resource.db).careerCategories.updateOne({_id:state.category.id},{$pull:{propertySchemaV2:{id:state.note}}});
  await mongoCollections(fixture.resource.db).careerRecords.updateOne({_id:state.recordId},{$pull:{propertyValues:{propertyDefinitionId:state.note}},$inc:{version:1}});
  runner.port.findPrepared=vi.fn(async()=>runner.scope);vi.mocked(runner.port.execute).mockResolvedValue(CareerProducerIntentSchema.parse({...runner.scope,business:command,document,state:"completed",leaseToken:null,leaseUntil:null,attempts:1,fence:1,businessResult:{data:state.business,replayed:false},documentResult:{recordId:state.recordId,documentVersion:1,beforeSnapshotId:randomUUID(),afterSnapshotId:randomUUID(),revisionId:randomUUID()},lastError:null,createdAt:now.toISOString(),updatedAt:now.toISOString()}));
  const api=state.factory(runner.port).forSession!(token,userId),result=await api.updateRecordOperation!(userId,state.recordId,1,{properties:{note:"Original request"},bodyMd:"New body"});
  expect(result.status).toBe(200);expect(runner.port.findPrepared).toHaveBeenCalledWith(userId,expect.any(String),expect.stringMatching(/^[a-f0-9]{64}$/));expect(runner.port.prepareWithStatus).not.toHaveBeenCalled();expect(state.transport).not.toHaveBeenCalled();
 });
 it("forwards canonical scalar copies and explicit initial relations together without precision loss",async()=>{
  const state=await setup(),api=state.factory().forSession!(token,userId),values=[{propertyDefinitionId:state.amount,type:"number"as const,value:"123456789012345678901234567890.2300"}],initialRelations=[{propertyId:state.relationId,targetIds:[state.targetId]}];
  await api.createRecord(userId,"legacy-safe-create-key_001",{categoryId:state.category.id,title:"Copy",properties:{},propertyValues:values,initialRelations,bodyMd:""});
  expect(JSON.parse(String(state.calls[0]!.init.body))).toEqual({categoryId:state.category.id,title:"Copy",propertyValues:values,initialRelations});
 });
 it("rejects duplicate relation bindings across keyed and explicit create inputs before the owner",async()=>{
  const state=await setup(),api=state.factory().forSession!(token,userId);
  await expect(api.createRecord(userId,randomUUID(),{categoryId:state.category.id,title:"Copy",properties:{related:{type:"relation",value:[{recordId:state.targetId,title:"Target"}]}},initialRelations:[{propertyId:state.relationId,targetIds:[]}],bodyMd:""})).rejects.toMatchObject({statusCode:400});expect(state.transport).not.toHaveBeenCalled();
 });
 it("uses an existing nonUUID public key for partial create replay without re-preparing owner payloads",async()=>{
  const state=await setup(),runner=prepared(state,"retry"),api=state.factory(runner.port).forSession!(token,userId),key="legacy-safe-create-key_002",input={categoryId:state.category.id,title:"Copy",properties:{},propertyValues:[{propertyDefinitionId:state.amount,type:"number"as const,value:"1.2300"}],initialRelations:[{propertyId:state.relationId,targetIds:[state.targetId]}],bodyMd:"Private copied body"};
  expect(await api.createRecordOperation!(userId,key,input)).toMatchObject({status:202,body:{data:{state:"retry",owners:{business:"completed",document:"pending"}}}});
  const original=await runner.port.execute(runner.scope);vi.mocked(runner.port.execute).mockResolvedValue(CareerProducerIntentSchema.parse({...original,state:"completed",documentResult:{recordId:state.recordId,documentVersion:1,beforeSnapshotId:randomUUID(),afterSnapshotId:randomUUID(),revisionId:randomUUID()},lastError:null}));runner.port.findPrepared=vi.fn(async()=>runner.scope);
  const result=await api.createRecordOperation!(userId,key,input);expect(result.status).toBe(200);expect(runner.port.prepareWithStatus).toHaveBeenCalledOnce();expect(runner.port.findPrepared).toHaveBeenCalledWith(userId,key,vi.mocked(runner.port.prepareWithStatus).mock.calls[0]![2]);
  expect(vi.mocked(runner.port.prepareWithStatus).mock.calls[0]![3]).toMatchObject({input:{initialRelations:input.initialRelations,propertyValues:input.propertyValues}});expect(state.transport).not.toHaveBeenCalled();
 });
 it("shares the durable create-key namespace when body changes and rejects before a second owner create",async()=>{
  const state=await setup(),runner=prepared(state,"retry"),api=state.factory(runner.port).forSession!(token,userId),key="legacy-safe-create-key_003",input={categoryId:state.category.id,title:"Copy",properties:{},bodyMd:"Original body"};
  await api.createRecordOperation!(userId,key,input);const hash=vi.mocked(runner.port.prepareWithStatus).mock.calls[0]![2];
  runner.port.findPrepared=vi.fn(async(_user,_key,inputHash)=>{if(inputHash!==hash)throw new CareerError(409,"Career idempotency key was reused for another write");return runner.scope;});
  await expect(api.createRecordOperation!(userId,key,{...input,bodyMd:""})).rejects.toMatchObject({statusCode:409});expect(state.transport).not.toHaveBeenCalled();expect(runner.port.prepareWithStatus).toHaveBeenCalledOnce();
  expect(await mongoCollections(fixture.resource.db).careerRecords.countDocuments({userId,categoryId:state.category.id})).toBe(2);
 });
});