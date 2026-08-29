import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/mysql.js";

import type { JobAnalysisExtraction } from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { createReliableQueue } from "../../platform/queue.js";
import { createQueueWorker } from "../../worker/create-queue-worker.js";
import { createJobAnalysisProcessor } from "../../worker/processors/job-analysis.js";
import { IdentityService } from "../identity/service.js";
import type { RequirementExtractor } from "./extractor.js";
import { JobAnalysisService } from "./service.js";
import { MongoJobAnalysisService } from "./mongo-service.js";
import { MongoJobMarketService } from "../jobs/index.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoCareerService } from "../career/index.js";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB versioned job analysis", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: MongoJobAnalysisService;
  let market: MongoJobMarketService;
  let owner: string;
  let other: string;
  let analysisId: string;
  let postingId: string;
  const quotes = ["MongoDB 데이터베이스를 운영합니다.", "TypeScript API를 개발합니다.", "AWS 장애 대응을 합니다."];
  const source = "😀 채용 공고\n" + quotes.join("\n") + " 상세한 직무 설명입니다.".repeat(20);
  let calls = 0;
  const extractor: RequirementExtractor = { async extract(input) { calls++; return extractionFor(input, quotes); } };
  beforeAll(async () => {
    fixture = await createMongoFixture("analysis-version");
    service = new MongoJobAnalysisService(fixture.resource);
    market = new MongoJobMarketService(fixture.resource);
    const identity = new MongoIdentityService(fixture.resource);
    owner = (await identity.signup({ email: `analysis-${randomUUID()}@example.com`, displayName: "분석", password: "correct-horse-battery" })).user.id;
    other = (await identity.signup({ email: `analysis-${randomUUID()}@example.com`, displayName: "다른 사용자", password: "correct-horse-battery" })).user.id;
    const submission = await market.submitPosting(owner, randomUUID(), { companyName: "분석 회사", title: "Backend", descriptionRaw: source });
    analysisId = submission.jobAnalysisId; postingId = submission.jobPostingId;
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("stores validated code-point spans and reuses completed delivery", async () => {
    const first = await service.process(analysisId, extractor);
    expect(first.analysis).toMatchObject({ status: "done", resultVersion: 1 });
    expect(first.requirements).toHaveLength(3);
    expect((await service.process(analysisId, extractor)).analysis.resultVersion).toBe(1);
    expect(calls).toBe(1);
    await expect(service.getResult(other, analysisId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("retains only the immediately previous result and does not extract immutable requirements again", async () => {
    const career = new MongoCareerService(fixture.resource);
    const categoryId = (await career.listCategories(owner))[0]!.id;
    for (let index = 0; index < 3; index++) await career.createRecord(owner, randomUUID(), { categoryId, title: quotes[index]!, properties: {}, bodyMd: "typescript postgresql aws reliability backend remote" });
    expect((await service.requestReanalysis(owner, analysisId)).targetVersion).toBe(2);
    const second = await service.process(analysisId, extractor);
    expect(second.previous?.version).toBe(1);
    expect(second.requirements.some((row) => row.coverage === "covered")).toBe(true);
    await service.requestReanalysis(owner, analysisId);
    expect((await service.process(analysisId, extractor)).previous?.version).toBe(2);
    expect(calls).toBe(1);
    expect(await mongoCollections(fixture.resource.db).matchScores.countDocuments({ userId: owner, jobPostingId: postingId })).toBe(1);
  });

  it("rejects invalid evidence without storing a partial result", async () => {
    const submission = await market.submitPosting(owner, randomUUID(), { companyName: "분석 회사", title: "다른 공고", descriptionRaw: source + "다름" });
    const invalid: RequirementExtractor = { async extract(input) { const value = extractionFor(input, quotes); value.requirements[0]!.sourceSpan.quote = "없는 문장"; return value; } };
    await expect(service.process(submission.jobAnalysisId, invalid)).rejects.toThrow();
    const result = await service.getResult(owner, submission.jobAnalysisId);
    expect(result.analysis).toMatchObject({ status: "failed", resultVersion: 0, failure: { code: "INVALID_SOURCE_SPAN", retryable: false } });
    expect(result.requirements).toHaveLength(0);
  });

  it("does not let an old extraction overwrite a newer completed target", async () => {
    const submission = await market.submitPosting(owner, randomUUID(), { companyName: "분석 회사", title: "경합 공고", descriptionRaw: source + "경합" });
    let release!: () => void;
    let started!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const delayed: RequirementExtractor = { async extract(input) { started(); await wait; return extractionFor(input, quotes); } };
    const first = service.process(submission.jobAnalysisId, delayed);
    await ready;
    try {
      await service.process(submission.jobAnalysisId, extractor);
      await service.requestReanalysis(owner, submission.jobAnalysisId);
      await service.process(submission.jobAnalysisId, extractor);
    } finally { release(); }
    await first;
    expect((await service.getResult(owner, submission.jobAnalysisId)).analysis.resultVersion).toBe(2);
  });

  it("scores a concurrent reader against the common extraction that actually won", async () => {
    const career = new MongoCareerService(fixture.resource);
    const categoryId = (await career.listCategories(other))[0]!.id;
    for (let i = 0; i < 3; i++) await career.createRecord(other, randomUUID(), { categoryId, title: "TypeScript", properties: {}, bodyMd: "" });
    const submission = await market.submitPosting(owner, randomUUID(), { companyName: "분석 회사", title: "공통 경쟁", descriptionRaw: source + "공통 경쟁" });
    const second = await market.analyzePosting(other, submission.jobPostingId);
    let release!: () => void; let started!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const losing = service.process(second.jobAnalysisId, { async extract(input) { started(); await wait; return { ...extractionFor(input, quotes), normalized: { technologies: ["MongoDB"], impacts: [], roles: [], conditions: [] } }; } });
    await ready;
    try { await service.process(submission.jobAnalysisId, { async extract(input) { return { ...extractionFor(input, quotes), normalized: { technologies: ["typescript"], impacts: [], roles: [], conditions: [] } }; } }); }
    finally { release(); }
    await losing;
    const score = await mongoCollections(fixture.resource.db).matchScores.findOne({ userId: other, jobPostingId: submission.jobPostingId });
    expect(score?.total.toString()).toBe("100");
    expect(await mongoCollections(fixture.resource.db).jobPostingRequirements.countDocuments({ jobPostingId: submission.jobPostingId })).toBe(3);
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const describeWithInfrastructure = databaseUrl && redisUrl ? describe : describe.skip;

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  databaseUrl: databaseUrl ?? "mysql://127.0.0.1:1/unused",
  redisUrl: redisUrl ?? "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-job-analysis-test",
};

interface IdRow {
  id: string;
}

interface StateRow {
  status: string;
  progress_stage: string;
  attempts: number;
  result_version: number;
  failure_code: string | null;
  failure_retryable: boolean | null;
}

function extractionFor(source: string, quotes: string[]): JobAnalysisExtraction {
  let cursor = 0;
  return {
    requirements: quotes.map((quote, index) => {
      const utf16Start = source.indexOf(quote, cursor);
      if (utf16Start < 0) throw new Error("fixture quote missing");
      cursor = utf16Start + quote.length;
      const start = Array.from(source.slice(0, utf16Start)).length;
      return {
        label: quote,
        kind: index < 2 ? "must" as const : "nice" as const,
        axis: "other" as const,
        sourceSpan: { start, end: start + Array.from(quote).length, quote },
      };
    }),
    normalized: {
      technologies: ["typescript", "postgresql", "aws"],
      impacts: ["reliability"],
      roles: ["backend"],
      conditions: ["remote"],
    },
  };
}

async function waitUntil(
  condition: () => Promise<boolean>,
  timeoutMs = 8_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for job analysis");
}

describeWithInfrastructure("job analysis integration", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const identityService = new IdentityService(sql);
  const service = new JobAnalysisService(sql);
  const app = buildApi({ config, identityService, jobAnalysisService: service });
  const marker = randomUUID();
  const sourceQuotes = [
    "TypeScript와 PostgreSQL로 고가용성 백엔드 API를 개발합니다.",
    "AWS 환경의 장애를 분석하고 서비스 reliability를 높입니다.",
    "제품 팀과 협업하여 사용자 impact를 측정합니다.",
    "대규모 트래픽에 맞춰 데이터 계층을 최적화합니다.",
    "remote 환경에서 기술 리더십을 발휘합니다.",
  ];
  const source = sourceQuotes.join(" ");
  const prefix = `expresso-analysis-${marker}`;
  const queue = createReliableQueue<Record<string, unknown>>(
    "domain-jobs",
    redisUrl ?? "redis://127.0.0.1:1",
    prefix,
  );
  let worker: ReturnType<typeof createQueueWorker<Record<string, unknown>, Record<string, unknown>>>;
  let userId = "";
  let otherUserId = "";
  let token = "";
  let otherToken = "";
  let companyId = "";
  let postingId = "";
  let tamperPostingId = "";
  let analysisId = "";
  let experienceCategoryId = "";
  let extractorVersion = 1;

  const extractor: RequirementExtractor = {
    async extract(input) {
      expect(input).toBe(source);
      const offset = Math.min(extractorVersion - 1, 2);
      return extractionFor(source, sourceQuotes.slice(offset, offset + 3));
    },
  };

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!planId) throw new Error("free plan missing");
    const users: IdRow[] = [{ id: randomUUID() }, { id: randomUUID() }];
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values
        (${users[0]!.id}, ${`analysis-a-${marker}@example.com`}, 'Analysis A', ${planId}),
        (${users[1]!.id}, ${`analysis-b-${marker}@example.com`}, 'Analysis B', ${planId})
    `;
    userId = users[0]?.id ?? "";
    otherUserId = users[1]?.id ?? "";
    if (!userId || !otherUserId) throw new Error("analysis users missing");
    token = (await identityService.issueSession({ userId })).accessToken;
    otherToken = (await identityService.issueSession({ userId: otherUserId })).accessToken;
    experienceCategoryId = (await sql<IdRow[]>`
      select id from category where \`key\` = 'experience' and is_system
    `)[0]?.id ?? "";
    const companies = await sql<IdRow[]>`
      insert into company (name, dedupe_key)
      values (${`Analysis ${marker}`}, ${`analysis-company-${marker}`}) returning id
    `;
    companyId = companies[0]?.id ?? "";
    const postings = await sql<IdRow[]>`
      insert into job_posting (
        company_id, source, title, description_raw, requirements, dedupe_hash
      ) values (
        ${companyId}, 'user_input', 'Backend Engineer', ${source}, '{}',
        ${`analysis-posting-${marker}`}
      ) returning id
    `;
    postingId = postings[0]?.id ?? "";
    const analyses = await sql<IdRow[]>`
      insert into job_analysis (
        user_id, job_posting_id, input_type, status, progress_stage
      ) values (${userId}, ${postingId}, 'paste', 'running', 'extracting')
      returning id
    `;
    analysisId = analyses[0]?.id ?? "";
    if (!experienceCategoryId || !companyId || !postingId || !analysisId) {
      throw new Error("analysis fixture missing");
    }
    await sql`
      insert into record (user_id, category_id, title, origin, properties, body_md)
      values
        (${userId}, ${experienceCategoryId}, 'Covered evidence', 'manual', '{}', ${sourceQuotes[0]!}),
        (${userId}, ${experienceCategoryId}, 'Partial evidence', 'manual', '{}', 'AWS 장애 대응 경험'),
        (${userId}, ${experienceCategoryId}, 'Unrelated evidence', 'manual', '{}', '브랜드 디자인 시스템 구축')
    `;
    worker = createQueueWorker<Record<string, unknown>, Record<string, unknown>>({
      queueName: "domain-jobs",
      redisUrl: redisUrl!,
      prefix,
      concurrency: 1,
      deadLetterQueue: queue.deadLetterQueue,
      processor: createJobAnalysisProcessor(service, extractor),
    });
    await app.ready();
  });

  afterAll(async () => {
    await worker?.close();
    await Promise.allSettled([
      queue.queue.obliterate({ force: true }),
      queue.deadLetterQueue.obliterate({ force: true }),
    ]);
    await queue.close();
    if (userId) {
      await sql`delete from platform_outbox where payload ->> '$.userId' = ${userId}`;
    }
    if (userId && otherUserId) {
      await sql`delete from \`user\` where id in (${userId}, ${otherUserId})`;
    }
    if (postingId) await sql`delete from job_posting where id = ${postingId}`;
    if (tamperPostingId) await sql`delete from job_posting where id = ${tamperPostingId}`;
    if (companyId) await sql`delete from company where id = ${companyId}`;
    await app.close();
    await sql.end({ timeout: 5 });
  });

  it("resumes a running job and completes duplicate deliveries exactly once", async () => {
    await queue.queue.add("job.normalize", { jobAnalysisId: analysisId }, {
      jobId: `first-${marker}`,
    });
    await waitUntil(async () => (
      await service.getResult(userId, analysisId)
    ).analysis.status === "done");

    const first = await service.getResult(userId, analysisId);
    expect(first.analysis).toMatchObject({
      status: "done",
      stage: "done",
      attempts: 1,
      resultVersion: 1,
      failure: null,
    });
    expect(first.requirements).toHaveLength(3);
    expect(first.requirements.map((item) => item.coverage).sort()).toEqual([
      "covered",
      "missing",
      "partial",
    ]);
    expect(first.requirements.find((item) => item.coverage === "covered")?.coveredBy)
      .toHaveLength(1);
    for (const requirement of first.requirements) {
      const { start, end, quote } = requirement.sourceSpan;
      expect(Array.from(source).slice(start, end).join("")).toBe(quote);
    }

    await queue.queue.add("job.normalize", { jobAnalysisId: analysisId }, {
      jobId: `duplicate-${marker}`,
    });
    await waitUntil(async () => {
      const job = await queue.queue.getJob(`duplicate-${marker}`);
      return (await job?.getState()) === "completed";
    });
    const rows = await sql<StateRow[]>`
      select status, progress_stage, attempts, result_version,
             failure_code, failure_retryable
      from job_analysis where id = ${analysisId}
    `;
    expect(rows[0]).toMatchObject({ attempts: 1, result_version: 1 });
    // 요건은 공고에 붙고, 커버리지만 사용자별로 붙는다.
    expect((await sql<{ count: number }[]>`
      select count(*) as count from job_posting_requirement
      where job_posting_id = ${postingId}
    `)[0]?.count).toBe(3);
    expect((await sql<{ count: number }[]>`
      select count(*) as count
      from requirement_coverage
      join job_posting_requirement on job_posting_requirement.id = requirement_coverage.requirement_id
      where requirement_coverage.user_id = ${userId}
        and job_posting_requirement.job_posting_id = ${postingId}
    `)[0]?.count).toBe(3);

    const ownerResponse = await app.inject({
      method: "GET",
      url: `/v1/job-analyses/${analysisId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const crossUserResponse = await app.inject({
      method: "GET",
      url: `/v1/job-analyses/${analysisId}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(ownerResponse.statusCode).toBe(200);
    expect(ownerResponse.json().data.analysis.stage).toBe("done");
    expect(crossUserResponse.statusCode).toBe(404);
  });

  it("preserves failure retryability and blocks tampered source spans in the service and database", async () => {
    // 요건이 이미 뽑힌 공고는 추출기를 다시 부르지 않는다. 변조 시도를 보려면
    // 아직 아무도 읽지 않은 공고가 있어야 한다.
    const freshPostings = await sql<IdRow[]>`
      insert into job_posting (
        company_id, source, title, description_raw, requirements, dedupe_hash
      ) values (
        ${companyId}, 'user_input', 'Backend Engineer', ${source}, '{}',
        ${`analysis-tamper-${marker}`}
      ) returning id
    `;
    const freshPostingId = freshPostings[0]?.id ?? "";
    tamperPostingId = freshPostingId;
    const evidenceFailureId = randomUUID();
    const providerFailureId = randomUUID();
    await sql`
      insert into job_analysis (id, user_id, job_posting_id, input_type)
      values (${evidenceFailureId}, ${userId}, ${freshPostingId}, 'paste'),
             (${providerFailureId}, ${userId}, ${freshPostingId}, 'paste')
    `;
    const tampered = extractionFor(source, sourceQuotes.slice(0, 3));
    tampered.requirements[0]!.sourceSpan.quote += " 변조";

    await expect(service.process(evidenceFailureId, {
      async extract() { return tampered; },
    })).rejects.toThrow(/source span/);
    await expect(service.process(providerFailureId, {
      async extract() { throw new Error("temporary provider failure"); },
    })).rejects.toThrow(/temporary provider failure/);

    const states = await sql<StateRow[]>`
      select status, progress_stage, attempts, result_version,
             failure_code, failure_retryable
      from job_analysis where id in (${evidenceFailureId}, ${providerFailureId})
      order by failure_retryable
    `;
    expect(states).toEqual([
      expect.objectContaining({
        status: "failed", progress_stage: "failed",
        failure_code: "INVALID_SOURCE_SPAN", failure_retryable: false,
      }),
      expect.objectContaining({
        status: "failed", progress_stage: "failed",
        failure_code: "EXTRACTION_FAILED", failure_retryable: true,
      }),
    ]);
    // 실패한 분석은 요건을 하나도 남기지 않는다.
    expect((await sql<{ count: number }[]>`
      select count(*) as count from job_posting_requirement
      where job_posting_id = ${freshPostingId}
    `)[0]?.count).toBe(0);

    await expect(sql`
      insert into job_posting_requirement (
        job_posting_id, order_no, label, kind, source_span
      ) values (
        ${freshPostingId}, 0, 'tampered', 'must',
        ${sql.json({ start: 0, end: 9, quote: "not-source" })}
      )
    `).rejects.toThrow(/does not match immutable posting source/);
  });

  it("reports brew and recipe impact and retains only the immediately previous generation", async () => {
    const brews = await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, length_preset)
      values (${userId}, ${analysisId}, 'single') returning id
    `;
    const brewId = brews[0]?.id;
    if (!brewId) throw new Error("brew fixture missing");
    await sql`
      insert into recipe (user_id, brew_id, version, completeness)
      values (${userId}, ${brewId}, 1, 100)
    `;

    const request = await app.inject({
      method: "POST",
      url: `/v1/job-analyses/${analysisId}/reanalyze`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(request.statusCode).toBe(202);
    expect(request.json().data).toMatchObject({
      jobAnalysisId: analysisId,
      status: "queued",
      targetVersion: 2,
      impact: { brewCount: 1, recipeCount: 1 },
    });
    extractorVersion = 2;
    await service.process(analysisId, extractor);
    const second = await service.getResult(userId, analysisId);
    expect(second.analysis.resultVersion).toBe(2);
    expect(second.previous?.version).toBe(1);

    await service.requestReanalysis(userId, analysisId);
    extractorVersion = 3;
    await service.process(analysisId, extractor);
    const third = await service.getResult(userId, analysisId);
    expect(third.analysis.resultVersion).toBe(3);
    expect(third.previous?.version).toBe(2);
    expect(third.previous?.requirements).toEqual(second.requirements);
    expect((await sql<{ count: number }[]>`
      select count(*) as count from job_analysis_history
      where job_analysis_id = ${analysisId}
    `)[0]?.count).toBe(1);
  });
});
