import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoCareerService } from "../career/index.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoAccountLifecycleService } from "./service.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB account lifecycle", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: MongoAccountLifecycleService;
  const graphs: Array<{ userId: string; portfolioId: string; deploymentId: string; assetId: string }> = [];

  async function graph(label: string) {
    const db = mongoCollections(fixture.resource.db); const identity = new MongoIdentityService(fixture.resource);
    const userId = (await identity.signup({ email: `${label}-${randomUUID()}@example.com`, displayName: label, password: "correct-horse-battery" })).user.id;
    const career = new MongoCareerService(fixture.resource); const categoryId = (await career.listCategories(userId)).find(({ key }) => key === "experience")!.id;
    await career.createRecord(userId, randomUUID(), { categoryId, title: `${label} record`, properties: {}, bodyMd: "exported body" });
    const portfolioId = randomUUID(); const deploymentId = randomUUID(); const assetId = randomUUID(); const now = new Date("2026-08-09T00:00:00Z");
    await db.portfolios.insertOne({ _id: portfolioId, userId, brewId: randomUUID(), templateId: randomUUID(), currentDeploymentId: deploymentId, title: `${label} portfolio`, status: "published", createdAt: now, updatedAt: now, styleOverrides: {} });
    await db.deployments.insertOne({ _id: deploymentId, userId, portfolioId, version: 1, subdomain: `${label}-${randomUUID().slice(0, 8)}`, seoIndexable: false, contactVisibility: "hidden", publishedAt: now, hasUnpublishedChanges: false, snapshot: { kind: "inline", value: { sections: [] } }, seo: {} });
    await db.exportAssets.insertOne({ _id: assetId, userId, portfolioId, kind: "resume_file", fileUrl: `${label}/resume.pdf`, pageFormat: null, downloadCount: 0, version: 1, accessNonce: randomUUID(), revokedAt: null, createdAt: now });
    await db.analyticsEventReceipts.insertOne({ _id: randomUUID(), userId, deploymentId, eventType: "visit", visitorHash: "b".repeat(64), payloadHash: "c".repeat(64), payloadBytes: 100, occurredAt: now, receivedAt: now });
    graphs.push({ userId, portfolioId, deploymentId, assetId }); return graphs.at(-1)!;
  }

  beforeAll(async () => { fixture = await createMongoFixture("accountlifecycle"); service = new MongoAccountLifecycleService(fixture.resource); });
  afterAll(async () => fixture?.dispose());

  it("exports owned documents using the existing versioned contract", async () => {
    const item = await graph("export"); const exported = await service.exportData(item.userId, new Date("2026-08-09T00:00:00Z"));
    expect(exported).toMatchObject({ schemaVersion: 1, account: { id: item.userId }, career: { records: [{ title: "export record", body_md: "exported body" }] }, publishing: { portfolios: [{ id: item.portfolioId }], deployments: [{ id: item.deploymentId }], assets: [{ id: item.assetId }] } });
    expect(JSON.parse(JSON.stringify(exported))).toEqual(exported);
  });

  it("revokes immediately and restores only during the grace period", async () => {
    const item = await graph("cancel"); const requested = await service.requestDeletion(item.userId, new Date("2026-08-09T01:00:00Z"));
    expect(requested).toMatchObject({ status: "pending", purgeAfter: "2026-09-08T01:00:00.000Z" });
    expect(await mongoCollections(fixture.resource.db).portfolios.findOne({ _id: item.portfolioId })).toMatchObject({ status: "unlisted" });
    expect(await mongoCollections(fixture.resource.db).exportAssets.findOne({ _id: item.assetId })).toMatchObject({ revokedAt: expect.any(Date) });
    await service.cancelDeletion(requested.cancellationToken!, new Date("2026-08-10T01:00:00Z"));
    expect(await mongoCollections(fixture.resource.db).portfolios.findOne({ _id: item.portfolioId })).toMatchObject({ status: "published" });
    expect((await mongoCollections(fixture.resource.db).exportAssets.findOne({ _id: item.assetId }))?.revokedAt).toBeNull();
  });

  it("retains through day 29 and resumes staged purge without touching shared jobs", async () => {
    const item = await graph("purge"); const db = mongoCollections(fixture.resource.db); const companyId = randomUUID();
    await db.companies.insertOne({ _id: companyId, name: "Shared", dedupeKey: `shared-${randomUUID()}`, brandColors: [] });
    const requested = await service.requestDeletion(item.userId, new Date("2026-08-09T00:00:00Z"));
    await expect(service.purgeExpired(new Date("2026-09-07T23:59:59Z"))).resolves.toEqual({ purged: [] }); expect(await db.users.countDocuments({ _id: item.userId })).toBe(1);
    await expect(service.cancelDeletion(requested.cancellationToken!, new Date("2026-09-08T00:00:00Z"))).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.purgeExpired(new Date("2026-09-08T00:00:00Z"))).resolves.toEqual({ purged: [requested.requestId] });
    expect(await db.users.countDocuments({ _id: item.userId })).toBe(0); expect(await db.companies.countDocuments({ _id: companyId })).toBe(1);
    expect(await db.analyticsEventReceipts.countDocuments({ userId: item.userId })).toBe(0); expect(await db.snapshotChunks.countDocuments({ userId: item.userId })).toBe(0);
    expect(await db.accountDeletionEvents.find({ requestId: requested.requestId }).sort({ occurredAt: 1 }).toArray()).toHaveLength(5);
    expect(await db.accountDeletionRequests.findOne({ _id: requested.requestId })).toMatchObject({ status: "purged", userId: null, phase: "complete" });
  });
});
