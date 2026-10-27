import { randomUUID } from "node:crypto";
import { TERMS_VERSION } from "@expresso/contracts";
import { createMysqlResource } from "../../platform/legacy-mysql.js";

import type { SqlTag } from "../../platform/legacy-mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/legacy-mysql-service.js";
import { MaterialsService } from "./legacy-mysql-service.js";
import { MongoMaterialsService } from "./service.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoCareerService } from "../career/index.js";
import { MongoBrewJobService } from "../brew-jobs/service.js";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB brew materials and jobs", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let materials: MongoMaterialsService;
  let jobs: MongoBrewJobService;
  let owner: string;
  let other: string;
  let brewId: string;
  beforeAll(async () => {
    fixture = await createMongoFixture("brew-materials");
    materials = new MongoMaterialsService(fixture.resource);
    jobs = new MongoBrewJobService(fixture.resource);
    const identity = new MongoIdentityService(fixture.resource);
    owner = (await identity.signup({ email: `brew-${randomUUID()}@example.com`, displayName: "재료", password: "correct-horse-battery" })).user.id;
    other = (await identity.signup({ email: `brew-${randomUUID()}@example.com`, displayName: "다른 사용자", password: "correct-horse-battery" })).user.id;
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("allows a free brew without records and restores its wizard state", async () => {
    const brew = await materials.createFreeBrew(owner, { title: "나의 커리어", brief: "경험 정리", lengthPreset: "single" });
    brewId = brew.brewId;
    expect(brew.materials).toEqual([]);
    expect(await materials.getState(owner, brewId)).toMatchObject({ freeTitle: "나의 커리어", posting: null, materials: { total: 0, selected: 0 }, portfolioId: null });
    await expect(materials.getMaterials(other, brewId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("ranks eligible records, allows selecting none, and enforces the maximum", async () => {
    const career = new MongoCareerService(fixture.resource);
    const categoryId = (await career.listCategories(owner))[0]!.id;
    for (let index = 0; index < 12; index++) {
      const record = (await career.createRecord(owner, randomUUID(), { categoryId, title: `TypeScript ${index}`, properties: {}, bodyMd: "개발 경험" })).record;
      await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: record.id }, { $set: { status: "organized" } });
    }
    const brew = await materials.createFreeBrew(owner, { title: "TypeScript", brief: "개발 경험", lengthPreset: "single" });
    const ids = brew.materials.map((material) => material.recordId);
    expect(brew.materials.filter((material) => material.selected)).toHaveLength(10);
    expect((await materials.updateSelection(owner, brew.brewId, [])).materials.every((material) => !material.selected)).toBe(true);
    await expect(materials.updateSelection(owner, brew.brewId, ids.slice(0, 11))).rejects.toThrow();
    const selected = await materials.updateSelection(owner, brew.brewId, [ids[5]!, ids[1]!]);
    expect(selected.materials.map((material) => material.rank)).toEqual(brew.materials.map((material) => material.rank));
    expect(selected.materials.filter((material) => material.selected)).toHaveLength(2);
    await expect(materials.updateBrew(owner, brew.brewId, { mode: "collab" })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("registers one job and outbox atomically and rejects idempotency reuse across job types", async () => {
    const results = await Promise.all([jobs.submit(owner, "interview", "brew-key-0001", { brewId }), jobs.submit(owner, "interview", "brew-key-0001", { brewId })]);
    expect(results[0]?.jobId).toBe(results[1]?.jobId);
    await expect(jobs.submit(owner, "recipe", "brew-key-0001", { brewId })).rejects.toMatchObject({ statusCode: 409 });
    await expect(jobs.submit(other, "interview", "brew-key-0001", { brewId })).rejects.toMatchObject({ statusCode: 404 });
    expect(await mongoCollections(fixture.resource.db).outboxEvents.countDocuments({ userId: owner, topic: "interview.draft" })).toBe(1);
    let calls = 0;
    const id = randomUUID();
    const runner = { async run() { calls++; return id; } };
    const classify = () => ({ code: "FAILED", retryable: true });
    expect(await jobs.process(results[0]!.jobId, runner, classify)).toMatchObject({ status: "succeeded", resultId: id });
    await jobs.process(results[0]!.jobId, runner, classify);
    expect(calls).toBe(1);
  });
});

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB 제작 이름 변경 라우트", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let app: ReturnType<typeof buildApi>;
  let accessToken: string;
  let otherToken: string;
  let brewId: string;
  const auth = (token = accessToken) => ({ authorization: `Bearer ${token}` });
  const mongoConfig: RuntimeConfig = {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 4_000,
    logLevel: "silent",
    redisUrl: "redis://127.0.0.1:1",
    outboxPollIntervalMs: 1_000,
    outboxBatchSize: 25,
    outboxMaxAttempts: 5,
    queuePrefix: "expresso-brew-title-test",
  };
  const signup = async (label: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: { email: `brew-title-${label}-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: label, termsVersion: TERMS_VERSION },
    });
    expect(response.statusCode).toBe(201);
    return response.json().data.session.accessToken as string;
  };
  const rename = async (payload: Record<string, unknown>, token = accessToken) =>
    await app.inject({ method: "PATCH", url: `/v1/brews/${brewId}`, headers: auth(token), payload });
  const state = async () =>
    (await app.inject({ method: "GET", url: `/v1/brews/${brewId}`, headers: auth() })).json().data;

  beforeAll(async () => {
    fixture = await createMongoFixture("brew-title");
    app = buildApi({ config: mongoConfig, identityService: new MongoIdentityService(fixture.resource), materialsService: new MongoMaterialsService(fixture.resource) });
    await app.ready();
    accessToken = await signup("owner");
    otherToken = await signup("other");
    const created = await app.inject({ method: "POST", url: "/v1/brews/free", headers: auth(), payload: { title: "자유 제작", brief: "경험 정리", lengthPreset: "single" } });
    expect(created.statusCode).toBe(201);
    brewId = created.json().data.brewId;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await fixture?.dispose();
  });

  it("이름을 붙이기 전에는 null이고, 붙이면 앞뒤 공백을 걷어 저장한다", async () => {
    expect(await state()).toMatchObject({ title: null, freeTitle: "자유 제작" });
    const response = await rename({ title: "  토스 지원용  " });
    expect(response.statusCode).toBe(200);
    // 자유 제작 표식은 그대로 둔다 — 이것이 바뀌면 레시피가 다르게 짜인다.
    expect(await state()).toMatchObject({ title: "토스 지원용", freeTitle: "자유 제작" });
  });

  it("이름만 보내면 제작 모드는 그대로다", async () => {
    const before = (await app.inject({ method: "GET", url: `/v1/brews/${brewId}/materials`, headers: auth() })).json().data;
    const response = await rename({ title: "당근 지원용" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.mode).toBe(before.mode);
    expect((await state()).title).toBe("당근 지원용");
  });

  it("빈 요청 · 빈 이름 · 300자 초과는 400이고, 남의 제작은 404다", async () => {
    expect((await rename({})).statusCode).toBe(400);
    expect((await rename({ title: "   " })).statusCode).toBe(400);
    expect((await rename({ title: "가".repeat(301) })).statusCode).toBe(400);
    expect((await rename({ title: "남의 것" }, otherToken)).statusCode).toBe(404);
    expect((await state()).title).toBe("당근 지원용");
  });
});

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
      select id from category where \`key\` = 'experience' and is_system
    `)[0]?.id;
    if (!planId || !categoryId) throw new Error("materials seed data missing");
    const users: IdRow[] = [{ id: randomUUID() }, { id: randomUUID() }];
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values
        (${users[0]!.id}, ${`materials-a-${marker}@example.com`}, 'Materials A', ${planId}),
        (${users[1]!.id}, ${`materials-b-${marker}@example.com`}, 'Materials B', ${planId})
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
          ${index % 3 === 0 ? "verified" : "organized"}, 'manual', '{}',
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

  it("starts a brew when the user has no organized records", async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!planId) throw new Error("free plan missing");
    const emptyUserId = randomUUID();
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values (${emptyUserId}, ${`materials-empty-${marker}@example.com`}, 'Materials Empty', ${planId})
    `;

    try {
      const emptyToken = (await identityService.issueSession({ userId: emptyUserId })).accessToken;
      const emptyAnalysisId = (await sql<IdRow[]>`
        insert into job_analysis (
          user_id, job_posting_id, input_type, status, progress_stage,
          result_version, target_version, analyzed_at
        ) values (
          ${emptyUserId}, ${postingId}, 'paste', 'done', 'done', 1, 1, now(6)
        ) returning id
      `)[0]?.id;

      const response = await app.inject({
        method: "POST",
        url: "/v1/brews",
        headers: auth(emptyToken),
        payload: { jobAnalysisId: emptyAnalysisId, lengthPreset: "single" },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().data).toMatchObject({ materials: [] });
    } finally {
      await sql`delete from \`user\` where id = ${emptyUserId}`;
    }
  });

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
    expect(emptyResponse.statusCode).toBe(200);
    expect(emptyResponse.json().data.materials.every(
      ({ selected }: { selected: boolean }) => !selected,
    )).toBe(true);
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

    await sql`
      update brew_source set is_selected = false,
        excluded_reason = 'DIRECT_EMPTY'
      where user_id = ${userId} and brew_id = ${created.brewId}
    `;
    expect((await sql<{ count: number }[]>`
      select count(*) as count from brew_source
      where user_id = ${userId} and brew_id = ${created.brewId} and is_selected
    `)[0]?.count).toBe(0);

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
