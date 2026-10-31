import { createHmac, randomUUID } from "node:crypto";
import { Decimal128 } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_PREFIX, CareerProducerBusinessResultSchema, CareerProducerCommitRequestSchema, CareerProducerServiceClaimsSchema, DummyAccountResponseSchema, type CareerBusinessPropertyValue, type CareerProducerBusinessCommand } from "@expresso/contracts";
import { mongoCollections, readCanonicalCareerPropertyValues, stableCareerId, type CareerRecordDoc } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { buildApi } from "../../api/build-app.js";
import { loadRuntimeConfig } from "../../config/runtime-config.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { createCareerWriterRuntime } from "../../platform/career-writer-runtime.js";
import { CareerDocumentService } from "../career-editor/index.js";
import { ConsentService } from "../consent/index.js";
import { IdentityService } from "../identity/index.js";
import { AdminService } from "./service.js";

const secret = "admin-product-service-secret-with-more-than-32-bytes";
const config = { ...loadRuntimeConfig({}), logLevel: "silent" as const, careerSpringBaseUrl: "http://admin-owner.test", careerProductServiceSecret: secret };
const storedValues = (values: CareerBusinessPropertyValue[]): NonNullable<CareerRecordDoc["propertyValues"]> => values.map(value => value.type === "number" ? { ...value, value: Decimal128.fromString(value.value) } : value);

describe.skipIf(!process.env.TEST_MONGODB_URL)("admin dummy records through canonical service credentials", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let identity: IdentityService;
  let adminToken: string;
  let documents: CareerDocumentService;
  let runtime: ReturnType<typeof createCareerWriterRuntime>;
  let app: ReturnType<typeof buildApi>;
  const requestErrors: Error[] = [];
  const commands: Array<{ userId: string; command: CareerProducerBusinessCommand }> = [];
  beforeAll(async () => {
    fixture = await createMongoFixture("admincanonical");
    identity = new IdentityService(fixture.resource);
    documents = new CareerDocumentService(fixture.resource);
    // 이 fake는 Spring 업무 소유자만 대신하며 Node adapter에 Mongo 업무 쓰기 경로를 주지 않습니다.
    const transport = async (url: string, init: RequestInit): Promise<Response> => {
      expect(url).toBe("http://admin-owner.test/internal/career/integration/business");
      const request = CareerProducerCommitRequestSchema.parse(JSON.parse(String(init.body)));
      const bearer = new Headers(init.headers).get("authorization")!;
      expect(bearer).toMatch(/^Bearer expi\./);
      const [, payload, signature] = bearer.slice(7).split(".");
      expect(signature).toBe(createHmac("sha256", secret).update(payload!).digest("base64url"));
      const claims = CareerProducerServiceClaimsSchema.parse(JSON.parse(Buffer.from(payload!, "base64url").toString()));
      expect(claims).toMatchObject({ userId: request.userId, producer: "career-product", operationId: request.operationId, audience: "career-producer" });
      return inTransaction(fixture.resource, async tx => {
      const db=mongoCollections(tx.db),ownerOptions={session:tx.session};
      const source = await db.careerProductOperations.findOne({ _id: request.sourceId, userId: request.userId },ownerOptions);
      if(source?.writerIntegration.businessResult)return Response.json(source.writerIntegration.businessResult,{headers:{etag:'"v'+source.writerIntegration.businessResult.data.version+'"'}});
      expect(source?.writerIntegration.leaseToken).toBe(request.leaseToken);
      const command = source?.writerIntegration.business;
      if (!command) throw new Error("durable service command missing");
      commands.push({ userId: request.userId, command });
      const now = new Date();
      let record: CareerRecordDoc;
      if (command.kind === "create") {
        const category = await db.careerCategories.findOne({ _id: command.input.categoryId, userId: request.userId },ownerOptions);
        expect(category?.version).toBe(command.expectedCategoryVersion);
        record = { _id: randomUUID(), userId: request.userId, categoryId: command.input.categoryId, title: "title" in command.input ? command.input.title : "", status: "draft", origin: "manual", properties: {}, propertyValues: storedValues("propertyValues" in command.input ? command.input.propertyValues : []), bodyMd: "", version: 1, createdAt: now, updatedAt: now, deletedAt: null };
        await db.careerRecords.insertOne(record,ownerOptions);
      } else {
        const previous = await db.careerRecords.findOne({ _id: command.recordId, userId: request.userId },ownerOptions);
        if (!previous) throw new Error("owned owner record missing");
        expect(previous.version).toBe(command.expectedVersion);
        record = { ...previous, version: previous.version + 1, updatedAt: now };
        for (const patch of command.patches) {
          if ("status" in patch && patch.status !== undefined) record.status = patch.status;
          if ("title" in patch && patch.title !== undefined) record.title = patch.title;
          if ("propertyValues" in patch && patch.propertyValues) {
            const replaced = new Set([...patch.propertyValues.unsetPropertyIds, ...patch.propertyValues.set.map(value => value.propertyDefinitionId)]);
            record.propertyValues = [...(record.propertyValues ?? []).filter(value => !replaced.has(value.propertyDefinitionId)), ...storedValues(patch.propertyValues.set)];
          }
          for (const relation of patch.relations ?? []) {
            const category = await db.careerCategories.findOne({ _id: record.categoryId, userId: request.userId },ownerOptions);
            const definition = category!.propertySchemaV2.find(value => value.id === relation.propertyId)!;
            await db.careerRecordRelations.deleteMany({ userId: request.userId, sourceRecordId: record._id, sourcePropertyId: relation.propertyId },ownerOptions);
            for (const targetRecordId of relation.targetIds) await db.careerRecordRelations.insertOne({ _id: randomUUID(), userId: request.userId, sourceRecordId: record._id, sourcePropertyId: relation.propertyId, targetRecordId, inversePropertyId: typeof definition.config.inversePropertyId === "string" ? definition.config.inversePropertyId : null, cardinality: definition.config.cardinality === "single" ? "single" : "multiple", deletePolicy: definition.config.deletePolicy === "nullify" ? "nullify" : "restrict", createdBy: "user", createdAt: now, updatedAt: now },ownerOptions);
          }
        }
        await db.careerRecords.replaceOne({ _id: record._id, userId: record.userId }, record,ownerOptions);
      }
      const receipt=CareerProducerBusinessResultSchema.parse({ data: { id: record._id, userId: record.userId, categoryId: record.categoryId, title: record.title, status: record.status, propertyValues: readCanonicalCareerPropertyValues(record), version: record.version, updatedAt: record.updatedAt.toISOString() }, replayed: false });
      const changed=await db.careerProductOperations.updateOne({_id:request.sourceId,userId:request.userId,"writerIntegration.leaseToken":request.leaseToken},{$set:{"writerIntegration.businessResult":receipt}},ownerOptions);
      expect(changed.matchedCount).toBe(1);
      return Response.json(receipt, { headers: { etag: '"v' + record.version + '"' } });
      });
    };
    runtime = createCareerWriterRuntime(fixture.resource, config, documents, { transport });
    const admin = new AdminService(fixture.resource, { identity, career: runtime.adminCareer, consent: new ConsentService(fixture.resource) });
    app = buildApi({ config, identityService: identity, careerService: runtime.career, adminService: admin });
    app.addHook("onError", async (_request, _reply, error) => { requestErrors.push(error); });
    const email = randomUUID() + "@example.test";
    adminToken = (await identity.signup({ email, displayName: "Admin", password: "correct-horse-battery" })).session.accessToken;
    await admin.setRole(email, "admin");
    await app.ready();
  }, 60_000);
  afterAll(async () => { await app?.close(); await fixture?.dispose(); });

  it("creates main dummy bodies, statuses and relations with scoped producer credentials and no dummy sessions", async () => {
    const response = await app.inject({ method: "POST", url: API_PREFIX + "/admin/dummy-accounts/dummy-newgrad", headers: { authorization: "Bearer " + adminToken } });
    const operationStates=(await mongoCollections(fixture.resource.db).careerProductOperations.find({}).toArray()).map(row=>({state:row.writerIntegration.state,error:row.writerIntegration.lastError,business:!!row.writerIntegration.businessResult,document:!!row.writerIntegration.documentResult}));
    expect(response.statusCode, JSON.stringify({errors:requestErrors.map(error => error.stack),commands:commands.length,operations:operationStates}) || response.body).toBe(201);
    const dummy = DummyAccountResponseSchema.parse(response.json()).data;
    expect(dummy.account?.recordCount).toBe(3);
    const userId = dummy.account!.userId, db = mongoCollections(fixture.resource.db);
    expect(commands.every(command => command.userId === userId)).toBe(true);
    expect(commands.filter(item => item.command.kind === "create")).toHaveLength(3);
    expect(commands.some(item => item.command.kind === "patch" && item.command.patches.some(patch => "status" in patch && patch.status === "organized"))).toBe(true);
    expect(commands.some(item => item.command.kind === "patch" && item.command.patches.some(patch => patch.relations?.length))).toBe(true);
    expect((await db.careerRecords.find({ userId }).toArray()).map(record => record.status).sort()).toEqual(["draft", "organized", "organized"]);
    expect(await db.careerRecordRelations.countDocuments({ userId })).toBeGreaterThan(0);
    expect(await db.identitySessions.countDocuments({ userId })).toBe(0);
    expect((await db.users.findOne({ _id: userId }))?.profile).toMatchObject({ targetRoles: ["백엔드"], experienceYears: 0 });
    for (const record of await db.careerRecords.find({ userId }).toArray()) {
      const bootstrap = await documents.bootstrap(userId, record._id);
      expect(bootstrap.editor).toBe("blocknote");
      expect(bootstrap.document.content.some(block => block.text?.some(span => span.text.trim()))).toBe(true);
      expect(bootstrap.documentVersion).toBeGreaterThan(0);
    }
    const before = commands.length;
    await expect(runtime.career.createRecord(userId, randomUUID(), { categoryId: (await runtime.career.listCategories(userId))[0]!.id, title: "Unbound", properties: {}, bodyMd: "" })).rejects.toMatchObject({ statusCode: 401 });
    expect(commands).toHaveLength(before);
  });

  it("fails before service intent or record writes when the product owner is unconfigured", async () => {
    const unconfigured = createCareerWriterRuntime(fixture.resource, loadRuntimeConfig({}), documents);
    const admin = new AdminService(fixture.resource, { identity, career: unconfigured.adminCareer, consent: new ConsentService(fixture.resource) });
    const unconfiguredApp = buildApi({ config, identityService: identity, careerService: unconfigured.career, adminService: admin });
    try {
      const response = await unconfiguredApp.inject({ method: "POST", url: API_PREFIX + "/admin/dummy-accounts/dummy-career-switch", headers: { authorization: "Bearer " + adminToken } });
      expect(response.statusCode).toBe(503);
      const userId = stableCareerId("dummy-account:dummy-career-switch"), db = mongoCollections(fixture.resource.db);
      expect(await db.careerRecords.countDocuments({ userId })).toBe(0);
      expect(await db.careerProductOperations.countDocuments({ userId })).toBe(0);
      expect(await db.identitySessions.countDocuments({ userId })).toBe(0);
    } finally { await unconfiguredApp.close(); }
  });
});
