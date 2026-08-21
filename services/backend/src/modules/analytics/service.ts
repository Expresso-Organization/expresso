import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

import {
  AnalyticsDashboardSchema,
  InsightSchema,
  type AddWidget,
  type AnalyticsEvent,
  type AnalyticsMetrics,
  type AnalyticsPeriodPreset,
  type DashboardViewInput,
  type EntitlementCapability,
  type MetricKey,
  type UpdateWidget,
  type Widget,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";

import {
  DEFAULT_LAYOUT,
  metricCatalog,
  metricDefaults,
  metricIsCollected,
  supports,
} from "./metrics.js";
import type { InsightWriter } from "./writer.js";
import { withTimeout } from "../../platform/timeouts.js";
import type { ConsentService } from "../consent/service.js";
import type { EntitlementService } from "../entitlements/service.js";

import { addOutboxEvent } from "../../platform/outbox.js";

interface DeploymentOwnerRow {
  id: string;
  user_id: string;
  portfolio_id: string;
  snapshot: { sections?: Array<{ id?: string }> };
}

interface MetricRow { metric_key: string; value: string | number; sample_size: number }

export interface InsightDraft {
  narrative: string;
  evidenceMetrics: string[];
  suggestions: { direction: "up" | "down"; target: string; action: string }[];
}

export class AnalyticsError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AnalyticsError";
    this.statusCode = statusCode;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeReferrer(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin.slice(0, 500);
  } catch {
    return null;
  }
}

export function validateInsightDraft(draft: InsightDraft, availableMetricKeys: ReadonlySet<string>): InsightDraft {
  const speculative = /(?:아마|추정|가능성이|일s*것|probably|likely|maybe|might|could)/i;
  if (speculative.test(draft.narrative)
    || draft.suggestions.some(({ action }) => speculative.test(action))) {
    throw new AnalyticsError(400, "speculative insight is not allowed");
  }
  if (draft.evidenceMetrics.length === 0 || draft.evidenceMetrics.some((key) => !availableMetricKeys.has(key))) {
    throw new AnalyticsError(400, "insight evidence metric is missing");
  }
  if (draft.suggestions.length > 2) throw new AnalyticsError(400, "too many insight suggestions");
  // 제안이 가리키는 지표도 집계에 있어야 한다. 없는 것을 올리자고 할 수 없다.
  if (draft.suggestions.some(({ target }) => !availableMetricKeys.has(target))) {
    throw new AnalyticsError(400, "insight suggestion target is missing");
  }
  return draft;
}

export class AnalyticsService {
  readonly #sql: SqlTag;
  readonly #visitorSalt: string;
  readonly #writer: InsightWriter | null;
  readonly #consent: ConsentService | null;
  readonly #entitlements: EntitlementService | null;
  readonly #minimumSample: number;
  readonly #rateLimit: number;

  constructor(
    sql: SqlTag,
    options: {
      visitorSalt?: string; minimumSample?: number; rateLimit?: number;
      writer?: InsightWriter | null;
      consent?: ConsentService | null;
      entitlements?: EntitlementService | null;
    } = {},
  ) {
    this.#sql = sql;
    this.#writer = options.writer ?? null;
    this.#consent = options.consent ?? null;
    this.#entitlements = options.entitlements ?? null;
    this.#visitorSalt = options.visitorSalt ?? "expresso-local-analytics-salt";
    // §8.3 — 표본 30 미만이면 해설을 내지 않는다. 테스트는 이 문턱을 낮춰 잡는다.
    this.#minimumSample = options.minimumSample ?? 30;
    this.#rateLimit = options.rateLimit ?? 120;
  }

  async collect(input: AnalyticsEvent, authenticatedUserId?: string) {
    const serialized = JSON.stringify(input);
    const payloadBytes = Buffer.byteLength(serialized, "utf8");
    if (payloadBytes > 8_192) throw new AnalyticsError(413, "analytics payload exceeds 8KB");
    const sessionHash = sha256(`${this.#visitorSalt}:${input.sessionId}`);
    const payloadHash = sha256(serialized);
    return this.#sql.begin(async (transaction) => {
      const deployment = (await transaction<DeploymentOwnerRow[]>`
        select deployment.id, deployment.user_id, deployment.portfolio_id, deployment.snapshot
        from deployment join portfolio on portfolio.current_deployment_id = deployment.id
        where deployment.subdomain = ${input.slug} and portfolio.status = 'published'
      `)[0];
      if (!deployment) throw new AnalyticsError(404, "published deployment not found");
      await transaction`select get_lock(left(concat('an:', ${sessionHash}), 64), 10)`;
      const existing = (await transaction<{ payload_hash: string }[]>`
        select payload_hash from analytics_event_receipt where event_id = ${input.eventId}
      `)[0];
      if (existing) {
        if (existing.payload_hash !== payloadHash) throw new AnalyticsError(409, "event ID reused with different payload");
        return { accepted: true, duplicate: true, eventId: input.eventId };
      }
      const recent = Number((await transaction<{ count: number }[]>`
        select count(*) as count from analytics_event_receipt
        where visitor_hash = ${sessionHash} and received_at > now(6) - interval 1 minute
      `)[0]?.count ?? 0);
      if (recent >= this.#rateLimit) throw new AnalyticsError(429, "analytics rate limit exceeded");
      const occurredAt = new Date(input.occurredAt);
      await transaction`
        insert into analytics_event_receipt (
          event_id, user_id, deployment_id, event_type, visitor_hash, payload_hash, payload_bytes, occurred_at
        ) values (
          ${input.eventId}, ${deployment.user_id}, ${deployment.id}, ${input.type}, ${sessionHash}, ${payloadHash}, ${payloadBytes}, ${occurredAt}
        )
      `;
      const isOwner = authenticatedUserId === deployment.user_id;
      if (input.type === "visit") {
        await transaction`
          insert into visit_event (user_id, deployment_id, session_id, referrer, is_owner, started_at, event_id, duration_ms)
          values (${deployment.user_id}, ${deployment.id}, ${sessionHash}, ${safeReferrer(input.referrer)}, ${isOwner}, ${occurredAt}, ${input.eventId}, ${input.durationMs ?? null})
        `;
      } else {
        const visit = (await transaction<{ id: string }[]>`
          select id from visit_event where user_id = ${deployment.user_id} and deployment_id = ${deployment.id}
            and session_id = ${sessionHash} order by started_at desc limit 1
        `)[0];
        if (!visit) throw new AnalyticsError(409, "visit event must be collected first");
        if (input.type === "complete") {
          await transaction`
            update visit_event set completed = true, duration_ms = coalesce(${input.durationMs ?? null}, duration_ms)
            where id = ${visit.id}
          `;
        } else if (input.type === "section_view") {
          const sectionIds = new Set((deployment.snapshot.sections ?? []).map(({ id }) => id));
          if (!input.sectionId || !sectionIds.has(input.sectionId)) throw new AnalyticsError(400, "section is not in deployment snapshot");
          await transaction`
            insert into section_view (user_id, visit_event_id, portfolio_section_id, dwell_ms, scroll_depth, event_id, occurred_at)
            values (${deployment.user_id}, ${visit.id}, ${input.sectionId}, ${input.dwellMs!}, ${input.scrollDepth!}, ${input.eventId}, ${occurredAt})
          `;
        } else {
          await transaction`
            insert into conversion_event (user_id, visit_event_id, kind, target, event_id, occurred_at)
            values (${deployment.user_id}, ${visit.id}, ${input.type}, ${input.target!}, ${input.eventId}, ${occurredAt})
          `;
        }
      }
      return { accepted: true, duplicate: false, eventId: input.eventId };
    });
  }

  /**
   * 하루치를 다시 세 달라고 큐에 넣는다.
   *
   * 멱등 키에 **요청한 시각(분)**이 들어간다. `deployment:date`만으로 묶으면 그 날은
   * 평생 한 번만 셀 수 있게 되는데, 늦게 도착한 이벤트가 있거나 집계가 지워졌으면
   * 다시 세야 한다. 집계 자체가 upsert라 두 번 돌아도 결과가 같으므로, 여기서
   * 막을 것은 같은 순간의 이중 제출뿐이다.
   */
  async requestAggregation(userId: string, deploymentId: string, date: string, at = new Date()) {
    const deployment = (await this.#sql<{ id: string }[]>`
      select id from deployment where id = ${deploymentId} and user_id = ${userId}
    `)[0];
    if (!deployment) throw new AnalyticsError(404, "deployment not found");
    await addOutboxEvent(this.#sql, {
      topic: "analytics.aggregate",
      payload: { userId, deploymentId, date },
      idempotencyKey: `analytics-aggregate:${deploymentId}:${date}:${at.toISOString().slice(0, 16)}`,
    });
    return { deploymentId, date, status: "queued" as const };
  }

  async aggregateDay(deploymentId: string, date: string) {
    const deployment = (await this.#sql<{ user_id: string }[]>`select user_id from deployment where id = ${deploymentId}`)[0];
    if (!deployment) throw new AnalyticsError(404, "deployment not found");
    const start = `${date}T00:00:00.000Z`;
    const end = new Date(new Date(start).getTime() + 86_400_000).toISOString();
    const values = (await this.#sql<{
      visits: number; completes: number; contacts: number; downloads: number; links: number;
      section_views: number; dwell_ms: number;
    }[]>`
      with eligible_visits as (
        select id, completed from visit_event
        where deployment_id = ${deploymentId} and started_at >= ${start} and started_at < ${end}
          and not is_owner
      )
      select
        (select count(*) from eligible_visits) as visits,
        (select count(*) from eligible_visits where completed) as completes,
        (select count(*) from conversion_event join eligible_visits on eligible_visits.id = conversion_event.visit_event_id
          where conversion_event.kind = 'contact_click' and occurred_at >= ${start} and occurred_at < ${end}) as contacts,
        (select count(*) from conversion_event join eligible_visits on eligible_visits.id = conversion_event.visit_event_id
          where conversion_event.kind = 'file_download' and occurred_at >= ${start} and occurred_at < ${end}) as downloads,
        (select count(*) from conversion_event join eligible_visits on eligible_visits.id = conversion_event.visit_event_id
          where conversion_event.kind = 'link_click' and occurred_at >= ${start} and occurred_at < ${end}) as links,
        (select count(*) from section_view join eligible_visits on eligible_visits.id = section_view.visit_event_id
          where dwell_ms >= 1000 and occurred_at >= ${start} and occurred_at < ${end}) as section_views,
        (select coalesce(sum(dwell_ms), 0) from section_view join eligible_visits on eligible_visits.id = section_view.visit_event_id
          where dwell_ms >= 1000 and occurred_at >= ${start} and occurred_at < ${end}) as dwell_ms
    `)[0] ?? { visits: 0, completes: 0, contacts: 0, downloads: 0, links: 0, section_views: 0, dwell_ms: 0 };
    const metrics = {
      visits: values.visits,
      completes: values.completes,
      contact_clicks: values.contacts,
      file_downloads: values.downloads,
      link_clicks: values.links,
      eligible_section_views: values.section_views,
      total_section_dwell_ms: values.dwell_ms,
    };
    await this.#sql.begin(async (transaction) => {
      for (const [key, value] of Object.entries(metrics)) await transaction`
        insert into metric_daily (user_id, deployment_id, date, metric_key, value, sample_size)
        values (${deployment.user_id}, ${deploymentId}, ${date}, ${key}, ${value}, ${values.visits})
        as new on duplicate key update value = new.value, sample_size = new.sample_size
      `;
    });
    return metrics;
  }

  async calculateDerived(userId: string, deploymentId: string, date: string, numeratorKey: string, denominatorKey: string) {
    const rows = await this.#sql<MetricRow[]>`
      select metric_key, value, sample_size from metric_daily
      where user_id = ${userId} and deployment_id = ${deploymentId} and date = ${date}
        and metric_key in (${numeratorKey}, ${denominatorKey})
    `;
    const values = new Map(rows.map((row) => [row.metric_key, Number(row.value)]));
    const denominator = values.get(denominatorKey);
    const numerator = values.get(numeratorKey);
    if (denominator === undefined || numerator === undefined) throw new AnalyticsError(404, "metric input not found");
    if (denominator === 0) throw new AnalyticsError(400, "derived metric denominator is zero");
    return { numeratorKey, denominatorKey, value: numerator / denominator };
  }

  async createDashboardView(userId: string, portfolioId: string, input: DashboardViewInput) {
    try {
      const viewId = randomUUID();
      // 여섯 개 제한을 세는 동안 다른 요청이 끼어들면 둘 다 통과한다. 포트폴리오
      // 한 줄을 먼저 잠가 차례를 만든다 — PostgreSQL 에서는 트리거가 하던 일인데,
      // MySQL 트리거는 바깥 문장이 쓰고 있는 표를 잠그지 못한다.
      const row = await this.#sql.begin(async (transaction) => {
        const owner = (await transaction<{ id: string }[]>`
          select id from portfolio where id = ${portfolioId} and user_id = ${userId} for update
        `)[0];
        if (!owner) throw new AnalyticsError(404, "portfolio not found");
        await transaction`
          insert into dashboard_view (id, user_id, portfolio_id, name, period, is_default)
          values (${viewId}, ${userId}, ${portfolioId}, ${input.name}, ${input.period}, ${input.isDefault})
        `;
        return { id: viewId };
      });
      return { id: row.id, portfolioId, ...input };
    } catch (error) {
      if (error instanceof AnalyticsError) throw error;
      if (typeof error === "object" && error !== null && "sqlState" in error && error.sqlState === "45000") {
        throw new AnalyticsError(409, "dashboard view limit exceeded");
      }
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23514") {
        throw new AnalyticsError(409, "dashboard view limit exceeded");
      }
      throw error;
    }
  }

  /**
   * §8.3 「분석 해설」.
   *
   * 표본 30 미만이면 여기까지 오지 않는다 — 계약을 아예 부르지 않는다. 표본이
   * 작으면 아무 말이나 할 수 있게 되는데, 그런 해설은 없느니만 못하다.
   *
   * 계약이 없거나 실패하면 숫자를 다시 읽어 주는 한 문장으로 돌아간다. 해설이
   * 없다고 대시보드가 열리지 않으면 안 된다.
   */
  async #note(
    userId: string, deploymentId: string, start: string, end: string,
    sampleSize: number, metricMap: Map<string, number>,
  ): Promise<InsightDraft> {
    const fallback: InsightDraft = {
      narrative: `${start}부터 ${end}까지 방문 ${sampleSize}건 중 완독 ${metricMap.get("completes") ?? 0}건이 집계되었습니다.`,
      evidenceMetrics: ["visits", "completes"],
      suggestions: [],
    };
    if (!this.#writer) return fallback;

    try {
      await this.#consent?.require(userId, "insight_note");
      const [sections, referrers, domains] = await Promise.all([
        this.#sql<{ title: string | null; views: number; dwell_ms: number }[]>`
          select recipe_section.title,
                 count(*) as views,
                 coalesce(sum(section_view.dwell_ms), 0) as dwell_ms
          from section_view
          join visit_event on visit_event.id = section_view.visit_event_id
          join portfolio_section on portfolio_section.id = section_view.portfolio_section_id
          left join recipe_section on recipe_section.id = portfolio_section.recipe_section_id
          where section_view.user_id = ${userId} and visit_event.deployment_id = ${deploymentId}
            and section_view.occurred_at >= ${start}
            and section_view.occurred_at < (${end} + 1)
          group by recipe_section.title, portfolio_section.order_no
          order by portfolio_section.order_no
        `,
        this.#sql<{ origin: string; visits: number }[]>`
          select coalesce(referrer, '(직접 방문)') as origin, count(*) as visits
          from visit_event
          where user_id = ${userId} and deployment_id = ${deploymentId} and not is_owner
            and started_at >= ${start} and started_at < (${end} + 1)
          group by 1 order by 2 desc limit 6
        `,
        this.#sql<{ domain: string; visits: number }[]>`
          select org_domain as domain, count(*) as visits
          from visit_event
          where user_id = ${userId} and deployment_id = ${deploymentId} and not is_owner
            and org_domain is not null
            and started_at >= ${start} and started_at < (${end} + 1)
          group by 1 order by 2 desc limit 6
        `,
      ]);

      const note = await withTimeout(this.#writer.write({
        period: { start, end },
        sampleSize,
        metrics: Object.fromEntries(metricMap),
        sections: sections.map(({ title, views, dwell_ms }) => ({
          title: title ?? "", views, dwellMs: dwell_ms,
        })),
        referrers,
        domains,
      }), 120_000, "insight writer");
      return note;
    } catch (error) {
      console.error(JSON.stringify({
        level: "warn",
        event: "insight.draft_failed",
        deploymentId,
        message: error instanceof Error ? error.message : String(error),
      }));
      return fallback;
    }
  }

  async insight(userId: string, deploymentId: string, start: string, end: string, draft?: InsightDraft) {
    const rows = await this.#sql<MetricRow[]>`
      select metric_key, sum(value) as value, max(sample_size) as sample_size
      from metric_daily where user_id = ${userId} and deployment_id = ${deploymentId}
        and date between ${start} and ${end}
      group by metric_key
    `;
    const metricMap = new Map(rows.map((row) => [row.metric_key, Number(row.value)]));
    const sampleSize = metricMap.get("visits") ?? 0;
    if (sampleSize < this.#minimumSample) return InsightSchema.parse({
      visibility: "hidden", reason: "INSUFFICIENT_SAMPLE", sampleSize, minimumSample: this.#minimumSample,
    });
    const generated = validateInsightDraft(
      draft ?? await this.#note(userId, deploymentId, start, end, sampleSize, metricMap),
      new Set(metricMap.keys()),
    );
    await this.#sql`
      insert into insight (user_id, deployment_id, period_start, period_end, narrative, evidence_metrics, suggestions)
      values (${userId}, ${deploymentId}, ${start}, ${end}, ${generated.narrative}, ${this.#sql.array(generated.evidenceMetrics)}, ${this.#sql.json(generated.suggestions)})
    `;
    return InsightSchema.parse({ visibility: "visible", ...generated, period: { start, end }, sampleSize });
  }

  // ── 07 분석 대시보드 ────────────────────────────────────────────────

  /** 07이 여는 포트폴리오의 지금 배포. 배포한 적이 없으면 볼 것이 없다. */
  async #deployment(userId: string, portfolioId: string): Promise<DashboardDeploymentRow> {
    const row = (await this.#sql<DashboardDeploymentRow[]>`
      select portfolio.title,
             deployment.id, deployment.subdomain, deployment.custom_domain, deployment.published_at
      from portfolio
      left join deployment on deployment.id = portfolio.current_deployment_id
      where portfolio.id = ${portfolioId} and portfolio.user_id = ${userId}
    `)[0];
    if (!row) throw new AnalyticsError(404, "portfolio not found");
    if (!row.id) throw new AnalyticsError(409, "portfolio has never been published");
    return row;
  }

  /**
   * 기간을 날짜 두 개로 바꾼다.
   *
   * 하루의 경계는 집계와 같은 **UTC 자정**이다. 화면과 집계가 다른 하루를 쓰면
   * 어느 날 수가 하루씩 어긋나고, 그건 아무도 못 찾는다.
   */
  async #period(deploymentId: string, preset: AnalyticsPeriodPreset, today: string) {
    if (preset !== "all") {
      return { preset, start: shiftDate(today, 1 - (preset === "7d" ? 7 : 30)), end: today };
    }
    const first = (await this.#sql<{ date: string | null }[]>`
      select min(started_at) as date
      from visit_event where deployment_id = ${deploymentId} and not is_owner
    `)[0]?.date;
    return { preset, start: first && first < today ? first : today, end: today };
  }

  async #metrics(userId: string, deploymentId: string, start: string, end: string) {
    const rows = await this.#sql<{ metric_key: string; value: string }[]>`
      select metric_key, sum(value) as value from metric_daily
      where user_id = ${userId} and deployment_id = ${deploymentId}
        and date between ${start} and ${end}
      group by metric_key
    `;
    const metrics: AnalyticsMetrics = { ...EMPTY_METRICS };
    for (const row of rows) {
      const field = METRIC_FIELD[row.metric_key];
      if (field) metrics[field] = Math.round(Number(row.value));
    }
    return { metrics, found: rows.length > 0 };
  }

  /**
   * 어느 날까지 집계가 끝났나.
   *
   * 방문은 들어오는 즉시 쌓이지만 수는 밤에 한 번 계산된다(`analytics_daily`).
   * 그래서 오늘 들어온 방문은 어느 타일에도 없다 — 화면이 그걸 말해야 사용자가
   * 우리를 의심하지 않는다.
   */
  async #coverage(userId: string, deploymentId: string, start: string, end: string) {
    const rows = await this.#sql<{ date: string; aggregated: boolean }[]>`
      with visited as (
        select distinct started_at as date
        from visit_event
        where user_id = ${userId} and deployment_id = ${deploymentId} and not is_owner
          and started_at between ${start} and ${end}
      ), aggregated as (
        select distinct date from metric_daily
        where user_id = ${userId} and deployment_id = ${deploymentId}
          and metric_key = 'visits' and date between ${start} and ${end}
      )
      select visited.date as date, (aggregated.date is not null) as aggregated
      from visited left join aggregated on aggregated.date = visited.date
      order by visited.date
    `;
    return {
      days: rows.length,
      aggregatedDays: rows.filter(({ aggregated }) => aggregated).length,
      pendingDates: rows.filter(({ aggregated }) => !aggregated).map(({ date }) => date),
      /** 실제로 세어 둔 날. 나눠 보기도 이 날들만 센다. */
      countedDates: rows.filter(({ aggregated }) => aggregated).map(({ date }) => date),
    };
  }

  /**
   * 07이 한 번에 읽는 것.
   *
   * 숫자는 집계에서, 나눠 보기(섹션 · 유입 · 도메인)는 원본 이벤트에서 온다.
   * 원본을 다시 세는 것은 나눠 보기가 집계 테이블에 없기 때문이고, 셀 때는
   * 집계와 **같은 규칙**을 쓴다 — 소유자 방문 제외, 1초 미만 섹션 제외.
   *
   * 그리고 **같은 날들만** 센다. 타일은 집계된 날에서, 도넛은 원본 전체에서
   * 세면 한 화면이 방문 6건과 24건을 동시에 말한다. 아직 세지 않은 날은
   * 어느 쪽에도 넣지 않고, 그런 날이 있다는 것만 따로 말한다.
   */
  async dashboard(userId: string, portfolioId: string, preset: AnalyticsPeriodPreset) {
    const deployment = await this.#deployment(userId, portfolioId);
    const deploymentId = deployment.id as string;
    const period = await this.#period(deploymentId, preset, isoDate(new Date()));
    const { start, end } = period;
    const length = daysBetween(start, end);
    const coverage = await this.#coverage(userId, deploymentId, start, end);
    const counted = coverage.countedDates;

    const [current, previous, trend, sections, referrers, stored, views, entitlement, layout] =
      await Promise.all([
        this.#metrics(userId, deploymentId, start, end),
        preset === "all"
          ? Promise.resolve(null)
          : this.#metrics(userId, deploymentId, shiftDate(start, -length), shiftDate(start, -1)),
        this.#sql<{ date: string; visits: number; completes: number }[]>`
          select date as date,
                 coalesce(max(case when metric_key = 'visits' then value end), 0) as visits,
                 coalesce(max(case when metric_key = 'completes' then value end), 0) as completes
          from metric_daily
          where user_id = ${userId} and deployment_id = ${deploymentId}
            and date between ${start} and ${end}
          group by date order by date
        `,
        this.#sql<{ id: string; title: string; views: number; dwell_ms: number }[]>`
          select portfolio_section.id,
                 coalesce(recipe_section.title, '') as title,
                 count(*) as views,
                 coalesce(sum(section_view.dwell_ms), 0) as dwell_ms
          from section_view
          join visit_event on visit_event.id = section_view.visit_event_id
          join portfolio_section on portfolio_section.id = section_view.portfolio_section_id
          left join recipe_section on recipe_section.id = portfolio_section.recipe_section_id
          where section_view.user_id = ${userId} and visit_event.deployment_id = ${deploymentId}
            and not visit_event.is_owner and section_view.dwell_ms >= 1000
            and section_view.occurred_at in ${this.#sql(counted)}
          group by portfolio_section.id, recipe_section.title
          order by dwell_ms desc limit 50
        `,
        this.#sql<{ origin: string | null; visits: number }[]>`
          select referrer as origin, count(*) as visits
          from visit_event
          where user_id = ${userId} and deployment_id = ${deploymentId} and not is_owner
            and started_at in ${this.#sql(counted)}
          group by referrer order by visits desc limit 8
        `,
        this.#sql<StoredInsightRow[]>`
          select narrative, evidence_metrics, suggestions, generated_at
          from insight
          where user_id = ${userId} and deployment_id = ${deploymentId}
            and period_start = ${start} and period_end = ${end}
          order by generated_at desc limit 1
        `,
        this.#sql<{ id: string; name: string; period: string; is_default: boolean }[]>`
          select id, name, period, is_default from dashboard_view
          where user_id = ${userId} and portfolio_id = ${portfolioId}
          order by is_default desc, name limit 6
        `,
        this.#entitlements?.check(userId, "analytics.organization_domains") ?? null,
        this.widgets(userId, portfolioId),
      ]);

    const domains = entitlement?.allowed
      ? await this.#sql<{ domain: string; visits: number; dwell_ms: number; last_visit_at: Date }[]>`
          select visit_event.org_domain as domain,
                 count(distinct visit_event.id) as visits,
                 coalesce(sum(section_view.dwell_ms), 0) as dwell_ms,
                 max(visit_event.started_at) as last_visit_at
          from visit_event
          left join section_view on section_view.visit_event_id = visit_event.id
            and section_view.dwell_ms >= 1000
          where visit_event.user_id = ${userId} and visit_event.deployment_id = ${deploymentId}
            and not visit_event.is_owner and visit_event.org_domain is not null
            and visit_event.started_at in ${this.#sql(counted)}
          group by visit_event.org_domain
          order by visits desc limit 20
        `
      : [];

    const sampleSize = current.metrics.visits;
    const note = stored[0];

    return AnalyticsDashboardSchema.parse({
      portfolio: { id: portfolioId, title: deployment.title },
      deployment: {
        id: deploymentId,
        subdomain: deployment.subdomain,
        customDomain: deployment.custom_domain,
        publishedAt: deployment.published_at?.toISOString() ?? null,
      },
      period,
      coverage: {
        days: coverage.days,
        aggregatedDays: coverage.aggregatedDays,
        pendingDates: coverage.pendingDates,
      },
      metrics: current.metrics,
      // 비교할 집계가 아예 없으면 0이 아니라 없음이다. 0은 "방문이 없었다"는 뜻이다.
      previous: previous?.found ? previous.metrics : null,
      trend,
      sections: sections.map(({ id, title, views: seen, dwell_ms }) => ({
        sectionId: id, title, views: seen, dwellMs: dwell_ms,
      })),
      referrers,
      organizations: entitlement?.allowed
        ? {
          entitled: true,
          domains: domains.map(({ domain, visits, dwell_ms, last_visit_at }) => ({
            domain, visits, dwellMs: dwell_ms, lastVisitAt: last_visit_at.toISOString(),
          })),
        }
        : { entitled: false },
      insight: sampleSize < this.#minimumSample
        ? { state: "insufficient_sample", sampleSize, minimumSample: this.#minimumSample }
        : note
          ? {
            state: "ready",
            narrative: note.narrative,
            evidenceMetrics: note.evidence_metrics,
            suggestions: note.suggestions,
            generatedAt: note.generated_at.toISOString(),
          }
          : { state: "none" },
      views: views.map(({ id, name, period: viewPeriod, is_default }) => ({
        id, name, period: viewPeriod, isDefault: is_default,
      })),
      customized: layout.customized,
      widgets: layout.widgets,
    });
  }

  /** 07의 "지금 집계" — 아직 계산되지 않은 날만 큐에 넣는다. */
  async requestPendingAggregation(userId: string, portfolioId: string, preset: AnalyticsPeriodPreset) {
    const deployment = await this.#deployment(userId, portfolioId);
    const deploymentId = deployment.id as string;
    const { start, end } = await this.#period(deploymentId, preset, isoDate(new Date()));
    const { pendingDates } = await this.#coverage(userId, deploymentId, start, end);
    const at = new Date();
    for (const date of pendingDates) {
      await this.requestAggregation(userId, deploymentId, date, at);
    }
    return { queued: pendingDates };
  }

  // ── 07b 지표 라이브러리 · 위젯 ───────────────────────────────────────

  /** 07b가 여는 목록. 못 쓰는 것도 왜 못 쓰는지와 함께 남는다. */
  async catalog(userId: string) {
    const decisions = new Map<EntitlementCapability, boolean>();
    for (const capability of ["analytics.organization_domains", "analytics.returning_visitors"] as const) {
      const decision = await this.#entitlements?.check(userId, capability);
      decisions.set(capability, decision?.allowed ?? false);
    }
    return metricCatalog((capability) => decisions.get(capability) ?? false);
  }

  /** 이 포트폴리오의 지면을 담는 뷰. 아직 굳히지 않았으면 null. */
  async #view(userId: string, portfolioId: string) {
    return (await this.#sql<{ id: string }[]>`
      select id from dashboard_view
      where user_id = ${userId} and portfolio_id = ${portfolioId} and is_default
    `)[0]?.id ?? null;
  }

  async #widgetsOf(viewId: string): Promise<Widget[]> {
    const rows = await this.#sql<WidgetRow[]>`
      select id, metric_key, visualization, compare_to, position from widget
      where dashboard_view_id = ${viewId}
      order by (position ->> '$.order') is null, (position ->> '$.order'), id
    `;
    return rows.map((row, index) => ({
      id: row.id,
      metricKey: row.metric_key as MetricKey,
      visualization: row.visualization as Widget["visualization"],
      span: (row.position.span ?? 3) as Widget["span"],
      compareTo: row.compare_to as Widget["compareTo"],
      order: index,
    }));
  }

  /** 지금 이 지면. 굳히지 않았으면 코드가 정한 기본 목록을 그대로 낸다. */
  async widgets(userId: string, portfolioId: string) {
    const viewId = await this.#view(userId, portfolioId);
    if (!viewId) {
      return { customized: false, widgets: DEFAULT_LAYOUT.map((widget) => ({ ...widget, id: null })) };
    }
    return { customized: true, widgets: await this.#widgetsOf(viewId) };
  }

  /**
   * 기본 지면을 내 것으로 굳힌다. "대시보드 편집"을 누를 때 한 번.
   *
   * 화면을 여는 것만으로 굳히지 않는다 — 아무것도 고칠 생각이 없는 사람의
   * 계정에 위젯 아홉 줄을 심어 둘 이유가 없다. 두 번 눌러도 하나다.
   */
  async materializeLayout(userId: string, portfolioId: string, preset: AnalyticsPeriodPreset) {
    const existing = await this.#view(userId, portfolioId);
    if (existing) return { customized: true, widgets: await this.#widgetsOf(existing) };

    const viewId = await this.#sql.begin(async (transaction) => {
      const defaultViewId = randomUUID();
      await transaction`
        insert into dashboard_view (id, user_id, portfolio_id, name, period, is_default)
        select ${defaultViewId}, ${userId}, id, '기본', ${preset}, true
        from portfolio where id = ${portfolioId} and user_id = ${userId}
      `;
      const row = (await transaction<{ id: string }[]>`
        select id from dashboard_view where id = ${defaultViewId}
      `)[0];
      if (!row) throw new AnalyticsError(404, "portfolio not found");
      for (const widget of DEFAULT_LAYOUT) await insertWidget(transaction, userId, row.id, widget);
      return row.id;
    }).catch((error: unknown) => {
      // 뷰 여섯 개를 이미 만들어 두면 굳힐 자리가 없다. 뷰 관리 화면이 아직 없어
      // API로만 닿는 자리다 — 조용히 실패하지 않게 그대로 말한다.
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23514") {
        throw new AnalyticsError(409, "dashboard view limit exceeded");
      }
      throw error;
    });
    return { customized: true, widgets: await this.#widgetsOf(viewId) };
  }

  /** 07b에서 끌어다 놓기. 맨 뒤에 붙는다. */
  async addWidget(userId: string, portfolioId: string, input: AddWidget, preset: AnalyticsPeriodPreset) {
    // 세고 있지 않은 지표는 놓을 수 없다. 그릴 것이 없는 위젯은 위젯이 아니다.
    if (!metricIsCollected(input.metricKey)) {
      throw new AnalyticsError(409, `${input.metricKey} is not collected yet`);
    }
    const defaults = metricDefaults(input.metricKey);
    const visualization = input.visualization ?? defaults.visualization;
    if (!supports(input.metricKey, visualization)) {
      throw new AnalyticsError(422, `${input.metricKey} cannot be drawn as ${visualization}`);
    }
    await this.materializeLayout(userId, portfolioId, preset);
    const viewId = await this.#view(userId, portfolioId);
    if (!viewId) throw new AnalyticsError(404, "dashboard view not found");

    await this.#sql.begin(async (transaction) => {
      const last = (await transaction<{ next: number }[]>`
        select coalesce(max((position ->> '$.order')) + 1, 0) as next
        from widget where dashboard_view_id = ${viewId}
      `)[0]?.next ?? 0;
      const order = input.index === undefined ? last : Math.min(input.index, last);
      // 끼워 넣은 자리부터 뒤로 한 칸씩 민다. 안 밀면 두 위젯이 같은 자리를 갖는다.
      if (order < last) await transaction`
        update widget
        set position = json_set(position, '$.order', cast(position ->> '$.order' as unsigned) + 1)
        where dashboard_view_id = ${viewId} and (position ->> '$.order') >= ${order}
      `;
      await insertWidget(transaction, userId, viewId, {
        metricKey: input.metricKey,
        visualization,
        span: input.span ?? defaults.span,
        compareTo: null,
        order,
      });
    });
    return { customized: true, widgets: await this.#widgetsOf(viewId) };
  }

  /**
   * 끌어 놓아 순서를 바꾼다.
   *
   * 지면 전체의 차례를 통째로 받는다. 보낸 목록이 지금 지면과 정확히 같지 않으면
   * 거절한다 — 화면이 낡았다는 뜻이고, 낡은 목록으로 덮으면 그 사이에 놓은
   * 위젯이 순서를 잃는다.
   */
  async reorderWidgets(userId: string, portfolioId: string, widgetIds: string[]) {
    const viewId = await this.#view(userId, portfolioId);
    // 굳히지 않은 기본 지면에는 옮길 위젯이 없다.
    if (!viewId) throw new AnalyticsError(409, "dashboard layout is not customized yet");

    const current = await this.#sql<{ id: string }[]>`
      select id from widget where dashboard_view_id = ${viewId} and user_id = ${userId}
    `;
    const known = new Set(current.map(({ id }) => id));
    const given = new Set(widgetIds);
    if (given.size !== widgetIds.length || known.size !== given.size
      || widgetIds.some((id) => !known.has(id))) {
      throw new AnalyticsError(409, "widget order does not match the current layout");
    }

    await this.#sql.begin(async (transaction) => {
      for (const [order, id] of widgetIds.entries()) await transaction`
        update widget set position = json_set(position, '$.order', ${order})
        where id = ${id} and user_id = ${userId}
      `;
    });
    return { customized: true, widgets: await this.#widgetsOf(viewId) };
  }

  /** 07c 위젯 설정. 그림과 폭과 비교 대상만 바뀐다 — 지표를 바꾸면 다른 위젯이다. */
  async updateWidget(userId: string, widgetId: string, input: UpdateWidget) {
    const row = (await this.#sql<WidgetRow[]>`
      select id, metric_key, visualization, compare_to, position from widget
      where id = ${widgetId} and user_id = ${userId}
    `)[0];
    if (!row) throw new AnalyticsError(404, "widget not found");
    const metricKey = row.metric_key as MetricKey;
    const visualization = input.visualization ?? (row.visualization as Widget["visualization"]);
    if (!supports(metricKey, visualization)) {
      throw new AnalyticsError(422, `${metricKey} cannot be drawn as ${visualization}`);
    }
    const position = { order: row.position.order ?? 0, span: input.span ?? row.position.span ?? 3 };
    const compareTo = input.compareTo === undefined ? row.compare_to : input.compareTo;
    // 다른 포트폴리오·업계 평균은 비교할 데이터가 없다. 켜 두면 위젯이 조용히 빈다.
    if (compareTo !== null && compareTo !== "prev_period") {
      throw new AnalyticsError(422, `${compareTo} comparison has no data behind it`);
    }
    await this.#sql`
      update widget
      set visualization = ${visualization}, compare_to = ${compareTo},
          position = ${this.#sql.json(position)}
      where id = ${widgetId} and user_id = ${userId}
    `;
    const viewId = (await this.#sql<{ dashboard_view_id: string }[]>`
      select dashboard_view_id from widget where id = ${widgetId}
    `)[0]?.dashboard_view_id;
    return { customized: true, widgets: viewId ? await this.#widgetsOf(viewId) : [] };
  }

  async deleteWidget(userId: string, widgetId: string) {
    const row = (await this.#sql<{ dashboard_view_id: string }[]>`
      delete from widget where id = ${widgetId} and user_id = ${userId}
      returning dashboard_view_id
    `)[0];
    if (!row) throw new AnalyticsError(404, "widget not found");
    return { customized: true, widgets: await this.#widgetsOf(row.dashboard_view_id) };
  }

  /**
   * "레이아웃 초기화" — 굳힌 것을 버리고 기본 지면으로 돌아간다.
   *
   * 위젯만 지우고 뷰를 남기면 빈 지면이 된다. 뷰째 지워서 **기본 지면을 다시
   * 보게** 한다 — 초기화는 비우는 것이 아니라 처음으로 되돌리는 것이다.
   */
  async resetLayout(userId: string, portfolioId: string) {
    await this.#sql`
      delete from dashboard_view
      where user_id = ${userId} and portfolio_id = ${portfolioId} and is_default
    `;
    return this.widgets(userId, portfolioId);
  }

  /** 07의 "해설 읽기" — 여기서만 모델을 부른다. 화면을 여는 것으로는 부르지 않는다. */
  async insightForPortfolio(userId: string, portfolioId: string, preset: AnalyticsPeriodPreset) {
    const deployment = await this.#deployment(userId, portfolioId);
    const { start, end } = await this.#period(deployment.id as string, preset, isoDate(new Date()));
    return this.insight(userId, deployment.id as string, start, end);
  }
}

interface DashboardDeploymentRow {
  title: string;
  id: string | null;
  subdomain: string | null;
  custom_domain: string | null;
  published_at: Date | null;
}

interface WidgetRow {
  id: string;
  metric_key: string;
  visualization: string;
  compare_to: string | null;
  position: { order?: number; span?: number };
}

async function insertWidget(
  sql: SqlTag | SqlTag,
  userId: string,
  viewId: string,
  widget: Omit<Widget, "id">,
) {
  await sql`
    insert into widget (user_id, dashboard_view_id, metric_key, visualization, compare_to, position)
    values (${userId}, ${viewId}, ${widget.metricKey}, ${widget.visualization}, ${widget.compareTo},
            ${sql.json({ order: widget.order, span: widget.span })})
  `;
}

interface StoredInsightRow {
  narrative: string;
  evidence_metrics: string[];
  suggestions: { direction: "up" | "down"; target: string; action: string }[];
  generated_at: Date;
}

/** 집계 키 → 읽기 모델의 칸. 여기 없는 키는 07이 쓰지 않는 것이다. */
const METRIC_FIELD: Record<string, keyof AnalyticsMetrics> = {
  visits: "visits",
  completes: "completes",
  contact_clicks: "contactClicks",
  file_downloads: "fileDownloads",
  link_clicks: "linkClicks",
  eligible_section_views: "sectionViews",
  total_section_dwell_ms: "sectionDwellMs",
};

const EMPTY_METRICS: AnalyticsMetrics = {
  visits: 0, completes: 0, contactClicks: 0, fileDownloads: 0, linkClicks: 0,
  sectionViews: 0, sectionDwellMs: 0,
};

function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  return isoDate(new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000));
}

/** 양 끝을 포함한 날 수. 7일 기간은 7이다. */
function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1;
}
