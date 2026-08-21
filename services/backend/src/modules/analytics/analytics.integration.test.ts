import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../platform/mysql.js";

import { AnalyticsEventSchema } from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AnalyticsService, validateInsightDraft } from "./service.js";
import { EntitlementService } from "../entitlements/service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
interface IdRow { id: string }

describeWithDatabase("privacy-minimized analytics integration", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const service = new AnalyticsService(sql, { visitorSalt: "analytics-integration-salt", minimumSample: 5 });
  const marker = randomUUID();
  const slug = `analytics-${marker}`;
  const date = "2026-08-09";
  let userId = "";
  let portfolioId = "";
  let sectionId = "";
  let deploymentId = "";

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'pro'`)[0]?.id;
    const templateId = (await sql<IdRow[]>`select id from template where code = 'clarity'`)[0]?.id;
    if (!planId || !templateId) throw new Error("analytics seed missing");
    userId = (await sql<IdRow[]>`
      insert into \`user\` (email, display_name, plan_id)
      values (${`analytics-${marker}@example.com`}, 'Analytics', ${planId}) returning id
    `)[0]?.id ?? "";
    const companyId = (await sql<IdRow[]>`insert into company (name, dedupe_key) values (${`Analytics ${marker}`}, ${`analytics-${marker}`}) returning id`)[0]?.id;
    const postingId = companyId && (await sql<IdRow[]>`
      insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash)
      values (${companyId}, 'user_input', 'Engineer', ${"a".repeat(250)}, '{}', ${`analytics-post-${marker}`}) returning id
    `)[0]?.id;
    const analysisId = postingId && (await sql<IdRow[]>`
      insert into job_analysis (user_id, job_posting_id, input_type, status)
      values (${userId}, ${postingId}, 'paste', 'done') returning id
    `)[0]?.id;
    const brewId = analysisId && (await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, length_preset, status)
      values (${userId}, ${analysisId}, 'single', 'done') returning id
    `)[0]?.id;
    if (!brewId) throw new Error("analytics brew missing");
    portfolioId = (await sql<IdRow[]>`
      insert into portfolio (user_id, brew_id, template_id, title)
      values (${userId}, ${brewId}, ${templateId}, 'Analytics portfolio') returning id
    `)[0]?.id ?? "";
    sectionId = (await sql<IdRow[]>`
      insert into portfolio_section (user_id, portfolio_id, order_no)
      values (${userId}, ${portfolioId}, 0) returning id
    `)[0]?.id ?? "";
    await sql`insert into block (user_id, portfolio_section_id, kind, content) values (${userId}, ${sectionId}, 'paragraph', ${sql.json({ text: "evidence" })})`;
    deploymentId = (await sql<IdRow[]>`
      insert into deployment (user_id, portfolio_id, version, subdomain, published_at, snapshot)
      values (${userId}, ${portfolioId}, 1, ${slug}, now(), ${sql.json({ sections: [{ id: sectionId }] })}) returning id
    `)[0]?.id ?? "";
    await sql`update portfolio set current_deployment_id = ${deploymentId}, status = 'published' where id = ${portfolioId}`;
  });

  afterAll(async () => {
    if (userId) {
      await sql`delete from platform_outbox where payload ->> '$.userId' = ${userId}`;
      await sql`delete from \`user\` where id = ${userId}`;
    }
    // 공고와 회사는 전역이라 사용자를 지워도 남는다 — 목록 API가 이걸 다 읽는다.
    await sql`delete from job_posting where dedupe_hash like ${`%${marker}`}`;
    await sql`delete from company where dedupe_key like ${`%${marker}`}`;
    await sql.end({ timeout: 5 });
  });

  function event(input: Record<string, unknown>) {
    return AnalyticsEventSchema.parse({
      eventId: randomUUID(), slug, sessionId: `session-${randomUUID()}`,
      type: "visit", occurredAt: `${date}T01:00:00.000Z`, ...input,
    });
  }

  it("validates size, hashes visitor data, rate limits, and makes event IDs idempotent", async () => {
    const visit = event({ sessionId: "privacy-session-00000001", referrer: "https://jobs.example.com/private/path?q=secret" });
    await expect(service.collect(visit)).resolves.toMatchObject({ accepted: true, duplicate: false });
    await expect(service.collect(visit)).resolves.toMatchObject({ accepted: true, duplicate: true });
    await expect(service.collect({ ...visit, durationMs: 10 })).rejects.toMatchObject({ statusCode: 409 });
    const stored = (await sql<{ session_id: string; referrer: string }[]>`select session_id, referrer from visit_event where event_id = ${visit.eventId}`)[0];
    expect(stored?.session_id).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.session_id).not.toContain("privacy-session");
    expect(stored?.referrer).toBe("https://jobs.example.com");

    const limited = new AnalyticsService(sql, { visitorSalt: "analytics-integration-salt", rateLimit: 2 });
    const limitedSession = "limited-session-00000001";
    await limited.collect(event({ sessionId: limitedSession }));
    await limited.collect(event({ sessionId: limitedSession }));
    await expect(limited.collect(event({ sessionId: limitedSession }))).rejects.toMatchObject({ statusCode: 429 });
    expect(AnalyticsEventSchema.safeParse({ ...visit, target: "x".repeat(9_000) }).success).toBe(false);
  });

  it("replays raw events deterministically while excluding owners and sub-second sections", async () => {
    for (let index = 0; index < 5; index += 1) {
      const sessionId = `eligible-session-${index}-0001`;
      await service.collect(event({ sessionId, occurredAt: `${date}T0${index + 2}:00:00.000Z` }));
      if (index < 2) await service.collect(event({ sessionId, type: "complete", durationMs: 60_000, occurredAt: `${date}T0${index + 2}:01:00.000Z` }));
      await service.collect(event({ sessionId, type: "section_view", sectionId, dwellMs: index === 0 ? 999 : 1_200, scrollDepth: 0.8, occurredAt: `${date}T0${index + 2}:02:00.000Z` }));
    }
    const ownerSession = "owner-session-000000001";
    await service.collect(event({ sessionId: ownerSession, occurredAt: `${date}T08:00:00.000Z` }), userId);
    await service.collect(event({ sessionId: ownerSession, type: "contact_click", target: "mailto", occurredAt: `${date}T08:01:00.000Z` }), userId);
    await service.collect(event({ sessionId: "eligible-session-1-0001", type: "contact_click", target: "mailto", occurredAt: `${date}T03:03:00.000Z` }));

    const first = await service.aggregateDay(deploymentId, date);
    expect(first).toMatchObject({ visits: 8, completes: 2, contact_clicks: 1, eligible_section_views: 4, total_section_dwell_ms: 4_800 });
    const persistedBefore = await sql<{ metric_key: string; value: string }[]>`
      select metric_key, value from metric_daily where deployment_id = ${deploymentId} and date = ${date} order by metric_key
    `;
    expect(await service.aggregateDay(deploymentId, date)).toEqual(first);
    const persistedAfter = await sql<{ metric_key: string; value: string }[]>`
      select metric_key, value from metric_daily where deployment_id = ${deploymentId} and date = ${date} order by metric_key
    `;
    expect(persistedAfter).toEqual(persistedBefore);
    await service.aggregateDay(deploymentId, "2026-08-10");
    await expect(service.calculateDerived(userId, deploymentId, "2026-08-10", "completes", "visits"))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("enforces six dashboard views and hides or validates evidence-backed insights", async () => {
    const views = await Promise.allSettled(Array.from({ length: 10 }, (_, index) =>
      service.createDashboardView(userId, portfolioId, { name: `View ${index}`, period: "7d", isDefault: false })));
    expect(views.filter(({ status }) => status === "fulfilled")).toHaveLength(6);
    expect(views.filter(({ status }) => status === "rejected")).toHaveLength(4);

    await expect(service.insight(userId, deploymentId, "2026-08-10", "2026-08-10"))
      .resolves.toMatchObject({ visibility: "hidden", reason: "INSUFFICIENT_SAMPLE" });
    await expect(service.insight(userId, deploymentId, date, date))
      .resolves.toMatchObject({ visibility: "visible", evidenceMetrics: ["visits", "completes"], period: { start: date, end: date } });
    expect(() => validateInsightDraft({
      narrative: "아마 채용 담당자가 관심을 보였을 것입니다.", evidenceMetrics: ["visits"], suggestions: [],
    }, new Set(["visits"]))).toThrow(/speculative/);
    expect(() => validateInsightDraft({
      narrative: "방문이 집계되었습니다.", evidenceMetrics: ["unknown"], suggestions: [],
    }, new Set(["visits"]))).toThrow(/evidence/);
  });

  it("07이 읽는 것 — 집계에 있는 수만, 모델은 부르지 않고", async () => {
    // 어제 방문 하나를 더 흘려 둔다. 집계는 하루에 한 번이라 아직 어느 수에도 없다.
    await service.collect(event({ sessionId: "pending-session-0000001", occurredAt: "2026-08-08T05:00:00.000Z" }));

    const dashboard = await service.dashboard(userId, portfolioId, "all");
    expect(dashboard.portfolio.id).toBe(portfolioId);
    expect(dashboard.deployment.subdomain).toBe(slug);
    // 수는 집계에서만 온다 — 어제 방문은 원본에만 있으므로 타일에 없다.
    expect(dashboard.metrics).toMatchObject({
      visits: 8, completes: 2, contactClicks: 1, sectionViews: 4, sectionDwellMs: 4_800,
    });
    // 대신 세지 않은 날이 있다고 말한다.
    expect(dashboard.coverage.pendingDates).toEqual(["2026-08-08"]);
    expect(dashboard.coverage).toMatchObject({ days: 2, aggregatedDays: 1 });
    expect(dashboard.trend.find(({ date }) => date === "2026-08-09"))
      .toMatchObject({ visits: 8, completes: 2 });

    // 나눠 보기는 원본에서 세되 집계와 같은 규칙을 쓴다 — 소유자 제외, 1초 미만 제외.
    expect(dashboard.sections).toHaveLength(1);
    expect(dashboard.sections[0]).toMatchObject({ sectionId, views: 4, dwellMs: 4_800 });
    expect(dashboard.referrers).toContainEqual({ origin: "https://jobs.example.com", visits: 1 });
    // 한 화면이 방문을 두 수로 말하지 않는다 — 나눠 보기도 세어 둔 날만 센다.
    expect(dashboard.referrers.reduce((sum, { visits }) => sum + visits, 0))
      .toBe(dashboard.metrics.visits);
    // 자격 판정이 없으면 기업 도메인은 아예 보여주지 않는다.
    expect(dashboard.organizations).toEqual({ entitled: false });

    // 표본은 찼는데 아직 아무도 읽지 않았다 — 화면을 여는 것으로 모델을 부르지 않는다.
    expect(dashboard.insight).toEqual({ state: "none" });

    const { start, end } = dashboard.period;
    await service.insight(userId, deploymentId, start, end, {
      narrative: "링크드인에서 온 방문이 절반을 넘습니다.",
      evidenceMetrics: ["visits"],
      suggestions: [{ direction: "up", target: "completes", action: "앞 섹션을 짧게 줄이세요." }],
    });
    const read = await service.dashboard(userId, portfolioId, "all");
    expect(read.insight).toMatchObject({
      state: "ready", narrative: "링크드인에서 온 방문이 절반을 넘습니다.",
    });

    // 표본이 모자라면 해설 자리에 왜 없는지가 온다.
    const strict = new AnalyticsService(sql, { minimumSample: 100 });
    expect((await strict.dashboard(userId, portfolioId, "all")).insight)
      .toEqual({ state: "insufficient_sample", sampleSize: 8, minimumSample: 100 });

    // PRO는 기업 도메인을 본다. 자격은 요금제가 판단하고 분석은 그 답만 따른다.
    const entitled = new AnalyticsService(sql, { entitlements: new EntitlementService(sql) });
    expect((await entitled.dashboard(userId, portfolioId, "all")).organizations)
      .toMatchObject({ entitled: true });

    // 세지 않은 날만 큐에 넣는다.
    await expect(service.requestPendingAggregation(userId, portfolioId, "all"))
      .resolves.toEqual({ queued: ["2026-08-08"] });
  });

  it("07b 지표 라이브러리 — 못 쓰는 것도 왜 못 쓰는지와 함께 남는다", async () => {
    const catalog = await service.catalog(userId);
    expect(catalog.find(({ key }) => key === "visits"))
      .toMatchObject({ availability: "ready", reason: null, group: "방문" });

    // 세고 있지 않은 것은 지우지 않고 이유를 붙인다.
    const unique = catalog.find(({ key }) => key === "unique_visitors");
    expect(unique?.availability).toBe("not_collected");
    expect(unique?.reason).toMatch(/여러 번/);

    // 자격 판정이 없으면 PRO 지표는 잠긴다.
    expect(catalog.find(({ key }) => key === "org_domains")?.availability).toBe("plan_required");
    const entitled = new AnalyticsService(sql, { entitlements: new EntitlementService(sql) });
    expect((await entitled.catalog(userId)).find(({ key }) => key === "org_domains")?.availability)
      .toBe("ready");
    // 요금제를 올려도 없는 값은 없다 — 세고 있지 않은 쪽이 먼저다.
    expect((await entitled.catalog(userId)).find(({ key }) => key === "org_returning")?.availability)
      .toBe("not_collected");
  });

  it("위젯은 편집을 시작할 때 굳고, 초기화는 처음으로 되돌린다", async () => {
    // 뷰 여섯 개를 이미 쓴 포트폴리오와 섞이지 않게 새로 만든다.
    const boardId = (await sql<IdRow[]>`
      insert into portfolio (user_id, brew_id, template_id, title)
      select user_id, brew_id, template_id, 'Widget portfolio' from portfolio where id = ${portfolioId}
      returning id
    `)[0]?.id ?? "";

    // 아직 굳히지 않았다 — 기본 지면은 코드에 있고 id가 없다.
    const before = await service.widgets(userId, boardId);
    expect(before.customized).toBe(false);
    expect(before.widgets).toHaveLength(9);
    expect(before.widgets.every(({ id }) => id === null)).toBe(true);
    expect(await sql<IdRow[]>`select id from dashboard_view where portfolio_id = ${boardId}`)
      .toHaveLength(0);

    const materialized = await service.materializeLayout(userId, boardId, "30d");
    expect(materialized.customized).toBe(true);
    expect(materialized.widgets.every(({ id }) => id !== null)).toBe(true);
    // 두 번 눌러도 하나다.
    expect((await service.materializeLayout(userId, boardId, "30d")).widgets).toHaveLength(9);

    const added = await service.addWidget(userId, boardId, { metricKey: "file_downloads" }, "30d");
    expect(added.widgets).toHaveLength(10);
    expect(added.widgets.at(-1))
      .toMatchObject({ metricKey: "file_downloads", visualization: "number", span: 3 });

    // 세고 있지 않은 지표는 놓을 수 없다 — 그릴 것이 없는 위젯은 위젯이 아니다.
    await expect(service.addWidget(userId, boardId, { metricKey: "returning_rate" }, "30d"))
      .rejects.toMatchObject({ statusCode: 409 });
    // 그 지표가 낼 수 없는 그림도 막는다.
    await expect(service.addWidget(userId, boardId, { metricKey: "visits", visualization: "donut" }, "30d"))
      .rejects.toMatchObject({ statusCode: 422 });

    const widgetId = added.widgets.at(-1)?.id ?? "";
    const updated = await service.updateWidget(userId, widgetId, { visualization: "spark", span: 4 });
    expect(updated.widgets.find(({ id }) => id === widgetId))
      .toMatchObject({ visualization: "spark", span: 4 });
    await expect(service.updateWidget(userId, widgetId, { visualization: "note" }))
      .rejects.toMatchObject({ statusCode: 422 });

    // 끌어 놓기 — 맨 뒤 위젯을 맨 앞으로. 나머지가 한 칸씩 따라 민다.
    const placed = (await service.widgets(userId, boardId)).widgets;
    const moved = [placed[9], ...placed.slice(0, 9)].map((widget) => widget?.id ?? "");
    const reordered = await service.reorderWidgets(userId, boardId, moved);
    expect(reordered.widgets.map(({ metricKey }) => metricKey)[0]).toBe("file_downloads");
    expect(reordered.widgets.map(({ order }) => order)).toEqual([...Array(10).keys()]);

    // 낡은 목록으로 순서를 덮지 않는다.
    await expect(service.reorderWidgets(userId, boardId, moved.slice(0, 5)))
      .rejects.toMatchObject({ statusCode: 409 });

    // 끼워 넣기 — 놓은 자리부터 뒤로 민다.
    const inserted = await service.addWidget(userId, boardId, { metricKey: "link_clicks", index: 1 }, "30d");
    expect(inserted.widgets.map(({ metricKey }) => metricKey).slice(0, 3))
      .toEqual(["file_downloads", "link_clicks", "visits"]);
    expect(inserted.widgets.map(({ order }) => order)).toEqual([...Array(11).keys()]);
    await service.deleteWidget(userId, inserted.widgets[1]?.id ?? "");

    expect((await service.deleteWidget(userId, widgetId)).widgets).toHaveLength(9);
    await expect(service.deleteWidget(userId, widgetId)).rejects.toMatchObject({ statusCode: 404 });

    // 초기화는 비우는 것이 아니라 처음으로 되돌리는 것이다.
    await service.deleteWidget(userId, (await service.widgets(userId, boardId)).widgets[0]?.id ?? "");
    const reset = await service.resetLayout(userId, boardId);
    expect(reset.customized).toBe(false);
    expect(reset.widgets).toHaveLength(9);
    expect(await sql<IdRow[]>`select id from widget where user_id = ${userId} and dashboard_view_id in (
      select id from dashboard_view where portfolio_id = ${boardId})`).toHaveLength(0);
  });

  it("배포한 적 없는 포트폴리오는 볼 것이 없다", async () => {
    const draftId = (await sql<IdRow[]>`
      insert into portfolio (user_id, brew_id, template_id, title)
      select user_id, brew_id, template_id, 'Draft portfolio' from portfolio where id = ${portfolioId}
      returning id
    `)[0]?.id ?? "";
    await expect(service.dashboard(userId, draftId, "30d")).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.dashboard(userId, randomUUID(), "30d")).rejects.toMatchObject({ statusCode: 404 });
  });
});

