import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/mysql.js";

import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/service.js";
import { InterviewService } from "./service.js";
import { BrewJobService } from "../brew-jobs/service.js";
import { classifyBrewJobFailure } from "../../worker/processors/brew-jobs.js";
import { MongoInterviewService } from "./mongo-service.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoCareerService } from "../career/index.js";
import { MongoJobMarketService } from "../jobs/index.js";
import { MongoMaterialsService } from "../materials/index.js";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { createRecordCleanupProcessor } from "../../worker/processors/record-cleanup.js";
import type { Job } from "bullmq";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB interview integration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: MongoInterviewService;
  let career: MongoCareerService;
  let userId = "";
  let otherUserId = "";
  let brewId = "";
  let sessionId = "";

  beforeAll(async () => {
    fixture = await createMongoFixture("interview");
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `interview-${randomUUID()}@example.com`, displayName: "Interview", password: "correct-horse-battery" })).user.id;
    otherUserId = (await identity.signup({ email: `interview-${randomUUID()}@example.com`, displayName: "Other", password: "correct-horse-battery" })).user.id;
    career = new MongoCareerService(fixture.resource);
    const categoryId = (await career.listCategories(userId)).find(({ key }) => key === "experience")!.id;
    const recordIds: string[] = [];
    for (const title of ["Migration project", "Incident response"]) {
      const record = (await career.createRecord(userId, randomUUID(), { categoryId, title, properties: {}, bodyMd: "Led a database migration" })).record;
      recordIds.push(record.id);
      await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: record.id }, { $set: { status: "organized" } });
    }
    const source = "PostgreSQL 장애 대응 경험이 필요합니다. TypeScript API 성과를 수치로 설명해야 합니다. 원격 협업 경험을 우대합니다." + " 상세 직무와 팀 협업 방식을 설명합니다.".repeat(8);
    const submission = await new MongoJobMarketService(fixture.resource).submitPosting(userId, randomUUID(), { companyName: "Interview Company", title: "Backend Engineer", descriptionRaw: source });
    const db = mongoCollections(fixture.resource.db);
    await db.jobAnalyses.updateOne({ _id: submission.jobAnalysisId }, { $set: { status: "done", progressStage: "done", resultVersion: 1 } });
    let cursor = 0;
    for (const [orderNo, quote] of ["PostgreSQL 장애 대응 경험이 필요합니다.", "TypeScript API 성과를 수치로 설명해야 합니다.", "원격 협업 경험을 우대합니다."].entries()) {
      const start = Array.from(source.slice(0, source.indexOf(quote, cursor))).length;
      cursor = source.indexOf(quote, cursor) + quote.length;
      const requirementId = randomUUID();
      await db.jobPostingRequirements.insertOne({ _id: requirementId, jobPostingId: submission.jobPostingId, orderNo, label: quote, kind: "must", sourceSpan: { start, end: start + Array.from(quote).length, quote }, extractorVersion: 1, extractedAt: new Date() });
      await db.requirementCoverages.insertOne({ _id: `${userId}:${requirementId}`, userId, requirementId, coverage: orderNo === 0 ? "missing" : orderNo === 1 ? "partial" : "covered", coveredBy: [], computedAt: new Date() });
    }
    const materials = new MongoMaterialsService(fixture.resource);
    brewId = (await materials.createBrew(userId, { jobAnalysisId: submission.jobAnalysisId, lengthPreset: "single" })).brewId;
    await db.brewSources.updateMany({ userId, brewId, recordId: { $in: recordIds } }, { $set: { isSelected: true } });
    service = new MongoInterviewService(fixture.resource);
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("preserves grounded assignment, replacement, pause, and session boundaries", async () => {
    const started = await service.start(userId, brewId, "mongo-interview-start-0001");
    sessionId = started.id;
    expect(started.questions).toHaveLength(4);
    expect(started.questions.every(({ basis }) => ["requirement", "record_gap"].includes(basis.type))).toBe(true);
    const original = started.questions[0]!;
    const replaced = await service.replaceQuestion(userId, sessionId, original.id);
    expect(replaced.questions.find(({ order }) => order === original.order)).toMatchObject({ replacedFromId: original.id, basis: original.basis });
    expect((await service.setPaused(userId, sessionId, true)).status).toBe("paused");
    expect((await service.setPaused(userId, sessionId, false)).status).toBe("open");
    await expect(service.getSession(otherUserId, sessionId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("saves one answer, record change, and cleanup outbox for idempotent delivery", async () => {
    const questionId = (await service.getSession(userId, sessionId)).questions[1]!.id;
    const input = { inputType: "text" as const, transcript: "장애 원인을 로그에서 찾아 배포 절차를 개선했습니다." };
    const first = await service.saveAnswer(userId, sessionId, questionId, "mongo-answer-0001", input);
    const replay = await service.saveAnswer(userId, sessionId, questionId, "mongo-answer-0001", input);
    expect(replay.answer.id).toBe(first.answer.id);
    const db = mongoCollections(fixture.resource.db);
    expect(await db.answers.countDocuments({ userId, questionId })).toBe(1);
    expect(await db.answerRecordChanges.countDocuments({ userId, answerId: first.answer.id })).toBe(1);
    expect(await db.outboxEvents.countDocuments({ userId, topic: "record.cleanup" })).toBe(1);
    const strengthened = await service.saveAnswer(userId, sessionId, questionId, "mongo-answer-0002", { ...input, transcript: `${input.transcript} 재발도 막았습니다.` });
    expect(strengthened).toMatchObject({ answer: { id: first.answer.id, version: 2 }, recordChange: { type: "strengthened" } });
    await expect(service.saveAnswer(userId, randomUUID(), questionId, "mongo-answer-wrong-session", input)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("does not overwrite a record edited while cleanup is running", async () => {
    const questionId = (await service.getSession(userId, sessionId)).questions[2]!.id;
    const answer = await service.saveAnswer(userId, sessionId, questionId, "mongo-answer-cleanup", { inputType: "text", transcript: "실제 답변에는 수치가 없습니다." });
    let started!: () => void; let release!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const cleanup = new MongoInterviewService(fixture.resource, null, { async clean() { started(); await wait; return { title: "AI 정리", situation: "상황", task: "과제", action: "행동", result: "결과", metrics: [], competencies: [] }; } });
    const running = cleanup.cleanupAnswer(userId, answer.answer.id);
    await ready;
    const current = await career.getRecord(userId, answer.answer.createdRecordId);
    await career.updateRecord(userId, current.id, current.version, { title: "사용자 편집" });
    release();
    await running;
    expect((await career.getRecord(userId, current.id)).title).toBe("사용자 편집");
  });

  it("retries the record-cleanup worker without duplicating the derived change", async () => {
    const questionId = (await service.getSession(userId, sessionId)).questions[3]!.id;
    const answer = await service.saveAnswer(userId, sessionId, questionId, "mongo-answer-worker", { inputType: "text", transcript: "배포 절차를 문서화했습니다." });
    let calls = 0;
    const cleanup = new MongoInterviewService(fixture.resource, null, { async clean() {
      calls += 1;
      if (calls === 1) throw new Error("temporary cleaner failure");
      return { title: "배포 절차 문서화", situation: null, task: null, action: "절차를 문서화했습니다.", result: null, metrics: [], competencies: [] };
    } });
    const processor = createRecordCleanupProcessor(cleanup);
    const job = { data: { answerId: answer.answer.id, userId } } as unknown as Job<Record<string, unknown>>;
    await expect(processor(job)).rejects.toThrow("temporary cleaner failure");
    await expect(processor(job)).resolves.toEqual({});
    expect((await career.getRecord(userId, answer.answer.createdRecordId))).toMatchObject({ title: "배포 절차 문서화", status: "organized" });
    expect(await mongoCollections(fixture.resource.db).answerRecordChanges.countDocuments({ userId, answerId: answer.answer.id })).toBe(1);
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const config: RuntimeConfig = {
  nodeEnv: "test", host: "127.0.0.1", port: 4_000, logLevel: "silent",
  databaseUrl: databaseUrl ?? "mysql://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1", outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: "expresso-interview-test",
};

interface IdRow { id: string }

describeWithDatabase("interview integration", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const identityService = new IdentityService(sql);
  const interviewService = new InterviewService(sql);
  const brewJobService = new BrewJobService(sql);
  const app = buildApi({ config, identityService, interviewService, brewJobService });

  /**
   * 세션 만들기 = 잡 하나. 라우트가 202를 주고, 워커가 계약을 돌린다.
   * 여기서는 Redis 없이 잡을 직접 돌려 같은 경로를 검사한다.
   */
  async function startSession(idempotencyKey: string) {
    const response = await app.inject({
      method: "POST",
      url: `/v1/brews/${brewId}/interview-sessions`,
      headers: { ...auth(), "idempotency-key": idempotencyKey },
    });
    if (response.statusCode !== 202) return { response, sessionId: null };
    const { jobId } = response.json().data as { jobId: string };
    const done = await brewJobService.process(
      jobId,
      { async run({ userId: owner, brewId: brew, idempotencyKey: key }) {
        return (await interviewService.start(owner, brew, key)).id;
      } },
      classifyBrewJobFailure,
    );
    return { response, sessionId: done.resultId };
  }
  const marker = randomUUID();
  const quotes = [
    "PostgreSQL 장애 대응 경험이 필요합니다.",
    "TypeScript API 성과를 수치로 설명해야 합니다.",
    "원격 협업 경험을 우대합니다.",
  ];
  const source = quotes.join(" ");
  let userId = "";
  let otherUserId = "";
  let token = "";
  let otherToken = "";
  let companyId = "";
  let postingId = "";
  let analysisId = "";
  let brewId = "";

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    const categoryId = (await sql<IdRow[]>`
      select id from category where \`key\` = 'experience' and is_system
    `)[0]?.id;
    if (!planId || !categoryId) throw new Error("interview seed missing");
    const users: IdRow[] = [{ id: randomUUID() }, { id: randomUUID() }];
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values
        (${users[0]!.id}, ${`interview-a-${marker}@example.com`}, 'Interview A', ${planId}),
        (${users[1]!.id}, ${`interview-b-${marker}@example.com`}, 'Interview B', ${planId})
    `;
    userId = users[0]?.id ?? "";
    otherUserId = users[1]?.id ?? "";
    token = (await identityService.issueSession({ userId })).accessToken;
    otherToken = (await identityService.issueSession({ userId: otherUserId })).accessToken;
    companyId = (await sql<IdRow[]>`
      insert into company (name, dedupe_key)
      values (${`Interview ${marker}`}, ${`interview-company-${marker}`}) returning id
    `)[0]?.id ?? "";
    postingId = (await sql<IdRow[]>`
      insert into job_posting (
        company_id, source, title, description_raw, requirements, dedupe_hash
      ) values (
        ${companyId}, 'user_input', 'Backend Engineer', ${source}, '{}',
        ${`interview-posting-${marker}`}
      ) returning id
    `)[0]?.id ?? "";
    analysisId = (await sql<IdRow[]>`
      insert into job_analysis (
        user_id, job_posting_id, input_type, status, progress_stage,
        result_version, target_version, analyzed_at
      ) values (${userId}, ${postingId}, 'paste', 'done', 'done', 1, 1, now(6))
      returning id
    `)[0]?.id ?? "";
    let cursor = 0;
    for (const [index, quote] of quotes.entries()) {
      const utf16Start = source.indexOf(quote, cursor);
      cursor = utf16Start + quote.length;
      const start = Array.from(source.slice(0, utf16Start)).length;
      const criterion = (await sql<IdRow[]>`
        insert into job_posting_requirement (
          job_posting_id, order_no, label, kind, source_span
        ) values (
          ${postingId}, ${index}, ${quote}, 'must',
          ${sql.json({ start, end: start + Array.from(quote).length, quote })}
        )
        returning id
      `)[0];
      await sql`
        insert into requirement_coverage (user_id, requirement_id, coverage)
        values (
          ${userId}, ${criterion!.id},
          ${index === 0 ? "missing" : index === 1 ? "partial" : "covered"}
        )
      `;
    }
    const records: IdRow[] = [{ id: randomUUID() }, { id: randomUUID() }];
    await sql`
      insert into record (
        id, user_id, category_id, title, status, origin, properties, body_md
      ) values
        (${records[0]!.id}, ${userId}, ${categoryId}, 'Migration project', 'organized', 'manual', '{}', 'Led a database migration'),
        (${records[1]!.id}, ${userId}, ${categoryId}, 'Incident response', 'verified', 'manual', '{}', 'Resolved a production incident')
    `;
    brewId = (await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, length_preset)
      values (${userId}, ${analysisId}, 'single') returning id
    `)[0]?.id ?? "";
    for (const [rank, record] of records.entries()) {
      await sql`
        insert into brew_source (
          user_id, brew_id, record_id, \`rank\`, selected_by,
          score, reason_text, is_selected
        ) values (
          ${userId}, ${brewId}, ${record.id}, ${rank}, 'auto',
          ${20 - rank}, 'fixture evidence', true
        )
      `;
    }
    await app.ready();
  });

  afterAll(async () => {
    if (userId && otherUserId) {
      await sql`delete from \`user\` where id in (${userId}, ${otherUserId})`;
    }
    if (postingId) await sql`delete from job_posting where id = ${postingId}`;
    if (companyId) await sql`delete from company where id = ${companyId}`;
    await app.close();
    await sql.end({ timeout: 5 });
  });

  const auth = (accessToken = token) => ({ authorization: `Bearer ${accessToken}` });

  it("preserves grounded question assignment, replacement, pause, and resume", async () => {
    const { response: startedResponse, sessionId } = await startSession("interview-session-start-0001");
    expect(startedResponse.statusCode).toBe(202);
    const started = (await app.inject({
      method: "GET", url: `/v1/interview-sessions/${sessionId}`, headers: auth(),
    })).json().data as {
      id: string;
      status: string;
      questionCount: number;
      questions: Array<{ id: string; order: number; text: string; basis: unknown; replacedFromId: string | null }>;
    };
    expect(started.questionCount).toBeGreaterThanOrEqual(3);
    expect(started.questionCount).toBeLessThanOrEqual(6);
    expect(started.questions.every(({ basis }) =>
      ["requirement", "record_gap"].includes((basis as { type: string }).type))).toBe(true);

    const original = started.questions[0]!;
    const replacedResponse = await app.inject({
      method: "POST",
      url: `/v1/interview-sessions/${started.id}/questions/${original.id}/replace`,
      headers: auth(),
    });
    expect(replacedResponse.statusCode).toBe(200);
    const replaced = replacedResponse.json().data as typeof started;
    const alternative = replaced.questions.find(({ order }) => order === original.order);
    expect(alternative).toMatchObject({ replacedFromId: original.id, basis: original.basis });
    expect(alternative?.text).not.toBe(original.text);

    expect((await app.inject({
      method: "POST", url: `/v1/interview-sessions/${started.id}/pause`, headers: auth(),
    })).json().data.status).toBe("paused");
    expect((await app.inject({
      method: "POST", url: `/v1/interview-sessions/${started.id}/resume`, headers: auth(),
    })).json().data.status).toBe("open");
    const reloaded = await app.inject({
      method: "GET", url: `/v1/interview-sessions/${started.id}`, headers: auth(),
    });
    expect(reloaded.json().data.questions).toEqual(replaced.questions);
    const crossUser = await app.inject({
      method: "GET", url: `/v1/interview-sessions/${started.id}`, headers: auth(otherToken),
    });
    expect(crossUser.statusCode).toBe(404);
  });

  it("autosaves an idempotent answer and promotes only its exact facts into one record", async () => {
    const session = (await sql<{ id: string }[]>`
      select id from interview_session where user_id = ${userId} and brew_id = ${brewId}
    `)[0];
    if (!session) throw new Error("interview session missing");
    const questions = await sql<{ id: string }[]>`
      select id from question
      where user_id = ${userId} and interview_session_id = ${session.id} and active
      order by order_no
    `;
    const questionId = questions[1]?.id;
    if (!questionId) throw new Error("answer question missing");
    const transcript = "장애 원인을 로그에서 찾아 배포 절차를 개선했습니다.";
    const request = {
      method: "PUT" as const,
      url: `/v1/interview-sessions/${session.id}/answers/${questionId}`,
      headers: { ...auth(), "idempotency-key": "interview-answer-save-0001" },
      payload: { inputType: "text", transcript },
    };
    const firstResponse = await app.inject(request);
    const replayResponse = await app.inject(request);
    expect(firstResponse.statusCode).toBe(200);
    expect(replayResponse.statusCode).toBe(200);
    const first = firstResponse.json().data as {
      answer: { id: string; createdRecordId: string; version: number };
      recordChange: { type: string; recordId: string; sourceQuote: string };
    };
    expect(replayResponse.json().data.answer.id).toBe(first.answer.id);
    expect(first.recordChange).toMatchObject({
      type: "created",
      recordId: first.answer.createdRecordId,
      sourceQuote: transcript,
    });
    expect((await sql<{ count: number }[]>`
      select count(*) as count from answer
      where user_id = ${userId} and question_id = ${questionId}
    `)[0]?.count).toBe(1);
    expect((await sql<{ body_md: string; origin: string }[]>`
      select body_md, origin from record where id = ${first.answer.createdRecordId}
    `)[0]).toEqual({ body_md: transcript, origin: "interview" });

    const strengthened = "장애 원인을 로그에서 찾아 배포 절차를 개선하고 재발을 막았습니다.";
    const changedResponse = await app.inject({
      ...request,
      headers: { ...auth(), "idempotency-key": "interview-answer-save-0002" },
      payload: { inputType: "text", transcript: strengthened },
    });
    expect(changedResponse.json().data).toMatchObject({
      answer: { id: first.answer.id, createdRecordId: first.answer.createdRecordId, version: 2 },
      recordChange: { type: "strengthened", sourceQuote: strengthened },
    });
    expect((await sql<{ body_md: string }[]>`
      select body_md from record where id = ${first.answer.createdRecordId}
    `)[0]?.body_md).toBe(strengthened);
    await expect(sql`
      update answer_record_change set source_quote = 'fabricated 99%'
      where user_id = ${userId} and answer_id = ${first.answer.id}
    `).rejects.toThrow(/exact answer transcript span/);
  });
});
