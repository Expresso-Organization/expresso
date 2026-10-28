import { randomUUID } from "node:crypto";

import { AnalyticsEventSchema } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { analyticsDigest } from "./mongo-events.js";
import { MongoAnalyticsService } from "./service.js";
import type { InsightContext } from "./writer.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB analytics", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: MongoAnalyticsService;
  let userId = "";
  let portfolioId = "";
  let deploymentId = "";
  let sectionId = "";
  const slug = `analytics-${randomUUID().slice(0, 8)}`;
  const date = "2026-08-09";

  function event(input: Record<string, unknown> = {}) {
    return AnalyticsEventSchema.parse({ eventId: randomUUID(), slug, sessionId: `session-${randomUUID()}`, type: "visit", occurredAt: `${date}T01:00:00.000Z`, ...input });
  }

  beforeAll(async () => {
    fixture = await createMongoFixture("analytics");
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `analytics-${randomUUID()}@example.com`, displayName: "Analytics", password: "correct-horse-battery" })).user.id;
    portfolioId = randomUUID(); deploymentId = randomUUID(); sectionId = randomUUID();
    const now = new Date("2026-08-09T00:00:00.000Z");
    const db = mongoCollections(fixture.resource.db);
    await db.portfolios.insertOne({ _id: portfolioId, userId, brewId: randomUUID(), templateId: randomUUID(), currentDeploymentId: deploymentId, publicSlug: slug, title: "Analytics", status: "published", createdAt: now, updatedAt: now, styleOverrides: {} });
    await db.deployments.insertOne({ _id: deploymentId, userId, portfolioId, version: 1, subdomain: slug, seoIndexable: false, contactVisibility: "hidden", publishedAt: now, hasUnpublishedChanges: false, snapshot: { kind: "inline", value: { sections: [{ id: sectionId }] } }, seo: {} });
    service = new MongoAnalyticsService(fixture.resource, { visitorSalt: "mongo-analytics", rateLimit: 10 });
  });
  afterAll(async () => fixture?.dispose());

  it("stores receipts atomically and rejects an event ID with a different payload", async () => {
    const visit = event({ sessionId: "privacy-session-00000001", referrer: "https://jobs.example.com/private?q=secret" });
    await expect(service.collect(visit)).resolves.toMatchObject({ accepted: true, duplicate: false });
    await expect(service.collect(visit)).resolves.toMatchObject({ accepted: true, duplicate: true });
    await expect(service.collect({ ...visit, durationMs: 10 })).rejects.toMatchObject({ statusCode: 409 });
    const db = mongoCollections(fixture.resource.db);
    expect(await db.analyticsEventReceipts.countDocuments({ _id: visit.eventId })).toBe(1);
    expect((await db.visitEvents.findOne({ eventId: visit.eventId }))?.referrer).toBe("https://jobs.example.com");
  });

  it("replaces daily aggregates while excluding owners and short section views", async () => {
    for (let index = 0; index < 5; index += 1) {
      const sessionId = `eligible-session-${index}-0001`;
      await service.collect(event({ sessionId, occurredAt: `${date}T0${index + 2}:00:00.000Z` }));
      if (index < 2) await service.collect(event({ sessionId, type: "complete", durationMs: 60_000, occurredAt: `${date}T0${index + 2}:01:00.000Z` }));
      await service.collect(event({ sessionId, type: "section_view", sectionId, dwellMs: index === 0 ? 999 : 1_200, scrollDepth: 0.8, occurredAt: `${date}T0${index + 2}:02:00.000Z` }));
    }
    const ownerSession = "owner-session-000000001";
    await service.collect(event({ sessionId: ownerSession, occurredAt: `${date}T08:00:00.000Z` }), userId);
    await service.collect(event({ sessionId: ownerSession, type: "contact_click", target: "mailto", occurredAt: `${date}T08:01:00.000Z` }), userId);
    await service.collect(event({ sessionId: "eligible-session-1-0001", type: "contact_click", target: "mailto", occurredAt: `${date}T03:03:00.000Z` }));
    const first = await service.aggregateDay(deploymentId, date);
    expect(first).toMatchObject({ visits: 6, completes: 2, contact_clicks: 1, eligible_section_views: 4, total_section_dwell_ms: 4_800 });
    expect(await service.aggregateDay(deploymentId, date)).toEqual(first);
    expect(await mongoCollections(fixture.resource.db).metricsDaily.countDocuments({ deploymentId, date })).toBe(7);
  });

  it("hashes the session with the day it arrived", async () => {
    const visit = event({ sessionId: "daily-hash-session-0001" });
    await service.collect(visit);
    const today = new Date().toISOString().slice(0, 10);
    expect((await mongoCollections(fixture.resource.db).visitEvents.findOne({ eventId: visit.eventId }))?.sessionId).toBe(analyticsDigest(`mongo-analytics:${today}:daily-hash-session-0001`));
  });

  it("follows the address to the new version and keeps the old version's visits on the dashboard", async () => {
    const db = mongoCollections(fixture.resource.db); const next = randomUUID(); const outlined = randomUUID(); const later = "2026-08-10"; const at = new Date(`${later}T00:00:00.000Z`);
    await db.deployments.insertOne({ _id: next, userId, portfolioId, version: 2, subdomain: slug, seoIndexable: false, contactVisibility: "hidden", publishedAt: at, hasUnpublishedChanges: false, snapshot: { kind: "inline", value: { sections: [], outline: [{ id: randomUUID(), title: null }, { id: outlined, title: "협업과 리드" }] } }, seo: {} });
    await db.portfolios.updateOne({ _id: portfolioId }, { $set: { currentDeploymentId: next } });
    const sessionId = "second-version-session-01";
    await service.collect(event({ sessionId, occurredAt: `${later}T01:00:00.000Z`, referrer: "https://www.linkedin.com/in/someone" }));
    await service.collect(event({ sessionId, type: "section_view", sectionId: outlined, dwellMs: 4_000, scrollDepth: 0.5, occurredAt: `${later}T01:01:00.000Z` }));
    await service.collect(event({ sessionId, type: "contact_click", target: "mailto", occurredAt: `${later}T01:02:00.000Z` }));
    // 앞 판의 섹션은 이 판의 섹션 목록에 없다.
    await expect(service.collect(event({ sessionId, type: "section_view", sectionId, dwellMs: 2_000, scrollDepth: 0.5 }))).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.visitEvents.countDocuments({ deploymentId: next })).toBe(1);
    await service.aggregateDay(next, later);

    const dashboard = await service.dashboard(userId, portfolioId, "all");
    expect(dashboard.metrics).toMatchObject({ visits: 7, contactClicks: 2 });
    expect(dashboard.trend.find((point) => point.date === later)).toMatchObject({ visits: 1, contactClicks: 1, fileDownloads: 0, linkClicks: 0 });
    expect(dashboard.sections.find((section) => section.sectionId === outlined)).toMatchObject({ title: "협업과 리드", position: 2, views: 1, dwellMs: 4_000 });
    expect(dashboard.sections.find((section) => section.sectionId === sectionId)).toMatchObject({ title: "", position: 1 });
    expect(dashboard.widgets.map(({ metricKey }) => metricKey)).not.toContain("org_domains");

    let seen: InsightContext | null = null;
    const writer = { async write(context: InsightContext) { seen = context; return { narrative: "협업과 리드에서 가장 오래 머물렀습니다.", evidenceMetrics: ["visits"], suggestions: [] }; } };
    const insight = await new MongoAnalyticsService(fixture.resource, { visitorSalt: "mongo-analytics", minimumSample: 1, writer }).insightForPortfolio(userId, portfolioId, "all");
    expect(insight).toMatchObject({ visibility: "visible", sampleSize: 7 });
    expect(seen!.sections).toContainEqual({ title: "협업과 리드", views: 1, dwellMs: 4_000 });
    expect(seen!.referrers).toContainEqual({ origin: "https://www.linkedin.com", visits: 1 });
  });

  it("admits exactly ten requests for one hot visitor", async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => service.collect(event({ sessionId: "hot-visitor-session-001" }))));
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(10);
    expect(results.filter((result) => result.status === "rejected" && (result.reason as { statusCode?: number }).statusCode === 429)).toHaveLength(10);
  });

  it("serializes concurrent dashboard creation at six views", async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => service.createDashboardView(userId, portfolioId, { name: `View ${index}`, period: "7d", isDefault: false })));
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(6);
    expect(await mongoCollections(fixture.resource.db).dashboardViews.countDocuments({ userId, portfolioId })).toBe(6);
  });
});
