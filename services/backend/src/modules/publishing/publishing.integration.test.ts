import { randomUUID } from "node:crypto";

import { PublishPortfolioSchema } from "@expresso/contracts";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/service.js";
import { PublishingService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const config: RuntimeConfig = {
  nodeEnv: "test", host: "127.0.0.1", port: 4_000, logLevel: "silent",
  databaseUrl: databaseUrl ?? "postgres://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1", outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: "expresso-publishing-test",
  assetSigningSecret: "publishing-integration-secret",
};

interface IdRow { id: string }

describeWithDatabase("publishing and asset lifecycle integration", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1/unused", { max: 20 });
  const service = new PublishingService(sql, config.assetSigningSecret);
  const identity = new IdentityService(sql);
  const app = buildApi({ config, identityService: identity, publishingService: service });
  const marker = randomUUID();
  let proUserId = "";
  let freeUserId = "";
  let proPortfolioId = "";
  let competingPortfolioId = "";
  let freePortfolioId = "";
  let blockId = "";

  async function createPortfolio(userId: string, label: string) {
    const companyId = (await sql<IdRow[]>`
      insert into company (name, dedupe_key) values (${label}, ${`${label}-${marker}`}) returning id
    `)[0]?.id;
    const postingId = companyId && (await sql<IdRow[]>`
      insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash)
      values (${companyId}, 'user_input', 'Engineer', ${"x".repeat(250)}, '{}'::jsonb, ${`${label}-posting-${marker}`}) returning id
    `)[0]?.id;
    const analysisId = postingId && (await sql<IdRow[]>`
      insert into job_analysis (user_id, job_posting_id, input_type, status)
      values (${userId}, ${postingId}, 'paste', 'done') returning id
    `)[0]?.id;
    const brewId = analysisId && (await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, length_preset, status)
      values (${userId}, ${analysisId}, 'single', 'done') returning id
    `)[0]?.id;
    const templateId = (await sql<IdRow[]>`select id from template where code = 'clarity'`)[0]?.id;
    if (!brewId || !templateId) throw new Error("publishing seed missing");
    const portfolioId = (await sql<IdRow[]>`
      insert into portfolio (user_id, brew_id, template_id, title)
      values (${userId}, ${brewId}, ${templateId}, ${label}) returning id
    `)[0]?.id;
    if (!portfolioId) throw new Error("portfolio seed missing");
    const sectionId = (await sql<IdRow[]>`
      insert into portfolio_section (user_id, portfolio_id, order_no)
      values (${userId}, ${portfolioId}, 0) returning id
    `)[0]?.id;
    const seededBlockId = sectionId && (await sql<IdRow[]>`
      insert into block (user_id, portfolio_section_id, kind, content)
      values (${userId}, ${sectionId}, 'paragraph', ${sql.json({ text: `${label} original` })}) returning id
    `)[0]?.id;
    if (!seededBlockId) throw new Error("block seed missing");
    return { portfolioId, blockId: seededBlockId };
  }

  beforeAll(async () => {
    const proPlan = (await sql<IdRow[]>`select id from plan where code = 'pro'`)[0]?.id;
    const freePlan = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!proPlan || !freePlan) throw new Error("plan seed missing");
    proUserId = (await sql<IdRow[]>`
      insert into "user" (email, display_name, plan_id)
      values (${`publish-pro-${marker}@example.com`}, 'Publisher', ${proPlan}) returning id
    `)[0]?.id ?? "";
    freeUserId = (await sql<IdRow[]>`
      insert into "user" (email, display_name, plan_id)
      values (${`publish-free-${marker}@example.com`}, 'Free publisher', ${freePlan}) returning id
    `)[0]?.id ?? "";
    const primary = await createPortfolio(proUserId, "primary");
    proPortfolioId = primary.portfolioId;
    blockId = primary.blockId;
    competingPortfolioId = (await createPortfolio(freeUserId, "competitor")).portfolioId;
    freePortfolioId = (await createPortfolio(freeUserId, "free-export")).portfolioId;
    await app.ready();
  });

  afterAll(async () => {
    if (proUserId || freeUserId) {
      await sql`delete from platform_outbox where payload ->> 'userId' in (${proUserId}, ${freeUserId})`;
      await sql`delete from "user" where id in (${proUserId}, ${freeUserId})`;
    }
    // 공고와 회사는 전역이라 사용자를 지워도 남는다 — 목록 API가 이걸 다 읽는다.
    await sql`delete from job_posting where dedupe_hash like ${`%${marker}`}`;
    await sql`delete from company where dedupe_key like ${`%${marker}`}`;
    await app.close();
    await sql.end({ timeout: 5 });
  });

  it("atomically reserves a unique slug under concurrent publication", async () => {
    const slug = `race-${marker}`;
    const input = PublishPortfolioSchema.parse({ slug });
    const attempts = await Promise.allSettled([
      ...Array.from({ length: 10 }, () => service.publish(proUserId, proPortfolioId, input)),
      ...Array.from({ length: 10 }, () => service.publish(freeUserId, competingPortfolioId, input)),
    ]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(19);
    expect((await sql<{ count: number }[]>`select count(*)::integer as count from deployment where subdomain = ${slug}`)[0]?.count).toBe(1);
  });

  it("serves only immutable current snapshots, redirects for 30 days, rolls back, and unpublishes", async () => {
    const at = new Date("2026-08-09T00:00:00.000Z");
    const firstSlug = `first-${marker}`;
    const secondSlug = `second-${marker}`;
    const first = await service.publish(proUserId, proPortfolioId, PublishPortfolioSchema.parse({ slug: firstSlug }), at);
    expect(first).toMatchObject({ version: expect.any(Number), contactVisibility: "hidden" });
    await expect(sql`update deployment set snapshot = '{"tampered":true}'::jsonb where id = ${first.id}`).rejects.toThrow(/immutable/);
    await sql`update block set content = ${sql.json({ text: "unpublished edit" })} where id = ${blockId}`;

    const beforeRepublish = await app.inject({ method: "GET", url: `/v1/public/portfolios/${firstSlug}` });
    expect(beforeRepublish.statusCode).toBe(200);
    expect(JSON.stringify(beforeRepublish.json())).toContain("primary original");
    expect(JSON.stringify(beforeRepublish.json())).not.toContain("unpublished edit");

    const second = await service.publish(proUserId, proPortfolioId, PublishPortfolioSchema.parse({ slug: secondSlug }), at);
    expect(second.version).toBe(first.version + 1);
    await expect(service.getPublic(firstSlug, new Date("2026-09-07T23:59:59.000Z"))).resolves.toMatchObject({ kind: "redirect", to: secondSlug });
    await expect(service.getPublic(firstSlug, new Date("2026-09-08T00:00:01.000Z"))).rejects.toMatchObject({ statusCode: 404 });

    // 08b 버전 목록 — 최신이 위, 지금 열리는 것 하나만 current, 그때 나간 것을 센다.
    const versions = await service.listDeployments(proUserId, proPortfolioId);
    // 앞 테스트가 이미 한 번 배포해 둬서 목록에는 그것도 남아 있다. 순서만 본다.
    expect(versions.slice(0, 2).map(({ version }) => version)).toEqual([second.version, first.version]);
    expect(versions.filter(({ isCurrent }) => isCurrent).map(({ id }) => id)).toEqual([second.id]);
    expect(versions[1]).toMatchObject({ id: first.id, slug: firstSlug, blockCount: 1, sectionCount: 1 });
    await expect(service.listDeployments(proUserId, randomUUID())).rejects.toMatchObject({ statusCode: 404 });

    await service.rollback(proUserId, proPortfolioId, first.id);
    expect((await service.listDeployments(proUserId, proPortfolioId))
      .filter(({ isCurrent }) => isCurrent).map(({ id }) => id)).toEqual([first.id]);
    await expect(service.getPublic(firstSlug)).resolves.toMatchObject({ kind: "portfolio", deployment: { id: first.id } });
    await expect(service.getPublic(secondSlug)).rejects.toMatchObject({ statusCode: 404 });
    await service.unpublish(proUserId, proPortfolioId);
    await expect(service.getPublic(firstSlug)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("queues entitled exports and invalidates expired or replaced signed links", async () => {
    await expect(service.submitExport(freeUserId, freePortfolioId, "free-export-request-0001", { kind: "pdf", pageFormat: "a4" }))
      .rejects.toMatchObject({ statusCode: 403 });
    const queued = await service.submitExport(proUserId, proPortfolioId, "pro-export-request-00001", { kind: "deck", pageFormat: null });
    const repeated = await service.submitExport(proUserId, proPortfolioId, "pro-export-request-00001", { kind: "deck", pageFormat: null });
    expect(repeated.id).toBe(queued.id);
    expect((await sql<{ count: number }[]>`
      select count(*)::integer as count from platform_outbox
      where topic = 'portfolio.export' and payload ->> 'exportJobId' = ${queued.id}
    `)[0]?.count).toBe(1);
    const done = await service.processExport(queued.id);
    expect(done).toMatchObject({ status: "done", attempts: 1, assetId: expect.any(String) });
    await service.processExport(queued.id);
    expect((await service.getExport(proUserId, queued.id)).attempts).toBe(1);

    const exportLink = await service.signAsset(proUserId, done.assetId!, 60, new Date("2026-08-09T00:00:00Z"));
    const parsed = new URL(exportLink.url, "https://example.test");
    await expect(service.resolveAsset(done.assetId!, Number(parsed.searchParams.get("version")), Number(parsed.searchParams.get("expires")), parsed.searchParams.get("signature")!, new Date("2026-08-09T00:00:30Z")))
      .resolves.toMatchObject({ kind: "deck" });
    await expect(service.resolveAsset(done.assetId!, 1, Number(parsed.searchParams.get("expires")), parsed.searchParams.get("signature")!, new Date("2026-08-09T00:01:01Z")))
      .rejects.toMatchObject({ statusCode: 403 });

    const firstResume = await service.replaceResume(proUserId, proPortfolioId, "resumes/first.pdf");
    const oldLink = await service.signAsset(proUserId, firstResume.id, 300);
    await service.replaceResume(proUserId, proPortfolioId, "resumes/replacement.pdf");
    const old = new URL(oldLink.url, "https://example.test");
    await expect(service.resolveAsset(firstResume.id, Number(old.searchParams.get("version")), Number(old.searchParams.get("expires")), old.searchParams.get("signature")!))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
