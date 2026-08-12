import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/service.js";
import { CareerError } from "./errors.js";
import { CareerService } from "./service.js";

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

describeWithDatabase("career domain integration", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1/unused", { max: 4 });
  const identityService = new IdentityService(sql);
  const careerService = new CareerService(sql);
  const app = buildApi({ config, identityService, careerService });
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
    const plans = await sql<IdRow[]>`select id from plan where code = 'free'`;
    const planId = plans[0]?.id;
    if (!planId) throw new Error("free plan is missing");
    const users = await sql<IdRow[]>`
      insert into "user" (email, display_name, plan_id)
      values
        (${`career-a-${randomUUID()}@example.com`}, 'Career A', ${planId}),
        (${`career-b-${randomUUID()}@example.com`}, 'Career B', ${planId})
      returning id
    `;
    const [first, second] = users;
    if (!first || !second) throw new Error("career test users are missing");
    firstUserId = first.id;
    secondUserId = second.id;
    firstAccessToken = (await identityService.issueSession({ userId: firstUserId })).accessToken;
    secondAccessToken = (await identityService.issueSession({ userId: secondUserId })).accessToken;
    const categories = await sql<CategoryRow[]>`
      select id, key from category where is_system order by sort_order
    `;
    const experience = categories.find(({ key }) => key === "experience");
    if (!experience) throw new Error("experience category is missing");
    experienceCategoryId = experience.id;
    await app.ready();
  });

  afterAll(async () => {
    if (firstUserId && secondUserId) {
      await sql`delete from "user" where id in (${firstUserId}, ${secondUserId})`;
    }
    for (const item of globalCleanup.reverse()) {
      await sql.unsafe(`delete from ${item.table} where id = $1`, [item.id]);
    }
    await app.close();
    await sql.end({ timeout: 5 });
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
    const counts = await sql<CountRow[]>`
      select count(*)::integer as count from category where is_system
    `;
    expect(counts[0]?.count).toBe(7);
    await expect(
      sql`update category set name = 'Changed' where id = ${experienceCategoryId}`,
    ).rejects.toThrow(/immutable/);
    await expect(
      sql`delete from category where id = ${experienceCategoryId}`,
    ).rejects.toThrow(/immutable/);
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
    const counts = await sql<CountRow[]>`
      select count(*)::integer as count from record
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
    const portfolio = (await sql<IdRow[]>`
      insert into portfolio (user_id, brew_id, template_id, title, status)
      values (${firstUserId}, ${brew.id}, ${template.id}, 'Published', 'published') returning id
    `)[0];
    const section = portfolio && (await sql<IdRow[]>`
      insert into portfolio_section (user_id, portfolio_id, order_no)
      values (${firstUserId}, ${portfolio.id}, 0) returning id
    `)[0];
    const block = section && (await sql<IdRow[]>`
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
    const deployment = (await sql<IdRow[]>`
      insert into deployment (user_id, portfolio_id, version, subdomain, published_at)
      values (${firstUserId}, ${portfolio.id}, 1, ${`career-${randomUUID()}`}, now())
      returning id
    `)[0];
    if (!deployment) throw new Error("deployment missing");

    const deletedAt = new Date("2026-08-09T00:00:00Z");
    await expect(
      careerService.getDeleteImpact(firstUserId, created.record.id, deletedAt),
    ).resolves.toMatchObject({ portfolioCount: 1, blockCount: 1 });
    const impact = await careerService.trashRecord(firstUserId, created.record.id, deletedAt);
    expect(impact).toMatchObject({ portfolioCount: 1, blockCount: 1 });
    expect(impact.purgeAfter).toBe("2026-09-08T00:00:00.000Z");
    await expect(careerService.getRecord(firstUserId, created.record.id)).rejects.toBeInstanceOf(CareerError);
    const material = await sql<{ content: { text: string }; source_record_id: string }[]>`
      select content, source_record_id from block where id = ${block.id}
    `;
    expect(material[0]).toEqual({
      content: { text: "Frozen snapshot sentence" },
      source_record_id: created.record.id,
    });
    expect((await sql<IdRow[]>`select id from deployment where id = ${deployment.id}`)).toEqual([
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
    const evidence = await sql<{ extracted_span: { quote: string }; body_md: string }[]>`
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
