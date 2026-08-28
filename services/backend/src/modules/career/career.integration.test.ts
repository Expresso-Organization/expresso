import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/mysql.js";

import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/service.js";
import { CareerError } from "./errors.js";
import { CareerService } from "./service.js";
import type { CareerApi } from "./index.js";
import { MongoCareerService } from "./mongo-service.js";
import { MongoIdentityService, type IdentityApi } from "../identity/index.js";
import { mongoCollections } from "@expresso/database";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { assertActiveRecordsForWrite, purgeTrashedCareerRecord } from "./mongo-record-guard.js";
import { inTransaction } from "../../platform/mongo-transaction.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB career editing", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: MongoCareerService;
  let userId: string;
  let otherId: string;
  let categoryId: string;
  beforeAll(async () => {
    fixture = await createMongoFixture("career-editing");
    service = new MongoCareerService(fixture.resource);
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `career-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "기록" })).user.id;
    otherId = (await identity.signup({ email: `career-${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "다른 사용자" })).user.id;
    categoryId = (await service.listCategories(userId)).find((category) => category.key === "experience")!.id;
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("scopes categories, validates properties, and replays only identical create requests", async () => {
    expect((await service.listCategories(userId)).filter((category) => category.isSystem)).toHaveLength(7);
    const input = { categoryId, title: "한국어 日本語 😀", properties: {}, bodyMd: "가".repeat(200_000) };
    const key = randomUUID();
    const created = await service.createRecord(userId, key, input);
    expect(created.created).toBe(true);
    expect(await service.createRecord(userId, key, input)).toEqual({ ...created, created: false });
    await expect(service.createRecord(userId, key, { ...input, title: "변경" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.getRecord(otherId, created.record.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.createRecord(userId, randomUUID(), { ...input, bodyMd: "a".repeat(200_001) })).rejects.toThrow();
    await expect(service.createRecord(userId, randomUUID(), { ...input, properties: { role: null } as never })).rejects.toThrow();
  });

  it("allows exactly one concurrent update at the same version", async () => {
    const { record } = await service.createRecord(userId, randomUUID(), { categoryId, title: "초기", properties: {}, bodyMd: "" });
    const results = await Promise.allSettled(["A", "B"].map((title) => service.updateRecord(userId, record.id, record.version, { title })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { statusCode: 412 } });
    expect((await service.getRecord(userId, record.id)).version).toBe(2);
    await expect(service.updateRecord(otherId, record.id, 2, { title: "침입" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("requires confirmation to remove populated properties and protects system fields", async () => {
    const category = await service.createCategory(userId, { key: `custom_${randomUUID().replaceAll("-", "")}`, name: "사용자", icon: "📁", defaultView: "table", propertySchema: { note: { type: "text", label: "메모", required: false, system: false }, fixed: { type: "text", label: "고정", required: false, system: true } } });
    const { record } = await service.createRecord(userId, randomUUID(), { categoryId: category.id, title: "", properties: { note: "남은 값" }, bodyMd: "" });
    await expect(service.listViews(otherId, category.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.updatePropertySchema(userId, category.id, 1, {}, true)).rejects.toMatchObject({ statusCode: 403 });
    const next = { fixed: category.propertySchema.fixed! };
    await expect(service.updatePropertySchema(userId, category.id, 1, next, false)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.updatePropertySchema(userId, category.id, 1, next, true)).version).toBe(2);
    expect(await service.getRecord(userId, record.id)).toMatchObject({ properties: {}, version: 2 });
    await expect(service.updatePropertySchema(userId, category.id, 1, next, true)).rejects.toMatchObject({ statusCode: 412 });
  });

  it("limits views under concurrency and rejects foreign fields", async () => {
    const input = { name: "기본", viewType: "table" as const, filters: [], sorts: [], visibleProperties: ["title"] };
    await expect(service.createView(userId, categoryId, { ...input, visibleProperties: ["$where"] })).rejects.toMatchObject({ statusCode: 400 });
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => service.createView(userId, categoryId, { ...input, name: `뷰 ${index}` })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(8);
    expect((await service.listViews(userId, categoryId))).toHaveLength(8);
    expect((await service.listViews(otherId, categoryId))).toHaveLength(0);
  });

  it("canonicalizes links, checks source spans, and replaces skill evidence atomically", async () => {
    const make = () => service.createRecord(userId, randomUUID(), { categoryId, title: "Kubernetes", properties: {}, bodyMd: "" });
    const a = (await make()).record;
    const b = (await make()).record;
    expect(await service.createLink(userId, a.id, b.id, "related")).toEqual(await service.createLink(userId, b.id, a.id, "related"));
    expect(await service.listLinks(userId, a.id)).toHaveLength(1);
    await expect(service.createLink(otherId, a.id, b.id, "parent")).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.createLink(userId, a.id, a.id, "related")).rejects.toMatchObject({ statusCode: 400 });
    const evidence = (recordId: string) => ({ recordId, span: { source: "title" as const, start: 0, end: 10, quote: "Kubernetes" } });
    const skill = await service.recomputeSkill(userId, { name: "K8s", evidence: [evidence(a.id), evidence(b.id)] });
    expect(skill).toMatchObject({ name: "kubernetes", level: 2, strength: "supported", evidenceCount: 2 });
    await expect(service.recomputeSkill(userId, { name: "K8s", evidence: [{ ...evidence(a.id), span: { ...evidence(a.id).span, quote: "invented" } }] })).rejects.toMatchObject({ statusCode: 400 });
    expect(await service.listSkillEvidence(userId, skill.id)).toHaveLength(2);
    await service.recomputeSkill(userId, { name: "K8s", evidence: [evidence(b.id)] });
    expect(await service.listSkillEvidence(userId, skill.id)).toEqual([{ recordId: b.id, recordTitle: "Kubernetes", span: evidence(b.id).span }]);
    expect((await service.getRecord(userId, a.id)).version).toBe(1);
    await expect(service.listSkillEvidence(otherId, skill.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps quoted snapshots through trash, but refuses physical purge while cited", async () => {
    const record = (await service.createRecord(userId, randomUUID(), { categoryId, title: "보존", properties: {}, bodyMd: "본문" })).record;
    const db = mongoCollections(fixture.resource.db);
    const blockId = randomUUID();
    const sectionId = randomUUID();
    await db.portfolioSections.insertOne({ _id: sectionId, userId, portfolioId: randomUUID(), orderNo: 0, visible: true });
    await db.blocks.insertOne({ _id: blockId, userId, portfolioSectionId: sectionId, kind: "paragraph", content: { text: "보존 문장" }, style: {}, sourceRecordId: record.id, syncState: "synced", locked: false, orderNo: 0 });
    await db.recordUsages.insertOne({ _id: randomUUID(), userId, recordId: record.id, blockId, quotedText: "본문", firstUsedAt: new Date() });
    expect((await service.listRecords(userId, { q: "보존", sort: "updated_desc", limit: 10 })).data[0]?.usedInCount).toBe(1);
    const at = new Date("2026-08-01T00:00:00Z");
    expect(await service.trashRecord(userId, record.id, at)).toMatchObject({ portfolioCount: 1, blockCount: 1, purgeAfter: "2026-08-31T00:00:00.000Z" });
    await expect(purgeTrashedCareerRecord(fixture.resource, userId, record.id, new Date("2026-08-31T00:00:00Z"))).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.restoreRecord(userId, record.id, new Date("2026-08-31T00:00:00Z"))).rejects.toMatchObject({ statusCode: 404 });
    await service.restoreRecord(userId, record.id, new Date("2026-08-30T23:59:59Z"));
    await service.trashRecord(userId, record.id, at);
    await db.recordUsages.deleteMany({ userId, recordId: record.id });
    await purgeTrashedCareerRecord(fixture.resource, userId, record.id, new Date("2026-08-31T00:00:00Z"));
    expect(await db.blocks.findOne({ _id: blockId })).toMatchObject({ content: { text: "보존 문장" }, sourceRecordId: null, syncState: "detached" });
    expect(await db.careerRecords.findOne({ _id: record.id })).toBeNull();
  });

  it("retries a stale reference transaction and refuses a newly trashed record", async () => {
    const record = (await service.createRecord(userId, randomUUID(), { categoryId, title: "경쟁", properties: {}, bodyMd: "" })).record;
    let release!: () => void;
    let started!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const snapshot = new Promise<void>((resolve) => { started = resolve; });
    let attempts = 0;
    const referencing = inTransaction(fixture.resource, async (tx) => {
      await mongoCollections(tx.db).careerRecords.findOne({ _id: record.id }, { session: tx.session });
      if (++attempts === 1) { started(); await barrier; }
      await assertActiveRecordsForWrite(tx, userId, [record.id, record.id]);
      await mongoCollections(tx.db).recordUsages.insertOne({ _id: randomUUID(), userId, recordId: record.id, blockId: randomUUID(), quotedText: "", firstUsedAt: new Date() }, { session: tx.session });
    });
    const rejected = expect(referencing).rejects.toMatchObject({ statusCode: 404 });
    await snapshot;
    try { await service.trashRecord(userId, record.id); } finally { release(); }
    await rejected;
    expect(attempts).toBeGreaterThan(1);
    expect(await mongoCollections(fixture.resource.db).recordUsages.countDocuments({ recordId: record.id })).toBe(0);
  });

  it("stores profile atomically on the owner and blocks writes after deletion starts", async () => {
    expect(await service.getProfile(otherId)).toBeNull();
    await service.saveProfile(otherId, { targetRoles: ["백엔드", "백엔드"], experienceYears: 3, primaryGoal: "build" });
    expect(await service.getProfile(otherId)).toMatchObject({ targetRoles: ["백엔드"], experienceYears: 3 });
    await mongoCollections(fixture.resource.db).users.updateOne({ _id: otherId }, { $set: { deletionRequestedAt: new Date() } });
    await expect(service.saveProfile(otherId, { targetRoles: [], experienceYears: 0, primaryGoal: "explore" })).rejects.toMatchObject({ statusCode: 401 });
    await expect(service.createRecord(otherId, randomUUID(), { categoryId, title: "", properties: {}, bodyMd: "" })).rejects.toMatchObject({ statusCode: 401 });
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
  queuePrefix: "expresso-career-test",
};

interface IdRow {
  id: string;
}

interface CategoryRow extends IdRow {
  key: string;
}

interface CountRow {
  count: number;
}

for (const engine of ["mysql", "mongodb"] as const) {
describe.skipIf(engine === "mysql" ? !databaseUrl : !process.env.TEST_MONGODB_URL)(`career domain integration (${engine})`, () => {
  let sql: SqlTag;
  let fixture: Awaited<ReturnType<typeof createMongoFixture>> | undefined;
  let identityService: IdentityApi;
  let careerService: CareerApi;
  let app: ReturnType<typeof buildApi>;
  let firstUserId: string;
  let secondUserId: string;
  let firstAccessToken: string;
  let secondAccessToken: string;
  let experienceCategoryId: string;
  const globalCleanup: Array<{ table: "job_posting" | "company" | "template"; id: string }> = [];

  const auth = (accessToken = firstAccessToken) => ({
    authorization: `Bearer ${accessToken}`,
  });

  beforeAll(async () => {
    if (engine === "mongodb") {
      fixture = await createMongoFixture("career-http");
      identityService = new MongoIdentityService(fixture.resource);
      careerService = new MongoCareerService(fixture.resource);
      const first = await identityService.signup({ email: `career-${randomUUID()}@example.com`, displayName: "기록 A", password: "correct-horse-battery" });
      const second = await identityService.signup({ email: `career-${randomUUID()}@example.com`, displayName: "기록 B", password: "correct-horse-battery" });
      firstUserId = first.user.id; secondUserId = second.user.id;
      firstAccessToken = first.session.accessToken; secondAccessToken = second.session.accessToken;
      experienceCategoryId = (await careerService.listCategories(firstUserId)).find((category) => category.key === "experience")!.id;
    } else {
      sql = createMysqlResource(databaseUrl!).sql;
      identityService = new IdentityService(sql);
      careerService = new CareerService(sql);
    const plans = await sql<IdRow[]>`select id from plan where code = 'free'`;
    const planId = plans[0]?.id;
    if (!planId) throw new Error("free plan is missing");
    const users: IdRow[] = [{ id: randomUUID() }, { id: randomUUID() }];
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values
        (${users[0]!.id}, ${`career-a-${randomUUID()}@example.com`}, 'Career A', ${planId}),
        (${users[1]!.id}, ${`career-b-${randomUUID()}@example.com`}, 'Career B', ${planId})
    `;
    const [first, second] = users;
    if (!first || !second) throw new Error("career test users are missing");
    firstUserId = first.id;
    secondUserId = second.id;
    firstAccessToken = (await identityService.issueSession({ userId: firstUserId })).accessToken;
    secondAccessToken = (await identityService.issueSession({ userId: secondUserId })).accessToken;
    const categories = await sql<CategoryRow[]>`
      select id, \`key\` from category where is_system order by sort_order
    `;
    const experience = categories.find(({ key }) => key === "experience");
    if (!experience) throw new Error("experience category is missing");
    experienceCategoryId = experience.id;
    }
    app = buildApi({ config, identityService, careerService });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (fixture) await fixture.dispose();
    else if (sql) {
      if (firstUserId && secondUserId) await sql`delete from \`user\` where id in (${firstUserId}, ${secondUserId})`;
      for (const item of globalCleanup.reverse()) await sql.unsafe(`delete from ${item.table} where id = $1`, [item.id]);
      await sql.end({ timeout: 5 });
    }
  });

  it("shows exactly seven immutable default categories idempotently", async () => {
    const first = await app.inject({
      method: "GET",
      url: "/v1/career/categories",
      headers: auth(),
    });
    const second = await app.inject({
      method: "GET",
      url: "/v1/career/categories",
      headers: auth(),
    });
    const expectedKeys = [
      "experience",
      "project",
      "education_history",
      "certification_award",
      "academic_writing",
      "activity_leadership",
      "skill_tool",
    ];
    expect(first.statusCode).toBe(200);
    expect(first.json().data.map(({ key }: { key: string }) => key)).toEqual(expectedKeys);
    expect(second.json().data.map(({ id }: { id: string }) => id)).toEqual(
      first.json().data.map(({ id }: { id: string }) => id),
    );
    if (fixture) {
      await expect(careerService.updatePropertySchema(firstUserId, experienceCategoryId, 1, {}, true)).rejects.toMatchObject({ statusCode: 404 });
      expect((await careerService.listCategories(firstUserId)).find((category) => category.id === experienceCategoryId)?.name).toBe(first.json().data[0].name);
    } else {
    const counts = await sql<CountRow[]>`
      select count(*) as count from category where is_system
    `;
    expect(counts[0]?.count).toBe(7);
    await expect(
      sql`update category set name = 'Changed' where id = ${experienceCategoryId}`,
    ).rejects.toThrow(/immutable/);
    await expect(
      sql`delete from category where id = ${experienceCategoryId}`,
    ).rejects.toThrow(/immutable/);    }

  });

  it("provides idempotent record CRUD, ETags, stale-save rejection, and user scope", async () => {
    const body = {
      categoryId: experienceCategoryId,
      title: "API platform migration",
      properties: { role: "Backend engineer", achievements: ["zero downtime"] },
      bodyMd: "Migrated the API platform with zero downtime.",
    };
    const headers = { ...auth(), "idempotency-key": "career-record:retry-0001" };
    const created = await app.inject({ method: "POST", url: "/v1/career/records", headers, payload: body });
    const replayed = await app.inject({ method: "POST", url: "/v1/career/records", headers, payload: body });
    expect(created.statusCode).toBe(201);
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json().data.id).toBe(created.json().data.id);
    const recordId = created.json().data.id as string;
    const counts = fixture ? [{ count: await mongoCollections(fixture.resource.db).careerRecords.countDocuments({ userId: firstUserId, createIdempotencyKey: "career-record:retry-0001" }) }] : await sql<CountRow[]>`
      select count(*) as count from record
      where user_id = ${firstUserId} and create_idempotency_key = 'career-record:retry-0001'
    `;
    expect(counts[0]?.count).toBe(1);

    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/career/records/${recordId}`,
      headers: { ...auth(), "if-match": created.headers.etag as string },
      payload: { bodyMd: `${body.bodyMd}\nValidated rollback.` },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.headers.etag).toBe('"v2"');

    const stale = await app.inject({
      method: "PATCH",
      url: `/v1/career/records/${recordId}`,
      headers: { ...auth(), "if-match": '"v1"' },
      payload: { title: "Stale overwrite" },
    });
    expect(stale.statusCode).toBe(412);
    expect(stale.json().error.code).toBe("PRECONDITION_FAILED");

    const crossUser = await app.inject({
      method: "GET",
      url: `/v1/career/records/${recordId}`,
      headers: auth(secondAccessToken),
    });
    expect(crossUser.statusCode).toBe(404);
  });

  it("validates schemas, reports removal impact, saves views, and returns links bidirectionally", async () => {
    const categoryResponse = await app.inject({
      method: "POST",
      url: "/v1/career/categories",
      headers: auth(),
      payload: {
        key: `custom_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        name: "Custom projects",
        icon: "sparkles",
        defaultView: "gallery",
        propertySchema: {
          impact: { label: "Impact", type: "number", required: false, system: false },
          tools: { label: "Tools", type: "tags", required: false, system: false },
          happened: { label: "Month", type: "date", required: false, system: false },
        },
      },
    });
    expect(categoryResponse.statusCode).toBe(201);
    const category = categoryResponse.json().data;
    const first = await careerService.createRecord(firstUserId, `custom:first:${randomUUID()}`, {
      categoryId: category.id,
      title: "Custom record",
      properties: { impact: 42, tools: ["PostgreSQL"], happened: "2026-08" },
      bodyMd: "Improved throughput by 42 percent.",
    });
    const second = await careerService.createRecord(firstUserId, `custom:second:${randomUUID()}`, {
      categoryId: category.id,
      title: "Related record",
      properties: { tools: ["TypeScript"] },
      bodyMd: "Built a TypeScript service.",
    });

    const nextSchema = {
      tools: { label: "Tools", type: "tags", required: false, system: false },
      happened: { label: "Month", type: "date", required: false, system: false },
    };
    const preview = await app.inject({
      method: "PATCH",
      url: `/v1/career/categories/${category.id}/property-schema`,
      headers: { ...auth(), "if-match": categoryResponse.headers.etag as string },
      payload: { propertySchema: nextSchema, confirmValueRemoval: false },
    });
    expect(preview.statusCode).toBe(409);
    expect(preview.json().error.details.propertyValueCounts).toEqual({ impact: 1 });

    const confirmed = await app.inject({
      method: "PATCH",
      url: `/v1/career/categories/${category.id}/property-schema`,
      headers: { ...auth(), "if-match": categoryResponse.headers.etag as string },
      payload: { propertySchema: nextSchema, confirmValueRemoval: true },
    });
    expect(confirmed.statusCode).toBe(200);
    expect((await careerService.getRecord(firstUserId, first.record.id)).properties).not.toHaveProperty("impact");

    const view = await app.inject({
      method: "POST",
      url: `/v1/career/categories/${category.id}/views`,
      headers: auth(),
      payload: {
        name: "PostgreSQL work",
        viewType: "gallery",
        filters: [{ property: "tools", operator: "contains", value: "PostgreSQL" }],
        sorts: [{ property: "happened", direction: "desc" }],
        visibleProperties: ["tools", "happened"],
      },
    });
    expect(view.statusCode).toBe(201);
    expect((await careerService.listViews(firstUserId, category.id))).toHaveLength(1);

    await careerService.createLink(firstUserId, first.record.id, second.record.id, "related");
    expect(await careerService.listLinks(firstUserId, first.record.id)).toMatchObject([
      { relatedRecordId: second.record.id },
    ]);
    expect(await careerService.listLinks(firstUserId, second.record.id)).toMatchObject([
      { relatedRecordId: first.record.id },
    ]);

    const other = await careerService.createRecord(secondUserId, `other:${randomUUID()}`, {
      categoryId: experienceCategoryId,
      title: "Other user record",
      properties: {},
      bodyMd: "Private evidence.",
    });
    await expect(
      careerService.createLink(firstUserId, first.record.id, other.record.id, "related"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps a trashed record for 30 days and leaves portfolio/deployment material unchanged", async () => {
    const created = await careerService.createRecord(firstUserId, `trash:${randomUUID()}`, {
      categoryId: experienceCategoryId,
      title: "Published evidence",
      properties: {},
      bodyMd: "This exact sentence is already materialized.",
    });
    let portfolio: IdRow | undefined;
    let block: IdRow | undefined;
    let deployment: IdRow | undefined;
    if (fixture) {
      const db = mongoCollections(fixture.resource.db);
      portfolio = { id: randomUUID() }; block = { id: randomUUID() }; deployment = { id: randomUUID() };
      const sectionId = randomUUID();
      // 이 사례는 이미 생성된 지면과 인용의 보존을 검사합니다. 생성 그래프는 생성 모듈에서 검증합니다.
      await db.portfolios.insertOne({ _id: portfolio.id, userId: firstUserId, brewId: randomUUID(), templateId: randomUUID(), title: "Published", status: "published", createdAt: new Date(), updatedAt: new Date(), styleOverrides: {} });
      await db.portfolioSections.insertOne({ _id: sectionId, userId: firstUserId, portfolioId: portfolio.id, orderNo: 0, visible: true });
      await db.blocks.insertOne({ _id: block.id, userId: firstUserId, portfolioSectionId: sectionId, kind: "paragraph", content: { text: "Frozen snapshot sentence" }, style: {}, sourceRecordId: created.record.id, syncState: "synced", locked: false, orderNo: 0 });
      await db.recordUsages.insertOne({ _id: randomUUID(), userId: firstUserId, recordId: created.record.id, blockId: block.id, quotedText: "This exact sentence", firstUsedAt: new Date() });
      await db.deployments.insertOne({ _id: deployment.id, userId: firstUserId, portfolioId: portfolio.id, version: 1, subdomain: `career-${randomUUID()}`, seoIndexable: false, contactVisibility: "hidden", publishedAt: new Date(), hasUnpublishedChanges: false, snapshot: {}, seo: {} });
    } else {
    const company = (await sql<IdRow[]>`
      insert into company (name) values (${`Career ${randomUUID()}`}) returning id
    `)[0];
    if (!company) throw new Error("company missing");
    globalCleanup.push({ table: "company", id: company.id });
    const posting = (await sql<IdRow[]>`
      insert into job_posting (
        company_id, source, external_id, title, description_raw, dedupe_hash
      ) values (
        ${company.id}, 'api', ${`career-${randomUUID()}`}, 'Engineer',
        'Immutable posting source for career integration.', ${randomUUID()}
      ) returning id
    `)[0];
    if (!posting) throw new Error("posting missing");
    globalCleanup.push({ table: "job_posting", id: posting.id });
    const analysis = (await sql<IdRow[]>`
      insert into job_analysis (user_id, job_posting_id, input_type)
      values (${firstUserId}, ${posting.id}, 'url') returning id
    `)[0];
    const brew = analysis && (await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, length_preset)
      values (${firstUserId}, ${analysis.id}, 'single') returning id
    `)[0];
    const template = (await sql<IdRow[]>`
      insert into template (code, name, plan_required)
      values (${`career-${randomUUID()}`}, 'Career Template', 'free') returning id
    `)[0];
    if (!template) throw new Error("template missing");
    globalCleanup.push({ table: "template", id: template.id });
    if (!brew) throw new Error("brew missing");
    portfolio = (await sql<IdRow[]>`
      insert into portfolio (user_id, brew_id, template_id, title, status)
      values (${firstUserId}, ${brew.id}, ${template.id}, 'Published', 'published') returning id
    `)[0];
    const section = portfolio && (await sql<IdRow[]>`
      insert into portfolio_section (user_id, portfolio_id, order_no)
      values (${firstUserId}, ${portfolio.id}, 0) returning id
    `)[0];
    block = section && (await sql<IdRow[]>`
      insert into block (
        user_id, portfolio_section_id, kind, content, source_record_id
      ) values (
        ${firstUserId}, ${section.id}, 'paragraph',
        ${sql.json({ text: "Frozen snapshot sentence" })}, ${created.record.id}
      ) returning id
    `)[0];
    if (!portfolio || !block) throw new Error("portfolio material missing");
    await sql`
      insert into record_usage (user_id, record_id, block_id, quoted_text)
      values (${firstUserId}, ${created.record.id}, ${block.id}, 'This exact sentence')
    `;
    deployment = (await sql<IdRow[]>`
      insert into deployment (user_id, portfolio_id, version, subdomain, published_at)
      values (${firstUserId}, ${portfolio.id}, 1, ${`career-${randomUUID()}`}, now())
      returning id
    `)[0];
    if (!deployment) throw new Error("deployment missing");

    }
    if (!portfolio || !block || !deployment) throw new Error("portfolio material missing");

    const deletedAt = new Date("2026-08-09T00:00:00Z");
    await expect(
      careerService.getDeleteImpact(firstUserId, created.record.id, deletedAt),
    ).resolves.toMatchObject({ portfolioCount: 1, blockCount: 1 });
    const impact = await careerService.trashRecord(firstUserId, created.record.id, deletedAt);
    expect(impact).toMatchObject({ portfolioCount: 1, blockCount: 1 });
    expect(impact.purgeAfter).toBe("2026-09-08T00:00:00.000Z");
    await expect(careerService.getRecord(firstUserId, created.record.id)).rejects.toBeInstanceOf(CareerError);
    const mongoBlock = fixture ? await mongoCollections(fixture.resource.db).blocks.findOne({ _id: block.id }) : null;
    const material = fixture ? [{ content: mongoBlock?.content, source_record_id: mongoBlock?.sourceRecordId }] : await sql<{ content: { text: string }; source_record_id: string }[]>`
      select content, source_record_id from block where id = ${block.id}
    `;
    expect(material[0]).toEqual({
      content: { text: "Frozen snapshot sentence" },
      source_record_id: created.record.id,
    });
    expect(fixture ? (await mongoCollections(fixture.resource.db).deployments.find({ _id: deployment.id }).toArray()).map((row) => ({ id: row._id })) : (await sql<IdRow[]>`select id from deployment where id = ${deployment.id}`)).toEqual([
      { id: deployment.id },
    ]);

    await expect(
      careerService.restoreRecord(firstUserId, created.record.id, new Date("2026-09-07T23:59:59Z")),
    ).resolves.toMatchObject({ id: created.record.id });
    await careerService.trashRecord(firstUserId, created.record.id, deletedAt);
    await expect(
      careerService.restoreRecord(firstUserId, created.record.id, new Date("2026-09-08T00:00:00Z")),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("derives skill level and exact evidence only from owned record spans", async () => {
    const firstText = "Operated Kubernetes clusters in production.";
    const secondText = "Scaled Kubernetes workloads with safe rollouts.";
    const first = await careerService.createRecord(firstUserId, `skill:first:${randomUUID()}`, {
      categoryId: experienceCategoryId,
      title: "Platform operations",
      properties: {},
      bodyMd: firstText,
    });
    const second = await careerService.createRecord(firstUserId, `skill:second:${randomUUID()}`, {
      categoryId: experienceCategoryId,
      title: "Platform scaling",
      properties: {},
      bodyMd: secondText,
    });
    const spanFor = (text: string) => {
      const start = text.indexOf("Kubernetes");
      return { source: "body_md" as const, start, end: start + "Kubernetes".length, quote: "Kubernetes" };
    };
    const weak = await careerService.recomputeSkill(firstUserId, {
      name: "K8s",
      evidence: [{ recordId: first.record.id, span: spanFor(firstText) }],
    });
    expect(weak).toMatchObject({ name: "kubernetes", evidenceCount: 1, strength: "weak", level: 1 });

    const supported = await careerService.recomputeSkill(firstUserId, {
      name: "Kubernetes",
      evidence: [
        { recordId: first.record.id, span: spanFor(firstText) },
        { recordId: second.record.id, span: spanFor(secondText) },
      ],
    });
    expect(supported).toMatchObject({ evidenceCount: 2, strength: "supported", level: 2 });
    const evidence = fixture ? (await careerService.listSkillEvidence(firstUserId, supported.id)).map((row) => ({ extracted_span: row.span, body_md: row.recordId === first.record.id ? firstText : secondText })) : await sql<{ extracted_span: { quote: string }; body_md: string }[]>`
      select skill_evidence.extracted_span, record.body_md
      from skill_evidence
      join record on record.id = skill_evidence.record_id
      where skill_evidence.user_id = ${firstUserId}
        and skill_evidence.skill_id = ${supported.id}
      order by record.id
    `;
    expect(evidence).toHaveLength(2);
    expect(evidence.every(({ extracted_span, body_md }) =>
      body_md.includes(extracted_span.quote))).toBe(true);
    expect(await careerService.listSkillEvidence(firstUserId, supported.id)).toHaveLength(2);
    const evidenceResponse = await app.inject({
      method: "GET",
      url: `/v1/career/skills/${supported.id}/evidence`,
      headers: auth(),
    });
    expect(evidenceResponse.statusCode).toBe(200);
    expect(evidenceResponse.json().data).toHaveLength(2);
    expect(evidenceResponse.json().data[0].span.quote).toBe("Kubernetes");

    await expect(careerService.recomputeSkill(firstUserId, {
      name: "Kubernetes",
      evidence: [{
        recordId: first.record.id,
        span: { ...spanFor(firstText), quote: "fabricated" },
      }],
    })).rejects.toMatchObject({ statusCode: 400 });
    const noEvidence = await app.inject({
      method: "POST",
      url: "/v1/career/skills/recompute",
      headers: auth(),
      payload: { name: "Unsupported", evidence: [] },
    });
    expect(noEvidence.statusCode).toBe(400);
  });
});

}
