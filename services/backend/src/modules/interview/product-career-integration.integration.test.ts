import { randomUUID } from "node:crypto";
import { CareerBusinessRecordSchema, type CareerProducerCommitRequest, type CareerProducerBusinessResult, type CareerProducerScope } from "@expresso/contracts";
import { mongoCollections, readCanonicalCareerPropertyValues, registerCareerPropertyOption, type CareerRecordDoc } from "@expresso/database";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { Decimal128 } from "mongodb";
import { createRecordCleanupProcessor } from "../../worker/processors/record-cleanup.js";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerProducerCoordinator, CanonicalCareerReadService } from "../career/index.js";
import { PreparedCareerDocumentWriter } from "../career-editor/index.js";
import * as Interview from "./index.js";
import { registerInterviewRoutes } from "./routes.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("product Interview canonical owner integration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>, userId: string, foreignId: string;
  let failBusiness = false, loseBusiness = false, failDocument = false, businessCalls = 0;
  beforeAll(async () => {
    fixture = await createMongoFixture("productinterview");
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: randomUUID() + "@example.com", displayName: "Interview", password: "correct-horse-battery" })).user.id;
    foreignId = (await identity.signup({ email: randomUUID() + "@example.com", displayName: "Foreign", password: "correct-horse-battery" })).user.id;
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });
  afterEach(() => { failBusiness = false; loseBusiness = false; failDocument = false; businessCalls = 0; });

  async function source() {
    const db = mongoCollections(fixture.resource.db), now = new Date(), sessionId = randomUUID(), questionIds = Array.from({ length: 3 }, () => randomUUID());
    await db.interviewSessions.insertOne({ _id: sessionId, userId, brewId: randomUUID(), status: "open", questionCount: 3, currentOrder: 0, answeredCount: 0, version: 1, createdAt: now, updatedAt: now });
    await db.questions.insertMany(questionIds.map((_id, orderNo) => ({ _id, userId, interviewSessionId: sessionId, orderNo, text: "어떻게 개선했나요?", skipped: false, active: true, variant: 0, basis: { type: "record_gap", recordId: randomUUID(), gap: "metric", evidence: "경험" }, createdAt: now })));
    const category = await db.careerCategories.findOne({ key: "experience", isSystem: true, userId: null });
    if (!category) throw new Error("experience missing");
    if (!category.propertySchemaV2 || !category.schemaVersion) throw new Error("fixture canonical category missing");
    return { sessionId, questionId: questionIds[0]! };
  }

  function integration(options: Record<string, unknown> = {}) {
    const owner = { async commit(request: CareerProducerCommitRequest): Promise<CareerProducerBusinessResult> {
      businessCalls++;
      if (failBusiness) throw new Error("Spring unavailable");
      const result = await inTransaction(fixture.resource, async tx => {
        const db = mongoCollections(tx.db), mongo = { session: tx.session };
        const operation = await db.interviewCareerOperations.findOne({ _id: request.sourceId, userId: request.userId, "writerIntegration.operationId": request.operationId, "writerIntegration.fingerprint": request.fingerprint, "writerIntegration.leaseToken": request.leaseToken }, mongo);
        if (!operation) throw new Error("scope changed");
        if (operation.writerIntegration.businessResult) return operation.writerIntegration.businessResult;
        const command = operation.writerIntegration.business!, now = new Date();
        let record: CareerRecordDoc;
        if (command.kind === "create") {
          record = { _id: randomUUID(), userId: request.userId, categoryId: command.input.categoryId, title: "title" in command.input ? command.input.title : "", status: "draft", origin: "interview", properties: {}, propertyValues: [], bodyMd: "", version: 1, referenceVersion: 0, updatedAt: now, deletedAt: null, purgeAfter: null };
          await db.careerRecords.insertOne(record, mongo);
        } else {
          const current = await db.careerRecords.findOne({ _id: command.recordId, userId: request.userId, version: command.expectedVersion, deletedAt: null }, mongo);
          if (!current) throw Object.assign(new Error("version changed"), { statusCode: 412 });
          record = { ...current, updatedAt: now, version: current.version + 1 };
          for (const patch of command.patches) {
            if ("title" in patch && patch.title !== undefined) record.title = patch.title;
            if ("status" in patch && patch.status !== undefined) record.status = patch.status;
            if ("propertyValues" in patch && patch.propertyValues) {
              const delta = patch.propertyValues;
              const values = (record.propertyValues ?? []).filter(value => !delta.unsetPropertyIds.includes(value.propertyDefinitionId) && !delta.set.some(next => next.propertyDefinitionId === value.propertyDefinitionId));
              record.propertyValues = [...values, ...delta.set.map(value => value.type === "number" ? { ...value, value: Decimal128.fromString(value.value) } : value)];
            }
          }
          await db.careerRecords.replaceOne({ _id: current._id, userId: request.userId, version: current.version }, record, mongo);
        }
        const receipt = { data: CareerBusinessRecordSchema.parse({ id: record._id, userId: record.userId, categoryId: record.categoryId, title: record.title, status: record.status, propertyValues: readCanonicalCareerPropertyValues(record), version: record.version, updatedAt: now.toISOString() }), replayed: false };
        await db.interviewCareerOperations.updateOne({ _id: operation._id, "writerIntegration.leaseToken": request.leaseToken }, { $set: { "writerIntegration.businessResult": receipt } }, mongo);
        return receipt;
      });
      if (loseBusiness) { loseBusiness = false; throw new Error("Spring receipt response lost"); }
      return result;
    }};
    const document = new PreparedCareerDocumentWriter(fixture.resource);
    const coordinator = new CareerProducerCoordinator(fixture.resource, owner, {
      reserve: scope => document.reserve(scope), cancel: scope => document.cancel(scope),
      async commit(request) { if (failDocument) throw new Error("Document unavailable"); return document.commit(request); },
    });
    const writer = new Interview.PreparedInterviewCareerWriter(fixture.resource, coordinator);
    const product = new Interview.InterviewProductCareerIntegration(fixture.resource, writer, new CanonicalCareerReadService(fixture.resource), options);
    const service = new Interview.InterviewService(fixture.resource, null, null, null, product);
    return { product, service };
  }
  async function operationScope(operationId: string): Promise<CareerProducerScope> {
    const row = await mongoCollections(fixture.resource.db).interviewCareerOperations.findOne({ _id: operationId, userId });
    if (!row) throw new Error("operation missing");
    const intent = row.writerIntegration;
    return { producer: "interview", userId, sourceId: row._id, operationId: intent.operationId, fingerprint: intent.fingerprint };
  }
  it("returns real pending, preserves the transcript, and shows no completed answer or progress", async () => {
    const { sessionId, questionId } = await source(), { service } = integration();
    failBusiness = true;
    const response = await service.saveAnswerOperation(userId, sessionId, questionId, randomUUID(), { inputType: "text", transcript: "  실제 원문  " });
    expect(response.status).toBe(202); if (response.status !== 202) throw new Error("pending expected");
    expect(response.body).toMatchObject({ data: { producer: "interview", state: "retry", recordId: null } });
    const pendingId = response.body.data.operationId;
    expect(await mongoCollections(fixture.resource.db).answers.findOne({ userId, questionId })).toMatchObject({ writerPending: true, transcript: "실제 원문", createdRecordId: null });
    const session = await service.getSession(userId, sessionId);
    expect(session).toMatchObject({ answeredCount: 0, currentOrder: 0, status: "open" });
    expect(session.questions[0]).toMatchObject({ answered: false, pendingOperation: { operationId: pendingId } });
    await expect(service.skipQuestion(userId, sessionId, questionId)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.replaceQuestion(userId, sessionId, questionId)).rejects.toMatchObject({ statusCode: 409 });
    expect(await mongoCollections(fixture.resource.db).careerRecords.countDocuments({ userId, origin: "interview" })).toBe(0);
    failBusiness = false;
  });
  it("recovers a lost Spring response without another successful owner write and keeps the old success result", async () => {
    const { sessionId, questionId } = await source(), { product, service } = integration(), key = randomUUID();
    loseBusiness = true; businessCalls = 0;
    const pending = await service.saveAnswerOperation(userId, sessionId, questionId, key, { inputType: "text", transcript: "원문 보존" });
    expect(pending.status).toBe(202); if (pending.status !== 202) throw new Error("pending expected");
    const recovered = await product.execute(await operationScope(pending.body.data.operationId));
    expect(recovered).toMatchObject({ answer: { transcript: "원문 보존" }, progress: { answered: 1, total: 3 } });
    const replay = await service.saveAnswerOperation(userId, sessionId, questionId, key, { inputType: "text", transcript: "원문 보존" });
    expect(replay).toMatchObject({ status: 200, body: { data: recovered } });
    expect(businessCalls).toBe(1);
    const db = mongoCollections(fixture.resource.db);
    expect(await db.answers.countDocuments({ userId, questionId })).toBe(1);
    expect(await db.careerRecords.countDocuments({ _id: recovered.answer.createdRecordId })).toBe(1);
    expect(await db.outboxEvents.countDocuments({ userId, topic: "record.cleanup", "payload.answerId": recovered.answer.id })).toBe(1);
    await expect(product.execute({ ...await operationScope(pending.body.data.operationId), userId: foreignId })).rejects.toMatchObject({ statusCode: 404 });
  });
  it("does not count a partial business receipt while Document is pending, including strengthened answers", async () => {
    const { sessionId, questionId } = await source(), { product, service } = integration();
    const first = await service.saveAnswerOperation(userId, sessionId, questionId, randomUUID(), { inputType: "text", transcript: "처음 답변" });
    expect(first.status).toBe(200); if (first.status !== 200) throw new Error("completed expected");
    failDocument = true;
    const second = await service.saveAnswerOperation(userId, sessionId, questionId, randomUUID(), { inputType: "text", transcript: "수정 원문" });
    expect(second.status).toBe(202); if (second.status !== 202) throw new Error("pending expected");
    expect((await service.getSession(userId, sessionId)).answeredCount).toBe(0);
    expect(await mongoCollections(fixture.resource.db).interviewSessions.findOne({ _id: sessionId, userId })).toMatchObject({ answeredCount: 0, currentOrder: 0, status: "open" });
    await expect(service.getAnswerResult(userId, sessionId, first.body.data.answer.id)).rejects.toMatchObject({ statusCode: 409 });
    failDocument = false;
    const done = await product.execute(await operationScope(second.body.data.operationId));
    expect(done).toMatchObject({ answer: { version: 2, transcript: "수정 원문" }, recordChange: { type: "strengthened" } });
    expect((await service.getSession(userId, sessionId)).answeredCount).toBe(1);
  });
  it("returns pending HTTP status and Location through the actual route without calling the legacy writer", async () => {
    const { sessionId, questionId } = await source(), { service } = integration();
    failBusiness = true;
    const app = Fastify();
    app.decorateRequest("auth", null);
    registerInterviewRoutes(app, { interviewService: service, brewJobService: {} as never, authenticateRequest: async request => { request.auth = { user: { id: userId } } as never; } });
    const response = await app.inject({ method: "PUT", url: "/v1/interview-sessions/" + sessionId + "/answers/" + questionId, headers: { "idempotency-key": randomUUID() }, payload: { inputType: "text", transcript: "pending route" } });
    expect(response.statusCode).toBe(202);
    expect(response.headers.location).toBe(response.json().data.statusUrl);
    await app.close(); failBusiness = false;
  });
  async function completedSource() {
    const sourceIds = await source(), key = randomUUID(), bundle = integration();
    const result = await bundle.service.saveAnswerOperation(userId, sourceIds.sessionId, sourceIds.questionId, key, { inputType: "text", transcript: "정확한 원문 수치 123.4500" });
    if (result.status !== 200) throw new Error("completed expected");
    const operation = await mongoCollections(fixture.resource.db).interviewCareerOperations.findOne({ userId, inputIdempotencyKey: key });
    if (!operation) throw new Error("source missing");
    return { ...sourceIds, result: result.body.data, event: { answerId: operation.answerId, operationId: operation._id, answerVersion: operation.answerVersion, recordVersion: operation.writerIntegration.businessResult!.data.version } };
  }
  it("freezes cleanup once, preserves exact unrelated scalars and the live document, and finalizes a lost receipt after consent revocation", async () => {
    const completed = await completedSource(), db = mongoCollections(fixture.resource.db), numberId = randomUUID();
    const category = await db.careerCategories.findOne({ key: "experience", isSystem: true, userId: null });
    if (!category) throw new Error("category missing");
    await db.careerCategories.updateOne({ _id: category._id }, { $push: { propertySchemaV2: { id: numberId, key: "precise_" + numberId.replaceAll("-", ""), name: "Exact amount", type: "number", required: false, system: false, config: {}, order: 99, version: 1, deletedAt: null } } });
    await db.careerRecords.updateOne({ _id: completed.result.answer.createdRecordId }, { $set: { propertyValues: [{ propertyDefinitionId: numberId, type: "number", value: Decimal128.fromString("9007199254740993123456789012345678") }] } });
    let revoked = false;
    const requireConsent = vi.fn(async () => { if (revoked) throw Object.assign(new Error("consent revoked"), { statusCode: 403 }); });
    const cleaner = { clean: vi.fn(async () => ({ title: "정리 제목", situation: "상황", task: null, action: "실제 행동", result: null, metrics: [" 123.4500 그대로 "], competencies: ["정확한 태그"] })) };
    const registerOption = vi.fn(async (actor: string, categoryId: string, propertyId: string, input: { label: string }) => {
      const row = await registerCareerPropertyOption(fixture.resource.db, { userId: actor, categoryId, propertyId }, input.label);
      return { data: { id: row.optionId, name: row.rawLabel }, version: 1 as const };
    });
    const { product, service } = integration({ cleaner, consent: { require: requireConsent }, registerOption });
    const before = await product.readRecord(userId, completed.result.answer.createdRecordId);
    loseBusiness = true; businessCalls = 0;
    await expect(service.cleanupAnswerOperation(userId, completed.event)).rejects.toThrow("Spring receipt response lost");
    revoked = true;
    await service.cleanupAnswerOperation(userId, completed.event);
    expect(cleaner.clean).toHaveBeenCalledOnce();
    expect(businessCalls).toBe(1);
    expect(registerOption.mock.calls.map(call => call[3].label)).toEqual([" 123.4500 그대로 ", "정확한 태그"]);
    const after = await product.readRecord(userId, completed.result.answer.createdRecordId);
    expect(after.bodyMd).toBe(before.bodyMd);
    expect(after.propertyValues!.find(value => value.propertyDefinitionId === numberId)).toMatchObject({ type: "number", value: "9007199254740993123456789012345678" });
    expect(after).toMatchObject({ title: "정리 제목", status: "organized" });
    expect((await db.careerRecords.findOne({ _id: after.id }))!.properties).toEqual({});
    const frozen = await db.interviewCareerOperations.findOne({ userId, inputIdempotencyKey: "interview-cleanup:" + completed.event.operationId });
    expect(frozen).toMatchObject({ active: false, writerIntegration: { document: null, state: "completed" } });
  });
  it("rejects consent before unfinished cleanup owner calls and ignores stale original answer events before cleaner", async () => {
    const completed = await completedSource();
    const cleaner = { clean: vi.fn(async () => ({ title: "정리", situation: null, task: null, action: "행동", result: null, metrics: [], competencies: [] })) };
    let revoked = false;
    const bundle = integration({ cleaner, consent: { require: async () => { if (revoked) throw Object.assign(new Error("consent revoked"), { statusCode: 403 }); } } });
    failBusiness = true;
    await expect(bundle.service.cleanupAnswerOperation(userId, completed.event)).rejects.toThrow("Spring unavailable");
    failBusiness = false; revoked = true; businessCalls = 0;
    await expect(bundle.service.cleanupAnswerOperation(userId, completed.event)).rejects.toMatchObject({ statusCode: 403 });
    expect(businessCalls).toBe(0);
    expect(cleaner.clean).toHaveBeenCalledOnce();
    const newer = await completedSource(), staleCleaner = { clean: vi.fn(async () => ({ title: "정리", situation: null, task: null, action: "행동", result: null, metrics: [], competencies: [] })) };
    await mongoCollections(fixture.resource.db).answers.updateOne({ _id: newer.event.answerId }, { $inc: { version: 1 } });
    await integration({ cleaner: staleCleaner }).service.cleanupAnswerOperation(userId, newer.event);
    expect(staleCleaner.clean).not.toHaveBeenCalled();
  });
  it("passes the immutable event scope through the cleanup worker and blocks unscoped product jobs", async () => {
    const completed = await completedSource(), { service } = integration();
    const hook = vi.spyOn(service, "cleanupAnswerOperation").mockResolvedValue();
    const process = createRecordCleanupProcessor(service);
    await process({ data: { userId, ...completed.event } } as never);
    expect(hook).toHaveBeenCalledWith(userId, completed.event);
    await expect(process({ data: { userId, answerId: completed.event.answerId } } as never)).rejects.toMatchObject({ statusCode: 409 });
  });  it("rejects missing business-owner configuration before accepting a new answer", async () => {
    const { sessionId, questionId } = await source(), { service } = integration({
      requireBusinessOwner: () => { throw Object.assign(new Error("Career business owner unavailable"), { statusCode: 503 }); },
    });
    businessCalls = 0;
    await expect(service.saveAnswerOperation(userId, sessionId, questionId, randomUUID(), { inputType: "text", transcript: "configuration gate" })).rejects.toMatchObject({ statusCode: 503 });
    const db = mongoCollections(fixture.resource.db);
    expect(await db.answers.countDocuments({ userId, questionId })).toBe(0);
    expect(await db.interviewCareerOperations.countDocuments({ userId, questionId })).toBe(0);
    expect(businessCalls).toBe(0);
  });
  it("exposes a terminal partial-owner conflict as safe public recovery metadata and never reexecutes business", async () => {
    const { sessionId, questionId } = await source(), { service } = integration(), key = randomUUID();
    failDocument = true;
    const pending = await service.saveAnswerOperation(userId, sessionId, questionId, key, { inputType: "text", transcript: "partial owner recovery" });
    if (pending.status !== 202) throw new Error("pending expected");
    const db = mongoCollections(fixture.resource.db);
    // 복구 분류기가 확정한 충돌 상태를 준비된 fixture 안에서 재현합니다.
    await db.interviewCareerOperations.updateOne({ userId, inputIdempotencyKey: key }, { $set: { "writerIntegration.state": "blocked", "writerIntegration.lastError": "OWNER_CONFLICT" } });
    failDocument = false;
    for (let attempt = 0; attempt < 2; attempt++) await expect(service.saveAnswerOperation(userId, sessionId, questionId, key, { inputType: "text", transcript: "partial owner recovery" })).rejects.toMatchObject({
      statusCode: 409, publicDetails: { operation: { operationId: pending.body.data.operationId, producer: "interview", state: "recovery-required", retryable: false, owners: { business: "completed", document: "pending" } } },
    });
    expect(businessCalls).toBe(1);
    expect((await service.getSession(userId, sessionId)).answeredCount).toBe(0);
  });
});