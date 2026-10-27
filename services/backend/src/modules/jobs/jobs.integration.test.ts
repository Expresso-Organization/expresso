import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import type { JobMarketApi } from "./index.js";
import { MongoJobMarketService } from "./service.js";
import { MongoJobBoardService } from "./board-service.js";
import { MongoIdentityService, type IdentityApi } from "../identity/index.js";
import { MongoCareerService, type CareerApi } from "../career/index.js";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { JobInterestResponseSchema, ListJobPostingsQuerySchema } from "@expresso/contracts";

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
    // 해제는 행을 지운다 — 단계(`closed`)로 남기면 `interested` 필터에 그대로 걸린다.
    await market.deleteInterest(other, postingId);
    expect((await board.list(owner, { ...query, interested: true })).summary.total).toBe(1);
    await market.deleteInterest(owner, postingId);
    expect((await board.list(owner, { ...query, interested: true })).summary.total).toBe(0);
    expect((await board.get(owner, postingId)).interest).toBeNull();
    const search = await market.interpretSearch(owner, "서울 MongoDB", 1);
    expect(search).toMatchObject({ originalQuery: "서울 MongoDB", conditions: [], needsClarification: true });
    expect(await mongoCollections(fixture.resource.db).recentSearches.findOne({ _id: search.recentSearchId, userId: owner })).toMatchObject({ conditions: [], resultCount: 1 });
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

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-jobs-test",
};

describe.skipIf(!process.env.TEST_MONGODB_URL)("job market integration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
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
    fixture = await createMongoFixture("job-market-http");
    identityService = new MongoIdentityService(fixture.resource);
    careerService = new MongoCareerService(fixture.resource);
    // AI 활성 경로의 저장·소유권 검증에는 외부 호출 없는 해석기를 주입합니다.
    jobMarketService = new MongoJobMarketService(fixture.resource, {
      async interpret(query) {
        expect(query).toBe("서울 3년 TypeScript 백엔드 remote 연봉 6000");
        return [
          { field: "location", value: "서울", enabled: true, confidence: 0.85 },
          { field: "experience", value: 3, enabled: true, confidence: 0.9 },
          { field: "technology", value: "typescript", enabled: true, confidence: 0.95 },
          { field: "role", value: "백엔드", enabled: true, confidence: 0.9 },
          { field: "work_type", value: "remote", enabled: true, confidence: 0.9 },
          { field: "salary", value: 6000, enabled: false, confidence: 0.6 },
        ];
      },
    });
    const first = await identityService.signup({ email: `jobs-a-${marker}@example.com`, displayName: "Jobs A", password: "correct-horse-battery" });
    const second = await identityService.signup({ email: `jobs-b-${marker}@example.com`, displayName: "Jobs B", password: "correct-horse-battery" });
    firstUserId = first.user.id; secondUserId = second.user.id; firstToken = first.session.accessToken; secondToken = second.session.accessToken;
    experienceCategoryId = (await careerService.listCategories(firstUserId)).find((category) => category.key === "experience")!.id;
    app = buildApi({ config, identityService, jobMarketService });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await fixture?.dispose();
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
    const posting = await mongoCollections(fixture.resource.db).jobPostings.findOne({ _id: primaryPostingId });
    expect(posting).toMatchObject({ descriptionRaw, sourceUrl: payload.sourceUrl });
    primaryCompanyId = posting?.companyId ?? "";
    const outbox = await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({ topic: "job.normalize", "payload.jobPostingId": primaryPostingId });
    expect(outbox).toBe(2);
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
    const secondUserInterests = await mongoCollections(fixture.resource.db).interests.countDocuments({ userId: secondUserId });
    expect(secondUserInterests).toBe(0);

    // 담기 → 다른 사람의 해제는 내 관심에 닿지 않음 → 해제.
    const interestUrl = `/v1/jobs/postings/${primaryPostingId}/interest`;
    const ownInterests = async () =>
      await mongoCollections(fixture.resource.db).interests.countDocuments({ userId: firstUserId, jobPostingId: primaryPostingId });
    const saved = await app.inject({ method: "PUT", url: interestUrl, headers: auth(), payload: { stage: "saved" } });
    expect(saved.statusCode).toBe(200);
    expect(JobInterestResponseSchema.parse(saved.json()).data).toMatchObject({ jobPostingId: primaryPostingId, stage: "saved", deadlineAt: null, memo: null });
    expect(await ownInterests()).toBe(1);
    expect((await app.inject({ method: "DELETE", url: interestUrl, headers: auth(secondToken) })).statusCode).toBe(204);
    expect(await ownInterests()).toBe(1);
    expect((await app.inject({ method: "DELETE", url: interestUrl, headers: auth() })).statusCode).toBe(204);
    expect(await ownInterests()).toBe(0);
    // 다시 눌러도 같은 결과다. 없는 공고와 UUID가 아닌 id만 실패한다.
    expect((await app.inject({ method: "DELETE", url: interestUrl, headers: auth() })).statusCode).toBe(204);
    expect((await app.inject({ method: "DELETE", url: `/v1/jobs/postings/${randomUUID()}/interest`, headers: auth() })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: "/v1/jobs/postings/not-a-uuid/interest", headers: auth() })).statusCode).toBe(400);
  });

  it("requires three records, persists four-axis scores, and hides demand ratios below five jobs", async () => {
    await mongoCollections(fixture.resource.db).jobPostings.updateOne({ _id: primaryPostingId }, { $set: { requirements: { technologies: ["postgresql", "kubernetes"], impacts: ["scale"], roles: ["backend"], conditions: ["remote"] } } });
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
    const score = await mongoCollections(fixture.resource.db).matchScores.findOne({ userId: firstUserId, jobPostingId: primaryPostingId });
    expect(Number(score?.total.toString())).toBe(match.total);

    for (let index = 0; index < 4; index += 1) {
      const id = randomUUID();
      await mongoCollections(fixture.resource.db).jobPostings.insertOne({ _id: id, companyId: primaryCompanyId, source: "api", externalId: `demand-${marker}-${index}`, title: `Demand ${index}`, descriptionRaw: `Demand source ${index}`, requirements: { technologies: index < 3 ? ["postgresql"] : ["kubernetes"], impacts: [], roles: [], conditions: [] }, dedupeHash: `demand-hash-${marker}-${index}`, createdAt: new Date(), duties: [], preferred: [], hiringProcess: [] });
      postingIds.push(id);
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
    const before = await mongoCollections(fixture.resource.db).jobPostings.countDocuments({ _id: primaryPostingId });

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
    expect(await mongoCollections(fixture.resource.db).jobPostings.countDocuments({ _id: primaryPostingId })).toBe(before);
    expect(await mongoCollections(fixture.resource.db).jobAnalyses.countDocuments({ userId: secondUserId, jobPostingId: primaryPostingId })).toBe(1);

    // 요건을 뽑는 것은 워커가 한다. 여기서는 자리만 만들고 큐에 넣는다.
    expect(await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({ topic: "job.normalize", "payload.jobAnalysisId": created.json().data.jobAnalysisId })).toBe(1);

    const missing = await app.inject({
      method: "POST",
      url: `/v1/jobs/postings/${randomUUID()}/analyses`,
      headers: auth(secondToken),
    });
    expect(missing.statusCode).toBe(404);
  });

  it("requeues a retryable failed analysis and leaves a permanent failure alone", async () => {
    const db = mongoCollections(fixture.resource.db);
    // 이 자리에서 분석을 만든다 — 앞 테스트가 만들어 둔 것에 기대면 하나만 돌릴 때 깨진다.
    const opened = await app.inject({
      method: "POST",
      url: `/v1/jobs/postings/${primaryPostingId}/analyses`,
      headers: auth(secondToken),
    });
    const jobAnalysisId: string = opened.json().data.jobAnalysisId;
    const queued = () =>
      db.outboxEvents.countDocuments({ topic: "job.normalize", "payload.jobAnalysisId": jobAnalysisId });

    // 다시 해 볼 수 있는 실패. 06c의 "다시 시도"가 누르는 자리다.
    await db.jobAnalyses.updateOne(
      { _id: jobAnalysisId },
      { $set: { status: "failed", progressStage: "failed", failureCode: "EXTRACTION_FAILED", failureRetryable: true, attempts: 1 } },
    );
    const before = await queued();
    const retried = await app.inject({
      method: "POST",
      url: `/v1/jobs/postings/${primaryPostingId}/analyses`,
      headers: auth(secondToken),
    });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().data).toMatchObject({ jobAnalysisId, status: "queued", reused: true });
    expect(await queued()).toBe(before + 1);
    expect(await db.jobAnalyses.findOne({ _id: jobAnalysisId })).toMatchObject({
      status: "queued",
      progressStage: "queued",
      failureCode: null,
      failureRetryable: null,
    });

    // 워커가 집기 전에 한 번 더 눌러도 큐에 한 번만 들어간다 — 이미 `queued`라 재적재 조건이 아니다.
    await app.inject({ method: "POST", url: `/v1/jobs/postings/${primaryPostingId}/analyses`, headers: auth(secondToken) });
    expect(await queued()).toBe(before + 1);

    // AI가 꺼져 생긴 실패는 다시 눌러도 같은 자리에서 멈춘다. 큐에 넣지 않는다.
    await db.jobAnalyses.updateOne(
      { _id: jobAnalysisId },
      { $set: { status: "failed", progressStage: "failed", failureCode: "EXTRACTOR_UNAVAILABLE", failureRetryable: false } },
    );
    const permanent = await app.inject({
      method: "POST",
      url: `/v1/jobs/postings/${primaryPostingId}/analyses`,
      headers: auth(secondToken),
    });
    expect(permanent.json().data).toMatchObject({ status: "failed", reused: true });
    expect(await queued()).toBe(before + 1);
  });
});
