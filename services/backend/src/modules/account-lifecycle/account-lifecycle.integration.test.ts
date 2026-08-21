import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/mysql.js";

import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PublishingService } from "../publishing/service.js";
import { AccountLifecycleService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
interface IdRow { id: string }
interface Graph { userId: string; portfolioId: string; deploymentId: string; assetId: string }

describeWithDatabase("account export and deletion grace lifecycle", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const service = new AccountLifecycleService(sql);
  const publishing = new PublishingService(sql, "account-lifecycle-signing-secret");
  const marker = randomUUID();
  let cancelGraph: Graph;
  let purgeGraph: Graph;

  async function createGraph(label: string): Promise<Graph> {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'pro'`)[0]?.id;
    const templateId = (await sql<IdRow[]>`select id from template where code = 'clarity'`)[0]?.id;
    const categoryId = (await sql<IdRow[]>`select id from category where key = 'experience' and is_system`)[0]?.id;
    if (!planId || !templateId || !categoryId) throw new Error("account lifecycle seed missing");
    const userId = (await sql<IdRow[]>`
      insert into \`user\` (email, display_name, plan_id) values (${`${label}-${marker}@example.com`}, ${label}, ${planId}) returning id
    `)[0]?.id ?? "";
    await sql`insert into record (user_id, category_id, title, status, origin, body_md) values (${userId}, ${categoryId}, ${`${label} record`}, 'organized', 'manual', 'exported body')`;
    const companyId = (await sql<IdRow[]>`insert into company (name, dedupe_key) values (${label}, ${`${label}-${marker}`}) returning id`)[0]?.id;
    const postingId = companyId && (await sql<IdRow[]>`
      insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash)
      values (${companyId}, 'user_input', 'Engineer', ${"a".repeat(250)}, '{}', ${`${label}-post-${marker}`}) returning id
    `)[0]?.id;
    const analysisId = postingId && (await sql<IdRow[]>`insert into job_analysis (user_id, job_posting_id, input_type, status) values (${userId}, ${postingId}, 'paste', 'done') returning id`)[0]?.id;
    const brewId = analysisId && (await sql<IdRow[]>`insert into brew (user_id, job_analysis_id, length_preset, status) values (${userId}, ${analysisId}, 'single', 'done') returning id`)[0]?.id;
    if (!brewId) throw new Error("account lifecycle brew missing");
    const portfolioId = (await sql<IdRow[]>`insert into portfolio (user_id, brew_id, template_id, title) values (${userId}, ${brewId}, ${templateId}, ${`${label} portfolio`}) returning id`)[0]?.id ?? "";
    const deploymentId = (await sql<IdRow[]>`
      insert into deployment (user_id, portfolio_id, version, subdomain, published_at, snapshot)
      values (${userId}, ${portfolioId}, 1, ${`${label}-${marker}`}, now(), ${sql.json({ title: label, sections: [] })}) returning id
    `)[0]?.id ?? "";
    await sql`update portfolio set current_deployment_id = ${deploymentId}, status = 'published' where id = ${portfolioId}`;
    const assetId = (await sql<IdRow[]>`insert into export_asset (user_id, portfolio_id, kind, file_url) values (${userId}, ${portfolioId}, 'resume_file', ${`${label}/resume.pdf`}) returning id`)[0]?.id ?? "";
    const visitId = (await sql<IdRow[]>`insert into visit_event (user_id, deployment_id, session_id, started_at) values (${userId}, ${deploymentId}, ${"a".repeat(64)}, '2026-08-09') returning id`)[0]?.id;
    if (!visitId) throw new Error("account lifecycle visit missing");
    await sql`insert into analytics_event_receipt (event_id, user_id, deployment_id, event_type, visitor_hash, payload_hash, payload_bytes, occurred_at) values (${randomUUID()}, ${userId}, ${deploymentId}, 'visit', ${"b".repeat(64)}, ${"c".repeat(64)}, 100, '2026-08-09')`;
    await sql`insert into metric_daily (user_id, deployment_id, date, metric_key, value, sample_size) values (${userId}, ${deploymentId}, '2026-08-09', 'visits', 1, 1)`;
    await sql`insert into insight (user_id, deployment_id, period, narrative, evidence_metrics) values (${userId}, ${deploymentId}, daterange('2026-08-09', '2026-08-10', '[)'), '1 visit', array['visits'])`;
    return { userId, portfolioId, deploymentId, assetId };
  }

  beforeAll(async () => {
    cancelGraph = await createGraph("cancel-account");
    purgeGraph = await createGraph("purge-account");
  });

  afterAll(async () => {
    if (cancelGraph?.userId) await sql`delete from \`user\` where id = ${cancelGraph.userId}`;
    if (purgeGraph?.userId) await sql`delete from \`user\` where id = ${purgeGraph.userId}`;
    // 공고와 회사는 전역이라 사용자를 지워도 남는다 — 목록 API가 이걸 다 읽는다.
    await sql`delete from job_posting where dedupe_hash like ${`%${marker}`}`;
    await sql`delete from company where dedupe_key like ${`%${marker}`}`;
    await sql.end({ timeout: 5 });
  });

  it("exports a versioned machine-readable snapshot of owned data", async () => {
    const exported = await service.exportData(cancelGraph.userId, new Date("2026-08-09T00:00:00Z"));
    expect(exported).toMatchObject({
      schemaVersion: 1,
      account: { id: cancelGraph.userId },
      career: { records: [{ title: "cancel-account record", body_md: "exported body" }] },
      publishing: { portfolios: [{ id: cancelGraph.portfolioId }], deployments: [{ id: cancelGraph.deploymentId }], assets: [{ id: cancelGraph.assetId }] },
      analytics: { metrics: [{ metric_key: "visits" }], insights: [{ evidence_metrics: ["visits"] }] },
    });
    expect(JSON.parse(JSON.stringify(exported))).toEqual(exported);
  });

  it("revokes publication/assets immediately and safely restores during grace", async () => {
    const oldLink = await publishing.signAsset(cancelGraph.userId, cancelGraph.assetId, 172_800, new Date("2026-08-09T00:00:00Z"));
    const requested = await service.requestDeletion(cancelGraph.userId, new Date("2026-08-09T01:00:00Z"));
    expect(requested).toMatchObject({ status: "pending", cancellationToken: expect.any(String), purgeAfter: "2026-09-08T01:00:00.000Z" });
    await expect(publishing.getPublic(`cancel-account-${marker}`)).rejects.toMatchObject({ statusCode: 404 });
    const parsed = new URL(oldLink.url, "https://example.test");
    await expect(publishing.resolveAsset(cancelGraph.assetId, Number(parsed.searchParams.get("version")), Number(parsed.searchParams.get("expires")), parsed.searchParams.get("signature")!, new Date("2026-08-09T02:00:00Z"))).rejects.toMatchObject({ statusCode: 404 });

    await expect(service.cancelDeletion(requested.cancellationToken!, new Date("2026-08-10T01:00:00Z"))).resolves.toMatchObject({ status: "cancelled" });
    await expect(publishing.getPublic(`cancel-account-${marker}`)).resolves.toMatchObject({ kind: "portfolio" });
    await expect(publishing.resolveAsset(cancelGraph.assetId, Number(parsed.searchParams.get("version")), Number(parsed.searchParams.get("expires")), parsed.searchParams.get("signature")!, new Date("2026-08-10T02:00:00Z"))).rejects.toMatchObject({ statusCode: 403 });
    await expect(publishing.signAsset(cancelGraph.userId, cancelGraph.assetId)).resolves.toMatchObject({ assetId: cancelGraph.assetId });
  });

  it("keeps data through day 29 then purges analytics and account in audited order", async () => {
    const requested = await service.requestDeletion(purgeGraph.userId, new Date("2026-08-09T00:00:00Z"));
    await expect(service.purgeExpired(new Date("2026-09-07T23:59:59Z"))).resolves.toEqual({ purged: [] });
    expect((await sql<IdRow[]>`select id from \`user\` where id = ${purgeGraph.userId}`)).toHaveLength(1);
    await expect(service.cancelDeletion(requested.cancellationToken!, new Date("2026-09-08T00:00:00Z"))).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.purgeExpired(new Date("2026-09-08T00:00:00Z"))).resolves.toEqual({ purged: [requested.requestId] });
    expect((await sql<IdRow[]>`select id from \`user\` where id = ${purgeGraph.userId}`)).toHaveLength(0);
    expect((await sql<{ status: string; user_id: string | null; phase: string }[]>`select status, user_id, phase from account_deletion_request where id = ${requested.requestId}`)[0]).toEqual({ status: "purged", user_id: null, phase: "complete" });
    expect((await sql<{ phase: string }[]>`
      select phase from account_deletion_event where request_id = ${requested.requestId}
      order by case phase when 'access_revoked' then 1 when 'analytics_raw_purged' then 2 when 'analytics_aggregate_purged' then 3 when 'account_purged' then 4 else 5 end
    `).map(({ phase }) => phase)).toEqual(["access_revoked", "analytics_raw_purged", "analytics_aggregate_purged", "account_purged"]);
  });
});
