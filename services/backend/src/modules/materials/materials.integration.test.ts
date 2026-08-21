import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/mysql.js";

import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/service.js";
import { MaterialsService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  databaseUrl: databaseUrl ?? "mysql://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-materials-test",
};

interface IdRow { id: string }

describeWithDatabase("brew materials integration", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const identityService = new IdentityService(sql);
  const materialsService = new MaterialsService(sql);
  const app = buildApi({ config, identityService, materialsService });
  const marker = randomUUID();
  const source = "TypeScript PostgreSQL backend reliability를 담당합니다.";
  let userId = "";
  let otherUserId = "";
  let token = "";
  let otherToken = "";
  let companyId = "";
  /** template은 사용자에 매달리지 않는다 — 지우지 않으면 03 후보 목록에 남는다. */
  let templateId = "";
  let postingId = "";
  let analysisId = "";
  let draftRecordId = "";

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    const categoryId = (await sql<IdRow[]>`
      select id from category where key = 'experience' and is_system
    `)[0]?.id;
    if (!planId || !categoryId) throw new Error("materials seed data missing");
    const users = await sql<IdRow[]>`
      insert into \`user\` (email, display_name, plan_id)
      values
        (${`materials-a-${marker}@example.com`}, 'Materials A', ${planId}),
        (${`materials-b-${marker}@example.com`}, 'Materials B', ${planId})
      returning id
    `;
    userId = users[0]?.id ?? "";
    otherUserId = users[1]?.id ?? "";
    token = (await identityService.issueSession({ userId })).accessToken;
    otherToken = (await identityService.issueSession({ userId: otherUserId })).accessToken;
    companyId = (await sql<IdRow[]>`
      insert into company (name, dedupe_key)
      values (${`Materials ${marker}`}, ${`materials-company-${marker}`}) returning id
    `)[0]?.id ?? "";
    postingId = (await sql<IdRow[]>`
      insert into job_posting (
        company_id, source, title, description_raw, requirements, dedupe_hash
      ) values (
        ${companyId}, 'user_input', 'Backend Engineer', ${source}, '{}',
        ${`materials-posting-${marker}`}
      ) returning id
    `)[0]?.id ?? "";
    analysisId = (await sql<IdRow[]>`
      insert into job_analysis (
        user_id, job_posting_id, input_type, status, progress_stage,
        result_version, target_version, analyzed_at
      ) values (
        ${userId}, ${postingId}, 'paste', 'done', 'done', 1, 1, now(6)
      ) returning id
    `)[0]?.id ?? "";
    await sql`
      insert into job_posting_requirement (
        job_posting_id, order_no, label, kind, source_span
      ) values (
        ${postingId}, 0, 'TypeScript PostgreSQL backend reliability', 'must',
        ${sql.json({ start: 0, end: Array.from(source).length, quote: source })}
      )
    `;
    for (let index = 0; index < 12; index += 1) {
      await sql`
        insert into record (
          user_id, category_id, title, status, origin, properties, body_md
        ) values (
          ${userId}, ${categoryId}, ${`Eligible ${index.toString().padStart(2, "0")}`},
          ${index % 3 === 0 ? "verified" : "organized"}, 'manual', '{}'::jsonb,
          ${index < 3 ? "TypeScript PostgreSQL backend reliability" : "Other organized evidence"}
        )
      `;
    }
    draftRecordId = (await sql<IdRow[]>`
      insert into record (
        user_id, category_id, title, status, origin, properties, body_md
      ) values (${userId}, ${categoryId}, 'Draft', 'draft', 'manual', '{}', 'TypeScript')
      returning id
    `)[0]?.id ?? "";
    await sql`
      insert into record (
        user_id, category_id, title, status, origin, properties, body_md
      ) values (${otherUserId}, ${categoryId}, 'Other owner', 'verified', 'manual', '{}', 'TypeScript PostgreSQL')
    `;
    await app.ready();
  });

  afterAll(async () => {
    if (userId && otherUserId) {
      await sql`delete from \`user\` where id in (${userId}, ${otherUserId})`;
    }
    if (postingId) await sql`delete from job_posting where id = ${postingId}`;
    if (templateId) await sql`delete from template where id = ${templateId}`;
    if (companyId) await sql`delete from company where id = ${companyId}`;
    await app.close();
    await sql.end({ timeout: 5 });
  });

  const auth = (accessToken = token) => ({ authorization: `Bearer ${accessToken}` });

  it("auto-selects at most ten organized records and persists user selection metadata", async () => {
    const createdResponse = await app.inject({
      method: "POST",
      url: "/v1/brews",
      headers: auth(),
      payload: { jobAnalysisId: analysisId, lengthPreset: "double" },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json().data as {
      brewId: string;
      materials: Array<{
        recordId: string;
        selected: boolean;
        selectedBy: string;
        excludedReason: string | null;
        rank: number;
      }>;
    };
    expect(created.materials).toHaveLength(12);
    expect(created.materials.filter(({ selected }) => selected)).toHaveLength(10);
    expect(created.materials.filter(({ selected }) => !selected)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selectedBy: "auto", excludedReason: "AUTO_LIMIT" }),
      ]),
    );
    expect(created.materials.some(({ recordId }) => recordId === draftRecordId)).toBe(false);

    // 01b 표가 그리는 것이 다 들어 있다 — 어느 서랍, 언제 일, 어디서 온 글, 왜 이 순위.
    expect(created.materials[0]).toMatchObject({
      categoryName: expect.any(String),
      categoryIcon: expect.any(String),
      origin: expect.any(String),
      reason: expect.any(String),
    });
    expect(created).toMatchObject({ selectionLimit: 10, mode: "solo", lengthPreset: "double" });

    // Cowork는 PRO다. 자격이 없으면 서버가 막는다 — 화면만 잠그면 잠근 것이 아니다.
    const coworkResponse = await app.inject({
      method: "PATCH",
      url: `/v1/brews/${created.brewId}`,
      headers: auth(),
      payload: { mode: "collab" },
    });
    expect(coworkResponse.statusCode).toBe(403);

    const emptyResponse = await app.inject({
      method: "PUT",
      url: `/v1/brews/${created.brewId}/materials`,
      headers: auth(),
      payload: { recordIds: [] },
    });
    expect(emptyResponse.statusCode).toBe(400);
    // 매칭 순위 한가운데를 골라 본다 — rank가 고른 차례로 덮이면 여기서 드러난다.
    const picked = [created.materials[3], created.materials[7]];
    const selectedIds = picked.map((material) => material?.recordId ?? "");
    const changedResponse = await app.inject({
      method: "PUT",
      url: `/v1/brews/${created.brewId}/materials`,
      headers: auth(),
      payload: { recordIds: selectedIds },
    });
    expect(changedResponse.statusCode).toBe(200);
    const changed = changedResponse.json().data as typeof created;
    const selected = changed.materials.filter((material) => material.selected);
    expect(selected.map(({ recordId }) => recordId)).toEqual(selectedIds);
    // rank는 매칭 순위지 고른 차례가 아니다.
    expect(selected.map(({ rank }) => rank)).toEqual([3, 7]);
    expect(changed.materials.map(({ rank }) => rank)).toEqual([...Array(12).keys()]);
    expect(selected.every(({ selectedBy, excludedReason }) =>
      selectedBy === "user" && excludedReason === null)).toBe(true);
    expect(changed.materials.filter(({ selected }) => !selected).every(
      ({ excludedReason }) => excludedReason === "USER_DESELECTED",
    )).toBe(true);

    const invalidResponse = await app.inject({
      method: "PUT",
      url: `/v1/brews/${created.brewId}/materials`,
      headers: auth(),
      payload: { recordIds: [draftRecordId] },
    });
    expect(invalidResponse.statusCode).toBe(409);
    const crossUserResponse = await app.inject({
      method: "GET",
      url: `/v1/brews/${created.brewId}/materials`,
      headers: auth(otherToken),
    });
    expect(crossUserResponse.statusCode).toBe(404);

    await expect(sql`
      update brew_source set is_selected = false,
        excluded_reason = 'DIRECT_EMPTY'
      where user_id = ${userId} and brew_id = ${created.brewId}
    `).rejects.toThrow(/at least one selected source/);
    expect((await sql<{ count: number }[]>`
      select count(*) as count from brew_source
      where user_id = ${userId} and brew_id = ${created.brewId} and is_selected
    `)[0]?.count).toBe(2);

    // 03은 이 두 칸을 보고 고르기와 기다리기를 가른다.
    const fresh = await app.inject({
      method: "GET",
      url: `/v1/brews/${created.brewId}`,
      headers: auth(),
    });
    expect(fresh.json().data).toMatchObject({
      portfolioId: null,
      latestGeneration: null,
    });

    const template = (await sql<{ id: string }[]>`
      insert into template (code, name, plan_required)
      values (${`materials-${randomUUID()}`}, 'Materials Template', 'free') returning id
    `)[0];
    templateId = template?.id ?? "";
    const recipe = (await sql<{ id: string }[]>`
      insert into recipe (user_id, brew_id, version, status, completeness)
      values (${userId}, ${created.brewId}, 1, 'draft', 100) returning id
    `)[0];
    const portfolio = (await sql<{ id: string }[]>`
      insert into portfolio (user_id, brew_id, template_id, title, status)
      values (${userId}, ${created.brewId}, ${template?.id ?? ""}, 'Generated', 'draft')
      returning id
    `)[0];
    await sql`
      insert into generation_job (
        user_id, brew_id, recipe_id, template_id, status, stage, portfolio_id
      ) values (
        ${userId}, ${created.brewId}, ${recipe?.id ?? ""}, ${template?.id ?? ""},
        'done', 'done', ${portfolio?.id ?? ""}
      )
    `;

    const afterBrewing = await app.inject({
      method: "GET",
      url: `/v1/brews/${created.brewId}`,
      headers: auth(),
    });
    expect(afterBrewing.json().data).toMatchObject({
      portfolioId: portfolio?.id,
      latestGeneration: {
        status: "done",
        stage: "done",
        portfolioId: portfolio?.id,
        failureCode: null,
      },
    });
  });
});
