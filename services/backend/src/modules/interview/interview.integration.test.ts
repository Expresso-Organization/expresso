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
      select id from category where key = 'experience' and is_system
    `)[0]?.id;
    if (!planId || !categoryId) throw new Error("interview seed missing");
    const users = await sql<IdRow[]>`
      insert into \`user\` (email, display_name, plan_id)
      values
        (${`interview-a-${marker}@example.com`}, 'Interview A', ${planId}),
        (${`interview-b-${marker}@example.com`}, 'Interview B', ${planId})
      returning id
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
      ) values (${userId}, ${postingId}, 'paste', 'done', 'done', 1, 1, now())
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
    const records = await sql<IdRow[]>`
      insert into record (
        user_id, category_id, title, status, origin, properties, body_md
      ) values
        (${userId}, ${categoryId}, 'Migration project', 'organized', 'manual', '{}', 'Led a database migration'),
        (${userId}, ${categoryId}, 'Incident response', 'verified', 'manual', '{}', 'Resolved a production incident')
      returning id
    `;
    brewId = (await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, length_preset)
      values (${userId}, ${analysisId}, 'single') returning id
    `)[0]?.id ?? "";
    for (const [rank, record] of records.entries()) {
      await sql`
        insert into brew_source (
          user_id, brew_id, record_id, rank, selected_by,
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
