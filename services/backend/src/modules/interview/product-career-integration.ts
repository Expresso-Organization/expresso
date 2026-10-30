import {
  CareerBusinessPropertyValueSchema, CareerProducerScopeSchema, CareerWriteOperationResponseSchema,
  InterviewAnswerResultSchema, RECORD_STAR_KEYS, type CareerProducerScope, type CareerPropertyDefinitionV2,
  type CareerPropertyOptionResponse, type CareerRegisterPropertyOption, type CareerWriteOperationResponse,
  type InterviewAnswerResult, type SaveInterviewAnswer,
} from "@expresso/contracts";
import { mongoCollections, type InterviewCareerOperationDoc } from "@expresso/database";
import { z } from "zod";
import type { MongoContext } from "../../platform/mongodb.js";
import { withTimeout } from "../../platform/timeouts.js";
import {
  CanonicalCareerReadService, publicCareerWriteOperation, validateCareerProducerIntent,
  translateCareerProductProperties, type RecordCleaner,
} from "../career/index.js";
import type { ConsentApi } from "../consent/index.js";
import { PreparedInterviewCareerWriter } from "./prepared-career-writer.js";
import { InterviewError } from "./public.js";

export const InterviewCleanupSourceSchema = z.strictObject({
  answerId: z.uuid(), operationId: z.uuid(),
  answerVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  recordVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export type InterviewCleanupSource = z.infer<typeof InterviewCleanupSourceSchema>;
export type InterviewAnswerOperationResult =
  | { status: 200; body: { data: InterviewAnswerResult } }
  | { status: 202; body: CareerWriteOperationResponse };
export interface InterviewProductCareerOptions {
  requireBusinessOwner?(): void;
  cleaner?: RecordCleaner | null;
  consent?: ConsentApi | null;
  registerOption?(userId: string, categoryId: string, propertyId: string, input: CareerRegisterPropertyOption): Promise<CareerPropertyOptionResponse>;
}

/** 답변/정리 source만 저장하며 업무·본문 값은 각 owner의 준비된 명령으로 변경합니다. */
export class InterviewProductCareerIntegration {
  constructor(readonly context: MongoContext, readonly writer: PreparedInterviewCareerWriter,
    readonly reader: CanonicalCareerReadService, readonly options: InterviewProductCareerOptions = {}) {}

  readRecord(userId: string, recordId: string) { return this.reader.getRecord(userId, recordId); }

  async saveAnswerOperation(userId: string, sessionId: string, questionId: string, key: string,
    input: SaveInterviewAnswer): Promise<InterviewAnswerOperationResult> {
    const db = mongoCollections(this.context.db);
    const question = await db.questions.findOne({ _id: questionId, userId, interviewSessionId: sessionId, active: true });
    if (!question) throw new InterviewError(404, "question not found");
    const replay = await db.interviewCareerOperations.findOne({ userId, inputIdempotencyKey: key });
    if (!replay) this.options.requireBusinessOwner?.();
    const existing = await db.answers.findOne({ userId, questionId });
    // 신규/강화 모두 준비된 schema와 canonical 값만 허용합니다.
    if (existing?.createdRecordId) await this.reader.getRecord(userId, existing.createdRecordId);
    else {
      const category = await db.careerCategories.findOne({ key: "experience", userId });
      if (!category) throw new InterviewError(404, "career category not found");
      await this.reader.definitions(userId, category);
    }
    const operation = await this.writer.prepareAnswer(userId, sessionId, questionId, key, input);
    try {
      return { status: 200, body: { data: await this.writer.executeAnswer(userId, operation._id) } };
    } catch (error) {
      const current = await db.interviewCareerOperations.findOne({ _id: operation._id, userId });
      if (!current) throw error;
      if (current.result) return { status: 200, body: { data: InterviewAnswerResultSchema.parse(current.result) } };
      const intent = validateCareerProducerIntent(current.writerIntegration);
      if (["pending", "running", "retry"].includes(intent.state)) {
        return { status: 202, body: CareerWriteOperationResponseSchema.parse({ data: publicCareerWriteOperation(intent) }) };
      }
      if (intent.state === "blocked" || intent.state === "cancelled") throw Object.assign(new InterviewError(409, "answer operation requires recovery"), { publicDetails: { operation: publicCareerWriteOperation(intent) } });
      throw error;
    }
  }

  async execute(rawScope: CareerProducerScope): Promise<InterviewAnswerResult> {
    const scope = CareerProducerScopeSchema.parse(rawScope);
    if (scope.producer !== "interview") throw new InterviewError(404, "Interview operation not found");
    const operation = await mongoCollections(this.context.db).interviewCareerOperations.findOne({
      _id: scope.sourceId, userId: scope.userId, "writerIntegration.operationId": scope.operationId,
      "writerIntegration.fingerprint": scope.fingerprint,
    });
    if (!operation) throw new InterviewError(404, "Interview operation not found");
    validateCareerProducerIntent(operation.writerIntegration);
    if (operation.kind === "answer") return this.writer.executeAnswer(scope.userId, operation._id);
    // 이미 성공한 receipt의 finalize/replay는 새 업무 변경이 아닙니다.
    if (!operation.writerIntegration.businessResult) await this.options.consent?.require(scope.userId, "record_cleanup");
    return this.writer.executeCleanup(scope.userId, operation._id);
  }

  private async registerCleanupOptions(userId: string, categoryId: string, definitions: readonly CareerPropertyDefinitionV2[], properties: Record<string, unknown>) {
    for (const [key, value] of Object.entries(properties)) {
      const definition = definitions.find(item => item.key === key && item.deletedAt === null);
      if (!definition || definition.type !== "multi_select" || !Array.isArray(value)) continue;

      const options = Array.isArray(definition.config.options) ? definition.config.options : [];
      for (const label of [...new Set(value)]) {
        if (typeof label !== "string") throw new InterviewError(409, "cleanup tag must be exact text");
        if (options.some(option => option && typeof option === "object" && ("label" in option && option.label === label || "name" in option && option.name === label))) continue;
        if (!this.options.registerOption) throw new InterviewError(503, "cleanup option registration unavailable");
        const registered = await this.options.registerOption(userId, categoryId, definition.id, { label });
        if (registered.data.name !== label) throw new InterviewError(409, "cleanup option label changed");
      }
    }
  }

  async cleanupAnswer(userId: string, rawSource: InterviewCleanupSource): Promise<void> {
    const source = InterviewCleanupSourceSchema.parse(rawSource), db = mongoCollections(this.context.db);
    const key = "interview-cleanup:" + source.operationId;
    // 모델 호출 전에 동결한 명령을 찾습니다. 응답 유실 뒤 다시 정리하지 않습니다.
    const replay = await db.interviewCareerOperations.findOne({ userId, inputIdempotencyKey: key });
    if (replay) {
      if (replay.kind !== "cleanup" || replay.answerId !== source.answerId || replay.answerVersion !== source.answerVersion
        || replay.writerIntegration.business?.kind !== "patch" || replay.writerIntegration.business.expectedVersion !== source.recordVersion) {
        throw new InterviewError(409, "cleanup event binding changed");
      }
      await this.execute(this.scope(replay));
      return;
    }
    const original = await db.interviewCareerOperations.findOne({ _id: source.operationId, userId, kind: "answer", answerId: source.answerId,
      answerVersion: source.answerVersion, active: false, "writerIntegration.state": "completed" });
    if (!original?.result || original.result.answer.version !== source.answerVersion
      || original.writerIntegration.businessResult?.data.version !== source.recordVersion) throw new InterviewError(409, "cleanup source event changed");
    const answer = await db.answers.findOne({ _id: source.answerId, userId, version: source.answerVersion, recordVersion: source.recordVersion,
      writerPending: { $ne: true }, createdRecordId: original.result.answer.createdRecordId });
    if (!answer?.createdRecordId) return;
    if (!await db.careerRecords.findOne({ _id: answer.createdRecordId, userId, deletedAt: null, version: source.recordVersion, origin: "interview", status: { $ne: "verified" } })) return;
    const record = await this.reader.getRecord(userId, answer.createdRecordId);
    if (record.version !== source.recordVersion || record.origin !== "interview" || record.status === "verified") return;
    const [question, category] = await Promise.all([
      db.questions.findOne({ _id: answer.questionId, userId, active: true }),
      db.careerCategories.findOne({ _id: record.categoryId, userId }),
    ]);
    if (!question || !category || !this.options.cleaner) return;
    this.options.requireBusinessOwner?.();
    if (record.pendingPropertyMutation) throw new InterviewError(409, "cleanup category mutation pending");
    await this.options.consent?.require(userId, "record_cleanup");
    const cleaned = await withTimeout(this.options.cleaner.clean({ userId, question: question.text, transcript: answer.transcript,
      existing: record.status === "draft" ? null : { title: record.title, bodyMd: record.bodyMd } }), 420_000, "record cleaner");
    const properties: Record<string,unknown> = cleaned.competencies.length ? { competencies: cleaned.competencies } : {};
    let definitions = await this.reader.definitions(userId, category);
    await this.registerCleanupOptions(userId, category._id, definitions, properties);
    const latestCategory=await db.careerCategories.findOne({_id:category._id,userId});
    if(!latestCategory)throw new InterviewError(404,"career category not found");
    definitions = await this.reader.definitions(userId, latestCategory);
    const competency = definitions.find(item=>item.key==="competencies" && item.deletedAt===null && item.type==="multi_select");
    const configured = Array.isArray(competency?.config.options) ? competency.config.options as {id:string;name?:string;label?:string}[] : [];
    const typed = competency && cleaned.competencies.length ? { competencies: {type:"multi_select",value:cleaned.competencies.map(label=>{const option=configured.find(o=>(o.name??o.label)===label);if(!option)throw new InterviewError(409,"cleanup option missing");return option.id;})} } : {};
    const translated = translateCareerProductProperties(category._id, definitions, typed);
    if (translated.relations.length) throw new InterviewError(409, "cleanup cannot change relations");
    const unsetPropertyIds: string[] = [];
    const operation = await this.writer.prepareCleanup(userId, answer._id, key, source.answerVersion, {
      kind: "patch", recordId: record.id, expectedVersion: source.recordVersion, expectedCategoryVersion: latestCategory.version,
      patches: [{ title: cleaned.title, propertyValues: { set: translated.propertyValues.map(value => CareerBusinessPropertyValueSchema.parse(value)), unsetPropertyIds } }, { status: "organized" }],
    });
    await this.execute(this.scope(operation));
  }

  private scope(operation: InterviewCareerOperationDoc): CareerProducerScope {
    return { producer: "interview", userId: operation.userId, sourceId: operation._id,
      operationId: operation.writerIntegration.operationId, fingerprint: operation.writerIntegration.fingerprint };
  }
}
