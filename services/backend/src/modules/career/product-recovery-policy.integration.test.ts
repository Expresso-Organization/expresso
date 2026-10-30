import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mongoCollections } from "@expresso/database";
import { CareerProducerBusinessResultSchema, CareerProducerScopeSchema } from "@expresso/contracts";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService } from "./service.js";
import { PreparedCareerDocumentWriter } from "../career-editor/index.js";
import { CareerProducerCoordinator, createCareerProducerIntent, careerProducerScopeFilter, type CareerProducerBusinessPort, type CareerProducerDocumentPort } from "./prepared-producer.js";

const noDocument: CareerProducerDocumentPort = { reserve: async () => {}, cancel: async () => {}, commit: async () => { throw new Error("unexpected document call"); } };
const policy = { maxAttempts: 2, classify: (error: unknown) => (error as {statusCode?: number}).statusCode === 412 ? "blocked" as const : "retry" as const };
describe.skipIf(!process.env.TEST_MONGODB_URL)("bounded product owner recovery", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>, userId: string;
  beforeAll(async () => { fixture = await createMongoFixture("b2prodpolicy"); userId = (await new MongoIdentityService(fixture.resource).signup({ email: randomUUID()+"@example.com", displayName: "recovery", password: "correct-horse-battery" })).user.id; }, 60000);
  afterAll(async () => fixture?.dispose());
  async function source() {
    const category = await new CareerService(fixture.resource).createCategory(userId, { key: "p_"+randomUUID().replaceAll("-",""), name: "회복", icon: "folder", defaultView: "table", propertySchemaV2:[] });
    const id = randomUUID(), intent = createCareerProducerIntent({ producer: "career-product", userId, sourceId: id, operationId: id, business: { kind: "create", expectedCategoryVersion: category.version, input: { categoryId: category.id, title: "created", propertyValues: [] } }, document: null }), now = new Date();
    await mongoCollections(fixture.resource.db).careerProductOperations.insertOne({ _id: id, userId, inputIdempotencyKey: randomUUID(), inputHash: "b".repeat(64), requestHash: intent.fingerprint, kind: "create", recordId: null, writerIntegration: intent, active: true, result: null, createdAt: now, updatedAt: now });
    return CareerProducerScopeSchema.parse(intent);
  }
  it("reclaims expired running with an existing owner receipt without repeating the owner", async () => {
    const scope = await source(), db = mongoCollections(fixture.resource.db), recordId = randomUUID();
    const receipt = CareerProducerBusinessResultSchema.parse({ data: { id: recordId, userId, categoryId: randomUUID(), title: "created", propertyValues: [], status: "draft", version: 1, updatedAt: new Date().toISOString() }, replayed: false });
    await db.careerProductOperations.updateOne({ _id: scope.sourceId }, { $set: { "writerIntegration.state": "running", "writerIntegration.leaseToken": randomUUID(), "writerIntegration.leaseUntil": new Date(0).toISOString(), "writerIntegration.businessResult": receipt } });
    let commits = 0;
    const business: CareerProducerBusinessPort = { commit: async () => { commits++; throw new Error("must replay durable receipt"); } };
    const finalize = async (tx: import("../../platform/mongo-transaction.js").MongoTransaction, intent: import("@expresso/contracts").CareerProducerIntent) => { await mongoCollections(tx.db).careerProductOperations.updateOne(careerProducerScopeFilter(scope), { $set: { active: false, result: { recordId: intent.businessResult!.data.id, version: intent.businessResult!.data.version } } }, { session: tx.session }); };
    const coordinator = new CareerProducerCoordinator(fixture.resource, business, noDocument, policy);
    expect(await coordinator.execute(scope, finalize)).toMatchObject({ state: "completed", businessResult: receipt });
    expect(await coordinator.execute(scope, finalize)).toMatchObject({ state: "completed" });
    expect(commits).toBe(0); expect(await db.careerProductOperations.findOne({ _id: scope.sourceId })).toMatchObject({ active: false, result: { recordId, version: 1 } });
  });
  it("turns a frozen stale-version conflict into explicit durable blocked state without leaking the error", async () => {
    const scope = await source(), business: CareerProducerBusinessPort = { commit: async () => { throw Object.assign(new Error("secret URI must never persist"), { statusCode: 412 }); } };
    const coordinator = new CareerProducerCoordinator(fixture.resource, business, noDocument, policy);
    await expect(coordinator.execute(scope)).rejects.toMatchObject({ statusCode: 412 });
    expect(await coordinator.pending(scope)).toMatchObject({ state: "blocked", lastError: "OWNER_CONFLICT", businessResult: null, documentResult: null });
    await expect(coordinator.execute(scope)).rejects.toMatchObject({ statusCode: 409 });
    expect(JSON.stringify(await mongoCollections(fixture.resource.db).careerProductOperations.findOne({ _id: scope.sourceId }))).not.toContain("secret URI");
  });
  it("releases only a blocked operation's document reservation atomically without undoing its business receipt",async()=>{
    const scope=await source(),db=mongoCollections(fixture.resource.db),stored=(await db.careerProductOperations.findOne({_id:scope.sourceId}))!;
    const record=(await new CareerService(fixture.resource).createRecord(userId,randomUUID(),{categoryId:stored.writerIntegration.business!.kind==="create"?stored.writerIntegration.business!.input.categoryId:randomUUID(),title:"Business already committed",properties:{},bodyMd:"Kept document"})).record;
    const receipt=CareerProducerBusinessResultSchema.parse({data:{id:record.id,userId,categoryId:record.categoryId,title:record.title,propertyValues:[],status:record.status,version:record.version,updatedAt:record.updatedAt},replayed:false});
    const intent=createCareerProducerIntent({...scope,business:stored.writerIntegration.business,document:{kind:"markdown",recordId:null,expectedVersion:0,markdown:"Pending",summary:"본문"}});
    await db.careerProductOperations.updateOne({_id:scope.sourceId},{$set:{requestHash:intent.fingerprint,writerIntegration:{...intent,businessResult:receipt}}});
    const nextScope=CareerProducerScopeSchema.parse(intent),before=await db.careerRecords.findOne({_id:record.id}),writer=new PreparedCareerDocumentWriter(fixture.resource);
    const document:CareerProducerDocumentPort={reserve:value=>writer.reserve(value),cancel:value=>writer.cancel(value),commit:async()=>{throw Object.assign(new Error("document stale"),{statusCode:409});},releaseBlocked:(value,tx)=>writer.releaseBlocked(value,tx)};
    const coordinator=new CareerProducerCoordinator(fixture.resource,{commit:async()=>{throw new Error("must not repeat business owner");}},document,{maxAttempts:2,classify:()=>"blocked"});
    await expect(coordinator.execute(nextScope)).rejects.toMatchObject({statusCode:409});
    expect(await coordinator.pending(nextScope)).toMatchObject({state:"blocked",businessResult:receipt,documentResult:null});
    expect(await db.careerRecords.findOne({_id:record.id})).toEqual(before);
    await expect(coordinator.cancel(nextScope)).rejects.toMatchObject({statusCode:409});
  });
  it("allows cancellation of blocked no-receipt business and mixed operations while retaining receipt fences",async()=>{
    for(const hasDocument of [false,true]){
      let scope=await source();const db=mongoCollections(fixture.resource.db),row=(await db.careerProductOperations.findOne({_id:scope.sourceId}))!;
      if(hasDocument){const intent=createCareerProducerIntent({...scope,business:row.writerIntegration.business,document:{kind:"markdown",recordId:null,expectedVersion:0,markdown:"Uncommitted",summary:"본문"}});await db.careerProductOperations.updateOne({_id:scope.sourceId},{$set:{writerIntegration:intent,requestHash:intent.fingerprint}});scope=CareerProducerScopeSchema.parse(intent);}
      const coordinator=new CareerProducerCoordinator(fixture.resource,{commit:async()=>{throw Object.assign(new Error("stale"),{statusCode:412});}},new PreparedCareerDocumentWriter(fixture.resource),policy);
      await expect(coordinator.execute(scope)).rejects.toMatchObject({statusCode:412});expect(await coordinator.pending(scope)).toMatchObject({state:"blocked",businessResult:null,documentResult:null});
      await coordinator.cancel(scope);expect(await coordinator.pending(scope)).toMatchObject({state:"cancelled",businessResult:null,documentResult:null});await coordinator.cancel(scope);
    }
  });
  it("caps transient redelivery while preserving frozen input and any earlier receipt", async () => {
    const scope = await source(), business: CareerProducerBusinessPort = { commit: async () => { throw Object.assign(new Error("unavailable"), { statusCode: 503 }); } };
    const coordinator = new CareerProducerCoordinator(fixture.resource, business, noDocument, policy);
    await expect(coordinator.execute(scope)).rejects.toMatchObject({ statusCode: 503 });
    expect(await coordinator.pending(scope)).toMatchObject({ state: "retry", attempts: 1 });
    await expect(coordinator.execute(scope)).rejects.toMatchObject({ statusCode: 503 });
    expect(await coordinator.pending(scope)).toMatchObject({ state: "blocked", attempts: 2, lastError: "RECOVERY_ATTEMPTS_EXHAUSTED" });
    await expect(coordinator.execute(scope)).rejects.toMatchObject({ statusCode: 409 });
    expect((await coordinator.pending(scope)).attempts).toBe(2);
  });
});
