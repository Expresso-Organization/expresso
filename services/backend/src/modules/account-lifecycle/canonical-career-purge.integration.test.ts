import {randomUUID} from "node:crypto";
import {Binary,type Document} from "mongodb";
import {beforeAll,afterAll,describe,it,expect} from "vitest";
import {mongoCollections} from "@expresso/database";
import {createMongoFixture} from "../../../test/support/mongodb.js";
import {MongoIdentityService} from "../identity/index.js";
import {createCareerProducerIntent} from "../career/index.js";
import {AccountLifecycleService} from "./service.js";

const ledgers=["career_property_options","career_property_mutations","career_property_mutation_receipts","career_relation_property_tombstones","career_record_relations","career_command_idempotency","career_document_snapshots","career_document_updates","career_record_revisions","career_ai_proposals","career_product_operations"] as const;
describe.skipIf(!process.env.TEST_MONGODB_URL)("canonical career account purge privacy",()=>{
 let fixture:Awaited<ReturnType<typeof createMongoFixture>>;
 beforeAll(async()=>{fixture=await createMongoFixture("canonicalpurge");},60000);
 afterAll(async()=>fixture?.dispose());
 async function seedOwner(label:string){
  const userId=(await new MongoIdentityService(fixture.resource).signup({email:`${label}-${randomUUID()}@example.test`,displayName:label,password:"correct-horse-battery"})).user.id;
  const now=new Date(),recordId=randomUUID(),categoryId=randomUUID(),propertyId=randomUUID(),mutationId=randomUUID(),operationId=randomUUID(),edge={_id:randomUUID(),userId,sourceRecordId:recordId,sourcePropertyId:propertyId,targetRecordId:randomUUID(),cardinality:"multiple",deletePolicy:"nullify",createdBy:"user",createdAt:now,updatedAt:now};
  const response={_id:recordId,userId,categoryId,title:label,status:"draft",propertyValues:[],version:1,updatedAt:now};
  await mongoCollections(fixture.resource.db).careerRecords.insertOne({...response,status:"draft",origin:"manual",properties:{},bodyMd:`${label} private body`,createdAt:now,deletedAt:null,purgeAfter:null});
  const intent=createCareerProducerIntent({producer:"career-product",userId,sourceId:operationId,operationId,business:{kind:"create",expectedCategoryVersion:1,input:{categoryId,title:label,propertyValues:[]}},document:null});
  const rows:Record<typeof ledgers[number],Document>={
   career_property_options:{_id:randomUUID(),userId,categoryId,propertyId,optionId:randomUUID(),rawLabel:`${label} private option`,version:1,createdAt:now},
   career_property_mutations:{_id:mutationId,userId,categoryId,propertyId,planJson:"{}",operationFingerprint:"a".repeat(64),status:"pending",active:true,cursor:0,processedCount:0,skippedCount:0,attempts:0,leaseToken:null,leaseUntil:null,lastError:null,commitFence:0,createdAt:now,updatedAt:now,completedAt:null},
   career_property_mutation_receipts:{_id:randomUUID(),userId,mutationId,recordId,operationFingerprint:"a".repeat(64),response,changed:false,createdAt:now},
   career_relation_property_tombstones:{_id:randomUUID(),userId,categoryId,propertyId,recordId,deletionMutationId:mutationId,definitionVersion:1,deletedAt:now.toISOString(),categoryVersion:1,schemaVersion:1,config:{targetCategoryId:categoryId,inversePropertyId:null,cardinality:"multiple",deletePolicy:"nullify"},sourceRecordVersion:1,forwardEdges:[edge],inverseEdges:[],inverseDefinitionBindings:[],inverseRecordVersions:{[edge.targetRecordId]:1},inverseRecordReferenceVersions:{[edge.targetRecordId]:0},createdAt:now},
   career_record_relations:edge,
   career_command_idempotency:{_id:randomUUID(),userId,key:randomUUID(),requestHash:"b".repeat(64),response,createdAt:now},
   career_document_snapshots:{_id:randomUUID(),userId,recordId,documentVersion:0,schemaVersion:1,content:{privateBody:label},stateVector:new Binary(Buffer.from([0])),serverSequence:0,checksum:"c".repeat(64),actor:"user",createdAt:now},
   career_document_updates:{_id:randomUUID(),userId,recordId,clientId:randomUUID(),clientSequence:1,serverSequence:1,update:new Binary(Buffer.from([0])),byteLength:1,updateHash:"d".repeat(64),actor:"user",receivedAt:now,compactedAt:null},
   career_record_revisions:{_id:randomUUID(),userId,recordId,actor:"user",summary:`${label} private revision`,beforeVersion:0,afterVersion:1,createdAt:now},
   career_ai_proposals:{_id:randomUUID(),userId,recordId,status:"ready",baseDocumentVersion:0,selection:{blockIds:[]},prompt:`${label} private AI prompt`,summary:label,commands:[],propertyChanges:[],progress:null,beforeSnapshotId:null,afterSnapshotId:null,beforeChecksum:null,afterChecksum:null,revisionId:null,appliedDocumentVersion:null,expiresAt:new Date("2030-01-01T00:00:00Z"),createdAt:now,updatedAt:now},
   career_product_operations:{_id:operationId,userId,inputIdempotencyKey:randomUUID(),inputHash:"e".repeat(64),requestHash:intent.fingerprint,kind:"create",recordId:null,writerIntegration:intent,active:true,result:null,createdAt:now,updatedAt:now},
  };
  for(const name of ledgers)await fixture.resource.db.collection<Document>(name).insertOne(rows[name]);return{userId,rows};
 }
 it("erases all owned runtime career ledgers after grace while preserving foreign rows exactly",async()=>{
  const own=await seedOwner("own"),foreign=await seedOwner("foreign"),service=new AccountLifecycleService(fixture.resource),requested=await service.requestDeletion(own.userId,new Date("2026-08-01T00:00:00Z"));
  expect(await service.purgeExpired(new Date("2026-08-30T23:59:59Z"))).toEqual({purged:[]});for(const name of ledgers)expect(await fixture.resource.db.collection(name).countDocuments({userId:own.userId}),name).toBe(1);
  expect(await service.purgeExpired(new Date("2026-08-31T00:00:00Z"))).toEqual({purged:[requested.requestId]});
  for(const name of ledgers){expect(await fixture.resource.db.collection(name).countDocuments({userId:own.userId}),name).toBe(0);expect(await fixture.resource.db.collection(name).findOne({userId:foreign.userId}),name).toEqual(foreign.rows[name]);}
  expect(await mongoCollections(fixture.resource.db).users.findOne({_id:foreign.userId})).not.toBeNull();expect(await mongoCollections(fixture.resource.db).careerRecords.countDocuments({userId:own.userId})).toBe(0);
 });
});
