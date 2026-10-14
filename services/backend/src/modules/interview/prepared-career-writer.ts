import { createHash, randomUUID } from "node:crypto";
import { CareerBusinessRecordSchema, CareerProducerBusinessCommandSchema, IdempotencyKeySchema, InterviewAnswerResultSchema, SaveInterviewAnswerSchema, UuidSchema,
  type CareerProducerBusinessCommand, type CareerProducerIntent, type CareerProducerScope, type InterviewAnswerResult, type SaveInterviewAnswer } from "@expresso/contracts";
import { mongoCollections, type InterviewCareerOperationDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { assertActiveRecordsForWrite, createCareerProducerIntent, type CareerProducerCoordinator } from "../career/index.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { requireActiveUser } from "../identity/index.js";
import { InterviewError } from "./public.js";
import { refreshMongoInterviewProgress } from "./mongo-answers.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function conflict(message: string): never { throw new InterviewError(409, message); }
const duplicate = (error: unknown) => (error as { code?: number })?.code === 11000;
function answerTitle(transcript: string): string {
  let title = "";
  for (const character of transcript.split(/\n/)[0]!) {
    if (title.length + character.length > 120) break;
    title += character;
  }
  return title;
}

/** 제품 라우트와 연결하지 않은 답변 producer입니다. 원문을 먼저 보존하고 owner 완료를 기다립니다. */
export class PreparedInterviewCareerWriter {
  constructor(readonly context: MongoContext, readonly coordinator: Pick<CareerProducerCoordinator, "execute">) {}

  async prepareAnswer(userId: string, sessionId: string, questionId: string, key: string, inputValue: SaveInterviewAnswer): Promise<InterviewCareerOperationDoc> {
    const input = SaveInterviewAnswerSchema.parse(inputValue);
    UuidSchema.parse(userId); UuidSchema.parse(sessionId); UuidSchema.parse(questionId);
    const inputIdempotencyKey = IdempotencyKeySchema.parse(key);
    const requestHash = hash({ kind: "answer", sessionId, questionId, input });
    try {
      return await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, userId);
        const db = mongoCollections(tx.db); const options = { session: tx.session };
        const replay = await db.interviewCareerOperations.findOne({ userId, inputIdempotencyKey }, options);
        if (replay) {
          if (replay.kind !== "answer" || replay.requestHash !== requestHash) conflict("idempotency key was reused for another answer");
          return replay;
        }
        const session = await db.interviewSessions.findOne({ _id: sessionId, userId }, options);
        const question = await db.questions.findOne({ _id: questionId, userId, interviewSessionId: sessionId, active: true }, options);
        if (!session || !question) throw new InterviewError(404, "question not found");
        if (await db.interviewCareerOperations.findOne({ userId, questionId, active: true }, options)) conflict("question has a pending Career operation");
        const existing = await db.answers.findOne({ userId, questionId }, options);
        if (existing?.writerPending) conflict("answer has a pending Career operation");
        const operationId = randomUUID(); const answerId = existing?._id ?? randomUUID();
        const expectedAnswerVersion = existing?.version ?? null;
        const answerVersion = CareerBusinessRecordSchema.shape.version.parse((existing?.version ?? 0) + 1);
        const title = answerTitle(input.transcript);
        let business: CareerProducerBusinessCommand;
        let recordId: string | null = null;
        let documentVersion = 0;
        if (existing) {
          if (!existing.createdRecordId) conflict("answer record is no longer writable");
          const record = await db.careerRecords.findOne({ _id: existing.createdRecordId, userId, origin: "interview", deletedAt: null }, options);
          if (!record) conflict("answer record is no longer writable");
          const category = await db.careerCategories.findOne({ _id: record.categoryId, $or: [{ userId: null }, { userId }] }, options);
          if (!category) throw new InterviewError(404, "career category not found");
          recordId = record._id; documentVersion = record.documentVersion ?? 0;
          business = { kind: "patch", recordId, expectedVersion: record.version, expectedCategoryVersion: category.version, patches: [{ title }] };
          const reserved = await db.answers.updateOne({ _id: answerId, userId, version: existing.version, writerPending: { $ne: true } }, {
            $set: { inputType: input.inputType, transcript: input.transcript, inputIdempotencyKey, requestHash,
              version: answerVersion, writerPending: true, writerOperationId: operationId, updatedAt: new Date() },
          }, options);
          if (!reserved.matchedCount) conflict("answer changed concurrently");
        } else {
          const category = await db.careerCategories.findOne({ key: "experience", isSystem: true, userId: null }, options);
          if (!category) throw new Error("experience category missing");
          business = { kind: "create", expectedCategoryVersion: category.version, input: { categoryId: category._id, title, propertyValues: [] } };
          await db.answers.insertOne({ _id: answerId, userId, questionId, ...input, createdRecordId: null,
            inputIdempotencyKey, requestHash, version: answerVersion, writerPending: true, writerOperationId: operationId, updatedAt: new Date() }, options);
        }
        const writerIntegration = createCareerProducerIntent({ producer: "interview", userId, sourceId: operationId, operationId,
          business, document: { kind: "markdown", recordId, expectedVersion: documentVersion, markdown: input.transcript, summary: "인터뷰 답변 저장" } });
        const now = new Date();
        const operation: InterviewCareerOperationDoc = { _id: operationId, userId, sessionId, questionId, answerId, answerVersion,
          expectedAnswerVersion, recordId, inputIdempotencyKey, requestHash, kind: "answer", input,
          writerIntegration, active: true, result: null, createdAt: now, updatedAt: now };
        await db.interviewCareerOperations.insertOne(operation, options);
        if (operation.kind === "answer") await refreshMongoInterviewProgress(tx, userId, sessionId);
        return operation;
      });
    } catch (error) {
      if (duplicate(error)) conflict("answer changed concurrently");
      throw error;
    }
  }

  private scope(operation: InterviewCareerOperationDoc): CareerProducerScope {
    return { producer: "interview", userId: operation.userId, sourceId: operation._id,
      operationId: operation.writerIntegration.operationId, fingerprint: operation.writerIntegration.fingerprint };
  }

  private async sourceGuard(tx: MongoTransaction, operation: InterviewCareerOperationDoc) {
    const intent = operation.writerIntegration;
    const requestHash = operation.kind === "answer"
      ? hash({ kind: "answer", sessionId: operation.sessionId, questionId: operation.questionId, input: operation.input })
      : hash({ kind: "cleanup", answerId: operation.answerId, expectedAnswerVersion: operation.expectedAnswerVersion, command: intent.business });
    if (requestHash !== operation.requestHash) conflict("prepared answer payload changed");
    if (operation.kind === "answer" && (intent.document?.kind !== "markdown" || intent.document.markdown !== operation.input.transcript
      || operation.answerVersion !== (operation.expectedAnswerVersion ?? 0) + 1)) conflict("prepared transcript intent changed");
    if (operation.kind === "cleanup" && (intent.document !== null || operation.expectedAnswerVersion !== operation.answerVersion)) conflict("prepared cleanup intent changed");
    const db = mongoCollections(tx.db); const options = { session: tx.session };
    const session = await db.interviewSessions.findOne({ _id: operation.sessionId, userId: operation.userId }, options);
    const question = await db.questions.findOne({ _id: operation.questionId, userId: operation.userId,
      interviewSessionId: operation.sessionId, active: true }, options);
    const answer = await db.answers.findOne({ _id: operation.answerId, userId: operation.userId, questionId: operation.questionId,
      version: operation.answerVersion, ...(operation.kind === "answer"
        ? { writerPending: true, writerOperationId: operation._id }
        : { writerPending: { $ne: true }, createdRecordId: operation.recordId }) }, options);
    if (!session || !question || !answer) conflict("prepared answer source changed");
    if (answer.inputType !== operation.input.inputType || answer.transcript !== operation.input.transcript
      || (operation.kind === "answer" && answer.requestHash !== operation.requestHash)) conflict("prepared answer input changed");
    if (operation.kind === "cleanup" && (intent.business?.kind !== "patch"
      || answer.recordVersion !== intent.business.expectedVersion)) throw new InterviewError(412, "cleanup answer record version is stale");
    return { session, answer };
  }

  private async progress(tx: MongoTransaction, userId: string, sessionId: string) {
    const db = mongoCollections(tx.db); const options = { session: tx.session };
    const questions = await db.questions.find({ userId, interviewSessionId: sessionId, active: true }, options).sort({ orderNo: 1, _id: 1 }).toArray();
    const answers = await db.answers.find({ userId, writerPending: { $ne: true },
      questionId: { $in: questions.map(({ _id }) => _id) } }, options).toArray();
    const answered = new Set(answers.map(({ questionId }) => questionId));
    const next = questions.find((question) => !question.skipped && !answered.has(question._id));
    const finished = questions.every((question) => question.skipped || answered.has(question._id));
    const currentSession = await db.interviewSessions.findOne({ _id: sessionId, userId }, options);
    const session = await db.interviewSessions.findOneAndUpdate({ _id: sessionId, userId }, {
      $set: { answeredCount: answered.size, currentOrder: next?.orderNo ?? questions.length,
        status: finished ? "done" as const : currentSession?.status === "paused" ? "paused" as const : "open" as const, updatedAt: new Date() }, $inc: { version: 1 },
    }, { ...options, returnDocument: "after" });
    if (!session) conflict("prepared interview session changed");
    return { answered: session.answeredCount, total: session.questionCount };
  }

  private async finalizeAnswer(tx: MongoTransaction, operation: InterviewCareerOperationDoc, intent: CareerProducerIntent) {
    await requireActiveUser(tx, operation.userId);
    await this.sourceGuard(tx, operation);
    const business = intent.businessResult;
    if (!business || business.data.userId !== operation.userId || (operation.recordId && business.data.id !== operation.recordId)
      || !intent.documentResult || intent.documentResult.recordId !== business.data.id) conflict("prepared owner receipt scope changed");
    const db = mongoCollections(tx.db); const options = { session: tx.session }; const now = new Date();
    await assertActiveRecordsForWrite(tx, operation.userId, [business.data.id]);
    const answer = await db.answers.findOneAndUpdate({ _id: operation.answerId, userId: operation.userId,
      version: operation.answerVersion, writerPending: true, writerOperationId: operation._id }, {
      $set: { createdRecordId: business.data.id, recordVersion: business.data.version, writerPending: false, updatedAt: now },
    }, { ...options, returnDocument: "after" });
    if (!answer) conflict("prepared answer changed before completion");
    const changeType = operation.expectedAnswerVersion === null ? "created" as const : "strengthened" as const;
    await db.answerRecordChanges.updateOne({ userId: operation.userId, answerId: operation.answerId }, {
      $setOnInsert: { _id: randomUUID(), userId: operation.userId, answerId: operation.answerId },
      $set: { recordId: business.data.id, changeType, changedFields: ["title", "body_md"], sourceQuote: operation.input.transcript, createdAt: now },
    }, { ...options, upsert: true });
    const progress = await this.progress(tx, operation.userId, operation.sessionId);
    await addMongoOutboxEvent(tx, { userId: operation.userId, topic: "record.cleanup", idempotencyKey: `record-cleanup:${operation._id}`,
      payload: { userId: operation.userId, answerId: operation.answerId, operationId: operation._id,
        answerVersion: operation.answerVersion, recordVersion: business.data.version } });
    const result = InterviewAnswerResultSchema.parse({
      answer: { id: answer._id, questionId: answer.questionId, inputType: answer.inputType, transcript: answer.transcript,
        createdRecordId: business.data.id, version: answer.version, updatedAt: answer.updatedAt.toISOString() },
      recordChange: { type: changeType, recordId: business.data.id, changedFields: ["title", "body_md"], sourceQuote: operation.input.transcript }, progress,
    });
    const finalized = await db.interviewCareerOperations.updateOne({ _id: operation._id, userId: operation.userId, active: true,
      "writerIntegration.operationId": intent.operationId, "writerIntegration.fingerprint": intent.fingerprint,
      "writerIntegration.leaseToken": intent.leaseToken }, { $set: { result, recordId: business.data.id, active: false, updatedAt: now } }, options);
    if (!finalized.matchedCount) conflict("prepared answer operation changed before completion");
  }

  async executeAnswer(userId: string, operationId: string): Promise<InterviewAnswerResult> {
    const operation = await mongoCollections(this.context.db).interviewCareerOperations.findOne({ _id: UuidSchema.parse(operationId),
      userId: UuidSchema.parse(userId), kind: "answer" });
    if (!operation) throw new InterviewError(404, "answer operation not found");
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      if (!operation.result) await this.sourceGuard(tx, operation);
    });
    if (operation.result) return InterviewAnswerResultSchema.parse(operation.result);
    await this.coordinator.execute(this.scope(operation), (tx, intent) => this.finalizeAnswer(tx, operation, intent));
    const completed = await mongoCollections(this.context.db).interviewCareerOperations.findOne({ _id: operation._id, userId });
    if (!completed?.result) conflict("prepared answer result missing");
    return InterviewAnswerResultSchema.parse(completed.result);
  }

  retryAnswer(userId: string, operationId: string) { return this.executeAnswer(userId, operationId); }
  async prepareCleanup(userId: string, answerId: string, key: string, expectedAnswerVersion: number,
    commandValue: Extract<CareerProducerBusinessCommand, { kind: "patch" }>): Promise<InterviewCareerOperationDoc> {
    UuidSchema.parse(userId); UuidSchema.parse(answerId);
    CareerBusinessRecordSchema.shape.version.parse(expectedAnswerVersion);
    const command = CareerProducerBusinessCommandSchema.parse(commandValue);
    if (command.kind !== "patch" || command.patches.length !== 2
      || !command.patches.some((patch) => "status" in patch && patch.status === "organized")
      || !command.patches.some((patch) => "title" in patch || "propertyValues" in patch)) conflict("cleanup requires frozen business changes and organized status");
    const inputIdempotencyKey = IdempotencyKeySchema.parse(key);
    const requestHash = hash({ kind: "cleanup", answerId, expectedAnswerVersion, command });
    try {
      return await inTransaction(this.context, async (tx) => {
        await requireActiveUser(tx, userId);
        const db = mongoCollections(tx.db); const options = { session: tx.session };
        const replay = await db.interviewCareerOperations.findOne({ userId, inputIdempotencyKey }, options);
        if (replay) {
          if (replay.kind !== "cleanup" || replay.requestHash !== requestHash) conflict("idempotency key was reused for another cleanup");
          return replay;
        }
        const answer = await db.answers.findOne({ _id: answerId, userId, version: expectedAnswerVersion,
          writerPending: { $ne: true }, createdRecordId: command.recordId }, options);
        if (!answer) conflict("cleanup answer revision changed");
        const question = await db.questions.findOne({ _id: answer.questionId, userId, active: true }, options);
        if (!question) throw new InterviewError(404, "question not found");
        const session = await db.interviewSessions.findOne({ _id: question.interviewSessionId, userId }, options);
        if (!session) throw new InterviewError(404, "interview session not found");
        if (await db.interviewCareerOperations.findOne({ userId, questionId: question._id, active: true }, options)) conflict("question has a pending Career operation");
        const record = await db.careerRecords.findOne({ _id: command.recordId, userId, origin: "interview", deletedAt: null, status: { $ne: "verified" } }, options);
        if (!record) conflict("cleanup record is no longer writable");
        if (record.version !== command.expectedVersion || answer.recordVersion !== command.expectedVersion) throw new InterviewError(412, "cleanup record version is stale");
        const category = await db.careerCategories.findOne({ _id: record.categoryId, $or: [{ userId: null }, { userId }] }, options);
        if (!category || category.version !== command.expectedCategoryVersion) throw new InterviewError(412, "cleanup category version is stale");
        const operationId = randomUUID(); const now = new Date();
        const operation: InterviewCareerOperationDoc = { _id: operationId, userId, sessionId: session._id, questionId: question._id,
          answerId, answerVersion: answer.version, expectedAnswerVersion: answer.version, recordId: record._id,
          inputIdempotencyKey, requestHash, kind: "cleanup", input: { inputType: answer.inputType, transcript: answer.transcript },
          writerIntegration: createCareerProducerIntent({ producer: "interview", userId, sourceId: operationId, operationId, business: command, document: null }),
          active: true, result: null, createdAt: now, updatedAt: now };
        await db.interviewCareerOperations.insertOne(operation, options);
        return operation;
      });
    } catch (error) {
      if (duplicate(error)) conflict("cleanup changed concurrently");
      throw error;
    }
  }

  private async finalizeCleanup(tx: MongoTransaction, operation: InterviewCareerOperationDoc, intent: CareerProducerIntent) {
    await requireActiveUser(tx, operation.userId);
    const { session, answer } = await this.sourceGuard(tx, operation);
    const business = intent.businessResult;
    if (!business || business.data.userId !== operation.userId || business.data.id !== operation.recordId || intent.document) conflict("cleanup owner receipt scope changed");
    await assertActiveRecordsForWrite(tx, operation.userId, [business.data.id]);
    const changedFields = new Set<string>();
    if (intent.business?.kind !== "patch") conflict("cleanup business command changed");
    for (const patch of intent.business.patches) {
      if ("title" in patch) changedFields.add("title");
      if ("status" in patch) changedFields.add("status");
      if ("propertyValues" in patch && patch.propertyValues) {
        for (const value of patch.propertyValues.set) changedFields.add(value.propertyDefinitionId);
        for (const id of patch.propertyValues.unsetPropertyIds) changedFields.add(id);
      }
    }
    const db = mongoCollections(tx.db); const options = { session: tx.session }; const now = new Date();
    const change = await db.answerRecordChanges.findOneAndUpdate({ userId: operation.userId, answerId: operation.answerId, recordId: business.data.id }, {
      $set: { changedFields: [...changedFields], createdAt: now },
    }, { ...options, returnDocument: "after" });
    if (!change) conflict("cleanup answer change is missing");
    await db.answers.updateOne({ _id: answer._id, userId: operation.userId, version: operation.answerVersion,
      createdRecordId: business.data.id, writerPending: { $ne: true } }, { $set: { recordVersion: business.data.version } }, options);
    const result = InterviewAnswerResultSchema.parse({
      answer: { id: answer._id, questionId: answer.questionId, inputType: answer.inputType, transcript: answer.transcript,
        createdRecordId: business.data.id, version: answer.version, updatedAt: answer.updatedAt.toISOString() },
      recordChange: { type: change.changeType, recordId: change.recordId, changedFields: [...changedFields], sourceQuote: change.sourceQuote },
      progress: { answered: session.answeredCount, total: session.questionCount },
    });
    const finalized = await db.interviewCareerOperations.updateOne({ _id: operation._id, userId: operation.userId, active: true,
      "writerIntegration.operationId": intent.operationId, "writerIntegration.fingerprint": intent.fingerprint,
      "writerIntegration.leaseToken": intent.leaseToken }, { $set: { result, active: false, updatedAt: now } }, options);
    if (!finalized.matchedCount) conflict("cleanup operation changed before completion");
  }

  async executeCleanup(userId: string, operationId: string): Promise<InterviewAnswerResult> {
    const operation = await mongoCollections(this.context.db).interviewCareerOperations.findOne({ _id: UuidSchema.parse(operationId),
      userId: UuidSchema.parse(userId), kind: "cleanup" });
    if (!operation) throw new InterviewError(404, "cleanup operation not found");
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      if (!operation.result) await this.sourceGuard(tx, operation);
    });
    if (operation.result) return InterviewAnswerResultSchema.parse(operation.result);
    await this.coordinator.execute(this.scope(operation), (tx, intent) => this.finalizeCleanup(tx, operation, intent));
    const completed = await mongoCollections(this.context.db).interviewCareerOperations.findOne({ _id: operation._id, userId });
    if (!completed?.result) conflict("cleanup result missing");
    return InterviewAnswerResultSchema.parse(completed.result);
  }

  retryCleanup(userId: string, operationId: string) { return this.executeCleanup(userId, operationId); }
}