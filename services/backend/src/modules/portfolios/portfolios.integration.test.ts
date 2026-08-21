import { randomUUID } from "node:crypto";

import {
  ApiErrorResponseSchema,
  PortfolioDetailResponseSchema,
  PortfolioListResponseSchema,
  PortfolioRevisionsResponseSchema,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/service.js";
import { PortfolioReadService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  databaseUrl: databaseUrl ?? "postgres://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-portfolios-test",
};

interface IdRow {
  id: string;
}

describeWithDatabase("portfolio read HTTP integration", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1/unused", { max: 4 });
  const identity = new IdentityService(sql);
  const app = buildApi({
    config,
    identityService: identity,
    portfolioReadService: new PortfolioReadService(sql),
  });

  const marker = randomUUID();
  let userId = "";
  let otherUserId = "";
  let token = "";
  let otherToken = "";
  let companyId = "";
  let postingId = "";
  let draftId = "";
  let publishedId = "";
  let otherPortfolioId = "";
  let hiddenSectionId = "";

  async function seedPortfolio(
    owner: string,
    title: string,
    templateId: string,
    brewId: string,
  ) {
    const rows = await sql<IdRow[]>`
      insert into portfolio (user_id, brew_id, template_id, title)
      values (${owner}, ${brewId}, ${templateId}, ${title})
      returning id
    `;
    return rows[0]!.id;
  }

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    const templateId = (
      await sql<IdRow[]>`select id from template where is_active order by code limit 1`
    )[0]?.id;
    if (!planId || !templateId) throw new Error("portfolio read seed missing");

    const users = await sql<IdRow[]>`
      insert into "user" (email, display_name, plan_id)
      values
        (${`pf-a-${marker}@example.com`}, 'Portfolio A', ${planId}),
        (${`pf-b-${marker}@example.com`}, 'Portfolio B', ${planId})
      returning id
    `;
    userId = users[0]!.id;
    otherUserId = users[1]!.id;
    token = (await identity.issueSession({ userId })).accessToken;
    otherToken = (await identity.issueSession({ userId: otherUserId })).accessToken;

    companyId = (
      await sql<IdRow[]>`
        insert into company (name, dedupe_key)
        values (${`Portfolio ${marker}`}, ${`pf-company-${marker}`}) returning id
      `
    )[0]!.id;
    postingId = (
      await sql<IdRow[]>`
        insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash)
        values (${companyId}, 'user_input', 'Engineer', 'Body', '{}'::jsonb, ${`pf-posting-${marker}`})
        returning id
      `
    )[0]!.id;

    async function seedBrew(owner: string) {
      const analysisId = (
        await sql<IdRow[]>`
          insert into job_analysis (user_id, job_posting_id, input_type)
          values (${owner}, ${postingId}, 'paste') returning id
        `
      )[0]!.id;
      return (
        await sql<IdRow[]>`
          insert into brew (user_id, job_analysis_id, length_preset)
          values (${owner}, ${analysisId}, 'single') returning id
        `
      )[0]!.id;
    }

    const brewId = await seedBrew(userId);
    const otherBrewId = await seedBrew(otherUserId);

    draftId = await seedPortfolio(userId, "당근 지원용", templateId, brewId);
    publishedId = await seedPortfolio(userId, "토스 지원용", templateId, brewId);
    otherPortfolioId = await seedPortfolio(
      otherUserId,
      "남의 포트폴리오",
      templateId,
      otherBrewId,
    );

    // 레시피를 붙여야 섹션 제목이 나온다.
    const recipeId = (
      await sql<IdRow[]>`
        insert into recipe (user_id, brew_id, version, status, completeness)
        values (${userId}, ${brewId}, 1, 'confirmed', 1) returning id
      `
    )[0]!.id;
    const recipeSectionId = (
      await sql<IdRow[]>`
        insert into recipe_section (user_id, recipe_id, order_no, title, purpose, target_length)
        values (${userId}, ${recipeId}, 0, '핵심 역량', '역량을 보여준다', 400)
        returning id
      `
    )[0]!.id;

    const namedSectionId = (
      await sql<IdRow[]>`
        insert into portfolio_section (user_id, portfolio_id, recipe_section_id, order_no)
        values (${userId}, ${publishedId}, ${recipeSectionId}, 0)
        returning id
      `
    )[0]!.id;
    hiddenSectionId = (
      await sql<IdRow[]>`
        insert into portfolio_section (user_id, portfolio_id, order_no, visible, hidden_reason)
        values (${userId}, ${publishedId}, 1, false, '공고와 무관')
        returning id
      `
    )[0]!.id;

    await sql`
      insert into block (user_id, portfolio_section_id, kind, content, style, locked, order_no)
      values
        (${userId}, ${namedSectionId}, 'heading', ${sql.json({ text: "쌓이는 데이터를" })}, ${sql.json({ size: 34 })}, true, 0),
        (${userId}, ${namedSectionId}, 'paragraph', ${sql.json({ text: "믿을 수 있게 만듭니다" })}, ${sql.json({})}, false, 1),
        (${userId}, ${hiddenSectionId}, 'paragraph', ${sql.json({ text: "숨긴 섹션 본문" })}, ${sql.json({})}, false, 0)
    `;

    const deploymentId = (
      await sql<IdRow[]>`
        insert into deployment
          (user_id, portfolio_id, version, subdomain, published_at, has_unpublished_changes, seo_indexable, contact_visibility)
        values (${userId}, ${publishedId}, 3, ${`pf-${marker}`}, now(), true, true, 'on_request')
        returning id
      `
    )[0]!.id;
    await sql`
      update portfolio
      set current_deployment_id = ${deploymentId}, status = 'published'
      where id = ${publishedId}
    `;

    // 한 문장으로 넣으면 created_at이 같아져 정렬이 id 난수에 좌우된다.
    await sql`
      insert into revision (user_id, portfolio_id, actor, change_kind, summary, after, created_at)
      values
        (${userId}, ${publishedId}, 'user', 'edit', '자격 · 수상 섹션 숨김', ${sql.json({})}, now() - interval '22 minutes'),
        (${userId}, ${publishedId}, 'ai', 'edit', '소개 문단을 공고 문장에 맞춰 다시 씀', ${sql.json({})}, now() - interval '2 minutes')
    `;
    await sql`
      insert into portfolio_snapshot (user_id, portfolio_id, kind, snapshot)
      values (${userId}, ${publishedId}, 'initial_generation', ${sql.json({ sections: [] })})
    `;

    await app.ready();
  });

  afterAll(async () => {
    if (userId && otherUserId) {
      await sql`delete from "user" where id in (${userId}, ${otherUserId})`;
    }
    if (postingId) await sql`delete from job_posting where id = ${postingId}`;
    if (companyId) await sql`delete from company where id = ${companyId}`;
    await app.close();
    await sql.end({ timeout: 5 });
  });

  const auth = (bearer = token) => ({ authorization: `Bearer ${bearer}` });

  it("lists only the caller's portfolios, most recently edited first", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/portfolios",
      headers: auth(),
    });
    expect(response.statusCode).toBe(200);

    const result = PortfolioListResponseSchema.parse(response.json());
    expect(result.data.map((portfolio) => portfolio.title)).not.toContain(
      "남의 포트폴리오",
    );
    // 섹션과 블록을 붙인 쪽이 나중에 편집된 것으로 올라온다.
    expect(result.data[0]?.title).toBe("토스 지원용");
    expect(result.data).toHaveLength(2);

    const published = result.data[0]!;
    expect(published.status).toBe("published");
    expect(published.sectionCount).toBe(2);
    expect(published.visibleSectionCount).toBe(1);
    expect(published.blockCount).toBe(3);
    expect(published.deployment?.version).toBe(3);
    expect(published.deployment?.hasUnpublishedChanges).toBe(true);
    expect(published.deployment?.contactVisibility).toBe("on_request");

    const draft = result.data[1]!;
    expect(draft.status).toBe("draft");
    expect(draft.deployment).toBeNull();
    expect(draft.sectionCount).toBe(0);
  });

  it("filters by status and pages with a stable cursor", async () => {
    const drafts = PortfolioListResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/v1/portfolios?status=draft",
          headers: auth(),
        })
      ).json(),
    );
    expect(drafts.data).toHaveLength(1);
    expect(drafts.data[0]?.title).toBe("당근 지원용");

    const firstPage = PortfolioListResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/v1/portfolios?limit=1",
          headers: auth(),
        })
      ).json(),
    );
    expect(firstPage.page.hasNextPage).toBe(true);

    const secondPage = PortfolioListResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/v1/portfolios?limit=1&cursor=${encodeURIComponent(firstPage.page.nextCursor!)}`,
          headers: auth(),
        })
      ).json(),
    );
    expect(secondPage.page.hasNextPage).toBe(false);

    const seen = [...firstPage.data, ...secondPage.data].map((item) => item.id);
    expect(new Set(seen).size).toBe(2);
  });

  it("returns sections in order with their blocks, titles and lock state", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${publishedId}`,
      headers: auth(),
    });
    expect(response.statusCode).toBe(200);

    const portfolio = PortfolioDetailResponseSchema.parse(response.json()).data;
    expect(portfolio.sections).toHaveLength(2);

    const [first, second] = portfolio.sections;
    // 섹션 제목은 레시피가 소유한다.
    expect(first?.title).toBe("핵심 역량");
    expect(first?.orderNo).toBe(0);
    expect(first?.blocks).toHaveLength(2);
    // 블록 순서는 id가 아니라 order_no를 따른다 — 문장 순서가 곧 지면 순서다.
    expect(first?.blocks.map((block) => block.orderNo)).toEqual([0, 1]);
    expect(first?.blocks[0]?.kind).toBe("heading");
    expect(first?.blocks[0]?.content).toEqual({ text: "쌓이는 데이터를" });
    // P3 — 직접 고친 블록은 잠긴 채로 내려온다.
    expect(first?.blocks[0]?.locked).toBe(true);
    expect(first?.blocks[1]?.locked).toBe(false);

    // 레시피 연결이 없는 섹션은 제목이 null이고, 숨김 사유가 붙는다.
    expect(second?.title).toBeNull();
    expect(second?.visible).toBe(false);
    expect(second?.hiddenReason).toBe("공고와 무관");
    expect(second?.id).toBe(hiddenSectionId);

    expect(typeof portfolio.templateStyle).toBe("object");
  });

  it("hides another user's portfolio behind the same 404 as a missing one", async () => {
    const crossUser = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${otherPortfolioId}`,
      headers: auth(),
    });
    const missing = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${randomUUID()}`,
      headers: auth(),
    });

    expect(crossUser.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);

    // 응답이 갈리면 남의 포트폴리오가 존재한다는 사실이 새어 나간다.
    // requestId는 요청마다 다르므로 빼고 비교한다.
    const withoutRequestId = (payload: unknown) => {
      const { error } = ApiErrorResponseSchema.parse(payload);
      return { code: error.code, message: error.message, details: error.details };
    };
    expect(withoutRequestId(crossUser.json())).toEqual(withoutRequestId(missing.json()));
    expect(withoutRequestId(crossUser.json()).code).toBe("NOT_FOUND");

    const owner = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${otherPortfolioId}`,
      headers: auth(otherToken),
    });
    expect(owner.statusCode).toBe(200);
  });

  it("returns revisions newest first with only the latest marked current", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${publishedId}/revisions`,
      headers: auth(),
    });
    expect(response.statusCode).toBe(200);

    const result = PortfolioRevisionsResponseSchema.parse(response.json()).data;
    expect(result.revisions).toHaveLength(2);
    expect(result.revisions[0]?.summary).toBe("소개 문단을 공고 문장에 맞춰 다시 씀");
    expect(result.revisions[0]?.actor).toBe("ai");
    expect(result.revisions[0]?.isCurrent).toBe(true);
    expect(result.revisions[1]?.isCurrent).toBe(false);

    expect(result.checkpoints).toHaveLength(1);
    expect(result.checkpoints[0]?.label).toBe("AI 추출 직후");

    const byActor = PortfolioRevisionsResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/v1/portfolios/${publishedId}/revisions?actor=user`,
          headers: auth(),
        })
      ).json(),
    ).data;
    expect(byActor.revisions).toHaveLength(1);
    expect(byActor.revisions[0]?.actor).toBe("user");
  });

  it("rejects an invalid cursor and requires authentication", async () => {
    const badCursor = await app.inject({
      method: "GET",
      url: "/v1/portfolios?cursor=not-base64-json",
      headers: auth(),
    });
    expect(badCursor.statusCode).toBe(400);
    expect(ApiErrorResponseSchema.parse(badCursor.json()).error.code).toBe(
      "VALIDATION_ERROR",
    );

    const anonymous = await app.inject({ method: "GET", url: "/v1/portfolios" });
    expect(anonymous.statusCode).toBe(401);
  });
});
