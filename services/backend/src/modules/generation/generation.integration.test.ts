import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/mysql.js";
import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LayoutDraft } from "@expresso/contracts";
import { LayoutService } from "../layout/service.js";
import type { LayoutDesignContext, LayoutDesigner } from "../layout/designer.js";
import { GenerationService } from "./service.js";
import { GenerationOutputSchema } from "@expresso/contracts";
import type { SentenceWriter, WriterContext } from "./writer.js";
import type { GeneratedPageResult, PageGenerationContext, PageGenerator } from "../page/generator.js";
import { PageService } from "../page/service.js";
import { createGenerationProcessor } from "../../worker/processors/generation.js";
import { MongoGenerationService } from "./mongo-service.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoCareerService } from "../career/index.js";
import { MongoMaterialsService } from "../materials/index.js";
import { MongoRecipeService } from "../recipe/index.js";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB generation integration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: MongoGenerationService;
  let userId = "";
  let recipeId = "";
  let templateId = "";

  beforeAll(async () => {
    fixture = await createMongoFixture("generation");
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `generation-${randomUUID()}@example.com`, displayName: "Generation", password: "correct-horse-battery" })).user.id;
    const career = new MongoCareerService(fixture.resource);
    const categoryId = (await career.listCategories(userId)).find(({ key }) => key === "experience")!.id;
    for (let index = 0; index < 3; index++) {
      const record = (await career.createRecord(userId, randomUUID(), { categoryId, title: `Grounded ${index}`, properties: {}, bodyMd: `MongoDB 운영 근거 ${index + 1}건` })).record;
      await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: record.id }, { $set: { status: "organized" } });
    }
    const brewId = (await new MongoMaterialsService(fixture.resource).createFreeBrew(userId, { title: "Generated portfolio", brief: "MongoDB 운영 근거", lengthPreset: "single" })).brewId;
    recipeId = (await new MongoRecipeService(fixture.resource).generate(userId, brewId, "mongo-generation-recipe")).id;
    templateId = (await mongoCollections(fixture.resource.db).templates.findOne({ isActive: true }))!._id;
    service = new MongoGenerationService(fixture.resource);
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("converges concurrent submissions and workers to one materialization and charge", async () => {
    const submissions = await Promise.all(Array.from({ length: 20 }, () => service.submit(userId, "mongo-generation-submit", { recipeId, templateId })));
    expect(new Set(submissions.map(({ generationJobId }) => generationJobId)).size).toBe(1);
    const jobId = submissions[0]!.generationJobId;
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => service.process(jobId, new StubSentenceWriter())));
    expect(results.some(({ status }) => status === "fulfilled")).toBe(true);
    expect(await service.getStatus(userId, jobId)).toMatchObject({ status: "done", usageCharged: true, portfolioId: expect.any(String) });
    const db = mongoCollections(fixture.resource.db);
    expect(await db.generationUsageLedger.countDocuments({ userId, generationJobId: jobId, reason: "success" })).toBe(1);
    expect((await db.usageCounters.findOne({ userId }))?.used).toBe(1);
    expect(await db.portfolios.countDocuments({ userId })).toBe(1);
    expect(await db.generationSentenceEvidence.countDocuments({ userId, generationJobId: jobId })).toBeGreaterThan(0);
    expect(await db.portfolioSnapshots.countDocuments({ userId })).toBe(1);
  }, 30_000);

  it("rejects ungrounded output and marks provider failures without charging", async () => {
    const invalid = await service.submit(userId, "mongo-generation-invalid", { recipeId, templateId });
    await expect(service.process(invalid.generationJobId, { usesContract: false, async write(context) { return { blocks: [{ recipeSectionId: context.sections[0]!.recipeSectionId, kind: "paragraph", text: "매출을 99% 높였습니다", label: null, chart: null, runs: null, items: null, evidencePathIds: [context.evidence[0]!.id] }] }; } })).rejects.toThrow(/ungrounded/);
    expect(await service.getStatus(userId, invalid.generationJobId)).toMatchObject({ status: "failed", usageCharged: false, failure: { code: "EVIDENCE_INVALID", retryable: false } });
    const failed = await service.submit(userId, "mongo-generation-provider", { recipeId, templateId });
    await expect(service.process(failed.generationJobId, { usesContract: false, async write() { throw new Error("provider down"); } })).rejects.toThrow("provider down");
    expect(await service.getStatus(userId, failed.generationJobId)).toMatchObject({ status: "failed", usageCharged: false, failure: { code: "PROVIDER_FAILED", retryable: true } });
    expect((await mongoCollections(fixture.resource.db).usageCounters.findOne({ userId }))?.used).toBe(1);
  });

  it("charges a ready free HTML page once and leaves failures uncharged", async () => {
    const submitted = await service.submit(userId, "mongo-generation-page", { recipeId, templateId });
    const prepared = await service.prepareFreeHtml(submitted.generationJobId);
    await expect(service.completeFreeHtml(submitted.generationJobId, { id: randomUUID(), portfolioId: prepared.portfolioId!, generationJobId: submitted.generationJobId, html: "<main>ready</main>", css: "", rationale: "ready", promptVersion: 1, revision: 1, qualityStatus: "failed_qa", qaReport: { status: "failed_qa", checks: [] }, generationManifest: null, styleSpec: null, createdAt: new Date().toISOString() })).rejects.toMatchObject({ statusCode: 409 });
    const page = { id: randomUUID(), portfolioId: prepared.portfolioId!, generationJobId: submitted.generationJobId, html: "<main>ready</main>", css: "", rationale: "ready", promptVersion: 1, revision: 1, qualityStatus: "ready" as const, qaReport: { status: "ready" as const, checks: [] }, generationManifest: null, styleSpec: null, createdAt: new Date().toISOString() };
    const completed = await Promise.all([service.completeFreeHtml(submitted.generationJobId, page), service.completeFreeHtml(submitted.generationJobId, page)]);
    expect(completed.every(({ status }) => status === "done")).toBe(true);
    const db = mongoCollections(fixture.resource.db);
    expect(await db.generationUsageLedger.countDocuments({ userId, generationJobId: submitted.generationJobId, reason: "success" })).toBe(1);
    const before = (await db.usageCounters.findOne({ userId }))!.used;
    const failed = await service.submit(userId, "mongo-generation-page-fail", { recipeId, templateId });
    await service.prepareFreeHtml(failed.generationJobId);
    expect(await service.failFreeHtml(failed.generationJobId, "PAGE_GENERATION_FAILED")).toMatchObject({ status: "failed", usageCharged: false });
    expect((await db.usageCounters.findOne({ userId }))!.used).toBe(before);
  });

  it("rolls materialization back when the charge boundary rejects the transaction", async () => {
    const db = mongoCollections(fixture.resource.db);
    await db.usageCounters.updateOne({ userId }, { $set: { used: 3 } });
    const submitted = await service.submit(userId, "mongo-generation-quota-fault", { recipeId, templateId });
    await expect(service.process(submitted.generationJobId, new StubSentenceWriter())).rejects.toMatchObject({ statusCode: 409 });
    const status = await service.getStatus(userId, submitted.generationJobId);
    expect(status).toMatchObject({ status: "failed", usageCharged: false, portfolioId: expect.any(String) });
    const portfolioId = status.portfolioId!;
    expect(await db.portfolioSections.countDocuments({ userId, portfolioId })).toBe(0);
    expect(await db.portfolioSnapshots.countDocuments({ userId, portfolioId })).toBe(0);
    expect(await db.generationUsageLedger.countDocuments({ userId, generationJobId: submitted.generationJobId })).toBe(0);
    expect((await db.usageCounters.findOne({ userId }))?.used).toBe(3);
  });
});

/**
 * 계약 없이 파이프라인만 돌리는 대역. 제품에는 이런 폴백을 두지 않는다 —
 * 아웃라인을 그대로 문단으로 옮긴 결과를 "포트폴리오"라 부를 수 없어서 걷어냈다.
 */
class StubSentenceWriter implements SentenceWriter {
  readonly usesContract = false;

  async write(context: WriterContext) {
    return GenerationOutputSchema.parse({
      blocks: context.sections.flatMap((section) =>
        section.items.map((item) => ({
          recipeSectionId: section.recipeSectionId,
          kind: "paragraph" as const,
          text: item.pointText,
          label: null,
          evidencePathIds: item.sourceNumbers
            .map((number) => context.evidence[number - 1]?.id)
            .filter((id): id is string => Boolean(id)),
        }))),
    });
  }
}

class CountingPageGenerator implements PageGenerator {
  calls = 0;
  constructor(private readonly failure: Error | null = null) {}

  async generate(_context: PageGenerationContext): Promise<GeneratedPageResult> {
    this.calls += 1;
    if (this.failure) throw this.failure;
    return {
      html: '<main class="k-page"><h1>Generated page</h1></main>',
      css: ".k-page{color:#16223a}",
      rationale: "페이지 우선 생성",
      ungrounded: [],
      removed: [],
      usage: { model: "fixture", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
      qaReport: { status: "ready", checks: [] },
      manifest: {
        methodologyVersion: 1, model: "fixture", promptHash: "0".repeat(64),
        promptVersions: { page: 6, designPrinciples: 1 }, tools: [], sourceUrls: [], attempts: 1, repairCount: 0,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
      },
    };
  }
}

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
interface IdRow { id: string }

describeWithDatabase("generation integration", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const service = new GenerationService(sql);
  const pageService = new PageService(sql);
  const marker = randomUUID();
  const quote = "PostgreSQL 운영 근거";
  let userId = ""; let companyId = ""; let postingId = "";
  let brewId = ""; let recipeId = ""; let templateId = "";
  let recordId = ""; let requirementId = "";

  /**
   * 레시피 하나를 통째로 만든다. `portfolio_section`은 `recipe_section`마다
   * 하나뿐이라(unique) 같은 레시피로 두 번 생성하면 섹션이 앞 포트폴리오에
   * 그대로 남는다. 생성을 여러 번 보는 테스트는 레시피를 따로 쓴다.
   */
  async function seedRecipe(version: number): Promise<string> {
    const id = (await sql<IdRow[]>`insert into recipe (user_id, brew_id, version, completeness) values (${userId}, ${brewId}, ${version}, 100) returning id`)[0]?.id ?? "";
    for (let index = 0; index < 3; index += 1) {
      const sectionId = (await sql<IdRow[]>`insert into recipe_section (user_id, recipe_id, order_no, title, purpose, target_length) values (${userId}, ${id}, ${index}, ${`Section ${index}`}, 'Evidence', 300) returning id`)[0]?.id;
      const itemId = sectionId && (await sql<IdRow[]>`insert into recipe_item (user_id, recipe_section_id, order_no, point_text, evidence, edited_by) values (${userId}, ${sectionId}, 0, ${index === 0 ? 'Record source' : quote}, ${sql.json([{ sourceType: index === 0 ? 'record' : 'requirement' }])}, 'ai') returning id`)[0]?.id;
      if (!itemId) throw new Error("generation item missing");
      await sql`insert into recipe_evidence_path (user_id, recipe_id, recipe_item_id, source_type, source_id, source_label, target_path) values (${userId}, ${id}, ${itemId}, ${index === 0 ? 'record' : 'requirement'}, ${index === 0 ? recordId : requirementId}, ${index === 0 ? 'Record source' : quote}, ${`sections[${index}].items[0]`})`;
    }
    return id;
  }

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    const categoryId = (await sql<IdRow[]>`select id from category where \`key\` = 'experience' and is_system`)[0]?.id;
    templateId = (await sql<IdRow[]>`select id from template where code = 'clarity'`)[0]?.id ?? "";
    if (!planId || !categoryId || !templateId) throw new Error("generation seed missing");
    userId = (await sql<IdRow[]>`insert into \`user\` (email, display_name, plan_id) values (${`generation-${marker}@example.com`}, 'Generation', ${planId}) returning id`)[0]?.id ?? "";
    companyId = (await sql<IdRow[]>`insert into company (name, dedupe_key) values (${`Generation ${marker}`}, ${`generation-company-${marker}`}) returning id`)[0]?.id ?? "";
    postingId = (await sql<IdRow[]>`insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash) values (${companyId}, 'user_input', 'Engineer', ${quote}, '{}', ${`generation-posting-${marker}`}) returning id`)[0]?.id ?? "";
    const analysisId = (await sql<IdRow[]>`insert into job_analysis (user_id, job_posting_id, input_type, status, progress_stage, result_version, target_version) values (${userId}, ${postingId}, 'paste', 'done', 'done', 1, 1) returning id`)[0]?.id;
    requirementId = (await sql<IdRow[]>`insert into job_posting_requirement (job_posting_id, order_no, label, kind, source_span) values (${postingId}, 0, ${quote}, 'must', ${sql.json({ start: 0, end: Array.from(quote).length, quote })}) returning id`)[0]?.id ?? "";
    if (requirementId) await sql`insert into requirement_coverage (user_id, requirement_id, coverage) values (${userId}, ${requirementId}, 'covered')`;
    recordId = (await sql<IdRow[]>`insert into record (user_id, category_id, title, status, origin, properties, body_md) values (${userId}, ${categoryId}, 'Record source', 'organized', 'manual', '{}', ${quote}) returning id`)[0]?.id ?? "";
    if (!analysisId || !requirementId || !recordId) throw new Error("generation domain seed missing");
    brewId = (await sql<IdRow[]>`insert into brew (user_id, job_analysis_id, length_preset, status) values (${userId}, ${analysisId}, 'single', 'recipe') returning id`)[0]?.id ?? "";
    await sql`insert into brew_source (user_id, brew_id, record_id, \`rank\`, selected_by, score, reason_text, is_selected) values (${userId}, ${brewId}, ${recordId}, 0, 'auto', 10, 'fixture', true)`;
    recipeId = await seedRecipe(1);
  });

  afterAll(async () => {
    if (userId) await sql`delete from platform_outbox where payload ->> '$.userId' = ${userId}`;
    if (userId) await sql`delete from \`user\` where id = ${userId}`;
    if (postingId) await sql`delete from job_posting where id = ${postingId}`;
    if (companyId) await sql`delete from company where id = ${companyId}`;
    await sql.end({ timeout: 5 });
  });

  it("converges 100 submissions and duplicate workers to one charge and one materialization", async () => {
    const submissions = await Promise.all(Array.from({ length: 100 }, () => service.submit(
      userId, "generation-submit-100x-0001", { recipeId, templateId },
    )));
    expect(new Set(submissions.map(({ generationJobId }) => generationJobId)).size).toBe(1);
    const jobId = submissions[0]!.generationJobId;
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      service.process(jobId, new StubSentenceWriter())));
    expect(results.every(({ status }) => status === "done")).toBe(true);
    const status = await service.getStatus(userId, jobId);
    expect(status).toMatchObject({ status: "done", stage: "done", usageCharged: true });
    expect((await sql<{ used: number }[]>`select used from usage_counter where user_id = ${userId}`)[0]?.used).toBe(1);
    expect((await sql<{ count: number }[]>`select count(*) as count from generation_usage_ledger where user_id = ${userId} and generation_job_id = ${jobId}`)[0]?.count).toBe(1);
    expect((await sql<{ count: number }[]>`select count(*) as count from generation_sentence_evidence where user_id = ${userId} and generation_job_id = ${jobId}`)[0]?.count).toBe(3);
    expect((await sql<{ count: number }[]>`select count(*) as count from record_usage where user_id = ${userId}`)[0]?.count).toBe(1);
    expect((await sql<{ count: number }[]>`select count(*) as count from portfolio_snapshot where user_id = ${userId} and portfolio_id = ${status.portfolioId}`)[0]?.count).toBe(1);
    expect((await sql<{ count: number }[]>`select count(*) as count from portfolio_section where user_id = ${userId} and portfolio_id = ${status.portfolioId}`)[0]?.count).toBe(3);
  }, 30_000);

  it("rejects ungrounded output before charging and preserves a retryable/non-retryable draft", async () => {
    const invalid = await service.submit(userId, "generation-invalid-0001", { recipeId, templateId });
    const fabricating: SentenceWriter = {
      usesContract: false,
      async write(context) {
        return { blocks: [{
          recipeSectionId: context.sections[0]!.recipeSectionId,
          kind: "paragraph", text: "매출을 99% 끌어올렸습니다", label: null, chart: null,
          runs: null, items: null,
          evidencePathIds: [context.evidence[0]!.id],
        }] };
      },
    };
    await expect(service.process(invalid.generationJobId, fabricating))
      .rejects.toThrow(/ungrounded/);
    expect(await service.getStatus(userId, invalid.generationJobId)).toMatchObject({
      status: "failed", usageCharged: false,
      portfolioId: expect.any(String), failure: { code: "EVIDENCE_INVALID", retryable: false },
    });
    const providerFailure = await service.submit(userId, "generation-provider-fail-0001", { recipeId, templateId });
    await expect(service.process(providerFailure.generationJobId, {
      usesContract: false,
      async write() { throw new Error("temporary provider failure"); },
    })).rejects.toThrow(/temporary provider failure/);
    expect(await service.getStatus(userId, providerFailure.generationJobId)).toMatchObject({
      status: "failed", usageCharged: false,
      portfolioId: expect.any(String), failure: { code: "PROVIDER_FAILED", retryable: true },
    });
    expect((await sql<{ used: number }[]>`select used from usage_counter where user_id = ${userId}`)[0]?.used).toBe(1);
  });

  it("추출 한 번이 문장과 지면 3안을 함께 남기고, 1안을 붙인다", async () => {
    const designer = new StubLayoutDesigner();
    const submitted = await service.submit(userId, "generation-layout-0001", {
      recipeId: await seedRecipe(2), templateId,
    });
    const status = await service.process(
      submitted.generationJobId,
      new StubSentenceWriter(),
      designer,
    );
    const portfolioId = status.portfolioId ?? "";

    // 지면은 섹션 UUID가 아니라 번호로 짜인다. 프롬프트에도 UUID는 없다.
    expect(designer.seen?.sections).toHaveLength(3);
    expect(designer.seen?.jobTitle).toBe("Engineer");

    const stored = await sql<{ id: string; order_no: number; prompt_version: number }[]>`
      select id, order_no, prompt_version from layout_spec
      where user_id = ${userId} and portfolio_id = ${portfolioId} order by order_no
    `;
    expect(stored).toHaveLength(3);
    expect(stored.every(({ prompt_version }) => prompt_version > 0)).toBe(true);

    const layouts = new LayoutService(sql);
    const first = await layouts.candidates(userId, portfolioId);
    expect(first.data.candidates).toHaveLength(3);
    // 고르기 전에는 1안이 붙어 있다 — 지면 없는 포트폴리오를 만들지 않는다.
    expect(first.data.selectedId).toBe(stored[0]?.id);
    expect(first.data.candidates[0]?.spec.sections).toHaveLength(3);

    const after = await layouts.select(userId, portfolioId, stored[2]!.id);
    expect(after.data.selectedId).toBe(stored[2]?.id);

    // 남의 후보는 붙지 않는다.
    await expect(layouts.select(userId, portfolioId, randomUUID())).rejects.toThrow(/not found/);
  }, 30_000);

  it("지면 생성이 실패해도 문장은 남는다", async () => {
    const submitted = await service.submit(userId, "generation-layout-fail-0001", {
      recipeId: await seedRecipe(3), templateId,
    });
    const status = await service.process(
      submitted.generationJobId,
      new StubSentenceWriter(),
      { async design() { throw new Error("layout provider is down"); } },
    );

    expect(status).toMatchObject({ status: "done", usageCharged: true });
    const count = (await sql<{ count: number }[]>`
      select count(*) as count from layout_spec
      where user_id = ${userId} and portfolio_id = ${status.portfolioId}
    `)[0]?.count;
    expect(count).toBe(0);
    // 지면이 없어도 블록은 그대로다. 화면은 기본 배치로 그린다.
    expect((await sql<{ count: number }[]>`
      select count(*) as count from block
      join portfolio_section on portfolio_section.id = block.portfolio_section_id
      where block.user_id = ${userId} and portfolio_section.portfolio_id = ${status.portfolioId}
    `)[0]?.count).toBe(3);
  }, 30_000);

  it("free HTML 판 저장 뒤에만 완료·차감하고 재전달은 다시 생성하지 않는다", async () => {
    // 기존 블록 경로의 역사 테스트와 quota를 분리한다.
    const proPlan = (await sql<IdRow[]>`select id from plan where code = 'pro'`)[0]?.id;
    if (!proPlan) throw new Error("pro plan seed missing");
    await sql`update \`user\` set plan_id = ${proPlan} where id = ${userId}`;
    const generator = new CountingPageGenerator();
    const submitted = await service.submit(userId, "generation-free-html-0001", {
      recipeId: await seedRecipe(4), templateId,
    });
    const processor = createGenerationProcessor(
      service,
      new StubSentenceWriter(),
      null,
      { service: pageService, generator },
    );
    const job = { data: { generationJobId: submitted.generationJobId, userId } } as never;
    const first = await processor(job);
    expect(first).toMatchObject({ status: "done", usageCharged: true, portfolioId: expect.any(String) });
    const page = await pageService.forGenerationJob(userId, submitted.generationJobId);
    expect(page).toMatchObject({ generationJobId: submitted.generationJobId, qualityStatus: "ready" });
    expect(generator.calls).toBe(1);

    const usedAfterFirst = (await sql<{ used: number }[]>`
      select used from usage_counter where user_id = ${userId}
    `)[0]?.used;
    const replay = await processor(job);
    expect(replay).toMatchObject({ status: "done", usageCharged: true });
    expect(generator.calls).toBe(1);
    expect((await sql<{ used: number }[]>`select used from usage_counter where user_id = ${userId}`)[0]?.used)
      .toBe(usedAfterFirst);
  }, 30_000);

  it("free HTML 생성 실패는 done이나 quota 차감으로 바뀌지 않는다", async () => {
    const generator = new CountingPageGenerator(new Error("page provider unavailable"));
    const submitted = await service.submit(userId, "generation-free-html-failure-0001", {
      recipeId: await seedRecipe(5), templateId,
    });
    const before = (await sql<{ used: number }[]>`select used from usage_counter where user_id = ${userId}`)[0]?.used;
    const processor = createGenerationProcessor(
      service,
      new StubSentenceWriter(),
      null,
      { service: pageService, generator },
    );
    const result = await processor({ data: { generationJobId: submitted.generationJobId, userId } } as never);
    expect(result).toMatchObject({
      status: "failed", usageCharged: false,
      failure: { code: "PAGE_GENERATION_FAILED", retryable: false },
    });
    expect(generator.calls).toBe(1);
    expect((await sql<{ used: number }[]>`select used from usage_counter where user_id = ${userId}`)[0]?.used)
      .toBe(before);
  }, 30_000);
});

/** 모델 대신 쓰는 초안 생성기. 준 섹션을 전부 배치하는 3안을 낸다. */
class StubLayoutDesigner implements LayoutDesigner {
  seen: LayoutDesignContext | null = null;

  async design(context: LayoutDesignContext): Promise<LayoutDraft[]> {
    this.seen = context;
    const numbers = context.sections.map((_, index) => index + 1);
    return (["serif-editorial", "mono-technical", "sans-geometric"] as const).map((display) => ({
      type: { display, body: "sans-neutral" as const, scaleRatio: 1.25, measure: 60 },
      palette: { ink: "#16223A", paper: "#FFFFFF", accent: "#9A4030", muted: "#5A6473" },
      rhythm: { density: "comfortable" as const, sectionGap: 72 },
      pageClassName: "font-body text-ink bg-paper break-keep",
      sectionLabelClassName: "text-step-1 font-mono tracking-widest text-accent",
      sections: numbers.map((section) => ({
        section,
        className: "px-8 py-12",
        innerClassName: "grid gap-5 max-w-measure mx-auto",
        items: [],
      })),
      blockClasses: { paragraph: "text-step0 leading-relaxed text-pretty" },
      rationale: `${display}로 세운 지면입니다.`,
    }));
  }
}
