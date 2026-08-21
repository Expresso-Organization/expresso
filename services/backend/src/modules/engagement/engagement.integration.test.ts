import { randomUUID } from "node:crypto";

import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EngagementService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
interface IdRow { id: string }

describeWithDatabase("notifications and read models integration", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1/unused", { max: 20 });
  const service = new EngagementService(sql);
  const marker = randomUUID();
  let userId = "";
  let otherUserId = "";
  let portfolioId = "";

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'pro'`)[0]?.id;
    const templateId = (await sql<IdRow[]>`select id from template where code = 'clarity'`)[0]?.id;
    const categoryId = (await sql<IdRow[]>`select id from category where key = 'experience' and is_system`)[0]?.id;
    if (!planId || !templateId || !categoryId) throw new Error("engagement seed missing");
    const users = await sql<IdRow[]>`
      insert into "user" (email, display_name, plan_id) values
      (${`engagement-${marker}@example.com`}, 'Engagement', ${planId}),
      (${`engagement-other-${marker}@example.com`}, 'Other', ${planId}) returning id
    `;
    userId = users[0]?.id ?? "";
    otherUserId = users[1]?.id ?? "";
    const companyId = (await sql<IdRow[]>`insert into company (name, dedupe_key) values ('Alpha Company', ${`engagement-${marker}`}) returning id`)[0]?.id;
    const postingId = companyId && (await sql<IdRow[]>`
      insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash)
      values (${companyId}, 'user_input', 'Alpha Job', ${"j".repeat(250)}, '{}'::jsonb, ${`engagement-post-${marker}`}) returning id
    `)[0]?.id;
    const analysisId = postingId && (await sql<IdRow[]>`
      insert into job_analysis (user_id, job_posting_id, input_type, status)
      values (${userId}, ${postingId}, 'paste', 'done') returning id
    `)[0]?.id;
    const brewId = analysisId && (await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, length_preset, status)
      values (${userId}, ${analysisId}, 'single', 'draft') returning id
    `)[0]?.id;
    if (!brewId || !postingId) throw new Error("engagement domain seed missing");
    portfolioId = (await sql<IdRow[]>`
      insert into portfolio (user_id, brew_id, template_id, title, status)
      values (${userId}, ${brewId}, ${templateId}, 'Alpha Portfolio', 'draft') returning id
    `)[0]?.id ?? "";
    const deploymentId = (await sql<IdRow[]>`
      insert into deployment (user_id, portfolio_id, version, subdomain, published_at, snapshot)
      values (${userId}, ${portfolioId}, 1, ${`engagement-${marker}`}, now(), '{}'::jsonb) returning id
    `)[0]?.id;
    if (!deploymentId) throw new Error("engagement deployment missing");
    await sql`update portfolio set current_deployment_id = ${deploymentId}, status = 'published' where id = ${portfolioId}`;
    await sql`insert into metric_daily (user_id, deployment_id, date, metric_key, value, sample_size) values (${userId}, ${deploymentId}, '2026-08-09', 'visits', 12, 12)`;
    await sql`insert into match_score (user_id, job_posting_id, total, axes, reason_text, next_action) values (${userId}, ${postingId}, 88, '{}'::jsonb, 'evidence', 'review')`;
    for (const title of ["Alpha Record A", "Alpha Record B"]) await sql`
      insert into record (user_id, category_id, title, status, origin) values (${userId}, ${categoryId}, ${title}, 'organized', 'manual')
    `;
    await sql`insert into record (user_id, category_id, title, status, origin) values (${otherUserId}, ${categoryId}, 'Alpha Secret Other User', 'organized', 'manual')`;
  });

  afterAll(async () => {
    if (userId || otherUserId) {
      await sql`delete from platform_outbox where payload ->> 'userId' in (${userId}, ${otherUserId})`;
      await sql`delete from "user" where id in (${userId}, ${otherUserId})`;
    }
    // 공고와 회사는 전역이라 사용자를 지워도 남는다 — 목록 API가 이걸 다 읽는다.
    await sql`delete from job_posting where dedupe_hash like ${`%${marker}`}`;
    await sql`delete from company where dedupe_key like ${`%${marker}`}`;
    await sql.end({ timeout: 5 });
  });

  it("applies per-kind preferences and converges same-day duplicates to one delivery", async () => {
    await service.setPreference(userId, "deadline", false);
    await expect(service.notify(userId, "deadline", "/jobs/1", "deadline:1", new Date("2026-08-09T00:00:00Z")))
      .resolves.toMatchObject({ created: false, reason: "PREFERENCE_DISABLED" });
    const attempts = await Promise.all(Array.from({ length: 50 }, () =>
      service.notify(userId, "generation", "/portfolios/1", "generation:1", new Date("2026-08-09T01:00:00Z"))));
    expect(attempts.filter(({ created }) => created)).toHaveLength(1);
    const notificationId = attempts[0]?.notification?.id;
    expect(notificationId).toBeTruthy();
    expect((await sql<{ count: number }[]>`select count(*)::integer as count from notification where user_id = ${userId} and dedupe_key = 'generation:1'`)[0]?.count).toBe(1);
    expect((await sql<{ count: number }[]>`select count(*)::integer as count from platform_outbox where topic = 'notification.deliver' and payload ->> 'notificationId' = ${notificationId!}`)[0]?.count).toBe(1);
    await expect(service.notify(userId, "generation", "/portfolios/1", "generation:1", new Date("2026-08-09T15:00:00Z")))
      .resolves.toMatchObject({ created: true });
  });

  it("preserves failed delivery retry state and eventually sends once", async () => {
    const created = await service.notify(userId, "traffic", "/analytics", "traffic:retry", new Date("2026-08-09T02:00:00Z"));
    const id = created.notification!.id;
    await expect(service.deliver(id, { async send() { throw new Error("provider secret detail"); } }, new Date("2026-08-09T02:00:00Z"))).rejects.toThrow(/provider/);
    expect(await service.getNotificationById(id)).toMatchObject({ deliveryStatus: "failed", attempts: 1 });
    await service.deliver(id, { async send() { throw new Error("must not run before retry"); } }, new Date("2026-08-09T02:00:01Z"));
    expect(await service.getNotificationById(id)).toMatchObject({ deliveryStatus: "failed", attempts: 1 });
    let sends = 0;
    await service.deliver(id, { async send() { sends += 1; } }, new Date("2026-08-09T02:00:03Z"));
    expect(sends).toBe(1);
    expect(await service.getNotificationById(id)).toMatchObject({ deliveryStatus: "sent", attempts: 2 });
    expect((await sql<{ last_error: string | null }[]>`select last_error from notification where id = ${id}`)[0]?.last_error).toBeNull();
  });

  it("returns explicit empty home state and populated owner-scoped read models", async () => {
    await expect(service.home(otherUserId)).resolves.toMatchObject({
      activeBrews: [], portfolios: [], recommendedJobs: [], keyMetrics: [],
      empty: { brews: true, portfolios: true, recommendations: true, metrics: true },
    });
    await expect(service.home(userId)).resolves.toMatchObject({
      activeBrews: [{ status: "draft" }],
      portfolios: [{ id: portfolioId, status: "published" }],
      recommendedJobs: [{ title: "Alpha Job", company: "Alpha Company", score: 88 }],
      keyMetrics: [{ key: "visits", value: 12 }],
      empty: { brews: false, portfolios: false, recommendations: false, metrics: false },
    });
  });

  it("uses a stable cursor across record, portfolio, and owned job search", async () => {
    const first = await service.search(userId, { q: "Alpha", limit: 2 });
    expect(first.data).toHaveLength(2);
    expect(first.page).toMatchObject({ hasNextPage: true, nextCursor: expect.any(String) });
    const second = await service.search(userId, { q: "Alpha", limit: 2, cursor: first.page.nextCursor! });
    expect(second.data).toHaveLength(2);
    expect(new Set([...first.data, ...second.data].map(({ id }) => id)).size).toBe(4);
    expect([...first.data, ...second.data].some(({ title }) => title.includes("Secret"))).toBe(false);
    await expect(service.search(otherUserId, { q: "Alpha", limit: 20 })).resolves.toMatchObject({ data: [{ title: "Alpha Secret Other User", type: "record" }] });
    await expect(service.search(userId, { q: "Alpha", limit: 2, cursor: "not-a-cursor" })).rejects.toMatchObject({ statusCode: 400 });
  });
});
