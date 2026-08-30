import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GenerationOutputSchema, PublishPortfolioSchema } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { LocalMediaStorage } from "../../platform/storage/local.js";
import { MongoCareerService } from "../career/index.js";
import { MongoGenerationService } from "../generation/index.js";
import type { SentenceWriter, WriterContext } from "../generation/writer.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoMaterialsService } from "../materials/index.js";
import { MongoMediaService } from "../media/index.js";
import { MongoPageService } from "../page/index.js";
import type { GeneratedPageResult, PageGenerationContext, PageGenerator } from "../page/generator.js";
import { MongoRecipeService } from "../recipe/index.js";
import { MongoPublishingService } from "./service.js";

class Writer implements SentenceWriter { readonly usesContract = false; async write(context: WriterContext) { return GenerationOutputSchema.parse({ blocks: context.sections.flatMap((section) => section.items.map((item) => ({ recipeSectionId: section.recipeSectionId, kind: "paragraph" as const, text: item.pointText, label: null, evidencePathIds: item.sourceNumbers.map((number) => context.evidence[number - 1]?.id).filter((id): id is string => Boolean(id)) }))) }); } }
class Page implements PageGenerator { async generate(_context: PageGenerationContext): Promise<GeneratedPageResult> { return { html: "<main>frozen Mongo page</main>", css: "main{color:#16223a}", rationale: "frozen", ungrounded: [], removed: [], usage: { model: "fixture", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 }, qaReport: { status: "ready", checks: [] }, manifest: { methodologyVersion: 1, model: "fixture", promptHash: "0".repeat(64), promptVersions: { page: 6, designPrinciples: 1 }, tools: [], sourceUrls: [], attempts: 1, repairCount: 0, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 } } }; } }

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB publishing, media and exports", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>; let service: MongoPublishingService; let media: MongoMediaService;
  let firstUser = ""; let secondUser = ""; let firstPortfolio = ""; let secondPortfolio = ""; let firstSection = ""; const storageRoot = mkdtempSync(join(tmpdir(), "expresso-mongo-media-"));
  async function createPortfolio(userId: string, suffix: string) {
    const career = new MongoCareerService(fixture.resource); const categoryId = (await career.listCategories(userId)).find(({ key }) => key === "experience")!.id;
    const record = (await career.createRecord(userId, randomUUID(), { categoryId, title: `${suffix} 근거`, properties: {}, bodyMd: "MongoDB 운영 3건" })).record; await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: record.id }, { $set: { status: "organized" } });
    const brewId = (await new MongoMaterialsService(fixture.resource).createFreeBrew(userId, { title: `${suffix} 포트폴리오`, brief: "MongoDB", lengthPreset: "single" })).brewId;
    const recipeId = (await new MongoRecipeService(fixture.resource).generate(userId, brewId, `${suffix}-recipe`)).id; const templateId = (await mongoCollections(fixture.resource.db).templates.findOne({ isActive: true }))!._id;
    const generation = new MongoGenerationService(fixture.resource); const submitted = await generation.submit(userId, `${suffix}-generation`, { recipeId, templateId }); const done = await generation.process(submitted.generationJobId, new Writer());
    await new MongoPageService(fixture.resource).generate(userId, done.portfolioId!, new Page()); return done.portfolioId!;
  }
  beforeAll(async () => {
    fixture = await createMongoFixture("publishing-media"); const identity = new MongoIdentityService(fixture.resource);
    firstUser = (await identity.signup({ email: `publish-a-${randomUUID()}@example.com`, displayName: "A", password: "correct-horse-battery" })).user.id; secondUser = (await identity.signup({ email: `publish-b-${randomUUID()}@example.com`, displayName: "B", password: "correct-horse-battery" })).user.id;
    const pro = await mongoCollections(fixture.resource.db).plans.findOne({ code: "pro" }); await mongoCollections(fixture.resource.db).users.updateMany({ _id: { $in: [firstUser, secondUser] } }, { $set: { planId: pro!._id } });
    firstPortfolio = await createPortfolio(firstUser, "first"); secondPortfolio = await createPortfolio(secondUser, "second"); firstSection = (await mongoCollections(fixture.resource.db).portfolioSections.findOne({ userId: firstUser, portfolioId: firstPortfolio }))!._id;
    service = new MongoPublishingService(fixture.resource, "test-signing-secret-at-least-16"); media = new MongoMediaService(fixture.resource, new LocalMediaStorage(storageRoot));
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); rmSync(storageRoot, { recursive: true, force: true }); });

  it("reserves one slug under a two-owner publication race", async () => {
    const input = PublishPortfolioSchema.parse({ slug: `mongo-race-${randomUUID().slice(0, 8)}` }); const results = await Promise.allSettled([service.publish(firstUser, firstPortfolio, input), service.publish(secondUser, secondPortfolio, input)]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1); expect(await mongoCollections(fixture.resource.db).deployments.countDocuments({ subdomain: input.slug })).toBe(1);
  });

  it("freezes versions, redirects for 30 days, rolls back and unpublishes", async () => {
    const at = new Date("2026-08-09T00:00:00Z"); const one = `mongo-one-${randomUUID().slice(0, 8)}`; const two = `mongo-two-${randomUUID().slice(0, 8)}`;
    const first = await service.publish(firstUser, firstPortfolio, PublishPortfolioSchema.parse({ slug: one }), at); const second = await service.publish(firstUser, firstPortfolio, PublishPortfolioSchema.parse({ slug: two }), at);
    expect(second.version).toBe(first.version + 1); expect(JSON.stringify(first.snapshot)).toContain("frozen Mongo page"); await expect(service.getPublic(one, new Date("2026-09-07T23:59:59Z"))).resolves.toMatchObject({ kind: "redirect", to: two }); await expect(service.getPublic(one, new Date("2026-09-08T00:00:01Z"))).rejects.toMatchObject({ statusCode: 404 });
    await service.rollback(firstUser, firstPortfolio, first.id); await expect(service.getPublic(one)).resolves.toMatchObject({ kind: "portfolio" }); await service.unpublish(firstUser, firstPortfolio); await expect(service.getPublic(one)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("commits export outbox once and invalidates expired or replaced asset links", async () => {
    const queued = await service.submitExport(firstUser, firstPortfolio, "mongo-export", { kind: "deck", pageFormat: null }); const repeated = await service.submitExport(firstUser, firstPortfolio, "mongo-export", { kind: "deck", pageFormat: null }); expect(repeated.id).toBe(queued.id);
    expect(await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({ topic: "portfolio.export", "payload.exportJobId": queued.id })).toBe(1);
    await Promise.all([service.processExport(queued.id), service.processExport(queued.id)]); const done = await service.getExport(firstUser, queued.id); expect(done).toMatchObject({ status: "done", attempts: 1, assetId: expect.any(String) });
    const link = await service.signAsset(firstUser, done.assetId!, 60, new Date("2026-08-09T00:00:00Z")); const url = new URL(link.url, "https://example.test"); await expect(service.resolveAsset(done.assetId!, Number(url.searchParams.get("version")), Number(url.searchParams.get("expires")), url.searchParams.get("signature")!, new Date("2026-08-09T00:01:01Z"))).rejects.toMatchObject({ statusCode: 403 });
    const resume = await service.replaceResume(firstUser, firstPortfolio, "resume/one.pdf"); const old = new URL((await service.signAsset(firstUser, resume.id)).url, "https://example.test"); await service.replaceResume(firstUser, firstPortfolio, "resume/two.pdf"); await expect(service.resolveAsset(resume.id, Number(old.searchParams.get("version")), Number(old.searchParams.get("expires")), old.searchParams.get("signature")!)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("deduplicates media by checksum, keeps unique widths and guards placement ownership", async () => {
    const bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 20, g: 30, b: 40 } } }).png().toBuffer(); const asset = await media.upload(firstUser, bytes); const repeated = await media.upload(firstUser, bytes); expect(repeated.id).toBe(asset.id); expect(asset.variants).toEqual([640, 1200]);
    expect((await media.read(asset.id)).bytes.equals(bytes)).toBe(true); expect(await mongoCollections(fixture.resource.db).mediaVariants.countDocuments({ userId: firstUser, mediaAssetId: asset.id })).toBe(2);
    const placed = await media.addBlock(firstUser, firstPortfolio, firstSection, { assetId: asset.id, alt: "대시보드", frame: "browser" }); expect(placed.blockId).toBeTruthy(); await expect(media.addBlock(secondUser, secondPortfolio, (await mongoCollections(fixture.resource.db).portfolioSections.findOne({ userId: secondUser, portfolioId: secondPortfolio }))!._id, { assetId: asset.id, alt: "", frame: "none" })).rejects.toMatchObject({ statusCode: 404 });
  });
});
