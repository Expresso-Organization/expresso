import { randomUUID } from "node:crypto";
import type { SqlTag } from "../../src/platform/mysql.js";
import { createMysqlResource } from "../../src/platform/mysql.js";

import { migrate } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/build-app.js";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";
import { CareerService } from "../../src/modules/career/service.js";
import { IdentityService } from "../../src/modules/identity/service.js";
import { JobAnalysisService } from "../../src/modules/job-analysis/service.js";
import { StubRequirementExtractor } from "../support/stub-extractor.js";
import { JobMarketService } from "../../src/modules/jobs/service.js";
import { OutboxDispatcher } from "../../src/platform/outbox.js";
import { createReliableQueue } from "../../src/platform/queue.js";
import { createQueueWorker } from "../../src/worker/create-queue-worker.js";
import { createJobAnalysisProcessor } from "../../src/worker/processors/job-analysis.js";
import { ISOLATED_DATABASE_TIMEOUT_MS } from "../support/timeouts.js";

const rootDatabaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const describeWithInfrastructure = rootDatabaseUrl && redisUrl ? describe : describe.skip;

interface IdRow {
  id: string;
}

async function waitUntil(
  condition: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for E2E state");
}

describeWithInfrastructure("job submission and analysis vertical slice", () => {
  const databaseName = `expresso_jobs_e2e_${randomUUID().replaceAll("-", "")}`;
  const queuePrefix = `expresso-${databaseName}`;
  const jobs = createReliableQueue<Record<string, unknown>>(
    "domain-jobs",
    redisUrl ?? "redis://127.0.0.1:1",
    queuePrefix,
  );
  let admin: SqlTag;
  let sql: SqlTag;
  let app: ReturnType<typeof buildApi>;
  let worker: ReturnType<typeof createQueueWorker<Record<string, unknown>, Record<string, unknown>>>;
  let dispatcher: OutboxDispatcher;
  let origin = "";
  let accessToken = "";
  let userId = "";
  let signalExtractionStarted: () => void = () => undefined;
  let releaseExtraction: () => void = () => undefined;
  const extractionStarted = new Promise<void>((resolve) => {
    signalExtractionStarted = resolve;
  });
  const extractionReleased = new Promise<void>((resolve) => {
    releaseExtraction = resolve;
  });

  beforeAll(async () => {
    const rootUrl = new URL(rootDatabaseUrl ?? "mysql://127.0.0.1:1/unused");
    const adminUrl = new URL(rootUrl);
    adminUrl.pathname = "/mysql";
    admin = createMysqlResource(adminUrl.toString()).sql;
    await admin.unsafe(`create database \`${databaseName}\``);

    const isolatedUrl = new URL(rootUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    await migrate({ databaseUrl: isolatedUrl.toString() });
    sql = createMysqlResource(isolatedUrl.toString()).sql;

    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!planId) throw new Error("fresh database did not seed the free plan");
    const users: IdRow[] = [{ id: randomUUID() }];
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values
        (${users[0]!.id}, 'jobs-vertical@example.com', 'Jobs Vertical', ${planId})
    `;
    userId = users[0]?.id ?? "";
    if (!userId) throw new Error("vertical slice user was not created");

    const identityService = new IdentityService(sql);
    const careerService = new CareerService(sql);
    const jobMarketService = new JobMarketService(sql);
    const jobAnalysisService = new JobAnalysisService(sql);
    accessToken = (await identityService.issueSession({ userId })).accessToken;
    const config: RuntimeConfig = {
      nodeEnv: "test",
      host: "127.0.0.1",
      port: 0,
      logLevel: "silent",
      databaseUrl: isolatedUrl.toString(),
      redisUrl: redisUrl!,
      outboxPollIntervalMs: 1_000,
      outboxBatchSize: 25,
      outboxMaxAttempts: 5,
      queuePrefix,
    };
    app = buildApi({
      config,
      identityService,
      careerService,
      jobMarketService,
      jobAnalysisService,
    });
    origin = await app.listen({ host: "127.0.0.1", port: 0 });

    const stubExtractor = new StubRequirementExtractor();
    worker = createQueueWorker<Record<string, unknown>, Record<string, unknown>>({
      queueName: "domain-jobs",
      redisUrl: redisUrl!,
      prefix: queuePrefix,
      concurrency: 1,
      deadLetterQueue: jobs.deadLetterQueue,
      processor: createJobAnalysisProcessor(jobAnalysisService, {
        async extract(source) {
          signalExtractionStarted();
          await extractionReleased;
          return stubExtractor.extract(source);
        },
      }),
    });
    dispatcher = new OutboxDispatcher({
      sql,
      queue: jobs.queue,
      batchSize: 25,
      maxAttempts: 5,
    });
  }, ISOLATED_DATABASE_TIMEOUT_MS);

  afterAll(async () => {
    releaseExtraction();
    if (worker) await worker.close();
    await Promise.allSettled([
      jobs.queue.obliterate({ force: true }),
      jobs.deadLetterQueue.obliterate({ force: true }),
    ]);
    await jobs.close();
    if (app) await app.close();
    if (sql) await sql.end({ timeout: 5 });
    if (admin) {
      await admin.unsafe(`drop database if exists \`${databaseName}\``);
      await admin.end({ timeout: 5 });
    }
  }, ISOLATED_DATABASE_TIMEOUT_MS);

  async function api(
    path: string,
    options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
  ): Promise<Response> {
    return fetch(`${origin}${path}`, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  }

  it("runs HTTP submission through outbox, Redis worker, evidence, coverage, and match", async () => {
    const categoriesResponse = await api("/v1/career/categories");
    const categories = (await categoriesResponse.json()) as {
      data: Array<{ id: string; key: string }>;
    };
    const experienceId = categories.data.find(({ key }) => key === "experience")?.id;
    if (!experienceId) throw new Error("experience category missing");

    const sourceSentences = [
      "TypeScript와 PostgreSQL을 사용하여 고가용성 backend API를 설계하고 운영합니다.",
      "AWS 환경에서 대규모 트래픽 장애를 분석하고 reliability를 지속적으로 개선합니다.",
      "제품 및 데이터 팀과 협업하여 고객 impact를 정량적으로 측정하고 공유합니다.",
      "remote 협업 환경에서 명확한 기술 문서와 코드 리뷰로 품질을 높입니다.",
    ];
    const descriptionRaw = `${sourceSentences.join(" ")} ${"원본 공고의 상세 업무와 자격 요건을 보존합니다. ".repeat(4)}`;
    for (const [index, bodyMd] of [
      sourceSentences[0]!,
      "AWS 장애 대응 경험과 운영 자동화",
      "고객 인터뷰를 바탕으로 제품 지표를 개선했습니다.",
    ].entries()) {
      const response = await api("/v1/career/records", {
        method: "POST",
        headers: { "idempotency-key": `jobs-e2e-record-${index}-0001` },
        body: {
          categoryId: experienceId,
          title: `Evidence ${index}`,
          properties: {},
          bodyMd,
        },
      });
      expect(response.status).toBe(201);
    }

    const submittedResponse = await api("/v1/jobs/submissions", {
      method: "POST",
      headers: { "idempotency-key": "jobs-e2e-submission-0001" },
      body: {
        companyName: "Expresso E2E Company",
        companyDomain: "jobs-e2e.example.com",
        title: "Backend Engineer",
        sourceUrl: "https://jobs-e2e.example.com/backend",
        descriptionRaw,
      },
    });
    expect(submittedResponse.status).toBe(202);
    const submitted = (await submittedResponse.json()) as {
      data: { jobPostingId: string; jobAnalysisId: string; status: string };
    };

    const queuedResponse = await api(`/v1/job-analyses/${submitted.data.jobAnalysisId}`);
    expect(queuedResponse.status).toBe(200);
    expect((await queuedResponse.json()) as unknown).toMatchObject({
      data: { analysis: { status: "queued", stage: "queued", resultVersion: 0 } },
    });

    expect(await dispatcher.pollOnce()).toEqual({
      published: 1,
      retried: 0,
      deadLettered: 0,
    });
    await Promise.race([
      extractionStarted,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("worker did not start extraction")),
        10_000,
      )),
    ]);
    const runningResponse = await api(`/v1/job-analyses/${submitted.data.jobAnalysisId}`);
    expect((await runningResponse.json()) as unknown).toMatchObject({
      data: { analysis: { status: "running", stage: "extracting", attempts: 1 } },
    });

    releaseExtraction();
    await waitUntil(async () => {
      const response = await api(`/v1/job-analyses/${submitted.data.jobAnalysisId}`);
      const result = (await response.json()) as { data: { analysis: { status: string } } };
      return result.data.analysis.status === "done";
    });
    const completedResponse = await api(`/v1/job-analyses/${submitted.data.jobAnalysisId}`);
    const completed = (await completedResponse.json()) as {
      data: {
        analysis: { status: string; stage: string; attempts: number; resultVersion: number };
        requirements: Array<{
          sourceSpan: { start: number; end: number; quote: string };
          coverage: "covered" | "partial" | "missing";
          coveredBy: string[];
        }>;
      };
    };
    expect(completed.data.analysis).toMatchObject({
      status: "done",
      stage: "done",
      attempts: 1,
      resultVersion: 1,
    });
    expect(completed.data.requirements.length).toBeGreaterThanOrEqual(3);
    expect(completed.data.requirements.length).toBeLessThanOrEqual(6);
    for (const requirement of completed.data.requirements) {
      expect(Array.from(descriptionRaw)
        .slice(requirement.sourceSpan.start, requirement.sourceSpan.end)
        .join(""))
        .toBe(requirement.sourceSpan.quote);
    }
    expect(completed.data.requirements.some(({ coveredBy }) => coveredBy.length > 0)).toBe(true);

    const matchResponse = await api(`/v1/jobs/postings/${submitted.data.jobPostingId}/match`, {
      method: "POST",
    });
    expect(matchResponse.status).toBe(200);
    const match = (await matchResponse.json()) as {
      data: {
        total: number;
        covered: number;
        required: number;
        axes: Record<string, { required: number; covered: number }>;
        reason: string;
      };
    };
    expect(Number.isInteger(match.data.total)).toBe(true);
    // 총점은 축의 합에서만 나온다. 축마다 배점을 주지 않는다 (§8.1).
    const axes = Object.values(match.data.axes);
    expect(axes.reduce((sum, axis) => sum + axis.required, 0)).toBe(match.data.required);
    expect(axes.reduce((sum, axis) => sum + axis.covered, 0)).toBe(match.data.covered);
    expect(match.data.total)
      .toBe(Math.round((100 * match.data.covered) / match.data.required));
    expect(match.data.reason.length).toBeGreaterThan(0);

    expect((await sql<{ state: string }[]>`
      select state from platform_outbox
      where payload ->> '$.jobAnalysisId' = ${submitted.data.jobAnalysisId}
    `)[0]?.state).toBe("published");
    // 요건은 공고에 붙고, 커버리지만 사용자별로 붙는다.
    expect((await sql<{ count: number }[]>`
      select count(*) as count from job_posting_requirement
      where job_posting_id = ${submitted.data.jobPostingId}
    `)[0]?.count).toBe(completed.data.requirements.length);
    expect((await sql<{ count: number }[]>`
      select count(*) as count
      from requirement_coverage
      join job_posting_requirement
        on job_posting_requirement.id = requirement_coverage.requirement_id
      where requirement_coverage.user_id = ${userId}
        and job_posting_requirement.job_posting_id = ${submitted.data.jobPostingId}
    `)[0]?.count).toBe(completed.data.requirements.length);
  }, 30_000);
});
