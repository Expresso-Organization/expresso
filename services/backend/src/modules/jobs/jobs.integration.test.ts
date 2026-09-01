import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/legacy-mysql.js";

import type { SqlTag } from "../../platform/legacy-mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { CareerService } from "../career/legacy-mysql-service.js";
import { IdentityService } from "../identity/legacy-mysql-service.js";
import { JobMarketService } from "./legacy-mysql-service.js";
import type { JobMarketApi } from "./index.js";
import { MongoJobMarketService } from "./service.js";
import { MongoJobBoardService } from "./board-service.js";
import { MongoIdentityService, type IdentityApi } from "../identity/index.js";
import { MongoCareerService, type CareerApi } from "../career/index.js";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { ListJobPostingsQuerySchema } from "@expresso/contracts";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB job market and board", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let market: MongoJobMarketService;
  let board: MongoJobBoardService;
  let career: MongoCareerService;
  let owner: string;
  let other: string;
  let postingId: string;
  beforeAll(async () => {
    fixture = await createMongoFixture("job-market");
    market = new MongoJobMarketService(fixture.resource);
    board = new MongoJobBoardService(fixture.resource);
    career = new MongoCareerService(fixture.resource);
    const identity = new MongoIdentityService(fixture.resource);
    owner = (await identity.signup({ email: `market-${randomUUID()}@example.com`, displayName: "공고", password: "correct-horse-battery" })).user.id;
    other = (await identity.signup({ email: `market-${randomUUID()}@example.com`, displayName: "타인", password: "correct-horse-battery" })).user.id;
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("deduplicates source and submission concurrently with a single outbox event per analysis", async () => {
    const input = { companyName: "공고 회사", title: "Backend [a+b]", descriptionRaw: "MongoDB TypeScript 한국어 多言語 😀 ".repeat(1000) };
    const result = await Promise.all(Array.from({ length: 4 }, () => market.submitPosting(owner, "same-request-0001", input)));
    postingId = result[0]!.jobPostingId;
    expect(new Set(result.map((row) => row.jobPostingId)).size).toBe(1);
    expect(new Set(result.map((row) => row.jobAnalysisId)).size).toBe(1);
    const db = mongoCollections(fixture.resource.db);
    expect(await db.outboxEvents.countDocuments({ userId: owner })).toBe(1);
    await expect(market.submitPosting(owner, "same-request-0001", { ...input, title: "Different" })).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.jobPostings.countDocuments({})).toBe(1);
    expect((await market.submitPosting(other, "same-request-0001", input)).jobPostingId).toBe(postingId);
    expect((await market.analyzePosting(owner, postingId)).reused).toBe(true);
    expect((await board.get(owner, postingId)).descriptionRaw).toBe(input.descriptionRaw);
  });

  it("keeps null scores visible and scopes interests, recent searches and saved-search limits", async () => {
    const query = ListJobPostingsQuerySchema.parse({});
    expect((await board.list(owner, query)).data[0]?.match).toBeNull();
    await market.upsertInterest(owner, postingId, { stage: "saved", memo: "관심", deadlineAt: null });
    expect((await board.list(owner, { ...query, interested: true })).summary.total).toBe(1);
    expect((await board.list(other, { ...query, interested: true })).summary.total).toBe(0);
    const search = await market.interpretSearch(owner, "서울 MongoDB", 1);
    expect((await market.interpretSearch(owner, "서울 MongoDB", 2)).recentSearchId).toBe(search.recentSearchId);
    expect((await board.recentSearches(owner, 20)).data).toHaveLength(1);
    await expect(market.deleteRecentSearch(other, search.recentSearchId)).rejects.toMatchObject({ statusCode: 404 });
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => market.saveSearch(owner, { name: `검색 ${index}`, originalQuery: "서울", conditions: [], notify: false })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(10);
    expect(await market.listSavedSearches(other)).toHaveLength(0);
  });

  it("returns company facets from the population without the selected company", async () => {
    const db = mongoCollections(fixture.resource.db);
    const companyId = randomUUID();
    await db.companies.insertOne({ _id: companyId, name: "큰 회사", brandColors: [] });
    for (let index = 0; index < 9; index++) await db.jobPostings.insertOne({ _id: randomUUID(), companyId, source: "api", title: `Backend ${index}`, descriptionRaw: "분석 전", dedupeHash: randomUUID(), requirements: {}, createdAt: new Date("2026-01-01T00:00:00Z"), duties: [], preferred: [], hiringProcess: [] });
    const original = (await db.jobPostings.findOne({ _id: postingId }))!;
    const result = await board.list(owner, ListJobPostingsQuerySchema.parse({ company: original.companyId }));
    expect(result.summary.total).toBe(1);
    expect(result.summary.companies.find((item) => item.key === companyId)).toMatchObject({ count: 9, ratio: 0.9 });
    const seen: string[] = [];
    for (let page = 1; page <= 5; page++) seen.push(...(await board.list(owner, ListJobPostingsQuerySchema.parse({ page, limit: 2 }))).data.map((row) => row.id));
    expect(new Set(seen).size).toBe(10);
    expect((await board.list(owner, ListJobPostingsQuerySchema.parse({ q: ".*" }))).summary.total).toBe(0);
    expect((await board.list(owner, ListJobPostingsQuerySchema.parse({ q: "[a+b]" }))).summary.total).toBe(1);
  });

  it("computes match only from owned records and supports requirement evidence in detail", async () => {
    const db = mongoCollections(fixture.resource.db);
    const categoryId = (await career.listCategories(owner))[0]!.id;
    const ids: string[] = [];
    for (let index = 0; index < 3; index++) ids.push((await career.createRecord(owner, randomUUID(), { categoryId, title: "MongoDB", properties: {}, bodyMd: "TypeScript" })).record.id);
    await db.jobPostings.updateOne({ _id: postingId }, { $set: { requirements: { technologies: ["MongoDB", "TypeScript"] } } });
    expect((await market.computeMatch(owner, postingId)).total).toBe(100);
    await expect(market.computeMatch(other, postingId)).rejects.toMatchObject({ statusCode: 409 });
    const requirementId = randomUUID();
    await db.jobPostingRequirements.insertOne({ _id: requirementId, jobPostingId: postingId, orderNo: 0, label: "MongoDB", kind: "must", sourceSpan: { start: 0, end: 7, quote: "MongoDB" }, extractorVersion: 1, extractedAt: new Date() });
    await db.requirementCoverages.insertOne({ _id: `${owner}:${requirementId}`, userId: owner, requirementId, coverage: "covered", coveredBy: [ids[0]!], computedAt: new Date() });
    const detail = await board.get(owner, postingId);
    expect(detail.criteria[0]).toMatchObject({ coverage: "covered", coveredBy: [{ id: ids[0], title: "MongoDB" }], sourceSpan: { quote: "MongoDB" } });
    expect(detail.rank).toEqual({ position: 1, total: 1 });
    expect(detail.topRecords[0]?.id).toBe(ids[0]);
    expect((await board.get(other, postingId)).criteria[0]?.coverage).toBeNull();
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  databaseUrl: databaseUrl ?? "mysql://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-jobs-test",
};

interface IdRow {
  id: string;
}

interface CountRow {
  count: number;
}

for (const engine of ["mysql", "mongodb"] as const) {
describe.skipIf(engine === "mysql" ? !databaseUrl : !process.env.TEST_MONGODB_URL)(`job market integration (${engine})`, () => {
  let sql: SqlTag;
  let fixture: Awaited<ReturnType<typeof createMongoFixture>> | undefined;
  let identityService: IdentityApi;
  let careerService: CareerApi;
  let jobMarketService: JobMarketApi;
  let app: ReturnType<typeof buildApi>;
  const marker = randomUUID();
  let firstUserId: string;
  let secondUserId: string;
  let firstToken: string;
  let secondToken: string;
  let experienceCategoryId: string;
  let primaryPostingId: string;
  let primaryCompanyId: string;
  const postingIds: string[] = [];

  const auth = (token = firstToken) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    if (engine === "mongodb") {
      fixture = await createMongoFixture("job-market-http");
      identityService = new MongoIdentityService(fixture.resource);
      careerService = new MongoCareerService(fixture.resource);
      jobMarketService = new MongoJobMarketService(fixture.resource);
      const first = await identityService.signup({ email: `jobs-a-${marker}@example.com`, displayName: "Jobs A", password: "correct-horse-battery" });
      const second = await identityService.signup({ email: `jobs-b-${marker}@example.com`, displayName: "Jobs B", password: "correct-horse-battery" });
      firstUserId = first.user.id; secondUserId = second.user.id; firstToken = first.session.accessToken; secondToken = second.session.accessToken;
      experienceCategoryId = (await careerService.listCategories(firstUserId)).find((category) => category.key === "experience")!.id;
    } else {
      sql = createMysqlResource(databaseUrl!).sql;
      identityService = new IdentityService(sql); careerService = new CareerService(sql); jobMarketService = new JobMarketService(sql);
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!planId) throw new Error("free plan missing");
    // 여러 행을 한 번에 넣을 때는 id 를 우리가 만들어 준다 — MySQL 은 returning 이 없다.
    firstUserId = randomUUID();
    secondUserId = randomUUID();
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values
        (${firstUserId}, ${`jobs-a-${marker}@example.com`}, 'Jobs A', ${planId}),
        (${secondUserId}, ${`jobs-b-${marker}@example.com`}, 'Jobs B', ${planId})
    `;
    firstToken = (await identityService.issueSession({ userId: firstUserId })).accessToken;
    secondToken = (await identityService.issueSession({ userId: secondUserId })).accessToken;
    experienceCategoryId = (await sql<IdRow[]>`
      select id from category where \`key\` = 'experience' and is_system
    `)[0]?.id ?? "";
    if (!experienceCategoryId) throw new Error("experience category missing");
    }
    app = buildApi({ config, identityService, jobMarketService });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    if (fixture) { await app?.close(); await fixture.dispose(); return; }
    if (firstUserId && secondUserId) {
      await sql`
        delete from platform_outbox
        where topic = 'job.normalize'
          and payload ->> '$.userId' in (${firstUserId}, ${secondUserId})
      `;
      await sql`delete from \`user\` where id in (${firstUserId}, ${secondUserId})`;
    }
    if (postingIds.length > 0) {
      await sql`delete from job_posting where id in ${sql(postingIds)}`;
    }
    if (primaryCompanyId) await sql`delete from company where id = ${primaryCompanyId}`;
    await app.close();
    await sql.end({ timeout: 5 });
  });

  it("preserves and deduplicates a 200+ character source while enqueueing normalization", async () => {
    const descriptionRaw = `Original source ${marker}. ` + "Backend platform responsibilities and evidence. ".repeat(8);
    const short = await app.inject({
      method: "POST",
      url: "/v1/jobs/submissions",
      headers: { ...auth(), "idempotency-key": `job-short-${marker}` },
      payload: { companyName: "Example", title: "Engineer", descriptionRaw: "short" },
    });
    expect(short.statusCode).toBe(400);

    const payload = {
      companyName: `Example ${marker}`,
      companyDomain: `${marker}.example.com`,
      title: "Backend Engineer",
      sourceUrl: `https://${marker}.example.com/jobs/backend`,
      descriptionRaw,
    };
    const first = await app.inject({
      method: "POST",
      url: "/v1/jobs/submissions",
      headers: { ...auth(), "idempotency-key": `job-submit-a-${marker}` },
      payload,
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/jobs/submissions",
      headers: { ...auth(), "idempotency-key": `job-submit-b-${marker}` },
      payload,
    });
    expect(first.statusCode).toBe(202);
    expect(duplicate.statusCode).toBe(202);
    primaryPostingId = first.json().data.jobPostingId;
    expect(duplicate.json().data).toMatchObject({
      jobPostingId: primaryPostingId,
      deduplicated: true,
    });
    postingIds.push(primaryPostingId);
    const document = fixture ? await mongoCollections(fixture.resource.db).jobPostings.findOne({ _id: primaryPostingId }) : null;
    const posting = fixture ? [{ description_raw: document?.descriptionRaw, source_url: document?.sourceUrl, company_id: document?.companyId }] : await sql<{
      description_raw: string;
      source_url: string;
      company_id: string;
    }[]>`
      select description_raw, source_url, company_id
      from job_posting where id = ${primaryPostingId}
    `;
    expect(posting[0]).toMatchObject({ description_raw: descriptionRaw, source_url: payload.sourceUrl });
    primaryCompanyId = posting[0]?.company_id ?? "";
    if (!fixture) await expect(
      sql`update job_posting set description_raw = 'tampered' where id = ${primaryPostingId}`,
    ).rejects.toThrow(/immutable/);
    const outbox = fixture ? [{ count: await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({ topic: "job.normalize", "payload.jobPostingId": primaryPostingId }) }] : await sql<CountRow[]>`
      select count(*) as count from platform_outbox
      where topic = 'job.normalize' and payload ->> '$.jobPostingId' = ${primaryPostingId}
    `;
    expect(outbox[0]?.count).toBe(2);
  });

  it("stores editable search conditions, enforces ten saved searches, and scopes recent/interest state", async () => {
    const query = "서울 3년 TypeScript 백엔드 remote 연봉 6000";
    const interpreted = await app.inject({
      method: "POST",
      url: "/v1/jobs/search/interpret",
      headers: auth(),
      payload: { query, resultCount: 12 },
    });
    expect(interpreted.statusCode).toBe(200);
    expect(interpreted.json()).toMatchObject({
      originalQuery: query,
      needsClarification: false,
    });
    expect(interpreted.json().conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "technology", value: "typescript", enabled: true }),
      expect.objectContaining({ field: "salary", value: 6000, enabled: false }),
    ]));
    const recentId = interpreted.json().recentSearchId as string;
    const crossDelete = await app.inject({
      method: "DELETE",
      url: `/v1/jobs/recent-searches/${recentId}`,
      headers: auth(secondToken),
    });
    expect(crossDelete.statusCode).toBe(404);
    expect((await app.inject({
      method: "DELETE",
      url: `/v1/jobs/recent-searches/${recentId}`,
      headers: auth(),
    })).statusCode).toBe(204);

    for (let index = 0; index < 10; index += 1) {
      await jobMarketService.saveSearch(firstUserId, {
        name: `Saved ${index}`,
        originalQuery: query,
        conditions: interpreted.json().conditions,
        notify: index === 0,
      });
    }
    await expect(jobMarketService.saveSearch(firstUserId, {
      name: "Saved 11",
      originalQuery: query,
      conditions: [],
      notify: false,
    })).rejects.toMatchObject({ statusCode: 409, publicDetails: { limit: 10 } });
    expect(await jobMarketService.listSavedSearches(firstUserId)).toHaveLength(10);

    const interest = await jobMarketService.upsertInterest(firstUserId, primaryPostingId, {
      stage: "saved",
      deadlineAt: "2026-08-20T00:00:00Z",
      memo: "Prepare evidence",
    });
    expect(interest).toMatchObject({ jobPostingId: primaryPostingId, stage: "saved" });
    const secondUserInterests = fixture ? [{ count: await mongoCollections(fixture.resource.db).interests.countDocuments({ userId: secondUserId }) }] : await sql<CountRow[]>`
      select count(*) as count from interest where user_id = ${secondUserId}
    `;
    expect(secondUserInterests[0]?.count).toBe(0);
  });

  it("requires three records, persists four-axis scores, and hides demand ratios below five jobs", async () => {
    if (fixture) await mongoCollections(fixture.resource.db).jobPostings.updateOne({ _id: primaryPostingId }, { $set: { requirements: { technologies: ["postgresql", "kubernetes"], impacts: ["scale"], roles: ["backend"], conditions: ["remote"] } } });
    else await sql`
      update job_posting
      set requirements = ${sql.json({
        technologies: ["postgresql", "kubernetes"],
        impacts: ["scale"],
        roles: ["backend"],
        conditions: ["remote"],
      })}
      where id = ${primaryPostingId}
    `;
    for (const [index, text] of [
      "Backend engineer used PostgreSQL to scale services.",
      "Operated remote production systems.",
    ].entries()) {
      await careerService.createRecord(firstUserId, `match-${index}-${marker}`, {
        categoryId: experienceCategoryId,
        title: `Evidence ${index}`,
        properties: {},
        bodyMd: text,
      });
    }
    await expect(
      jobMarketService.computeMatch(firstUserId, primaryPostingId),
    ).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { required: 3, actual: 2 },
    });
    await careerService.createRecord(firstUserId, `match-3-${marker}`, {
      categoryId: experienceCategoryId,
      title: "Evidence 3",
      properties: {},
      bodyMd: "Led backend delivery with measurable outcomes.",
    });
    const match = await jobMarketService.computeMatch(
      firstUserId,
      primaryPostingId,
      new Date("2026-08-09T00:00:00Z"),
    );
    expect(Number.isInteger(match.total)).toBe(true);
    expect(Object.values(match.axes).reduce((sum, axis) => sum + axis.covered, 0)).toBe(match.covered);
    expect(match.total).toBe(Math.round((100 * match.covered) / match.required));
    expect(match.reason.length).toBeGreaterThan(0);
    expect(match.nextAction).toContain("기록");
    const score = fixture ? await mongoCollections(fixture.resource.db).matchScores.findOne({ userId: firstUserId, jobPostingId: primaryPostingId }) : null;
    const persisted = fixture ? [{ total: score?.total.toString() }] : await sql<{ total: string; reason_text: string; next_action: string }[]>`
      select total, reason_text, next_action from match_score
      where user_id = ${firstUserId} and job_posting_id = ${primaryPostingId}
    `;
    expect(Number(persisted[0]?.total)).toBe(match.total);

    for (let index = 0; index < 4; index += 1) {
      if (fixture) {
        const id = randomUUID();
        await mongoCollections(fixture.resource.db).jobPostings.insertOne({ _id: id, companyId: primaryCompanyId, source: "api", externalId: `demand-${marker}-${index}`, title: `Demand ${index}`, descriptionRaw: `Demand source ${index}`, requirements: { technologies: index < 3 ? ["postgresql"] : ["kubernetes"], impacts: [], roles: [], conditions: [] }, dedupeHash: `demand-hash-${marker}-${index}`, createdAt: new Date(), duties: [], preferred: [], hiringProcess: [] });
        postingIds.push(id); continue;
      }
      const rows = await sql<IdRow[]>`
        insert into job_posting (
          company_id, source, external_id, title,
          description_raw, requirements, dedupe_hash
        ) values (
          ${primaryCompanyId}, 'api', ${`demand-${marker}-${index}`},
          ${`Demand ${index}`}, ${`Demand source ${index}`},
          ${sql.json({
            technologies: index < 3 ? ["postgresql"] : ["kubernetes"],
            impacts: [], roles: [], conditions: [],
          })}, ${`demand-hash-${marker}-${index}`}
        ) returning id
      `;
      if (rows[0]) postingIds.push(rows[0].id);
    }
    expect(await jobMarketService.summarizeDemand(postingIds.slice(0, 4))).toEqual({
      sampleSize: 4,
      demandRatios: null,
    });
    const five = await jobMarketService.summarizeDemand(postingIds.slice(0, 5));
    expect(five.sampleSize).toBe(5);
    expect(five.demandRatios).not.toBeNull();
  });

  it("brings a board posting into a per-user analysis exactly once, without cloning the posting", async () => {
    const before = (fixture ? [{ count: await mongoCollections(fixture.resource.db).jobPostings.countDocuments({ _id: primaryPostingId }) }] : await sql<CountRow[]>`
      select count(*) as count from job_posting where id = ${primaryPostingId}
    `)[0]?.count;

    const created = await app.inject({
      method: "POST",
      url: `/v1/jobs/postings/${primaryPostingId}/analyses`,
      headers: auth(secondToken),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data).toMatchObject({
      jobPostingId: primaryPostingId,
      status: "queued",
      reused: false,
    });

    // 두 번 눌러도 분석은 한 벌이다 — 두 벌이면 어느 쪽이 내 커버리지인지 말할 수 없다.
    const again = await app.inject({
      method: "POST",
      url: `/v1/jobs/postings/${primaryPostingId}/analyses`,
      headers: auth(secondToken),
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().data).toMatchObject({
      jobAnalysisId: created.json().data.jobAnalysisId,
      reused: true,
    });

    // 공고는 이미 있던 것을 쓴다. 본문 해시로 다시 찾으면 사본이 하나 더 생긴다.
    expect((fixture ? [{ count: await mongoCollections(fixture.resource.db).jobPostings.countDocuments({ _id: primaryPostingId }) }] : await sql<CountRow[]>`
      select count(*) as count from job_posting where id = ${primaryPostingId}
    `)[0]?.count).toBe(before);
    expect((fixture ? [{ count: await mongoCollections(fixture.resource.db).jobAnalyses.countDocuments({ userId: secondUserId, jobPostingId: primaryPostingId }) }] : await sql<CountRow[]>`
      select count(*) as count from job_analysis
      where user_id = ${secondUserId} and job_posting_id = ${primaryPostingId}
    `)[0]?.count).toBe(1);

    // 요건을 뽑는 것은 워커가 한다. 여기서는 자리만 만들고 큐에 넣는다.
    expect((fixture ? [{ count: await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({ topic: "job.normalize", "payload.jobAnalysisId": created.json().data.jobAnalysisId }) }] : await sql<CountRow[]>`
      select count(*) as count from platform_outbox
      where topic = 'job.normalize'
        and payload ->> '$.jobAnalysisId' = ${created.json().data.jobAnalysisId}
    `)[0]?.count).toBe(1);

    const missing = await app.inject({
      method: "POST",
      url: `/v1/jobs/postings/${randomUUID()}/analyses`,
      headers: auth(secondToken),
    });
    expect(missing.statusCode).toBe(404);
  });
});

}
