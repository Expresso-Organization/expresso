import { createHash, randomUUID } from "node:crypto";
import { mongoCollections, type CareerRecordDoc } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import * as Interview from "./index.js";
import { CareerProducerCoordinator, CareerService, purgeTrashedCareerRecord, validateCareerProducerIntent, createCareerProducerIntent } from "../career/index.js";
import { PreparedCareerDocumentWriter, CareerDocumentService } from "../career-editor/index.js";
import type { CareerProducerCommitRequest, CareerProducerBusinessResult, CareerProducerBusinessCommand, InterviewAnswerResult } from "@expresso/contracts";
import { inTransaction } from "../../platform/mongo-transaction.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("prepared Interview Career writer", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let userId: string;
  beforeAll(async () => {
    fixture = await createMongoFixture("prepinterview");
    userId = (await new MongoIdentityService(fixture.resource).signup({
      email: `prepared-${randomUUID()}@example.com`, displayName: "준비된 인터뷰", password: "correct-horse-battery",
    })).user.id;
  });
  afterAll(async () => { await fixture?.dispose(); });

  async function source() {
    const db = mongoCollections(fixture.resource.db);
    const sessionId = randomUUID();
    const questionIds = [randomUUID(), randomUUID(), randomUUID()];
    const now = new Date();
    await db.interviewSessions.insertOne({ _id: sessionId, userId, brewId: randomUUID(), status: "open", questionCount: 3,
      currentOrder: 0, answeredCount: 0, version: 1, createdAt: now, updatedAt: now });
    await db.questions.insertMany(questionIds.map((_id, orderNo) => ({ _id, userId, interviewSessionId: sessionId,
      orderNo, text: "어떻게 개선했나요?", skipped: false, active: true, variant: 0,
      basis: { type: "record_gap", recordId: randomUUID(), gap: "metric", evidence: "경험" }, createdAt: now })));
    return { sessionId, questionId: questionIds[0]! };
  }

  function ownedWriter(options: { loseResponse?: boolean; loseDocumentResponse?: boolean; mutateSource?: boolean } = {}) {
    let loseResponse = options.loseResponse ?? false;
    const owner = { async commit(request: CareerProducerCommitRequest): Promise<CareerProducerBusinessResult> {
      const result = await inTransaction(fixture.resource, async (tx) => {
        const db = mongoCollections(tx.db); const mongoOptions = { session: tx.session };
        const operation = await db.interviewCareerOperations.findOne({ _id: request.sourceId, userId: request.userId,
          "writerIntegration.operationId": request.operationId, "writerIntegration.fingerprint": request.fingerprint,
          "writerIntegration.leaseToken": request.leaseToken }, mongoOptions);
        if (!operation) throw new Error("owner scope changed");
        if (operation.writerIntegration.businessResult) return { ...operation.writerIntegration.businessResult, replayed: true };
        const command = operation.writerIntegration.business!;
        const now = new Date();
        let record: CareerRecordDoc;
        if (command.kind === "create") {
          record = { _id: randomUUID(), userId, categoryId: command.input.categoryId,
            title: "title" in command.input ? command.input.title : "", status: "draft", origin: "interview", properties: {},
            propertyValues: [], bodyMd: "", version: 1, referenceVersion: 0, updatedAt: now, deletedAt: null, purgeAfter: null };
          await db.careerRecords.insertOne(record, mongoOptions);
        } else {
          const found = await db.careerRecords.findOne({ _id: command.recordId, userId, deletedAt: null, version: command.expectedVersion }, mongoOptions);
          if (!found) throw Object.assign(new Error("record version changed"), { statusCode: 412 });
          record = { ...found, version: found.version + 1, updatedAt: now };
          for (const patch of command.patches) {
            if ("title" in patch) record.title = patch.title;
            if ("status" in patch) record.status = patch.status;
          }
          await db.careerRecords.replaceOne({ _id: record._id, userId, version: found.version }, record, mongoOptions);
        }
        const response: CareerProducerBusinessResult = { data: { id: record._id, userId, categoryId: record.categoryId,
          title: record.title, status: record.status, propertyValues: [], version: record.version, updatedAt: now.toISOString() }, replayed: false };
        await db.interviewCareerOperations.updateOne({ _id: operation._id, "writerIntegration.leaseToken": request.leaseToken }, {
          $set: { "writerIntegration.businessResult": response },
        }, mongoOptions);
        if (options.mutateSource) await db.answers.updateOne({ _id: operation.answerId }, { $inc: { version: 1 } }, mongoOptions);
        return response;
      });
      if (loseResponse) { loseResponse = false; throw new Error("Spring acknowledgement lost"); }
      return result;
    } };
    const document = new PreparedCareerDocumentWriter(fixture.resource);
    let loseDocumentResponse = options.loseDocumentResponse ?? false;
    return new Interview.PreparedInterviewCareerWriter(fixture.resource,
      new CareerProducerCoordinator(fixture.resource, owner, {
        reserve: (scope) => document.reserve(scope),
        cancel: (scope) => document.cancel(scope),
        async commit(request) {
          const result = await document.commit(request);
          if (loseDocumentResponse) { loseDocumentResponse = false; throw new Error("document acknowledgement lost"); }
          return result;
        },
      }));
  }
  it("keeps a pending transcript durable when Spring fails without completing progress or writing a record", async () => {
    const { sessionId, questionId } = await source();
    expect(Interview.PreparedInterviewCareerWriter, "준비용 writer가 필요합니다").toBeTypeOf("function");
    const writer = new Interview.PreparedInterviewCareerWriter(fixture.resource, {
      async execute() { throw new Error("Spring unavailable"); },
    });
    const operation = await writer.prepareAnswer(userId, sessionId, questionId, "pending-answer-0001", {
      inputType: "text", transcript: "  장애 원인을 찾아 재발을 막았습니다.  ",
    });
    await expect(writer.executeAnswer(userId, operation._id)).rejects.toThrow("Spring unavailable");
    const db = mongoCollections(fixture.resource.db);
    expect(await db.answers.findOne({ userId, questionId })).toMatchObject({
      transcript: "장애 원인을 찾아 재발을 막았습니다.", version: 1, writerPending: true, createdRecordId: null,
    });
    expect(await db.interviewSessions.findOne({ _id: sessionId })).toMatchObject({ answeredCount: 0, currentOrder: 0 });
    expect(await db.careerRecords.countDocuments({ userId })).toBe(0);
    expect(await db.answerRecordChanges.countDocuments({ userId })).toBe(0);
    expect(await db.outboxEvents.countDocuments({ userId, topic: "record.cleanup" })).toBe(0);
  });

  it("reserves one pending answer per question and rejects a reused key with different input", async () => {
    const { sessionId, questionId } = await source();
    expect(Interview.PreparedInterviewCareerWriter).toBeTypeOf("function");
    const writer = new Interview.PreparedInterviewCareerWriter(fixture.resource, { async execute() { throw new Error("unused"); } });
    const input = { inputType: "text" as const, transcript: "원문 보존" };
    const first = await writer.prepareAnswer(userId, sessionId, questionId, "duplicate-answer-0001", input);
    const duplicate = await writer.prepareAnswer(userId, sessionId, questionId, "duplicate-answer-0001", input);
    expect(duplicate._id).toBe(first._id);
    await expect(writer.prepareAnswer(userId, sessionId, questionId, "duplicate-answer-0001", { ...input, transcript: "다른 원문" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(writer.prepareAnswer(userId, sessionId, questionId, "duplicate-answer-0002", input)).rejects.toMatchObject({ statusCode: 409 });
    expect(await mongoCollections(fixture.resource.db).answers.countDocuments({ userId, questionId })).toBe(1);
    expect(await fixture.resource.db.collection("interview_career_operations").countDocuments({ userId, questionId })).toBe(1);
  });

  it("rejects a cross-session question before persisting a pending answer", async () => {
    const { questionId } = await source();
    const { sessionId } = await source();
    expect(Interview.PreparedInterviewCareerWriter).toBeTypeOf("function");
    const writer = new Interview.PreparedInterviewCareerWriter(fixture.resource, { async execute() { throw new Error("unused"); } });
    await expect(writer.prepareAnswer(userId, sessionId, questionId, "cross-session-answer", { inputType: "text", transcript: "원문" })).rejects.toMatchObject({ statusCode: 404 });
    expect(await mongoCollections(fixture.resource.db).answers.countDocuments({ userId, questionId })).toBe(0);
  });
  it("replays a historical answer result after a newer answer revision", async () => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter();
    const input = { inputType: "text" as const, transcript: "원문 A" };
    const first = await writer.prepareAnswer(userId, sessionId, questionId, "historical-answer-0001", input);
    const firstResult = await writer.executeAnswer(userId, first._id);
    expect(firstResult).toMatchObject({ answer: { transcript: "원문 A", version: 1 }, progress: { answered: 1, total: 3 } });
    const second = await writer.prepareAnswer(userId, sessionId, questionId, "historical-answer-0002", { ...input, transcript: "원문 B" });
    const secondResult = await writer.executeAnswer(userId, second._id);
    expect(secondResult).toMatchObject({ answer: { id: first.answerId, transcript: "원문 B", version: 2 }, recordChange: { type: "strengthened" } });
    const replay = await writer.prepareAnswer(userId, sessionId, questionId, "historical-answer-0001", input);
    expect(await writer.executeAnswer(userId, replay._id)).toEqual(firstResult);
    expect(await mongoCollections(fixture.resource.db).answers.findOne({ _id: first.answerId })).toMatchObject({ transcript: "원문 B", version: 2, writerPending: false });
    const document = await new CareerDocumentService(fixture.resource).bootstrap(userId, secondResult.answer.createdRecordId);
    expect(document.document.content[0]!.text).toEqual([{ text: "원문 B" }]);
  });

  it("recovers a durable Spring receipt after acknowledgement loss without creating another record", async () => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter({ loseResponse: true });
    const prepared = await writer.prepareAnswer(userId, sessionId, questionId, "lost-answer-response", { inputType: "text", transcript: "복구할 원문" });
    await expect(writer.executeAnswer(userId, prepared._id)).rejects.toThrow("Spring acknowledgement lost");
    const db = mongoCollections(fixture.resource.db);
    expect(await db.interviewSessions.findOne({ _id: sessionId })).toMatchObject({ answeredCount: 0 });
    expect(await db.answers.findOne({ _id: prepared.answerId })).toMatchObject({ writerPending: true, transcript: "복구할 원문" });
    const result = await writer.retryAnswer(userId, prepared._id);
    expect(result).toMatchObject({ answer: { id: prepared.answerId, version: 1, transcript: "복구할 원문" }, progress: { answered: 1 } });
    expect(await db.careerRecords.countDocuments({ _id: result.answer.createdRecordId })).toBe(1);
    expect(await db.answerRecordChanges.countDocuments({ userId, answerId: prepared.answerId })).toBe(1);
    expect(await db.outboxEvents.countDocuments({ userId, "payload.operationId": prepared._id })).toBe(1);
    expect(await writer.retryAnswer(userId, prepared._id)).toEqual(result);
  });

  it("does not falsely complete progress when the source answer changes after an owner commits", async () => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter({ mutateSource: true });
    const prepared = await writer.prepareAnswer(userId, sessionId, questionId, "changed-answer-source", { inputType: "text", transcript: "원문" });
    await expect(writer.executeAnswer(userId, prepared._id)).rejects.toMatchObject({ statusCode: 409 });
    const db = mongoCollections(fixture.resource.db);
    expect(await db.interviewSessions.findOne({ _id: sessionId })).toMatchObject({ answeredCount: 0 });
    expect(await db.answerRecordChanges.countDocuments({ userId, answerId: prepared.answerId })).toBe(0);
    const operation = await db.interviewCareerOperations.findOne({ _id: prepared._id });
    expect(operation?.result).toBeNull();
    expect(operation?.writerIntegration.businessResult?.data.id).toBeTruthy();
    expect(operation?.writerIntegration.documentResult).toBeNull();
    expect((await db.careerRecords.findOne({ _id: operation!.writerIntegration.businessResult!.data.id }))?.documentVersion ?? 0).toBe(0);
    expect(await db.careerDocumentUpdates.countDocuments({ recordId: operation!.writerIntegration.businessResult!.data.id })).toBe(0);
  });
  async function cleanupCommand(result: InterviewAnswerResult): Promise<Extract<CareerProducerBusinessCommand, { kind: "patch" }>> {
    const db = mongoCollections(fixture.resource.db);
    const record = await db.careerRecords.findOne({ _id: result.answer.createdRecordId, userId });
    const category = await db.careerCategories.findOne({ _id: record!.categoryId });
    return { kind: "patch", recordId: record!._id, expectedVersion: record!.version, expectedCategoryVersion: category!.version,
      patches: [{ title: "정리된 제목", propertyValues: { set: [], unsetPropertyIds: [] } }, { status: "organized" }] };
  }

  it("freezes cleanup business changes while preserving the answer document and historical result", async () => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter();
    const answer = await writer.prepareAnswer(userId, sessionId, questionId, "cleanup-answer-original", { inputType: "text", transcript: "정리할 원문" });
    const saved = await writer.executeAnswer(userId, answer._id);
    const before = await new CareerDocumentService(fixture.resource).bootstrap(userId, saved.answer.createdRecordId);
    const command = await cleanupCommand(saved);
    expect(writer).toHaveProperty("prepareCleanup");
    const cleanup = await writer.prepareCleanup(userId, saved.answer.id, "cleanup-frozen-0001", saved.answer.version, command);
    command.patches = [{ title: "호출자 변경" }, { status: "verified" }];
    const result = await writer.executeCleanup(userId, cleanup._id);
    const record = await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: saved.answer.createdRecordId });
    expect(record).toMatchObject({ title: "정리된 제목", status: "organized" });
    expect(result).toMatchObject({ answer: { id: saved.answer.id, transcript: "정리할 원문", version: 1 }, recordChange: { changedFields: ["title", "status"] } });
    const after = await new CareerDocumentService(fixture.resource).bootstrap(userId, saved.answer.createdRecordId);
    expect(after.documentVersion).toBe(before.documentVersion);
    expect(after.document).toEqual(before.document);
    expect(await writer.retryCleanup(userId, cleanup._id)).toEqual(result);
  });

  it("keeps a user's edit when cleanup's frozen record version becomes stale", async () => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter();
    const operation = await writer.prepareAnswer(userId, sessionId, questionId, "cleanup-stale-answer", { inputType: "text", transcript: "기록 원문" });
    const saved = await writer.executeAnswer(userId, operation._id);
    const command = await cleanupCommand(saved);
    expect(writer).toHaveProperty("prepareCleanup");
    const cleanup = await writer.prepareCleanup(userId, saved.answer.id, "cleanup-stale-record", saved.answer.version, command);
    await new CareerService(fixture.resource).updateRecord(userId, saved.answer.createdRecordId, command.expectedVersion, { title: "사용자 편집" });
    await expect(writer.executeCleanup(userId, cleanup._id)).rejects.toMatchObject({ statusCode: 412 });
    expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: saved.answer.createdRecordId })).toMatchObject({ title: "사용자 편집", status: "draft" });
    expect((await mongoCollections(fixture.resource.db).interviewCareerOperations.findOne({ _id: cleanup._id }))?.result).toBeNull();
  });

  it("rejects a cleanup operation when its answer revision changes", async () => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter();
    const operation = await writer.prepareAnswer(userId, sessionId, questionId, "cleanup-source-answer", { inputType: "text", transcript: "기록 원문" });
    const saved = await writer.executeAnswer(userId, operation._id);
    expect(writer).toHaveProperty("prepareCleanup");
    const cleanup = await writer.prepareCleanup(userId, saved.answer.id, "cleanup-stale-source", saved.answer.version, await cleanupCommand(saved));
    await mongoCollections(fixture.resource.db).answers.updateOne({ _id: saved.answer.id }, { $inc: { version: 1 } });
    await expect(writer.executeCleanup(userId, cleanup._id)).rejects.toMatchObject({ statusCode: 409 });
    expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: saved.answer.createdRecordId })).toMatchObject({ title: "기록 원문", status: "draft", version: 1 });
  });
  it("allows only one concurrent pending operation for the same question", async () => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter();
    const results = await Promise.allSettled([
      writer.prepareAnswer(userId, sessionId, questionId, "concurrent-answer-0001", { inputType: "text", transcript: "첫 원문" }),
      writer.prepareAnswer(userId, sessionId, questionId, "concurrent-answer-0002", { inputType: "text", transcript: "둘째 원문" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({ statusCode: 409 });
    expect(await mongoCollections(fixture.resource.db).answers.countDocuments({ userId, questionId })).toBe(1);
    expect(await mongoCollections(fixture.resource.db).interviewCareerOperations.countDocuments({ userId, questionId, active: true })).toBe(1);
  });

  it("counts completed answers without counting another question's pending transcript", async () => {
    const { sessionId, questionId } = await source();
    const questions = await mongoCollections(fixture.resource.db).questions.find({ userId, interviewSessionId: sessionId }).sort({ orderNo: 1 }).toArray();
    const writer = ownedWriter();
    await writer.prepareAnswer(userId, sessionId, questionId, "pending-progress-first", { inputType: "text", transcript: "아직 처리 중" });
    const second = await writer.prepareAnswer(userId, sessionId, questions[1]!._id, "pending-progress-second", { inputType: "text", transcript: "완료할 원문" });
    expect(await writer.executeAnswer(userId, second._id)).toMatchObject({ progress: { answered: 1, total: 3 } });
    expect(await mongoCollections(fixture.resource.db).interviewSessions.findOne({ _id: sessionId })).toMatchObject({ currentOrder: 0, answeredCount: 1, status: "open" });
  });

  it("does not finalize a durable owner receipt after its Career record is purged", async () => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter({ loseDocumentResponse: true });
    const operation = await writer.prepareAnswer(userId, sessionId, questionId, "purged-receipt-answer", { inputType: "text", transcript: "삭제될 답변" });
    await expect(writer.executeAnswer(userId, operation._id)).rejects.toThrow("document acknowledgement lost");
    const db = mongoCollections(fixture.resource.db);
    const pending = await db.interviewCareerOperations.findOne({ _id: operation._id });
    const recordId = pending!.writerIntegration.businessResult!.data.id;
    expect(pending!.writerIntegration.documentResult?.recordId).toBe(recordId);
    const trashedAt = new Date("2026-01-01T00:00:00Z");
    await new CareerService(fixture.resource).trashRecord(userId, recordId, trashedAt);
    await purgeTrashedCareerRecord(fixture.resource, userId, recordId, new Date("2026-03-01T00:00:00Z"));

    await expect(writer.retryAnswer(userId, operation._id)).rejects.toMatchObject({ statusCode: 404 });
    expect(await db.careerRecords.findOne({ _id: recordId })).toBeNull();
    expect(await db.answers.findOne({ _id: operation.answerId })).toMatchObject({ writerPending: true, createdRecordId: null });
    expect(await db.interviewSessions.findOne({ _id: sessionId })).toMatchObject({ answeredCount: 0, currentOrder: 0, status: "open" });
    expect(await db.answerRecordChanges.countDocuments({ answerId: operation.answerId })).toBe(0);
    expect(await db.outboxEvents.countDocuments({ userId, "payload.operationId": operation._id })).toBe(0);
    expect((await db.interviewCareerOperations.findOne({ _id: operation._id }))?.result).toBeNull();
  });

  it("rechecks a stale finalize transaction after a competing Career purge commits", async () => {
    const { sessionId, questionId } = await source();
    const ownerWriter = ownedWriter({ loseDocumentResponse: true });
    const operation = await ownerWriter.prepareAnswer(userId, sessionId, questionId, "racing-purge-answer", { inputType: "text", transcript: "경쟁할 답변" });
    await expect(ownerWriter.executeAnswer(userId, operation._id)).rejects.toThrow("document acknowledgement lost");
    const db = mongoCollections(fixture.resource.db);
    const pending = (await db.interviewCareerOperations.findOne({ _id: operation._id }))!;
    const receipt = validateCareerProducerIntent(pending.writerIntegration);
    const recordId = receipt.businessResult!.data.id;
    let release!: () => void;
    let started!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const snapshot = new Promise<void>((resolve) => { started = resolve; });
    let attempts = 0;
    // 실제 owner receipt로 finalize를 실행하되, 첫 snapshot 뒤에 purge를 커밋합니다.
    const writer = new Interview.PreparedInterviewCareerWriter(fixture.resource, {
      async execute(_scope, finalize) {
        await inTransaction(fixture.resource, async (tx) => {
          await mongoCollections(tx.db).careerRecords.findOne({ _id: recordId }, { session: tx.session });
          if (++attempts === 1) { started(); await barrier; }
          await finalize!(tx, receipt);
        });
        return receipt;
      },
    });
    const completing = writer.retryAnswer(userId, operation._id);
    const rejected = expect(completing).rejects.toMatchObject({ statusCode: 404 });
    await snapshot;
    try {
      await new CareerService(fixture.resource).trashRecord(userId, recordId, new Date("2026-01-01T00:00:00Z"));
      await purgeTrashedCareerRecord(fixture.resource, userId, recordId, new Date("2026-03-01T00:00:00Z"));
    } finally { release(); }
    await rejected;
    expect(attempts).toBeGreaterThan(1);
    expect(await db.careerRecords.findOne({ _id: recordId })).toBeNull();
    expect(await db.answers.findOne({ _id: operation.answerId })).toMatchObject({ writerPending: true, createdRecordId: null });
    expect(await db.interviewSessions.findOne({ _id: sessionId })).toMatchObject({ answeredCount: 0, status: "open" });
    expect(await db.answerRecordChanges.countDocuments({ answerId: operation.answerId })).toBe(0);
    expect(await db.outboxEvents.countDocuments({ userId, "payload.operationId": operation._id })).toBe(0);
    expect((await db.interviewCareerOperations.findOne({ _id: operation._id }))?.result).toBeNull();
  });

  it("rejects cleanup prepared with a fresh caller version after the user edited the answer record", async () => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter();
    const operation = await writer.prepareAnswer(userId, sessionId, questionId, "cleanup-edited-answer", { inputType: "text", transcript: "원래 답변" });
    const saved = await writer.executeAnswer(userId, operation._id);
    const initial = await cleanupCommand(saved);
    await new CareerService(fixture.resource).updateRecord(userId, saved.answer.createdRecordId, initial.expectedVersion, { title: "사용자가 확정한 제목" });
    const freshCommand = await cleanupCommand(saved);
    expect(freshCommand.expectedVersion).toBe(initial.expectedVersion + 1);

    await expect(writer.prepareCleanup(userId, saved.answer.id, "cleanup-adopted-edit", saved.answer.version, freshCommand)).rejects.toMatchObject({ statusCode: 412 });
    const db = mongoCollections(fixture.resource.db);
    expect(await db.careerRecords.findOne({ _id: saved.answer.createdRecordId })).toMatchObject({ title: "사용자가 확정한 제목", status: "draft", version: 2 });
    expect(await db.interviewCareerOperations.countDocuments({ answerId: saved.answer.id, kind: "cleanup" })).toBe(0);
    expect(await db.answers.findOne({ _id: saved.answer.id })).toMatchObject({ recordVersion: 1 });
  });

  it("rejects execution of an older cleanup operation that adopted a later user edit", async () => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter();
    const answer = await writer.prepareAnswer(userId, sessionId, questionId, "cleanup-legacy-answer", { inputType: "text", transcript: "원래 답변" });
    const saved = await writer.executeAnswer(userId, answer._id);
    const command = await cleanupCommand(saved);
    const cleanup = await writer.prepareCleanup(userId, saved.answer.id, "cleanup-legacy-record", saved.answer.version, command);
    await new CareerService(fixture.resource).updateRecord(userId, saved.answer.createdRecordId, command.expectedVersion, { title: "사용자 편집 보존" });
    const freshCommand = await cleanupCommand(saved);
    // 이전 준비 코드가 사용자 편집 뒤의 버전을 채택해 저장한 durable operation을 재현합니다.
    const intent = createCareerProducerIntent({ producer: "interview", userId, sourceId: cleanup._id, operationId: cleanup._id,
      business: freshCommand, document: null });
    const requestHash = createHash("sha256").update(JSON.stringify({ kind: "cleanup", answerId: saved.answer.id,
      expectedAnswerVersion: saved.answer.version, command: freshCommand })).digest("hex");
    const db = mongoCollections(fixture.resource.db);
    await db.interviewCareerOperations.updateOne({ _id: cleanup._id }, { $set: { writerIntegration: intent, requestHash } });

    await expect(writer.executeCleanup(userId, cleanup._id)).rejects.toMatchObject({ statusCode: 412 });
    expect(await db.careerRecords.findOne({ _id: saved.answer.createdRecordId })).toMatchObject({ title: "사용자 편집 보존", status: "draft", version: 2 });
    const pending = await db.interviewCareerOperations.findOne({ _id: cleanup._id });
    expect(pending?.result).toBeNull();
    expect(pending?.writerIntegration.businessResult).toBeNull();
    expect(await db.answers.findOne({ _id: saved.answer.id })).toMatchObject({ recordVersion: 1 });
  });
  it.each(["trash", "purge"] as const)("does not finalize a durable cleanup receipt after Career %s", async (removal) => {
    const { sessionId, questionId } = await source();
    const answerWriter = ownedWriter();
    const answer = await answerWriter.prepareAnswer(userId, sessionId, questionId, `cleanup-${removal}-answer`, { inputType: "text", transcript: "정리할 답변" });
    const saved = await answerWriter.executeAnswer(userId, answer._id);
    const writer = ownedWriter({ loseResponse: true });
    const cleanup = await writer.prepareCleanup(userId, saved.answer.id, `cleanup-${removal}-receipt`, saved.answer.version, await cleanupCommand(saved));
    await expect(writer.executeCleanup(userId, cleanup._id)).rejects.toThrow("Spring acknowledgement lost");
    const db = mongoCollections(fixture.resource.db);
    const pending = (await db.interviewCareerOperations.findOne({ _id: cleanup._id }))!;
    expect(pending.writerIntegration.businessResult?.data.version).toBe(2);
    expect(pending.result).toBeNull();
    await new CareerService(fixture.resource).trashRecord(userId, saved.answer.createdRecordId, new Date("2026-01-01T00:00:00Z"));
    if (removal === "purge") await purgeTrashedCareerRecord(fixture.resource, userId, saved.answer.createdRecordId, new Date("2026-03-01T00:00:00Z"));

    await expect(writer.retryCleanup(userId, cleanup._id)).rejects.toMatchObject({ statusCode: removal === "trash" ? 404 : 409 });
    expect((await db.interviewCareerOperations.findOne({ _id: cleanup._id }))?.result).toBeNull();
    expect(await db.answers.findOne({ _id: saved.answer.id })).toMatchObject({ version: 1, recordVersion: 1,
      createdRecordId: removal === "trash" ? saved.answer.createdRecordId : null });
    expect(await db.interviewSessions.findOne({ _id: sessionId })).toMatchObject({ answeredCount: 1, status: "open" });
    if (removal === "trash") {
      expect(await db.careerRecords.findOne({ _id: saved.answer.createdRecordId })).toMatchObject({ version: 3, status: "organized" });
      expect(await db.answerRecordChanges.findOne({ answerId: saved.answer.id })).toMatchObject({ changedFields: ["title", "body_md"] });
    } else expect(await db.careerRecords.findOne({ _id: saved.answer.createdRecordId })).toBeNull();
  });
  it.each([{ prefixLength: 119, title: "a".repeat(119) }, { prefixLength: 118, title: "a".repeat(118) + "😀" }])("keeps a supplementary character after $prefixLength units BSON-stable and executable through a retry", async ({ prefixLength, title }) => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter({ loseResponse: true });
    const transcript = "a".repeat(prefixLength) + "😀";
    const operation = await writer.prepareAnswer(userId, sessionId, questionId, `unicode-title-answer-${prefixLength}`, { inputType: "text", transcript });
    const stored = (await mongoCollections(fixture.resource.db).interviewCareerOperations.findOne({ _id: operation._id }))!;
    expect(stored.writerIntegration.business).toMatchObject({ kind: "create", input: { title } });
    expect(validateCareerProducerIntent(stored.writerIntegration).fingerprint).toBe(operation.writerIntegration.fingerprint);
    await expect(writer.executeAnswer(userId, operation._id)).rejects.toThrow("Spring acknowledgement lost");
    const result = await writer.retryAnswer(userId, operation._id);
    expect(result).toMatchObject({ answer: { transcript, version: 1 }, progress: { answered: 1 } });
    expect(await mongoCollections(fixture.resource.db).careerRecords.findOne({ _id: result.answer.createdRecordId })).toMatchObject({ title });
    expect(await writer.retryAnswer(userId, operation._id)).toEqual(result);
  });
  it("rejects historical replay after access is revoked for account deletion", async () => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter();
    const operation = await writer.prepareAnswer(userId, sessionId, questionId, "revoked-replay-answer", { inputType: "text", transcript: "보존한 결과" });
    await writer.executeAnswer(userId, operation._id);
    const users = mongoCollections(fixture.resource.db).users;
    await users.updateOne({ _id: userId }, { $set: { deletionRequestedAt: new Date() } });
    try {
      await expect(writer.retryAnswer(userId, operation._id)).rejects.toMatchObject({ statusCode: 401 });
    } finally { await users.updateOne({ _id: userId }, { $set: { deletionRequestedAt: null } }); }
  });
  it("rejects transcript drift against the frozen document intent", async () => {
    const { sessionId, questionId } = await source();
    const writer = ownedWriter();
    const operation = await writer.prepareAnswer(userId, sessionId, questionId, "frozen-transcript-drift", { inputType: "text", transcript: "확정된 원문" });
    const db = mongoCollections(fixture.resource.db);
    await db.answers.updateOne({ _id: operation.answerId }, { $set: { transcript: "바뀐 원문" } });
    await db.interviewCareerOperations.updateOne({ _id: operation._id }, { $set: { "input.transcript": "바뀐 원문" } });
    await expect(writer.executeAnswer(userId, operation._id)).rejects.toMatchObject({ statusCode: 409 });
    const pending = await db.interviewCareerOperations.findOne({ _id: operation._id });
    expect(pending?.writerIntegration.businessResult).toBeNull();
    expect(await db.interviewSessions.findOne({ _id: sessionId })).toMatchObject({ answeredCount: 0 });
  });
});