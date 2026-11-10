import { randomUUID } from "node:crypto";

import { ListPortfoliosQuerySchema, PublishPortfolioSchema, UnifiedSearchQuerySchema } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoEngagementService } from "../engagement/index.js";
import { MongoIdentityService } from "../identity/index.js";
import { BrewTrashService, MongoMaterialsService, purgeTrashedBrew } from "../materials/index.js";
import { MongoPublishingService } from "../publishing/index.js";
import { MongoPortfolioReadService, PORTFOLIO_TRASH_RETENTION_MS, PortfolioTrashService, purgeTrashedPortfolio } from "./index.js";

// 시드는 검증 규칙이 요구하는 필드를 다 채우지 않는다. 이 시험이 보는 것은 휴지통 필터와 정리 범위다.
const raw = { bypassDocumentValidation: true } as const;

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB portfolio · brew trash", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let userId = "";
  let templateId = "";
  const now = new Date("2026-11-10T00:00:00Z");
  const afterRetention = new Date(now.getTime() + PORTFOLIO_TRASH_RETENTION_MS + 1);

  beforeAll(async () => {
    fixture = await createMongoFixture("portfolio-trash");
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `trash-${randomUUID()}@example.com`, displayName: "Trash", password: "correct-horse-battery" })).user.id;
    templateId = randomUUID();
    await mongoCollections(fixture.resource.db).templates.insertOne({ _id: templateId, code: `t-${templateId.slice(0, 8)}`, name: "시험", toneTags: [], supportedSections: [], planRequired: "free", description: "", rendererVersion: 1, style: {}, industries: [], isActive: true });
  });
  afterAll(async () => fixture?.dispose());

  async function seedBrew(status: "draft" | "generating" | "done" = "done", freeTitle = "범용") {
    const brewId = randomUUID();
    await mongoCollections(fixture.resource.db).brews.insertOne({ _id: brewId, userId, jobAnalysisId: randomUUID(), freeTitle, mode: "solo", lengthPreset: "single", status, createdAt: now, updatedAt: now });
    return brewId;
  }

  async function seedPortfolio(title: string, extra: { status?: "draft" | "published"; publicSlug?: string } = {}) {
    const portfolioId = randomUUID();
    const brewId = await seedBrew();
    await mongoCollections(fixture.resource.db).portfolios.insertOne({ _id: portfolioId, userId, brewId, templateId, title, status: extra.status ?? "draft", publicSlug: extra.publicSlug ?? null, createdAt: now, updatedAt: now, styleOverrides: {} });
    return { portfolioId, brewId };
  }

  it("옮긴 포트폴리오는 목록 · 상세 · 홈 · 검색 · 공개 주소 · 배포에서 빠지고, 되살리면 목록에 돌아온다", async () => {
    const db = mongoCollections(fixture.resource.db);
    const slug = `trash-${randomUUID().slice(0, 8)}`;
    const { portfolioId } = await seedPortfolio("휴지통 시험 포트폴리오", { status: "published", publicSlug: slug });
    const deploymentId = randomUUID();
    await db.deployments.insertOne({ _id: deploymentId, userId, portfolioId, version: 1, subdomain: slug, seoIndexable: false, contactVisibility: "hidden", publishedAt: now, hasUnpublishedChanges: false, snapshot: {}, seo: {} }, raw);
    await db.portfolios.updateOne({ _id: portfolioId }, { $set: { currentDeploymentId: deploymentId } });
    const reads = new MongoPortfolioReadService(fixture.resource);
    const trash = new PortfolioTrashService(fixture.resource);
    const engagement = new MongoEngagementService(fixture.resource);
    const publishing = new MongoPublishingService(fixture.resource);

    await trash.trash(userId, portfolioId, now);

    const stored = await db.portfolios.findOne({ _id: portfolioId });
    expect(stored).toMatchObject({ status: "unlisted", deletedAt: now, purgeAfter: new Date(now.getTime() + PORTFOLIO_TRASH_RETENTION_MS) });
    expect((await reads.list(userId, ListPortfoliosQuerySchema.parse({}))).data.map(({ id }) => id)).not.toContain(portfolioId);
    await expect(reads.get(userId, portfolioId)).rejects.toMatchObject({ statusCode: 404 });
    expect((await engagement.home(userId)).portfolios.map(({ id }) => id)).not.toContain(portfolioId);
    expect((await engagement.search(userId, UnifiedSearchQuerySchema.parse({ q: "휴지통 시험" }))).data).toEqual([]);
    await expect(publishing.getPublic(slug)).rejects.toMatchObject({ statusCode: 404 });
    await expect(publishing.publish(userId, portfolioId, PublishPortfolioSchema.parse({ slug }))).rejects.toMatchObject({ statusCode: 404 });
    expect((await trash.list(userId, now)).data).toEqual([expect.objectContaining({ id: portfolioId, status: "unlisted" })]);
    await expect(trash.trash(userId, portfolioId, now)).rejects.toMatchObject({ statusCode: 404 });

    await trash.restore(userId, portfolioId, now);

    expect((await reads.list(userId, ListPortfoliosQuerySchema.parse({}))).data.map(({ id }) => id)).toContain(portfolioId);
    // 되살려도 공개는 다시 켜지 않는다.
    expect((await db.portfolios.findOne({ _id: portfolioId }))?.status).toBe("unlisted");
    expect((await trash.list(userId, now)).data).toEqual([]);
  });

  it("보관 기간이 지나면 되살릴 수 없다", async () => {
    const { portfolioId } = await seedPortfolio("기한 지난 포트폴리오");
    const trash = new PortfolioTrashService(fixture.resource);
    await trash.trash(userId, portfolioId, now);
    await expect(trash.restore(userId, portfolioId, afterRetention)).rejects.toMatchObject({ statusCode: 404 });
    expect((await trash.list(userId, afterRetention)).data.map(({ id }) => id)).not.toContain(portfolioId);
  });

  it("영구 삭제는 이 포트폴리오에 딸린 문서만 지우고, 다른 포트폴리오와 크레딧 원장은 남긴다", async () => {
    const db = fixture.resource.db;
    const target = await seedPortfolio("지울 포트폴리오");
    const other = await seedPortfolio("남길 포트폴리오");
    const seed = async (portfolioId: string) => {
      const sectionId = randomUUID(); const blockId = randomUUID(); const deploymentId = randomUUID(); const visitId = randomUUID(); const viewId = randomUUID(); const jobId = randomUUID();
      await db.collection("portfolio_sections").insertOne({ _id: sectionId as never, userId, portfolioId }, raw);
      await db.collection("blocks").insertOne({ _id: blockId as never, userId, portfolioSectionId: sectionId }, raw);
      await db.collection("record_usages").insertOne({ _id: randomUUID() as never, userId, recordId: randomUUID(), blockId }, raw);
      await db.collection("deployments").insertOne({ _id: deploymentId as never, userId, portfolioId }, raw);
      await db.collection("visit_events").insertOne({ _id: visitId as never, userId, deploymentId }, raw);
      await db.collection("section_views").insertOne({ _id: randomUUID() as never, userId, visitEventId: visitId, portfolioSectionId: sectionId }, raw);
      await db.collection("metrics_daily").insertOne({ _id: randomUUID() as never, userId, deploymentId, metricKey: "visits", date: "2026-11-09", value: 1 }, raw);
      await db.collection("dashboard_views").insertOne({ _id: viewId as never, userId, portfolioId }, raw);
      await db.collection("widgets").insertOne({ _id: randomUUID() as never, userId, dashboardViewId: viewId }, raw);
      await db.collection("generated_pages").insertOne({ _id: randomUUID() as never, userId, portfolioId, generationJobId: jobId }, raw);
      await db.collection("generation_jobs").insertOne({ _id: jobId as never, userId, portfolioId }, raw);
      await db.collection("generation_usage_ledger").insertOne({ _id: randomUUID() as never, userId, generationJobId: jobId }, raw);
      return { sectionId, blockId, deploymentId, visitId, viewId, jobId };
    };
    const mine = await seed(target.portfolioId);
    const theirs = await seed(other.portfolioId);
    await new PortfolioTrashService(fixture.resource).trash(userId, target.portfolioId, now);

    await expect(purgeTrashedPortfolio(fixture.resource, userId, target.portfolioId, now)).rejects.toMatchObject({ statusCode: 404 });
    expect(await purgeTrashedPortfolio(fixture.resource, userId, target.portfolioId, afterRetention)).toBeGreaterThan(10);

    const count = (collection: string, filter: Record<string, unknown>) => db.collection(collection).countDocuments({ userId, ...filter });
    expect(await count("portfolios", { _id: target.portfolioId })).toBe(0);
    for (const [collection, filter] of [
      ["portfolio_sections", { _id: mine.sectionId }], ["blocks", { _id: mine.blockId }], ["record_usages", { blockId: mine.blockId }],
      ["deployments", { _id: mine.deploymentId }], ["visit_events", { _id: mine.visitId }], ["section_views", { visitEventId: mine.visitId }],
      ["metrics_daily", { deploymentId: mine.deploymentId }], ["dashboard_views", { _id: mine.viewId }], ["widgets", { dashboardViewId: mine.viewId }],
      ["generated_pages", { portfolioId: target.portfolioId }],
    ] as const) expect(await count(collection, filter), collection).toBe(0);
    // 쓴 크레딧 기록은 남는다.
    expect(await count("generation_jobs", { _id: mine.jobId })).toBe(1);
    expect(await count("generation_usage_ledger", { generationJobId: mine.jobId })).toBe(1);
    // 다른 포트폴리오는 그대로다.
    expect(await count("portfolios", { _id: other.portfolioId })).toBe(1);
    for (const [collection, filter] of [
      ["portfolio_sections", { _id: theirs.sectionId }], ["blocks", { _id: theirs.blockId }], ["record_usages", { blockId: theirs.blockId }],
      ["visit_events", { _id: theirs.visitId }], ["widgets", { dashboardViewId: theirs.viewId }], ["generated_pages", { portfolioId: other.portfolioId }],
    ] as const) expect(await count(collection, filter), collection).toBe(1);
  });

  it("만들던 포트폴리오는 생성 중이면 옮기지 않고, 옮기면 홈 · 제작 API에서 빠지며 되살릴 수 있다", async () => {
    const trash = new BrewTrashService(fixture.resource);
    const engagement = new MongoEngagementService(fixture.resource);
    const materials = new MongoMaterialsService(fixture.resource);
    const generating = await seedBrew("generating", "생성 중 제작");
    await expect(trash.trash(userId, generating, now)).rejects.toMatchObject({ statusCode: 409 });

    const draft = await seedBrew("draft", "만들던 제작");
    expect((await engagement.home(userId)).activeBrews.map(({ id }) => id)).toContain(draft);
    await trash.trash(userId, draft, now);
    expect((await engagement.home(userId)).activeBrews.map(({ id }) => id)).not.toContain(draft);
    await expect(materials.getState(userId, draft)).rejects.toMatchObject({ statusCode: 404 });
    expect((await trash.list(userId, now)).data).toEqual([expect.objectContaining({ id: draft, title: "만들던 제작", status: "draft" })]);

    await trash.restore(userId, draft, now);
    expect((await engagement.home(userId)).activeBrews.map(({ id }) => id)).toContain(draft);
  });

  it("제작 영구 삭제는 포트폴리오가 남아 있으면 건너뛰고, 없으면 질문 · 레시피와 함께 지운다", async () => {
    const db = fixture.resource.db;
    const trash = new BrewTrashService(fixture.resource);
    const { brewId: quoted } = await seedPortfolio("제작이 남아야 하는 포트폴리오");
    await mongoCollections(db).brews.updateOne({ _id: quoted }, { $set: { status: "draft" } });
    await trash.trash(userId, quoted, now);
    await expect(purgeTrashedBrew(fixture.resource, userId, quoted, afterRetention)).rejects.toMatchObject({ statusCode: 409 });

    const lonely = await seedBrew("draft");
    const sessionId = randomUUID(); const questionId = randomUUID(); const recipeId = randomUUID();
    await db.collection("interview_sessions").insertOne({ _id: sessionId as never, userId, brewId: lonely }, raw);
    await db.collection("questions").insertOne({ _id: questionId as never, userId, interviewSessionId: sessionId }, raw);
    await db.collection("answers").insertOne({ _id: randomUUID() as never, userId, questionId }, raw);
    await db.collection("recipes").insertOne({ _id: recipeId as never, userId, brewId: lonely }, raw);
    await db.collection("recipe_sections").insertOne({ _id: randomUUID() as never, userId, recipeId }, raw);
    await trash.trash(userId, lonely, now);
    await purgeTrashedBrew(fixture.resource, userId, lonely, afterRetention);
    for (const [collection, filter] of [
      ["brews", { _id: lonely }], ["interview_sessions", { brewId: lonely }], ["questions", { interviewSessionId: sessionId }],
      ["answers", { questionId }], ["recipes", { brewId: lonely }], ["recipe_sections", { recipeId }],
    ] as const) expect(await db.collection(collection).countDocuments({ userId, ...filter }), collection).toBe(0);
  });
});
