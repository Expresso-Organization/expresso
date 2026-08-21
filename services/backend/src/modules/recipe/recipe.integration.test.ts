import { randomUUID } from "node:crypto";

import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import { BrewJobService } from "../brew-jobs/service.js";
import { classifyBrewJobFailure } from "../../worker/processors/brew-jobs.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/service.js";
import { RecipeService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const config: RuntimeConfig = {
  nodeEnv: "test", host: "127.0.0.1", port: 4_000, logLevel: "silent",
  databaseUrl: databaseUrl ?? "postgres://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1", outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: "expresso-recipe-test",
};
interface IdRow { id: string }

describeWithDatabase("recipe integration", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1/unused", { max: 4 });
  const identityService = new IdentityService(sql);
  const recipeService = new RecipeService(sql);
  const brewJobService = new BrewJobService(sql);
  const app = buildApi({ config, identityService, recipeService, brewJobService });

  /** 레시피 만들기 = 잡 하나. Redis 없이 같은 경로를 돌린다. */
  async function generateRecipe(idempotencyKey: string) {
    const response = await app.inject({
      method: "POST", url: `/v1/brews/${brewId}/recipes`,
      headers: { ...auth(), "idempotency-key": idempotencyKey },
    });
    if (response.statusCode !== 202) return { response, recipeId: null };
    const { jobId } = response.json().data as { jobId: string };
    const done = await brewJobService.process(
      jobId,
      { async run({ userId: owner, brewId: brew, idempotencyKey: key }) {
        return (await recipeService.generate(owner, brew, key)).id;
      } },
      classifyBrewJobFailure,
    );
    return { response, recipeId: done.resultId };
  }
  const marker = randomUUID();
  const quotes = ["PostgreSQL 운영", "TypeScript API", "장애 대응"];
  const source = quotes.join(" / ");
  let userId = "";
  let otherUserId = "";
  let token = "";
  let otherToken = "";
  let companyId = "";
  let postingId = "";
  let analysisId = "";
  let brewId = "";

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    const categoryId = (await sql<IdRow[]>`select id from category where key = 'experience' and is_system`)[0]?.id;
    if (!planId || !categoryId) throw new Error("recipe seed missing");
    const users = await sql<IdRow[]>`
      insert into "user" (email, display_name, plan_id)
      values
        (${`recipe-a-${marker}@example.com`}, 'Recipe A', ${planId}),
        (${`recipe-b-${marker}@example.com`}, 'Recipe B', ${planId})
      returning id
    `;
    userId = users[0]?.id ?? "";
    otherUserId = users[1]?.id ?? "";
    token = (await identityService.issueSession({ userId })).accessToken;
    otherToken = (await identityService.issueSession({ userId: otherUserId })).accessToken;
    companyId = (await sql<IdRow[]>`
      insert into company (name, dedupe_key) values (${`Recipe ${marker}`}, ${`recipe-company-${marker}`}) returning id
    `)[0]?.id ?? "";
    postingId = (await sql<IdRow[]>`
      insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash)
      values (${companyId}, 'user_input', 'Engineer', ${source}, '{}'::jsonb, ${`recipe-posting-${marker}`}) returning id
    `)[0]?.id ?? "";
    analysisId = (await sql<IdRow[]>`
      insert into job_analysis (user_id, job_posting_id, input_type, status, progress_stage, result_version, target_version, analyzed_at)
      values (${userId}, ${postingId}, 'paste', 'done', 'done', 1, 1, now()) returning id
    `)[0]?.id ?? "";
    let cursor = 0;
    for (const [order, quote] of quotes.entries()) {
      const utf16Start = source.indexOf(quote, cursor);
      cursor = utf16Start + quote.length;
      const start = Array.from(source.slice(0, utf16Start)).length;
      const criterion = (await sql<IdRow[]>`
        insert into job_posting_requirement (job_posting_id, order_no, label, kind, source_span)
        values (${postingId}, ${order}, ${quote}, 'must', ${sql.json({ start, end: start + Array.from(quote).length, quote })})
        returning id
      `)[0];
      await sql`
        insert into requirement_coverage (user_id, requirement_id, coverage)
        values (${userId}, ${criterion!.id}, 'missing')
      `;
    }
    const records: IdRow[] = [];
    for (let index = 0; index < 5; index += 1) {
      const record = (await sql<IdRow[]>`
        insert into record (user_id, category_id, title, status, origin, properties, body_md)
        values (${userId}, ${categoryId}, ${`Selected evidence ${index}`}, 'organized', 'manual', '{}'::jsonb, ${`Evidence body ${index}`}) returning id
      `)[0];
      if (record) records.push(record);
    }
    brewId = (await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, length_preset, status)
      values (${userId}, ${analysisId}, 'single', 'interviewing') returning id
    `)[0]?.id ?? "";
    for (const [rank, record] of records.entries()) {
      await sql`
        insert into brew_source (user_id, brew_id, record_id, rank, selected_by, score, reason_text, is_selected)
        values (${userId}, ${brewId}, ${record.id}, ${rank}, 'user', ${10 - rank}, 'selected fixture', true)
      `;
    }
    const sessionId = (await sql<IdRow[]>`
      insert into interview_session (user_id, brew_id, status, question_count)
      values (${userId}, ${brewId}, 'done', 3) returning id
    `)[0]?.id;
    const requirementId = (await sql<IdRow[]>`select id from job_posting_requirement where job_posting_id = ${postingId} order by order_no limit 1`)[0]?.id;
    if (!sessionId || !requirementId) throw new Error("recipe interview fixture missing");
    const questionId = (await sql<IdRow[]>`
      insert into question (user_id, interview_session_id, requirement_id, order_no, text, basis)
      values (${userId}, ${sessionId}, ${requirementId}, 0, '어떤 행동을 했나요?', ${sql.json({ type: 'requirement', requirementId, coverage: 'missing', evidence: quotes[0] })}) returning id
    `)[0]?.id;
    const answerRecordId = (await sql<IdRow[]>`
      insert into record (user_id, category_id, title, status, origin, properties, body_md)
      values (${userId}, ${categoryId}, 'Interview evidence', 'draft', 'interview', '{}'::jsonb, '장애 원인을 분석하고 재발을 막았습니다.') returning id
    `)[0]?.id;
    if (!questionId || !answerRecordId) throw new Error("recipe answer fixture missing");
    await sql`
      insert into answer (user_id, question_id, input_type, transcript, created_record_id)
      values (${userId}, ${questionId}, 'text', '장애 원인을 분석하고 재발을 막았습니다.', ${answerRecordId})
    `;
    await app.ready();
  });

  afterAll(async () => {
    if (userId && otherUserId) await sql`delete from "user" where id in (${userId}, ${otherUserId})`;
    if (postingId) await sql`delete from job_posting where id = ${postingId}`;
    if (companyId) await sql`delete from company where id = ${companyId}`;
    await app.close(); await sql.end({ timeout: 5 });
  });

  const auth = (value = token) => ({ authorization: `Bearer ${value}` });

  it("generates sections with at least three clickable evidence paths and explains unused sources", async () => {
    const { response, recipeId } = await generateRecipe("recipe-generate-0001");
    expect(response.statusCode).toBe(202);
    const recipe = (await app.inject({
      method: "GET", url: `/v1/recipes/${recipeId}`, headers: auth(),
    })).json().data as {
      id: string;
      sections: Array<{ items: Array<{ evidence: unknown[] }> }>;
      evidencePaths: Array<{ sourceType: string; sourceId: string; targetPath: string }>;
      unusedSources: Array<{ recordId: string; reason: string }>;
      portfolioPlan: {
        version: number;
        sections: Array<{ id: string; evidenceIds: string[] }>;
        claims: Array<{ evidenceIds: string[] }>;
      };
      planningManifest: {
        methodologyVersion: number;
        promptVersion: number;
        usage: unknown;
        sourceCounts: { records: number; requirements: number; answers: number };
      };
    };
    expect(recipe.sections).toHaveLength(3);
    expect(recipe.sections.every(({ items }) => items.length > 0)).toBe(true);
    expect(recipe.sections.flatMap(({ items }) => items).every(({ evidence }) => evidence.length > 0)).toBe(true);
    expect(recipe.evidencePaths.length).toBeGreaterThanOrEqual(3);
    expect(recipe.evidencePaths.map(({ sourceType }) => sourceType)).toEqual(
      expect.arrayContaining(["record", "requirement", "answer"]),
    );
    expect(recipe.evidencePaths.every(({ sourceId, targetPath }) => sourceId && targetPath)).toBe(true);
    expect(recipe.unusedSources).toHaveLength(3);
    expect(recipe.unusedSources.every(({ reason }) => reason.length > 0)).toBe(true);
    expect(recipe.portfolioPlan.version).toBe(1);
    expect(recipe.portfolioPlan.sections).toHaveLength(recipe.sections.length);
    expect(recipe.portfolioPlan.sections.every(({ evidenceIds }) => evidenceIds.length > 0)).toBe(true);
    expect(recipe.portfolioPlan.claims.every(({ evidenceIds }) => evidenceIds.length > 0)).toBe(true);
    expect(recipe.planningManifest).toMatchObject({
      methodologyVersion: 1,
      promptVersion: 0,
      usage: null,
      sourceCounts: { records: 5, requirements: 3, answers: 1 },
    });
    expect((await app.inject({ method: "GET", url: `/v1/recipes/${recipe.id}`, headers: auth(otherToken) })).statusCode).toBe(404);
  });

  it("returns diffs, locks user edits, restores an item, and retains only 50 revisions", async () => {
    const recipe = (await recipeService.generate(userId, brewId, "recipe-generate-0001")) as {
      id: string;
      sections: Array<{ id: string; title: string; items: Array<{ id: string; pointText: string }> }>;
      evidencePaths: Array<{ id: string }>;
    };
    const item = recipe.sections[0]!.items[0]!;
    const originalText = item.pointText;
    const update = await recipeService.edit(userId, recipe.id, {
      operation: "update_item", itemId: item.id, pointText: "사용자가 고친 핵심 요점",
    });
    expect(update.diff[0]).toMatchObject({ before: originalText, after: "사용자가 고친 핵심 요점" });
    expect(update.recipe.sections.flatMap(({ items }) => items).find(({ id }) => id === item.id))
      .toMatchObject({ locked: true, editedBy: "user" });
    await recipeService.restoreItem(userId, recipe.id, update.revisionId, item.id);
    expect((await recipeService.getRecipe(userId, recipe.id)).sections
      .flatMap(({ items }) => items).find(({ id }) => id === item.id)?.pointText).toBe(originalText);

    const moved = await recipeService.edit(userId, recipe.id, {
      operation: "move_section", sectionId: recipe.sections[0]!.id, toOrder: 2,
    });
    expect(moved.diff[0]?.path).toBe("sections.order");
    const instructed = await recipeService.edit(userId, recipe.id, {
      operation: "instruction", instruction: "section 1 title: Evidence First",
    });
    expect(instructed.recipe.sections[0]?.title).toBe("Evidence First");
    await expect(recipeService.edit(userId, recipe.id, {
      operation: "instruction", instruction: "좀 더 멋지게",
    })).rejects.toMatchObject({ statusCode: 409 });

    const addedSection = await recipeService.edit(userId, recipe.id, {
      operation: "add_section", title: "추가 섹션", purpose: "추가 근거 정리",
    });
    const newSection = addedSection.recipe.sections.find(({ title }) => title === "추가 섹션");
    if (!newSection) throw new Error("added section missing");
    const addedItem = await recipeService.edit(userId, recipe.id, {
      operation: "add_item", sectionId: newSection.id,
      pointText: "추가 근거 요점", sourcePathId: recipe.evidencePaths[0]!.id,
    });
    const newItem = addedItem.recipe.sections.find(({ id }) => id === newSection.id)?.items[0];
    if (!newItem) throw new Error("added item missing");
    await recipeService.edit(userId, recipe.id, { operation: "delete_item", itemId: newItem.id });
    await recipeService.edit(userId, recipe.id, { operation: "delete_section", sectionId: newSection.id });

    const current = await recipeService.getRecipe(userId, recipe.id);
    const movableSection = current.sections.find(({ items }) => items.length > 1);
    if (!movableSection) throw new Error("movable items missing");
    await recipeService.edit(userId, recipe.id, {
      operation: "move_item", itemId: movableSection.items[0]!.id, toOrder: 1,
    });
    for (let index = 0; index < 52; index += 1) {
      await recipeService.edit(userId, recipe.id, {
        operation: "update_item", itemId: item.id, pointText: `revision ${index}`,
      });
    }
    expect((await sql<{ count: number }[]>`
      select count(*)::integer as count from recipe_revision
      where user_id = ${userId} and recipe_id = ${recipe.id}
    `)[0]?.count).toBe(50);
  }, 30_000);
});
