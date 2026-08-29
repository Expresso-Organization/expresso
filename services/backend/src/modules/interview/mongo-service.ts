import { randomUUID } from "node:crypto";
import { InterviewQuestionBasisSchema, InterviewSessionSchema, type InterviewQuestionBasis, type SaveInterviewAnswer } from "@expresso/contracts";
import { mongoCollections, type CareerRecordDoc, type QuestionDoc } from "@expresso/database";
import type { ClientSession } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { withTimeout } from "../../platform/timeouts.js";
import { requireActiveUser } from "../identity/index.js";
import type { ConsentApi } from "../consent/index.js";
import { cleanupChangedFields, cleanupProperties, type RecordCleaner } from "../career/record-cleaner.js";
import { generateQuestionDrafts, hasMetric, questionTextForBasis } from "./questions.js";
import { countMentions, type QuestionBasisOption, type QuestionContext, type QuestionWriter } from "./question-writer.js";
import type { InterviewApi } from "./index.js";
import { InterviewError } from "./public.js";
import { getMongoAnswerResult, refreshMongoInterviewProgress, saveMongoAnswer } from "./mongo-answers.js";

interface PlannedQuestion { text: string; basis: InterviewQuestionBasis; requirementId: string | null; variant: number; rationale: string | null }

export class MongoInterviewService implements InterviewApi {
  constructor(readonly context: MongoContext, readonly writer: QuestionWriter | null = null, readonly cleaner: RecordCleaner | null = null, readonly consent: ConsentApi | null = null) {}

  async cleanupAnswer(userId: string, answerId: string) {
    if (!this.cleaner) return;
    await this.consent?.require(userId, "record_cleanup");
    const db = mongoCollections(this.context.db);
    const answer = await db.answers.findOne({ _id: answerId, userId });
    if (!answer?.createdRecordId || answer.recordVersion === undefined) return;
    const expectedRecordVersion = answer.recordVersion;
    const [question, record] = await Promise.all([db.questions.findOne({ _id: answer.questionId, userId }), db.careerRecords.findOne({ _id: answer.createdRecordId, userId, origin: "interview", deletedAt: null })]);
    if (!question || !record) return;
    const cleaned = await withTimeout(this.cleaner.clean({ question: question.text, transcript: answer.transcript, existing: record.status === "draft" ? null : { title: record.title, bodyMd: record.bodyMd } }), 420_000, "record cleaner");
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const collections = mongoCollections(tx.db); const options = { session: tx.session }; const now = new Date();
      const updated = await collections.careerRecords.updateOne(
        { _id: record._id, userId, origin: "interview", deletedAt: null, status: { $ne: "verified" }, version: expectedRecordVersion },
        { $set: { title: cleaned.title, properties: cleanupProperties(cleaned) as CareerRecordDoc["properties"], status: "organized", updatedAt: now }, $inc: { version: 1, referenceVersion: 1 } }, options,
      );
      if (!updated.matchedCount) return;
      await collections.answerRecordChanges.updateOne({ userId, answerId, recordId: record._id }, { $set: { changedFields: cleanupChangedFields(cleaned), createdAt: now } }, options);
    });
  }

  async #questionOptions(userId: string, brewId: string, session?: ClientSession) {
    const db = mongoCollections(this.context.db); const options = session ? { session } : {};
    const brew = await db.brews.findOne({ _id: brewId, userId }, options);
    if (!brew) throw new InterviewError(404, "brew not found");
    const analysis = await db.jobAnalyses.findOne({ _id: brew.jobAnalysisId, userId }, options);
    if (!analysis) throw new InterviewError(404, "job analysis not found");
    const requirements = analysis.jobPostingId ? await db.jobPostingRequirements.find({ jobPostingId: analysis.jobPostingId }, options).sort({ orderNo: 1, _id: 1 }).toArray() : [];
    const coverages = await db.requirementCoverages.find({ userId, requirementId: { $in: requirements.map(({ _id }) => _id) } }, options).toArray();
    const coverageById = new Map(coverages.map((coverage) => [coverage.requirementId, coverage.coverage]));
    const sources = await db.brewSources.find({ userId, brewId, isSelected: true }, options).sort({ rank: 1, _id: 1 }).toArray();
    const records = await db.careerRecords.find({ userId, _id: { $in: sources.map(({ recordId }) => recordId) }, deletedAt: null }, options).toArray();
    const recordsById = new Map(records.map((record) => [record._id, record]));
    const orderedRecords = sources.flatMap(({ recordId }) => recordsById.get(recordId) ? [recordsById.get(recordId)!] : []);
    const posting = analysis.jobPostingId ? await db.jobPostings.findOne({ _id: analysis.jobPostingId }, options) : null;
    const company = posting ? await db.companies.findOne({ _id: posting.companyId }, options) : null;
    const requirementRows = requirements.flatMap((requirement) => {
      const coverage = coverageById.get(requirement._id); const span = InterviewQuestionBasisSchema.options[0].shape.evidence.safeParse((requirement.sourceSpan as { quote?: unknown }).quote);
      if ((coverage !== "missing" && coverage !== "partial" && coverage !== "covered") || !span.success) return [];
      if (posting) { const value = requirement.sourceSpan as { start?: unknown; end?: unknown; quote?: unknown }; if (!Number.isInteger(value.start) || !Number.isInteger(value.end) || Array.from(posting.descriptionRaw).slice(value.start as number, value.end as number).join("") !== value.quote) return []; }
      return [{ ...requirement, coverage, quote: span.data }];
    });
    const context: QuestionContext = {
      options: [
        ...requirementRows.filter(({ coverage }) => coverage !== "covered").map((row) => ({ basis: { type: "requirement" as const, requirementId: row._id, coverage: row.coverage as "missing" | "partial", evidence: row.quote }, label: `[공고 요건 · ${row.coverage === "missing" ? "안 채움" : "일부만"}] ${row.label}`, detail: row.quote, mentions: posting ? countMentions(row.label, posting.descriptionRaw) : null })),
        ...orderedRecords.filter((record) => !hasMetric(`${record.title} ${record.bodyMd} ${JSON.stringify(record.properties)}`)).map((record) => ({ basis: { type: "record_gap" as const, recordId: record._id, gap: "metric" as const, evidence: record.title }, label: `[기록 · 수치 없음] ${record.title}`, detail: record.bodyMd, mentions: null })),
      ],
      company: company ? { name: company.name, industry: company.industry ?? null, toneSummary: company.toneSummary ?? null } : null,
      jobTitle: posting?.title ?? null,
      materials: orderedRecords.map(({ title }) => title),
    };
    return { context, requirements: requirementRows, records: orderedRecords };
  }

  async #planQuestions(userId: string, brewId: string): Promise<PlannedQuestion[]> {
    const { context, requirements, records } = await this.#questionOptions(userId, brewId);
    if (context.options.length < 3) throw new InterviewError(409, "at least three grounded question bases are required");
    if (this.writer) {
      await this.consent?.require(userId, "question_draft");
      const drafted = await withTimeout(this.writer.draft(context), 420_000, "question writer");
      return drafted.map((question) => { const option = context.options[question.optionIndex]!; return { text: question.text, basis: option.basis, requirementId: option.basis.type === "requirement" ? option.basis.requirementId : null, variant: 0, rationale: question.rationale }; });
    }
    return generateQuestionDrafts(requirements.map((row) => ({ id: row._id, label: row.label, coverage: row.coverage, evidence: row.quote })), records.map((record) => ({ id: record._id, title: record.title, text: `${record.title}\n${record.bodyMd}\n${JSON.stringify(record.properties)}` }))).map((draft) => ({ ...draft, rationale: null }));
  }

  async start(userId: string, brewId: string, idempotencyKey: string) {
    const db = mongoCollections(this.context.db);
    const replay = await db.interviewSessions.findOne({ userId, inputIdempotencyKey: idempotencyKey });
    if (replay) return this.getSession(userId, replay._id);
    const existing = await db.interviewSessions.findOne({ userId, brewId });
    if (existing) return this.getSession(userId, existing._id);
    const planned = await this.#planQuestions(userId, brewId);
    const sessionId = await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId);
      const collections = mongoCollections(tx.db); const options = { session: tx.session };
      const keyed = await collections.interviewSessions.findOne({ userId, inputIdempotencyKey: idempotencyKey }, options); if (keyed) return keyed._id;
      const brew = await collections.brews.findOneAndUpdate({ _id: brewId, userId }, { $set: { status: "interviewing", updatedAt: new Date() }, $inc: { referenceVersion: 1 } }, { ...options, returnDocument: "after" });
      if (!brew) throw new InterviewError(404, "brew not found");
      const started = await collections.interviewSessions.findOne({ userId, brewId }, options); if (started) return started._id;
      const now = new Date(); const id = randomUUID();
      await collections.interviewSessions.insertOne({ _id: id, userId, brewId, status: "open", questionCount: planned.length, inputIdempotencyKey: idempotencyKey, currentOrder: 0, answeredCount: 0, version: 1, createdAt: now, updatedAt: now }, options);
      await collections.questions.insertMany(planned.map((draft, orderNo) => ({ _id: randomUUID(), userId, interviewSessionId: id, requirementId: draft.requirementId, replacedFromId: null, orderNo, text: draft.text, skipped: false, basis: draft.basis, active: true, variant: draft.variant, rationale: draft.rationale, createdAt: now })), options);
      return id;
    });
    return this.getSession(userId, sessionId);
  }

  async getSession(userId: string, sessionId: string) {
    const db = mongoCollections(this.context.db); const session = await db.interviewSessions.findOne({ _id: sessionId, userId });
    if (!session) throw new InterviewError(404, "interview session not found");
    const questions = await db.questions.find({ userId, interviewSessionId: sessionId, active: true }).sort({ orderNo: 1, _id: 1 }).toArray();
    const answers = await db.answers.find({ userId, questionId: { $in: questions.map(({ _id }) => _id) } }).project<{ questionId: string }>({ questionId: 1 }).toArray(); const answered = new Set(answers.map(({ questionId }) => questionId));
    return InterviewSessionSchema.parse({ id: session._id, brewId: session.brewId, status: session.status, currentOrder: session.currentOrder, answeredCount: session.answeredCount, questionCount: session.questionCount, questionsMayAdapt: true, questions: questions.map((question) => ({ id: question._id, order: question.orderNo, text: question.text, basis: InterviewQuestionBasisSchema.parse(question.basis), rationale: question.rationale ?? null, replacedFromId: question.replacedFromId ?? null, skipped: question.skipped, answered: answered.has(question._id) })) });
  }

  async setPaused(userId: string, sessionId: string, paused: boolean) {
    await inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); const result = await mongoCollections(tx.db).interviewSessions.updateOne({ _id: sessionId, userId, status: { $ne: "done" } }, { $set: { status: paused ? "paused" : "open", pausedAt: paused ? new Date() : null, updatedAt: new Date() }, $inc: { version: 1 } }, { session: tx.session }); if (!result.matchedCount) throw new InterviewError(404, "interview session not found"); });
    return this.getSession(userId, sessionId);
  }

  async #rewrite(userId: string, sessionId: string, question: QuestionDoc, variant: number) {
    if (!this.writer) return { text: questionTextForBasis(InterviewQuestionBasisSchema.parse(question.basis), variant), rationale: null };
    const db = mongoCollections(this.context.db); const session = await db.interviewSessions.findOne({ _id: sessionId, userId }); if (!session) throw new InterviewError(404, "interview session not found");
    const previous = await db.questions.find({ userId, interviewSessionId: sessionId, orderNo: question.orderNo }).sort({ variant: 1 }).project<{ text: string }>({ text: 1 }).toArray();
    const { context } = await this.#questionOptions(userId, session.brewId); const basis = InterviewQuestionBasisSchema.parse(question.basis);
    const option = context.options.find(({ basis: item }) => item.type === basis.type && (item.type === "requirement" && basis.type === "requirement" ? item.requirementId === basis.requirementId : item.type === "record_gap" && basis.type === "record_gap" && item.recordId === basis.recordId));
    return withTimeout(this.writer.rewrite({ option: option ?? { basis, label: basis.evidence, detail: basis.evidence, mentions: null }, previousTexts: previous.map(({ text }) => text), company: context.company, jobTitle: context.jobTitle }), 420_000, "question writer");
  }

  async replaceQuestion(userId: string, sessionId: string, questionId: string) {
    const db = mongoCollections(this.context.db); const current = await db.questions.findOne({ _id: questionId, userId, interviewSessionId: sessionId, active: true }); if (!current) throw new InterviewError(404, "question not found");
    if (await db.answers.findOne({ userId, questionId })) throw new InterviewError(409, "answered question cannot be replaced");
    const rewritten = await this.#rewrite(userId, sessionId, current, current.variant + 1);
    await inTransaction(this.context, async (tx) => {
      await requireActiveUser(tx, userId); const collections = mongoCollections(tx.db); const options = { session: tx.session };
      const session = await collections.interviewSessions.findOne({ _id: sessionId, userId }, options); const question = await collections.questions.findOne({ _id: questionId, userId, interviewSessionId: sessionId, active: true }, options);
      if (!session || !question) throw new InterviewError(404, "question not found"); if (await collections.answers.findOne({ userId, questionId }, options)) throw new InterviewError(409, "answered question cannot be replaced");
      const guarded = await collections.interviewSessions.updateOne({ _id: sessionId, userId, version: session.version ?? 1 }, { $set: { updatedAt: new Date() }, $inc: { version: 1 } }, options); if (!guarded.matchedCount) throw new InterviewError(409, "interview session changed concurrently");
      await collections.questions.updateOne({ _id: questionId, userId, active: true }, { $set: { active: false, skipped: true } }, options);
      await collections.questions.insertOne({ _id: randomUUID(), userId, interviewSessionId: sessionId, requirementId: question.requirementId ?? null, replacedFromId: question._id, orderNo: question.orderNo, text: rewritten.text, skipped: false, basis: question.basis, active: true, variant: question.variant + 1, rationale: rewritten.rationale, createdAt: new Date() }, options);
    });
    return this.getSession(userId, sessionId);
  }

  async skipQuestion(userId: string, sessionId: string, questionId: string) {
    await inTransaction(this.context, async (tx) => { await requireActiveUser(tx, userId); const db = mongoCollections(tx.db); const updated = await db.questions.updateOne({ _id: questionId, userId, interviewSessionId: sessionId, active: true }, { $set: { skipped: true } }, { session: tx.session }); if (!updated.matchedCount) throw new InterviewError(404, "question not found"); await refreshMongoInterviewProgress(tx, userId, sessionId); });
    return this.getSession(userId, sessionId);
  }

  saveAnswer(userId: string, sessionId: string, questionId: string, idempotencyKey: string, input: SaveInterviewAnswer) { return saveMongoAnswer(this.context, userId, sessionId, questionId, idempotencyKey, input); }
  getAnswerResult(userId: string, sessionId: string, answerId: string) { return getMongoAnswerResult(this.context, userId, sessionId, answerId); }
}
