import { randomUUID } from "node:crypto";
import { mongoCollections, type CareerRecordDoc } from "@expresso/database";
import { CareerProducerScopeSchema, type CareerProducerCommitRequest, type CareerProducerBusinessResult } from "@expresso/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { MongoIdentityService } from "../identity/index.js";
import { CareerService, CareerProducerCoordinator, careerProducerScopeFilter } from "../career/index.js";
import { CareerDocumentService, PreparedAiProposalService, PreparedCareerDocumentWriter } from "./index.js";
import { AiProposalService } from "./ai-proposals.js";
import { PreparedInterviewCareerWriter } from "../interview/index.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("prepared cancellation rejection preserves durable operations", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>, userId: string;
  beforeAll(async () => {
    fixture = await createMongoFixture("cancelguards");
    userId = (await new MongoIdentityService(fixture.resource).signup({
      email: randomUUID() + "@example.com", password: "correct-horse-battery", displayName: "취소 경계",
    })).user.id;
  }, 60_000);
  afterAll(async () => fixture?.dispose());

  it.each(["cancel", "reject"] as const)("rejects pending Undo %s without changing any proposal or reservation state", async (action) => {
    const career = new CareerService(fixture.resource), documents = new CareerDocumentService(fixture.resource);
    const category = await career.createCategory(userId, { key: "undo_" + randomUUID().replaceAll("-", ""), name: "취소", icon: "folder", defaultView: "table", propertySchema: {} });
    const record = (await career.createRecord(userId, randomUUID(), { categoryId: category.id, title: "원문", properties: {}, bodyMd: "원문" })).record;
    const bootstrap = await documents.bootstrap(userId, record.id);
    const blockId = bootstrap.document.content[0]!.id;
    const ai = new AiProposalService(fixture.resource, documents, { async generate() {
      return { summary: "정리", commands: [{ type: "setText", blockId, text: "AI 변경" }], propertyChanges: [] };
    } });
    const proposal = await ai.create(userId, record.id, { selection: { blockIds: [blockId] }, prompt: "정리" });
    const owner = new PreparedCareerDocumentWriter(fixture.resource);
    const coordinator = new CareerProducerCoordinator(fixture.resource, { async commit() { throw new Error("body-only business call"); } }, owner);
    const producer = new PreparedAiProposalService(fixture.resource, documents, coordinator);
    const apply = await producer.prepare(userId, record.id, { recordId: record.id, proposalId: proposal.proposalId,
      operationId: randomUUID(), expectedDocumentVersion: 0, commandIndexes: [0], propertyChangeIndexes: [] });
    await producer.execute(apply);
    const request = { recordId: record.id, proposalId: proposal.proposalId, operationId: randomUUID(), expectedDocumentVersion: 1 };
    const undo = await producer.prepareUndo(userId, record.id, request);
    const db = mongoCollections(fixture.resource.db);
    const before = await db.careerAiProposals.findOne({ _id: proposal.proposalId });
    const recordBefore = await db.careerRecords.findOne({ _id: record.id });
    await expect(producer[action](undo)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.careerAiProposals.findOne({ _id: proposal.proposalId })).toEqual(before);
    expect(await db.careerRecords.findOne({ _id: record.id })).toEqual(recordBefore);
    await expect(coordinator.cancel(undo)).rejects.toMatchObject({ statusCode: 409 });
    await expect(owner.cancel(undo)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.careerAiProposals.findOne({ _id: proposal.proposalId })).toEqual(before);
    expect(await producer.prepareUndo(userId, record.id, request)).toEqual(undo);
    await expect(producer.prepareUndo(userId, record.id, { ...request, operationId: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    expect(await producer.execute(undo)).toMatchObject({ state: "completed" });
    expect(await producer.prepareUndo(userId, record.id, request)).toEqual(undo);
    await expect(producer.prepareUndo(userId, record.id, { ...request, operationId: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.careerRecords.findOne({ _id: record.id }))?.documentVersion).toBe(2);
  });

  async function interviewSource() {
    const db = mongoCollections(fixture.resource.db), sessionId = randomUUID(), questionId = randomUUID(), now = new Date();
    await db.interviewSessions.insertOne({ _id: sessionId, userId, brewId: randomUUID(), status: "open", questionCount: 3,
      currentOrder: 0, answeredCount: 0, version: 1, createdAt: now, updatedAt: now });
    await db.questions.insertMany([questionId, randomUUID(), randomUUID()].map((_id, orderNo) => ({ _id, userId, interviewSessionId: sessionId, orderNo,
      text: "무엇을 개선했나요?", skipped: false, active: true, variant: 0,
      basis: { type: "record_gap", recordId: randomUUID(), gap: "metric", evidence: "경험" }, createdAt: now })));
    return { sessionId, questionId };
  }

  // 외부 Spring 호출만 대역으로 대체하고 durable source와 문서 owner 및 finalize는 실제 Mongo에서 실행합니다.
  function interviewBusiness() {
    return { async commit(request: CareerProducerCommitRequest): Promise<CareerProducerBusinessResult> {
      return inTransaction(fixture.resource, async (tx) => {
        const db = mongoCollections(tx.db), options = { session: tx.session };
        const source = await db.interviewCareerOperations.findOne({ ...careerProducerScopeFilter(request),
          "writerIntegration.state": "running", "writerIntegration.leaseToken": request.leaseToken }, options);
        if (!source) throw new Error("owner fence lost");
        if (source.writerIntegration.businessResult) return source.writerIntegration.businessResult;
        const command = source.writerIntegration.business!, now = new Date();
        let record: CareerRecordDoc;
        if (command.kind === "create") {
          record = { _id: randomUUID(), userId, categoryId: command.input.categoryId, title: "title" in command.input ? command.input.title : "", origin: "interview",
            properties: {}, propertyValues: [], bodyMd: "", status: "draft", version: 1, referenceVersion: 0,
            deletedAt: null, purgeAfter: null, updatedAt: now };
          await db.careerRecords.insertOne(record, options);
        } else {
          const current = await db.careerRecords.findOne({ _id: command.recordId, userId, version: command.expectedVersion, deletedAt: null }, options);
          if (!current) throw new Error("business CAS failed");
          record = { ...current, version: current.version + 1, updatedAt: now };
          for (const patch of command.patches) {
            if ("title" in patch) record.title = patch.title;
            if ("status" in patch) record.status = patch.status;
          }
          await db.careerRecords.replaceOne({ _id: current._id, userId, version: current.version }, record, options);
        }
        const result: CareerProducerBusinessResult = { data: { id: record._id, userId, categoryId: record.categoryId,
          title: record.title, propertyValues: [], status: record.status, version: record.version, updatedAt: now.toISOString() }, replayed: false };
        await db.interviewCareerOperations.updateOne(careerProducerScopeFilter(request), { $set: { "writerIntegration.businessResult": result } }, options);
        return result;
      });
    } };
  }

  it("rejects generic Interview answer cancellation before changing intent, answer or operation and permits later requests", async () => {
    const { sessionId, questionId } = await interviewSource(), db = mongoCollections(fixture.resource.db);
    const coordinator = new CareerProducerCoordinator(fixture.resource, interviewBusiness(), new PreparedCareerDocumentWriter(fixture.resource));
    const producer = new PreparedInterviewCareerWriter(fixture.resource, coordinator);
    const input = { inputType: "text" as const, transcript: "실패 원인을 찾아 개선했습니다." }, key = "cancel-answer-" + randomUUID();
    const operation = await producer.prepareAnswer(userId, sessionId, questionId, key, input);
    const scope = CareerProducerScopeSchema.parse(operation.writerIntegration);
    const before = await db.interviewCareerOperations.findOne({ _id: operation._id });
    const answerBefore = await db.answers.findOne({ _id: operation.answerId });
    await expect(coordinator.cancel(scope)).rejects.toMatchObject({ statusCode: 409 });
    await expect(new PreparedCareerDocumentWriter(fixture.resource).cancel(scope)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.interviewCareerOperations.findOne({ _id: operation._id })).toEqual(before);
    expect(await db.answers.findOne({ _id: operation.answerId })).toEqual(answerBefore);
    expect(await producer.prepareAnswer(userId, sessionId, questionId, key, input)).toEqual(operation);
    await expect(producer.prepareAnswer(userId, sessionId, questionId, "another-" + randomUUID(), input)).rejects.toMatchObject({ statusCode: 409 });
    expect(await producer.executeAnswer(userId, operation._id)).toMatchObject({ answer: { version: 1 }, progress: { answered: 1 } });
    const next = await producer.prepareAnswer(userId, sessionId, questionId, "next-" + randomUUID(), { ...input, transcript: "다음 답변입니다." });
    expect(next.answerVersion).toBe(2);
    expect(next.active).toBe(true);
  });

  it("rejects generic business-only Interview cleanup cancellation without blocking cleanup execution", async () => {
    const { sessionId, questionId } = await interviewSource(), db = mongoCollections(fixture.resource.db);
    const coordinator = new CareerProducerCoordinator(fixture.resource, interviewBusiness(), new PreparedCareerDocumentWriter(fixture.resource));
    const producer = new PreparedInterviewCareerWriter(fixture.resource, coordinator);
    const operation = await producer.prepareAnswer(userId, sessionId, questionId, "cleanup-answer-" + randomUUID(),
      { inputType: "text", transcript: "답변을 정리합니다." });
    const completed = await producer.executeAnswer(userId, operation._id);
    const record = (await db.careerRecords.findOne({ _id: completed.answer.createdRecordId! }))!;
    const category = (await db.careerCategories.findOne({ _id: record.categoryId }))!;
    const cleanup = await producer.prepareCleanup(userId, operation.answerId, "cancel-cleanup-" + randomUUID(), 1,
      { kind: "patch", recordId: record._id, expectedVersion: record.version, expectedCategoryVersion: category.version, patches: [{ title: "정리된 답변" }, { status: "organized" }] });
    const before = await db.interviewCareerOperations.findOne({ _id: cleanup._id });
    const answerBefore = await db.answers.findOne({ _id: operation.answerId });
    await expect(coordinator.cancel(CareerProducerScopeSchema.parse(cleanup.writerIntegration))).rejects.toMatchObject({ statusCode: 409 });
    await expect(new PreparedCareerDocumentWriter(fixture.resource).cancel(CareerProducerScopeSchema.parse(cleanup.writerIntegration))).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.interviewCareerOperations.findOne({ _id: cleanup._id })).toEqual(before);
    expect(await db.answers.findOne({ _id: operation.answerId })).toEqual(answerBefore);
    await producer.executeCleanup(userId, cleanup._id);
    expect((await db.careerRecords.findOne({ _id: record._id }))?.status).toBe("organized");
    expect((await db.interviewCareerOperations.findOne({ _id: cleanup._id }))?.active).toBe(false);
  });
});
