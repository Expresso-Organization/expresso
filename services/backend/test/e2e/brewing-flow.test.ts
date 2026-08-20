import { randomUUID } from "node:crypto";

import { migrate } from "@expresso/database";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/build-app.js";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";
import { CareerService } from "../../src/modules/career/service.js";
import { IdentityService } from "../../src/modules/identity/service.js";
import { InterviewService } from "../../src/modules/interview/service.js";
import { JobAnalysisService } from "../../src/modules/job-analysis/service.js";
import { StubRequirementExtractor } from "../support/stub-extractor.js";
import { JobMarketService } from "../../src/modules/jobs/service.js";
import { MaterialsService } from "../../src/modules/materials/service.js";
import { RecipeService } from "../../src/modules/recipe/service.js";
import { OutboxDispatcher } from "../../src/platform/outbox.js";
import { createReliableQueue } from "../../src/platform/queue.js";
import { createQueueWorker } from "../../src/worker/create-queue-worker.js";
import { createJobAnalysisProcessor } from "../../src/worker/processors/job-analysis.js";
import { BrewJobService } from "../../src/modules/brew-jobs/service.js";
import { createBrewJobProcessor } from "../../src/worker/processors/brew-jobs.js";
import { createRecordCleanupProcessor } from "../../src/worker/processors/record-cleanup.js";

const rootDatabaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const describeWithInfrastructure = rootDatabaseUrl && redisUrl ? describe : describe.skip;
interface IdRow { id: string }

async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for brewing flow");
}

describeWithInfrastructure("analysis to evidence recipe vertical slice", () => {
  const databaseName = `expresso_brew_e2e_${randomUUID().replaceAll("-", "")}`;
  const prefix = `expresso-${databaseName}`;
  const jobs = createReliableQueue<Record<string, unknown>>("domain-jobs", redisUrl!, prefix);
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  let app: ReturnType<typeof buildApi>;
  let worker: ReturnType<typeof createQueueWorker<Record<string, unknown>, Record<string, unknown>>>;
  let dispatcher: OutboxDispatcher;
  let brewJobProcessor: ReturnType<typeof createBrewJobProcessor>;
  let origin = "";
  let token = "";

  beforeAll(async () => {
    const rootUrl = new URL(rootDatabaseUrl!);
    const adminUrl = new URL(rootUrl); adminUrl.pathname = "/postgres";
    admin = postgres(adminUrl.toString(), { max: 1 });
    await admin.unsafe(`create database "${databaseName}"`);
    const isolatedUrl = new URL(rootUrl); isolatedUrl.pathname = `/${databaseName}`;
    await migrate({ databaseUrl: isolatedUrl.toString() });
    sql = postgres(isolatedUrl.toString(), { max: 6 });
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!planId) throw new Error("fresh plan missing");
    const userId = (await sql<IdRow[]>`
      insert into "user" (email, display_name, plan_id)
      values ('brewing-vertical@example.com', 'Brewing Vertical', ${planId}) returning id
    `)[0]?.id;
    if (!userId) throw new Error("fresh user missing");
    const identity = new IdentityService(sql);
    const career = new CareerService(sql);
    const jobsService = new JobMarketService(sql);
    const analysis = new JobAnalysisService(sql);
    const materials = new MaterialsService(sql);
    const interview = new InterviewService(sql);
    const recipe = new RecipeService(sql);
    const brewJobs = new BrewJobService(sql);
    token = (await identity.issueSession({ userId })).accessToken;
    const config: RuntimeConfig = {
      nodeEnv: "test", host: "127.0.0.1", port: 0, logLevel: "silent",
      databaseUrl: isolatedUrl.toString(), redisUrl: redisUrl!,
      outboxPollIntervalMs: 1_000, outboxBatchSize: 25, outboxMaxAttempts: 5,
      queuePrefix: prefix,
    };
    app = buildApi({
      config, identityService: identity, careerService: career,
      jobMarketService: jobsService, jobAnalysisService: analysis,
      materialsService: materials, interviewService: interview, recipeService: recipe,
      brewJobService: brewJobs,
    });
    origin = await app.listen({ host: "127.0.0.1", port: 0 });
    worker = createQueueWorker<Record<string, unknown>, Record<string, unknown>>({
      queueName: "domain-jobs", redisUrl: redisUrl!, prefix, concurrency: 1,
      deadLetterQueue: jobs.deadLetterQueue,
      processor: (job) => {
        // 질문 · 레시피도 이제 큐를 탄다. 공고 분석과 같은 워커가 받는다.
        if (job.name === "interview.draft" || job.name === "recipe.draft") {
          return brewJobProcessor(job);
        }
        // 기록 정리는 계약이 없으면 아무 일도 하지 않는다.
        if (job.name === "record.cleanup") return createRecordCleanupProcessor(interview)(job);
        return createJobAnalysisProcessor(analysis, new StubRequirementExtractor())(job);
      },
    });
    brewJobProcessor = createBrewJobProcessor(brewJobs, {
      interview: {
        async run({ userId, brewId, idempotencyKey }) {
          return (await interview.start(userId, brewId, idempotencyKey)).id;
        },
      },
      recipe: {
        async run({ userId, brewId, idempotencyKey }) {
          return (await recipe.generate(userId, brewId, idempotencyKey)).id;
        },
      },
    });
    dispatcher = new OutboxDispatcher({ sql, queue: jobs.queue });
  }, 30_000);

  afterAll(async () => {
    if (worker) await worker.close();
    await Promise.allSettled([jobs.queue.obliterate({ force: true }), jobs.deadLetterQueue.obliterate({ force: true })]);
    await jobs.close();
    if (app) await app.close();
    if (sql) await sql.end({ timeout: 5 });
    if (admin) {
      await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${databaseName} and pid <> pg_backend_pid()`;
      await admin.unsafe(`drop database if exists "${databaseName}"`);
      await admin.end({ timeout: 5 });
    }
  }, 30_000);

  async function api(path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
    return fetch(`${origin}${path}`, {
      method: options.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...options.headers },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  }

  /** 잡이 끝날 때까지 기다렸다가 결과 식별자를 준다. 01b · 02b가 하는 일이다. */
  async function awaitJob(jobId: string): Promise<string> {
    // 답변이 기록 정리를 함께 예약하므로 한 번에 여러 건이 나갈 수 있다.
    expect((await dispatcher.pollOnce()).published).toBeGreaterThanOrEqual(1);
    let resultId: string | null = null;
    await waitUntil(async () => {
      const state = (await (await api(`/v1/brew-jobs/${jobId}`)).json()) as {
        data: { status: string; resultId: string | null; failure: { code: string } | null };
      };
      if (state.data.status === "failed") throw new Error(`brew job failed: ${state.data.failure?.code}`);
      resultId = state.data.resultId;
      return state.data.status === "succeeded";
    });
    if (!resultId) throw new Error("brew job finished without a result");
    return resultId;
  }

  it("selects materials, resumes an interview, creates a record, and locks an evidence recipe", async () => {
    const categories = await (await api("/v1/career/categories")).json() as { data: Array<{ id: string; key: string }> };
    const categoryId = categories.data.find(({ key }) => key === "experience")?.id;
    if (!categoryId) throw new Error("experience category missing");
    const recordIds: string[] = [];
    for (const [index, bodyMd] of [
      "TypeScript와 PostgreSQL로 고가용성 backend API를 설계했습니다.",
      "AWS 장애 대응과 운영 자동화 경험",
      "제품 팀과 협업한 사용자 연구",
    ].entries()) {
      const response = await api("/v1/career/records", {
        method: "POST", headers: { "idempotency-key": `brew-e2e-record-${index}-001` },
        body: { categoryId, title: `Evidence ${index}`, properties: {}, bodyMd },
      });
      const recordId = ((await response.json()) as { data: { id: string } }).data.id;
      recordIds.push(recordId);
      await sql`update record set status = 'organized' where id = ${recordId}`;
    }
    const descriptionRaw = [
      "TypeScript와 PostgreSQL로 고가용성 backend API를 설계하고 운영합니다.",
      "AWS 환경의 장애를 분석하고 reliability를 개선한 경험이 필요합니다.",
      "제품 팀과 협업하여 고객 impact를 측정하고 공유해야 합니다.",
      "remote 환경에서 명확한 문서와 코드 리뷰로 품질을 높입니다.",
      "지원자는 실제 성과와 본인의 역할을 구체적인 근거로 설명해야 합니다.",
    ].join(" ");
    const submitted = await api("/v1/jobs/submissions", {
      method: "POST", headers: { "idempotency-key": "brew-e2e-job-submit-001" },
      body: { companyName: "Brewing E2E", title: "Backend Engineer", descriptionRaw },
    });
    const job = (await submitted.json()) as { data: { jobAnalysisId: string } };
    expect((await dispatcher.pollOnce()).published).toBe(1);
    await waitUntil(async () => {
      const state = await api(`/v1/job-analyses/${job.data.jobAnalysisId}`);
      return ((await state.json()) as { data: { analysis: { status: string } } }).data.analysis.status === "done";
    });
    const brewResponse = await api("/v1/brews", {
      method: "POST", body: { jobAnalysisId: job.data.jobAnalysisId, lengthPreset: "single" },
    });
    expect(brewResponse.status).toBe(201);
    const brew = (await brewResponse.json()) as { data: { brewId: string; materials: Array<{ selected: boolean }> } };
    expect(brew.data.materials.filter(({ selected }) => selected)).toHaveLength(3);

    // 질문 생성은 이제 잡이다. 202를 받고 결과가 생길 때까지 폴링한다.
    const sessionResponse = await api(`/v1/brews/${brew.data.brewId}/interview-sessions`, {
      method: "POST", headers: { "idempotency-key": "brew-e2e-session-001" },
    });
    expect(sessionResponse.status).toBe(202);
    const sessionJob = (await sessionResponse.json()) as { data: { jobId: string; status: string } };
    expect(sessionJob.data.status).toBe("queued");
    const sessionId = await awaitJob(sessionJob.data.jobId);
    const session = (await (await api(`/v1/interview-sessions/${sessionId}`)).json()) as {
      data: { id: string; questions: Array<{ id: string }> };
    };
    expect((await api(`/v1/interview-sessions/${session.data.id}/pause`, { method: "POST" })).status).toBe(200);
    expect((await api(`/v1/interview-sessions/${session.data.id}/resume`, { method: "POST" })).status).toBe(200);
    const questionId = session.data.questions[0]?.id;
    if (!questionId) throw new Error("interview question missing");
    const answerResponse = await api(`/v1/interview-sessions/${session.data.id}/answers/${questionId}`, {
      method: "PUT", headers: { "idempotency-key": "brew-e2e-answer-001" },
      body: { inputType: "text", transcript: "장애 로그를 분석해 재발 방지 절차를 만들었습니다." },
    });
    const answer = (await answerResponse.json()) as { data: { answer: { createdRecordId: string } } };
    expect(answer.data.answer.createdRecordId).toBeTruthy();

    const recipeResponse = await api(`/v1/brews/${brew.data.brewId}/recipes`, {
      method: "POST", headers: { "idempotency-key": "brew-e2e-recipe-001" },
    });
    expect(recipeResponse.status).toBe(202);
    const recipeJob = (await recipeResponse.json()) as { data: { jobId: string } };
    const recipeId = await awaitJob(recipeJob.data.jobId);
    const recipe = (await (await api(`/v1/recipes/${recipeId}`)).json()) as {
      data: { id: string; sections: Array<{ items: Array<{ id: string }> }>; evidencePaths: unknown[] };
    };
    expect(recipe.data.evidencePaths.length).toBeGreaterThanOrEqual(3);
    const itemId = recipe.data.sections[0]?.items[0]?.id;
    if (!itemId) throw new Error("recipe item missing");
    const edited = await api(`/v1/recipes/${recipe.data.id}`, {
      method: "PATCH", body: { operation: "update_item", itemId, pointText: "사용자가 확정한 근거 요점" },
    });
    const editedBody = (await edited.json()) as {
      data: { recipe: { sections: Array<{ items: Array<{ id: string; locked: boolean; editedBy: string }> }> } };
    };
    expect(editedBody.data.recipe.sections.flatMap(({ items }) => items)
      .find(({ id }) => id === itemId)).toMatchObject({
        id: itemId,
        locked: true,
        editedBy: "user",
      });
    expect((await sql<{ count: number }[]>`
      select count(*)::integer as count from recipe_evidence_path where user_id = (select user_id from brew where id = ${brew.data.brewId}) and recipe_id = ${recipe.data.id}
    `)[0]?.count).toBeGreaterThanOrEqual(3);
  }, 30_000);
});
