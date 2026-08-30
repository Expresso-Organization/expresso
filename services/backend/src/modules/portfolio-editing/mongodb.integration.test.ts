import { randomUUID } from "node:crypto";

import { GenerationOutputSchema, type LayoutDraft } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoCareerService } from "../career/index.js";
import { MongoGenerationService } from "../generation/index.js";
import type { SentenceWriter, WriterContext } from "../generation/writer.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoLayoutService, type LayoutDesignContext, type LayoutDesigner } from "../layout/index.js";
import { MongoMaterialsService } from "../materials/index.js";
import { MongoPageService } from "../page/index.js";
import type { GeneratedPageResult, PageGenerationContext, PageGenerator } from "../page/generator.js";
import { MongoPortfolioReadService } from "../portfolios/index.js";
import { MongoRecipeService } from "../recipe/index.js";
import { MongoPortfolioEditingService } from "./service.js";

class Writer implements SentenceWriter {
  readonly usesContract = false;
  async write(context: WriterContext) {
    return GenerationOutputSchema.parse({ blocks: context.sections.flatMap((section) => section.items.map((item) => ({ recipeSectionId: section.recipeSectionId, kind: "paragraph" as const, text: item.pointText, label: null, evidencePathIds: item.sourceNumbers.map((number) => context.evidence[number - 1]?.id).filter((id): id is string => Boolean(id)) }))) });
  }
}
class Designer implements LayoutDesigner {
  async design(context: LayoutDesignContext): Promise<LayoutDraft[]> {
    return (["serif-editorial", "mono-technical", "sans-geometric"] as const).map((display) => ({
      type: { display, body: "sans-neutral" as const, scaleRatio: 1.25, measure: 60 },
      palette: { ink: "#16223A", paper: "#FFFFFF", accent: "#9A4030", muted: "#5A6473" },
      rhythm: { density: "comfortable" as const, sectionGap: 72 }, pageClassName: "font-body text-ink bg-paper break-keep",
      sectionLabelClassName: "text-step-1 font-mono tracking-widest text-accent",
      sections: context.sections.map((_, index) => ({ section: index + 1, className: "px-8 py-12", innerClassName: "grid gap-5 max-w-measure mx-auto", items: [] })),
      blockClasses: { paragraph: "text-step0 leading-relaxed text-pretty" }, rationale: display,
    }));
  }
}
class PageGeneratorStub implements PageGenerator {
  seen: PageGenerationContext[] = [];
  async generate(context: PageGenerationContext): Promise<GeneratedPageResult> {
    this.seen.push(context); const number = this.seen.length;
    return { html: `<main><h1>지면 ${number}</h1></main>`, css: "main{color:#16223a}", rationale: `${number}번째 판`, ungrounded: [], removed: [], usage: { model: "fixture", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 }, qaReport: { status: "ready", checks: [] }, manifest: { methodologyVersion: 1, model: "fixture", promptHash: "0".repeat(64), promptVersions: { page: 6, designPrinciples: 1 }, tools: [], sourceUrls: [], attempts: 1, repairCount: 0, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 } } };
  }
}

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB portfolio read, edit, layout and page", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>; let userId = ""; let portfolioId = ""; let blockId = "";
  let reader: MongoPortfolioReadService; let editor: MongoPortfolioEditingService; let layouts: MongoLayoutService; let pages: MongoPageService;
  beforeAll(async () => {
    fixture = await createMongoFixture("portfolio-surface"); const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `portfolio-${randomUUID()}@example.com`, displayName: "Portfolio", password: "correct-horse-battery" })).user.id;
    const career = new MongoCareerService(fixture.resource); const categoryId = (await career.listCategories(userId)).find(({ key }) => key === "experience")!.id;
    for (let index = 0; index < 3; index++) { const record = (await career.createRecord(userId, randomUUID(), { categoryId, title: `근거 ${index}`, properties: {}, bodyMd: `MongoDB 운영 근거 ${index + 1}건` })).record; await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: record.id }, { $set: { status: "organized" } }); }
    const brewId = (await new MongoMaterialsService(fixture.resource).createFreeBrew(userId, { title: "MongoDB 포트폴리오", brief: "운영 근거", lengthPreset: "single" })).brewId;
    const recipeId = (await new MongoRecipeService(fixture.resource).generate(userId, brewId, "portfolio-surface-recipe")).id;
    const templateId = (await mongoCollections(fixture.resource.db).templates.findOne({ isActive: true }))!._id;
    const generation = new MongoGenerationService(fixture.resource); const job = await generation.submit(userId, "portfolio-surface-generation", { recipeId, templateId });
    const status = await generation.process(job.generationJobId, new Writer(), new Designer()); portfolioId = status.portfolioId!;
    const section = await mongoCollections(fixture.resource.db).portfolioSections.findOne({ userId, portfolioId }); blockId = (await mongoCollections(fixture.resource.db).blocks.findOne({ userId, portfolioSectionId: section!._id }))!._id;
    reader = new MongoPortfolioReadService(fixture.resource); editor = new MongoPortfolioEditingService(fixture.resource); layouts = new MongoLayoutService(fixture.resource); pages = new MongoPageService(fixture.resource);
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("reads the same summary and nested blocks through cursor-safe APIs", async () => {
    const listed = await reader.list(userId, { limit: 20 }); expect(listed.data).toHaveLength(1); expect(listed.data[0]).toMatchObject({ id: portfolioId, blockCount: expect.any(Number) });
    const detail = await reader.get(userId, portfolioId); expect(detail.sections.length).toBeGreaterThan(0); expect(detail.sections.flatMap(({ blocks }) => blocks).some(({ id }) => id === blockId)).toBe(true);
    await expect(reader.list(userId, { limit: 20, cursor: "broken" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("allows only one stale-preview competitor to apply with its snapshot and revision", async () => {
    const first = await editor.preview(userId, portfolioId, blockId, { operation: "update_text", text: "첫 편집" });
    const second = await editor.preview(userId, portfolioId, blockId, { operation: "update_text", text: "둘째 편집" });
    const results = await Promise.allSettled([editor.apply(userId, first.id), editor.apply(userId, second.id)]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1); expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const db = mongoCollections(fixture.resource.db); expect(await db.revisions.countDocuments({ userId, portfolioId, blockId, changeKind: "edit" })).toBe(1);
    expect(await db.portfolioSnapshots.countDocuments({ userId, portfolioId, kind: "edit" })).toBe(1);
    const stale = results.find(({ status }) => status === "rejected"); if (stale?.status === "rejected") expect(stale.reason).toMatchObject({ statusCode: 409 });
  });

  it("updates block and section structure atomically and restores a deleted block", async () => {
    const before = await reader.get(userId, portfolioId); const section = before.sections[0]!;
    const duplicated = await editor.duplicateBlock(userId, portfolioId, section.blocks[0]!.id);
    const afterCopy = await reader.get(userId, portfolioId); const blockIds = afterCopy.sections[0]!.blocks.map(({ id }) => id);
    await editor.reorderBlocks(userId, portfolioId, section.id, [...blockIds].reverse());
    expect((await reader.get(userId, portfolioId)).sections[0]!.blocks.map(({ id }) => id)).toEqual([...blockIds].reverse());
    await editor.setSectionVisibility(userId, portfolioId, section.id, false);
    expect((await reader.get(userId, portfolioId)).sections[0]!.visible).toBe(false);
    await editor.setSectionVisibility(userId, portfolioId, section.id, true);
    const deleted = await editor.deleteBlock(userId, portfolioId, duplicated.blockId);
    expect(await mongoCollections(fixture.resource.db).blocks.findOne({ _id: duplicated.blockId })).toBeNull();
    await editor.restore(userId, portfolioId, deleted.snapshotId);
    expect(await mongoCollections(fixture.resource.db).blocks.findOne({ _id: duplicated.blockId, userId })).not.toBeNull();
  });

  it("rechecks a source record when applying a proposal", async () => {
    const db = mongoCollections(fixture.resource.db); const record = await db.careerRecords.findOne({ userId, deletedAt: null });
    const proposal = await editor.preview(userId, portfolioId, blockId, { operation: "insert_record", recordId: record!._id });
    await db.careerRecords.updateOne({ _id: record!._id }, { $set: { deletedAt: new Date(), purgeAfter: new Date(Date.now() + 86_400_000) } });
    await expect(editor.apply(userId, proposal.id)).rejects.toMatchObject({ statusCode: 404 });
    await db.careerRecords.updateOne({ _id: record!._id }, { $set: { deletedAt: null, purgeAfter: null } });
  });

  it("keeps exactly one selected layout under concurrent selection", async () => {
    const candidates = await layouts.candidates(userId, portfolioId); expect(candidates.data.candidates).toHaveLength(3);
    await Promise.all(candidates.data.candidates.map(({ id }) => layouts.select(userId, portfolioId, id)));
    const db = mongoCollections(fixture.resource.db); expect(await db.layoutSpecs.countDocuments({ userId, portfolioId, selected: true })).toBe(1);
    expect((await layouts.candidates(userId, portfolioId)).data.selectedId).toBeTruthy();
  });

  it("stores each generated page as an immutable revision with its style snapshot", async () => {
    const generator = new PageGeneratorStub(); const first = await pages.generate(userId, portfolioId, generator); const second = await pages.generate(userId, portfolioId, generator, { instruction: "더 차분하게" });
    expect(second.revision).toBe(first.revision + 1); expect(generator.seen[1]?.previous?.html).toBe(first.html);
    const history = await pages.history(userId, portfolioId); expect(history.map(({ revision }) => revision)).toEqual([second.revision, first.revision]);
    expect(history[1]?.html).toBe(first.html); expect(second.styleSpec).toEqual(generator.seen[1]?.style ?? null);
    expect(await pages.document(userId, portfolioId)).toContain("<!doctype html>");
  });
});
