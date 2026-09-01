import { createHash, randomUUID } from "node:crypto";
import { InterviewAnswerResultSchema, SaveInterviewAnswerSchema, type SaveInterviewAnswer } from "@expresso/contracts";
import { mongoCollections, type AnswerDoc, type CareerRecordDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { requireActiveUser } from "../identity/index.js";
import { InterviewError } from "./public.js";

const duplicate = (error: unknown) => (error as { code?: number })?.code === 11000;

function requestHash(questionId: string, input: SaveInterviewAnswer) {
  return createHash("sha256").update(JSON.stringify({ questionId, ...input })).digest("hex");
}

function fallbackTitle(transcript: string) {
  return transcript.split(/\n/)[0]!.slice(0, 120);
}

export async function refreshMongoInterviewProgress(tx: MongoTransaction, userId: string, sessionId: string) {
  const db = mongoCollections(tx.db); const options = { session: tx.session };
  const questions = await db.questions.find({ userId, interviewSessionId: sessionId, active: true }, options).sort({ orderNo: 1, _id: 1 }).toArray();
  const answers = await db.answers.find({ userId, questionId: { $in: questions.map(({ _id }) => _id) } }, options).project<{ questionId: string }>({ questionId: 1 }).toArray();
  const answered = new Set(answers.map(({ questionId }) => questionId));
  const next = questions.find((question) => !question.skipped && !answered.has(question._id));
  const finished = questions.every((question) => question.skipped || answered.has(question._id));
  await db.interviewSessions.updateOne(
    { _id: sessionId, userId },
    { $set: { answeredCount: answered.size, currentOrder: next?.orderNo ?? questions.length, ...(finished ? { status: "done" as const } : {}), updatedAt: new Date() }, $inc: { version: 1 } },
    options,
  );
}

export async function getMongoAnswerResult(context: MongoContext, userId: string, sessionId: string, answerId: string) {
  const db = mongoCollections(context.db);
  const [answer, change, session] = await Promise.all([
    db.answers.findOne({ _id: answerId, userId }),
    db.answerRecordChanges.findOne({ userId, answerId }),
    db.interviewSessions.findOne({ _id: sessionId, userId }),
  ]);
  if (!answer || !change || !session || !answer.createdRecordId) throw new InterviewError(404, "answer not found");
  const question = await db.questions.findOne({ _id: answer.questionId, userId, interviewSessionId: sessionId });
  if (!question) throw new InterviewError(404, "answer not found");
  return InterviewAnswerResultSchema.parse({
    answer: { id: answer._id, questionId: answer.questionId, inputType: answer.inputType, transcript: answer.transcript, createdRecordId: answer.createdRecordId, version: answer.version, updatedAt: answer.updatedAt.toISOString() },
    recordChange: { type: change.changeType, recordId: change.recordId, changedFields: change.changedFields, sourceQuote: change.sourceQuote },
    progress: { answered: session.answeredCount, total: session.questionCount },
  });
}

export async function saveMongoAnswer(context: MongoContext, userId: string, sessionId: string, questionId: string, idempotencyKey: string, inputValue: SaveInterviewAnswer) {
  const input = SaveInterviewAnswerSchema.parse(inputValue);
  const hash = requestHash(questionId, input);
  let answerId: string;
  try {
    answerId = await inTransaction(context, async (tx) => {
      await requireActiveUser(tx, userId);
      const db = mongoCollections(tx.db); const options = { session: tx.session };
      const session = await db.interviewSessions.findOne({ _id: sessionId, userId }, options);
      const question = await db.questions.findOne({ _id: questionId, userId, interviewSessionId: sessionId, active: true }, options);
      if (!session || !question) throw new InterviewError(404, "question not found");
      const keyed = await db.answers.findOne({ userId, inputIdempotencyKey: idempotencyKey }, options);
      if (keyed && keyed.requestHash !== hash) throw new InterviewError(409, "idempotency key was reused for another answer");
      if (keyed) return keyed._id;
      const existing = await db.answers.findOne({ userId, questionId }, options);
      const now = new Date();
      if (existing) {
        if (!existing.createdRecordId) throw new Error("interview answer record is missing");
        const updatedRecord = await db.careerRecords.findOneAndUpdate(
          { _id: existing.createdRecordId, userId, origin: "interview", deletedAt: null },
          { $set: { title: fallbackTitle(input.transcript), bodyMd: input.transcript, updatedAt: now }, $inc: { version: 1, referenceVersion: 1 } },
          { ...options, returnDocument: "after" },
        );
        if (!updatedRecord) throw new InterviewError(409, "answer record is no longer writable");
        await db.answers.updateOne({ _id: existing._id, userId, version: existing.version }, { $set: { inputType: input.inputType, transcript: input.transcript, inputIdempotencyKey: idempotencyKey, requestHash: hash, recordVersion: updatedRecord.version, updatedAt: now }, $inc: { version: 1 } }, options);
        await db.answerRecordChanges.updateOne({ userId, answerId: existing._id }, { $set: { changeType: "strengthened", changedFields: ["title", "body_md"], sourceQuote: input.transcript, createdAt: now } }, options);
        await addMongoOutboxEvent(tx, { userId, topic: "record.cleanup", payload: { answerId: existing._id, userId }, idempotencyKey: `record-cleanup:${existing._id}:${hash.slice(0, 16)}` });
        await refreshMongoInterviewProgress(tx, userId, sessionId);
        return existing._id;
      }
      const category = await db.careerCategories.findOne({ key: "experience", isSystem: true, userId: null }, options);
      if (!category) throw new Error("experience category missing");
      const record: CareerRecordDoc = { _id: randomUUID(), userId, categoryId: category._id, title: fallbackTitle(input.transcript), status: "draft", origin: "interview", properties: {}, bodyMd: input.transcript, version: 1, updatedAt: now, deletedAt: null, purgeAfter: null, referenceVersion: 0 };
      const answer: AnswerDoc = { _id: randomUUID(), userId, questionId, inputType: input.inputType, transcript: input.transcript, createdRecordId: record._id, inputIdempotencyKey: idempotencyKey, requestHash: hash, version: 1, recordVersion: 1, updatedAt: now };
      await db.careerRecords.insertOne(record, options);
      await db.answers.insertOne(answer, options);
      await db.answerRecordChanges.insertOne({ _id: randomUUID(), userId, answerId: answer._id, recordId: record._id, changeType: "created", changedFields: ["title", "body_md"], sourceQuote: input.transcript, createdAt: now }, options);
      await addMongoOutboxEvent(tx, { userId, topic: "record.cleanup", payload: { answerId: answer._id, userId }, idempotencyKey: `record-cleanup:${answer._id}:${hash.slice(0, 16)}` });
      await refreshMongoInterviewProgress(tx, userId, sessionId);
      return answer._id;
    });
  } catch (error) {
    if (duplicate(error)) throw new InterviewError(409, "answer was changed concurrently");
    throw error;
  }
  return getMongoAnswerResult(context, userId, sessionId, answerId);
}
