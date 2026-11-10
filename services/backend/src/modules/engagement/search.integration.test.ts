import { randomUUID } from "node:crypto";
import { Decimal128 } from "mongodb";

import { ListJobPostingsQuerySchema } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoCareerService } from "../career/index.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoJobBoardService } from "../jobs/index.js";
import { MongoPortfolioReadService } from "../portfolios/index.js";
import { UnifiedSearchService } from "./search.js";

/**
 * 00c 통합 검색이 각 화면의 검색 규칙을 그대로 쓰는가.
 *
 * 예전 구현은 일치도 점수가 있는 공고만, 제목으로만 찾았다. 그래서 회사 이름으로
 * 찾으면 공고 탐색에는 나오는 공고가 검색창에서는 사라졌다.
 */
describe.skipIf(!process.env.TEST_MONGODB_URL)("unified search over module services", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let search: UnifiedSearchService;
  let jobs: MongoJobBoardService;
  let userId = "";
  let otherUserId = "";
  const marker = randomUUID().slice(0, 8);
  const company = `검색회사${marker}`;
  const ids = { scored: randomUUID(), unscored: randomUUID(), closed: randomUUID(), byBody: randomUUID(), abroad: randomUUID(), record: randomUUID(), portfolio: randomUUID() };

  beforeAll(async () => {
    fixture = await createMongoFixture("unified-search");
    const identity = new MongoIdentityService(fixture.resource);
    const career = new MongoCareerService(fixture.resource);
    jobs = new MongoJobBoardService(fixture.resource);
    search = new UnifiedSearchService({ records: career, jobs, portfolios: new MongoPortfolioReadService(fixture.resource) });
    userId = (await identity.signup({ email: `search-${marker}@example.com`, displayName: "검색", password: "correct-horse-battery" })).user.id;
    otherUserId = (await identity.signup({ email: `search-other-${marker}@example.com`, displayName: "다른 사용자", password: "correct-horse-battery" })).user.id;

    const db = mongoCollections(fixture.resource.db);
    const now = new Date();
    const companyId = randomUUID();
    await db.companies.insertOne({ _id: companyId, name: company, brandColors: [] });
    const body = `통합 검색 시험 본문. ${"충분히 긴 설명. ".repeat(10)}`;
    const posting = (_id: string, title: string, extra: { descriptionRaw?: string; expiresAt?: Date; locationRegion?: string } = {}) => ({
      _id, companyId, source: "user_input" as const, title, descriptionRaw: extra.descriptionRaw ?? body, requirements: { technologies: [], impacts: [], roles: [], conditions: [] },
      dedupeHash: `search-${_id}`, createdAt: now, duties: [], preferred: [], hiringProcess: [],
      ...(extra.expiresAt ? { expiresAt: extra.expiresAt } : {}),
      ...(extra.locationRegion ? { locationRegion: extra.locationRegion } : {}),
    });
    await db.jobPostings.insertMany([
      posting(ids.scored, "백엔드 엔지니어"),
      posting(ids.unscored, "데이터 엔지니어"),
      posting(ids.closed, "마감된 엔지니어", { expiresAt: new Date(now.getTime() - 86_400_000) }),
      posting(ids.byBody, "플랫폼 엔지니어", { descriptionRaw: `${body} 키워드${marker}를 다룹니다.` }),
      posting(ids.abroad, "해외 엔지니어", { locationRegion: "미국" }),
    ]);
    const axis = { required: 1, covered: 1, matched: ["근거"], missing: [] };
    await db.matchScores.insertOne({ _id: randomUUID(), userId, jobPostingId: ids.scored, total: Decimal128.fromString("90"), axes: { technology: axis, impact: axis, role: axis, conditions: axis }, reasonText: "match", computedAt: now, nextAction: "apply" });

    // 포트폴리오 목록은 템플릿 이름을 함께 돌려준다.
    const templateId = randomUUID();
    await db.templates.insertOne({ _id: templateId, code: `t-${templateId.slice(0, 8)}`, name: "시험", toneTags: [], supportedSections: [], planRequired: "free", description: "", rendererVersion: 1, style: {}, industries: [], isActive: true });
    const experienceId = (await career.listCategories(userId)).find((category) => category.key === "experience")!.id;
    const otherExperienceId = (await career.listCategories(otherUserId)).find((category) => category.key === "experience")!.id;
    await db.careerRecords.insertMany([
      { _id: ids.record, userId, categoryId: experienceId, title: `${company} 정산 개편`, status: "organized", origin: "manual", properties: {}, bodyMd: "", updatedAt: now, version: 1 },
      { _id: randomUUID(), userId: otherUserId, categoryId: otherExperienceId, title: `${company} 남의 기록`, status: "organized", origin: "manual", properties: {}, bodyMd: "", updatedAt: now, version: 1 },
    ]);
    await db.portfolios.insertMany([
      { _id: ids.portfolio, userId, brewId: randomUUID(), templateId, title: `${company} 지원용`, status: "draft", createdAt: now, updatedAt: now, styleOverrides: {} },
      { _id: randomUUID(), userId: otherUserId, brewId: randomUUID(), templateId, title: `${company} 남의 포트폴리오`, status: "draft", createdAt: now, updatedAt: now, styleOverrides: {} },
    ]);
  }, 60_000);

  afterAll(async () => fixture?.dispose());

  it("finds open postings by company name, scored ones first, and only the owner's records and portfolios", async () => {
    const result = await search.search(userId, { q: company, limit: 20 });
    expect(result.data).toEqual([
      { id: ids.record, type: "record", title: `${company} 정산 개편`, subtitle: "organized" },
      // 일치도 순 — 점수가 있는 공고가 앞, 마감한 공고는 빠진다.
      { id: ids.scored, type: "job", title: "백엔드 엔지니어", subtitle: company },
      ...[ids.unscored, ids.byBody, ids.abroad].map(() => expect.objectContaining({ type: "job", subtitle: company })),
      { id: ids.portfolio, type: "portfolio", title: `${company} 지원용`, subtitle: "draft" },
    ]);
    expect(result.data.map((row) => row.id)).not.toContain(ids.closed);
  });

  it("narrows postings to the job board's country when the screen passes one", async () => {
    const all = (await search.search(userId, { q: company, limit: 20 })).data.map((row) => row.id);
    const korea = (await search.search(userId, { q: company, country: "한국", limit: 20 })).data.map((row) => row.id);
    expect(all).toContain(ids.abroad);
    // 근무지를 못 읽은 공고는 국내 보드에서 온 것으로 보고 한국에 남는다(`UNPLACED_COUNTRY`).
    expect(korea).toEqual(all.filter((id) => id !== ids.abroad));
  });

  it("matches the job board's first page for the same query", async () => {
    const board = await jobs.list(userId, ListJobPostingsQuerySchema.parse({ q: company, country: "한국", limit: 20 }));
    const palette = (await search.search(userId, { q: company, country: "한국", limit: 20 })).data.filter((row) => row.type === "job");
    expect(palette.map((row) => row.id)).toEqual(board.data.map((row) => row.id));
  });

  it("finds a posting by a word in its description", async () => {
    const result = await search.search(userId, { q: `키워드${marker}`, limit: 20 });
    expect(result.data).toEqual([{ id: ids.byBody, type: "job", title: "플랫폼 엔지니어", subtitle: company }]);
  });

  it("applies the limit to each kind separately", async () => {
    const result = await search.search(userId, { q: company, limit: 1 });
    expect(result.data.map((row) => row.type)).toEqual(["record", "job", "portfolio"]);
  });
});
