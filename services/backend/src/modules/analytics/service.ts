import { randomUUID } from "node:crypto";

import { AnalyticsDashboardSchema, DeploymentOutlineSectionSchema, InsightSchema, type AddWidget, type AnalyticsEvent, type AnalyticsMetrics, type AnalyticsPeriodPreset, type AnalyticsTrendPoint, type DashboardViewInput, type EntitlementCapability, type MetricKey, type UpdateWidget, type Widget } from "@expresso/contracts";
import { mongoCollections, type VisitEventDoc } from "@expresso/database";
import { Decimal128 } from "mongodb";

import type { MongoContext } from "../../platform/mongodb.js";
import { addMongoOutboxEvent } from "../../platform/mongo-outbox.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { readSnapshot, snapshotRefFromStored } from "../../platform/snapshot-payload.js";
import { AnalyticsError } from "./public.js";
import { validateInsightDraft, type InsightDraft } from "./public.js";
import { analyticsDigest, analyticsMinute, safeAnalyticsReferrer } from "./mongo-events.js";
import { DEFAULT_LAYOUT, metricCatalog, metricDefaults, metricIsCollected, supports } from "./metrics.js";
import type { InsightWriter } from "./writer.js";
import type { ConsentApi } from "../consent/index.js";
import type { EntitlementApi } from "../entitlements/index.js";

export class AnalyticsService {
  readonly #visitorSalt: string; readonly #rateLimit: number; readonly #minimumSample: number; readonly #writer: InsightWriter | null; readonly #consent: ConsentApi | null; readonly #entitlements: EntitlementApi | null;
  constructor(readonly context: MongoContext, options: { visitorSalt?: string; minimumSample?: number; rateLimit?: number; writer?: InsightWriter | null; consent?: ConsentApi | null; entitlements?: EntitlementApi | null } = {}) { this.#visitorSalt = options.visitorSalt ?? "expresso-local-analytics-salt"; this.#rateLimit = options.rateLimit ?? 120; this.#minimumSample = options.minimumSample ?? 30; this.#writer = options.writer ?? null; this.#consent = options.consent ?? null; this.#entitlements = options.entitlements ?? null; }
  async collect(input: AnalyticsEvent, authenticatedUserId?: string) {
    const serialized = JSON.stringify(input); const payloadBytes = Buffer.byteLength(serialized, "utf8"); if (payloadBytes > 8192) throw new AnalyticsError(413, "analytics payload exceeds 8KB");
    const receivedAt = new Date();
    // 날짜를 섞어 하루가 지나면 같은 방문자도 다른 해시가 된다. 방문자를 날짜 너머로 잇지 않는다.
    const visitorHash = analyticsDigest(`${this.#visitorSalt}:${isoDate(receivedAt)}:${input.sessionId}`); const payloadHash = analyticsDigest(serialized); const occurredAt = new Date(input.occurredAt);
    return inTransaction(this.context, async (tx) => {
      const db = mongoCollections(tx.db); const options = { session: tx.session }; const portfolio = await db.portfolios.findOne({ publicSlug: input.slug, status: "published" }, options); const deployment = portfolio?.currentDeploymentId ? await db.deployments.findOne({ _id: portfolio.currentDeploymentId, portfolioId: portfolio._id }, options) : null; if (!deployment || !portfolio) throw new AnalyticsError(404, "published deployment not found");
      const existing = await db.analyticsEventReceipts.findOne({ _id: input.eventId }, options); if (existing) { if (existing.payloadHash !== payloadHash) throw new AnalyticsError(409, "event ID reused with different payload"); return { accepted: true, duplicate: true, eventId: input.eventId }; }
      const period = analyticsMinute(receivedAt); const counterId = analyticsDigest(`${visitorHash}:${deployment._id}:${period}`);
      try {
        const changed = await db.analyticsRateLimits.updateOne(
          { _id: counterId, count: { $lt: this.#rateLimit } },
          { $inc: { count: 1 }, $setOnInsert: { visitorHash, targetId: deployment._id, period, expiresAt: new Date(receivedAt.getTime() + 120000) } },
          { ...options, upsert: true },
        );
        if (!changed.matchedCount && !changed.upsertedCount) throw new AnalyticsError(429, "analytics rate limit exceeded");
      } catch (error) {
        if ((error as { code?: number }).code === 11000) throw new AnalyticsError(429, "analytics rate limit exceeded");
        throw error;
      }
      await db.analyticsEventReceipts.insertOne({ _id: input.eventId, userId: deployment.userId, deploymentId: deployment._id, eventType: input.type, visitorHash, payloadHash, payloadBytes, occurredAt, receivedAt }, options);
      const isOwner = authenticatedUserId === deployment.userId;
      if (input.type === "visit") await db.visitEvents.insertOne({ _id: randomUUID(), userId: deployment.userId, deploymentId: deployment._id, sessionId: visitorHash, referrer: safeAnalyticsReferrer(input.referrer), isOwner, startedAt: occurredAt, eventId: input.eventId, completed: false, durationMs: input.durationMs ?? null }, options);
      else {
        const visit = await db.visitEvents.find({ userId: deployment.userId, deploymentId: deployment._id, sessionId: visitorHash }, options).sort({ startedAt: -1 }).limit(1).next(); if (!visit) throw new AnalyticsError(409, "visit event must be collected first");
        if (input.type === "complete") await db.visitEvents.updateOne({ _id: visit._id }, { $set: { completed: true, ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }) } }, options);
        else if (input.type === "section_view") { const snapshot = await readSnapshot(tx, snapshotRefFromStored(deployment.snapshot)); const ids = new Set([...outlineOf(snapshot).map(({ id }) => id), ...(snapshot.sections as Array<{ id?: string }> | undefined ?? []).map(({ id }) => id)]); if (!input.sectionId || !ids.has(input.sectionId)) throw new AnalyticsError(400, "section is not in deployment snapshot"); await db.sectionViews.insertOne({ _id: randomUUID(), userId: deployment.userId, visitEventId: visit._id, portfolioSectionId: input.sectionId, dwellMs: input.dwellMs!, scrollDepth: Decimal128.fromString(String(input.scrollDepth!)), exited: false, eventId: input.eventId, occurredAt }, options); }
        else await db.conversionEvents.insertOne({ _id: randomUUID(), userId: deployment.userId, visitEventId: visit._id, kind: input.type, target: input.target!, eventId: input.eventId, occurredAt }, options);
      }
      return { accepted: true, duplicate: false, eventId: input.eventId };
    });
  }
  async requestAggregation(userId: string, deploymentId: string, date: string, at = new Date()) { await inTransaction(this.context, async (tx) => { const deployment = await mongoCollections(tx.db).deployments.findOne({ _id: deploymentId, userId }, { session: tx.session }); if (!deployment) throw new AnalyticsError(404, "deployment not found"); await addMongoOutboxEvent(tx, { userId, topic: "analytics.aggregate", payload: { userId, deploymentId, date }, idempotencyKey: `analytics-aggregate:${deploymentId}:${date}:${at.toISOString().slice(0, 16)}` }); }); return { deploymentId, date, status: "queued" as const }; }
  async aggregateDay(deploymentId: string, date: string) { const db = mongoCollections(this.context.db); const deployment = await db.deployments.findOne({ _id: deploymentId }); if (!deployment) throw new AnalyticsError(404, "deployment not found"); const start = new Date(`${date}T00:00:00.000Z`); const end = new Date(start.getTime() + 86400000); const visits = await db.visitEvents.find({ deploymentId, startedAt: { $gte: start, $lt: end }, isOwner: false }).toArray(); const ids = visits.map(({ _id }) => _id); const conversions = await db.conversionEvents.find({ visitEventId: { $in: ids }, occurredAt: { $gte: start, $lt: end } }).toArray(); const sections = await db.sectionViews.find({ visitEventId: { $in: ids }, occurredAt: { $gte: start, $lt: end }, dwellMs: { $gte: 1000 } }).toArray(); const metrics = { visits: visits.length, completes: visits.filter(({ completed }) => completed).length, contact_clicks: conversions.filter(({ kind }) => kind === "contact_click").length, file_downloads: conversions.filter(({ kind }) => kind === "file_download").length, link_clicks: conversions.filter(({ kind }) => kind === "link_click").length, eligible_section_views: sections.length, total_section_dwell_ms: sections.reduce((sum, row) => sum + row.dwellMs, 0) }; await inTransaction(this.context, async (tx) => { const collection = mongoCollections(tx.db).metricsDaily; for (const [metricKey, value] of Object.entries(metrics)) await collection.updateOne({ userId: deployment.userId, deploymentId, date, metricKey }, { $set: { value: Decimal128.fromString(String(value)), sampleSize: visits.length }, $setOnInsert: { _id: randomUUID(), userId: deployment.userId, deploymentId, date, metricKey } }, { session: tx.session, upsert: true }); }); return metrics; }
  async calculateDerived(userId: string, deploymentId: string, date: string, numeratorKey: string, denominatorKey: string) { const rows = await mongoCollections(this.context.db).metricsDaily.find({ userId, deploymentId, date, metricKey: { $in: [numeratorKey, denominatorKey] } }).toArray(); const map = new Map(rows.map((row) => [row.metricKey, Number(row.value.toString())])); const numerator = map.get(numeratorKey); const denominator = map.get(denominatorKey); if (numerator === undefined || denominator === undefined) throw new AnalyticsError(404, "metric input not found"); if (!denominator) throw new AnalyticsError(400, "derived metric denominator is zero"); return { numeratorKey, denominatorKey, value: numerator / denominator }; }
  async createDashboardView(userId: string, portfolioId: string, input: DashboardViewInput) { return inTransaction(this.context, async (tx) => { const db = mongoCollections(tx.db); const options = { session: tx.session }; const owner = await db.portfolios.updateOne({ _id: portfolioId, userId }, { $set: { updatedAt: new Date() } }, options); if (!owner.matchedCount) throw new AnalyticsError(404, "portfolio not found"); if (await db.dashboardViews.countDocuments({ userId, portfolioId }, options) >= 6) throw new AnalyticsError(409, "dashboard view limit exceeded"); if (await db.dashboardViews.findOne({ userId, portfolioId, name: input.name }, options)) throw new AnalyticsError(409, "dashboard view name already exists"); if (input.isDefault) await db.dashboardViews.updateMany({ userId, portfolioId, isDefault: true }, { $set: { isDefault: false } }, options); const id = randomUUID(); await db.dashboardViews.insertOne({ _id: id, userId, portfolioId, name: input.name, period: input.period, isDefault: input.isDefault }, options); return { id, portfolioId, ...input }; }); }

  async insight(userId: string, deploymentId: string, start: string, end: string, draft?: InsightDraft) { return this.#insight(userId, [deploymentId], deploymentId, start, end, draft); }

  /** 해설은 지금 판(`storeAs`) 아래 저장하되, 읽는 집계는 포트폴리오의 모든 판이다. */
  async #insight(userId: string, deploymentIds: string[], storeAs: string, start: string, end: string, draft?: InsightDraft) {
    const rows = await mongoCollections(this.context.db).metricsDaily.find({ userId, deploymentId: { $in: deploymentIds }, date: { $gte: start, $lte: end } }).toArray(); const metricMap = new Map<string, number>();
    for (const item of rows) metricMap.set(item.metricKey, (metricMap.get(item.metricKey) ?? 0) + Number(item.value.toString())); const sampleSize = metricMap.get("visits") ?? 0;
    if (sampleSize < this.#minimumSample) return InsightSchema.parse({ visibility: "hidden", reason: "INSUFFICIENT_SAMPLE", sampleSize, minimumSample: this.#minimumSample });
    let generated = draft;
    if (!generated && this.#writer) {
      try {
        await this.#consent?.require(userId, "insight_note");
        const { sections, referrers } = await this.#breakdown(userId, await this.#countedVisits(userId, deploymentIds, start, end));
        generated = await this.#writer.write({ userId, period: { start, end }, sampleSize, metrics: Object.fromEntries(metricMap), sections: sections.map(({ title, position, views, dwellMs }) => ({ title: title || (position ? `${position}번째 섹션` : ""), views, dwellMs })), referrers: referrers.map(({ origin, visits }) => ({ origin: origin ?? "직접 방문", visits })), domains: [] });
      }
      catch { generated = undefined; }
    }
    generated ??= { narrative: `${start}부터 ${end}까지 방문 ${sampleSize}건 중 완독 ${metricMap.get("completes") ?? 0}건이 집계되었습니다.`, evidenceMetrics: ["visits", "completes"], suggestions: [] };
    const accepted = validateInsightDraft(generated, new Set(metricMap.keys())); const at = new Date();
    await mongoCollections(this.context.db).insights.insertOne({ _id: randomUUID(), userId, deploymentId: storeAs, periodStart: start, periodEnd: end, narrative: accepted.narrative, evidenceMetrics: accepted.evidenceMetrics, suggestions: accepted.suggestions, generatedAt: at });
    return InsightSchema.parse({ visibility: "visible", ...accepted, period: { start, end }, sampleSize });
  }

  /**
   * 분석은 포트폴리오 단위다. 새 판을 배포해도 그 전 판의 방문이 같은 화면에 합쳐진다.
   * 집계(`metrics_daily`)는 판마다 쌓이고 여기서 더한다.
   */
  async #deployment(userId: string, portfolioId: string) {
    const db = mongoCollections(this.context.db); const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId }); if (!portfolio) throw new AnalyticsError(404, "portfolio not found");
    if (!portfolio.currentDeploymentId) throw new AnalyticsError(409, "portfolio has never been published"); const deployment = await db.deployments.findOne({ _id: portfolio.currentDeploymentId, userId, portfolioId }); if (!deployment) throw new AnalyticsError(409, "portfolio has never been published");
    const deploymentIds = (await db.deployments.find({ userId, portfolioId }).project<{ _id: string }>({ _id: 1 }).toArray()).map(({ _id }) => _id);
    return { portfolio, deployment, deploymentIds };
  }
  async #period(deploymentIds: string[], preset: AnalyticsPeriodPreset, today: string) { if (preset !== "all") return { preset, start: shiftDate(today, 1 - (preset === "7d" ? 7 : 30)), end: today }; const first = await mongoCollections(this.context.db).visitEvents.find({ deploymentId: { $in: deploymentIds }, isOwner: false }).sort({ startedAt: 1 }).limit(1).next(); const date = first ? isoDate(first.startedAt) : today; return { preset, start: date < today ? date : today, end: today }; }
  async #metrics(userId: string, deploymentIds: string[], start: string, end: string) { const rows = await mongoCollections(this.context.db).metricsDaily.find({ userId, deploymentId: { $in: deploymentIds }, date: { $gte: start, $lte: end } }).toArray(); const metrics: AnalyticsMetrics = { ...EMPTY_METRICS }; for (const item of rows) { const field = METRIC_FIELD[item.metricKey]; if (field) metrics[field] += Number(item.value.toString()); } for (const key of Object.keys(metrics) as Array<keyof AnalyticsMetrics>) metrics[key] = Math.round(metrics[key]); return { metrics, found: rows.length > 0 }; }
  /**
   * 집계는 판 · 날짜 한 쌍마다 돈다. 재배포한 날에는 두 판이 같은 날짜를 나눠 가지므로,
   * 그날이 끝났다고 하려면 그날 방문이 걸린 판이 모두 집계되어 있어야 한다.
   */
  async #coverage(userId: string, deploymentIds: string[], start: string, end: string) {
    const db = mongoCollections(this.context.db);
    const visits = await db.visitEvents.find({ userId, deploymentId: { $in: deploymentIds }, isOwner: false, startedAt: { $gte: new Date(`${start}T00:00:00Z`), $lt: new Date(`${shiftDate(end, 1)}T00:00:00Z`) } }).project<{ deploymentId: string; startedAt: Date }>({ deploymentId: 1, startedAt: 1 }).toArray();
    const counted = new Set((await db.metricsDaily.find({ userId, deploymentId: { $in: deploymentIds }, metricKey: "visits", date: { $gte: start, $lte: end } }).project<{ deploymentId: string; date: string }>({ deploymentId: 1, date: 1 }).toArray()).map(({ deploymentId, date }) => `${deploymentId}:${date}`));
    const pairs = [...new Set(visits.map(({ deploymentId, startedAt }) => `${deploymentId}:${isoDate(startedAt)}`))].map((key) => { const [deploymentId, date] = key.split(":") as [string, string]; return { deploymentId, date, counted: counted.has(key) }; });
    const days = [...new Set(pairs.map(({ date }) => date))].sort();
    const pendingDates = days.filter((date) => pairs.some((pair) => pair.date === date && !pair.counted));
    return { days: days.length, aggregatedDays: days.length - pendingDates.length, pendingDates, pending: pairs.filter(({ counted: done }) => !done), counted };
  }
  /** 집계가 끝난 판 · 날짜의 방문만. 숫자 카드와 같은 모집단에서 섹션 · 유입을 센다. */
  async #countedVisits(userId: string, deploymentIds: string[], start: string, end: string) {
    const { counted } = await this.#coverage(userId, deploymentIds, start, end);
    const visits = await mongoCollections(this.context.db).visitEvents.find({ userId, deploymentId: { $in: deploymentIds }, isOwner: false, startedAt: { $gte: new Date(`${start}T00:00:00Z`), $lt: new Date(`${shiftDate(end, 1)}T00:00:00Z`) } }).toArray();
    return visits.filter((visit) => counted.has(`${visit.deploymentId}:${isoDate(visit.startedAt)}`));
  }
  /** 섹션별 체류와 유입. 섹션 제목은 그 방문이 본 판의 섹션 목록에서 찾는다. */
  async #breakdown(userId: string, visits: VisitEventDoc[]) {
    const db = mongoCollections(this.context.db); const deploymentOf = new Map(visits.map((visit) => [visit._id, visit.deploymentId]));
    const sectionsRaw = await db.sectionViews.find({ userId, visitEventId: { $in: [...deploymentOf.keys()] }, dwellMs: { $gte: 1000 } }).toArray();
    const sectionMap = new Map<string, { views: number; dwellMs: number; deploymentId: string }>();
    for (const item of sectionsRaw) { const value = sectionMap.get(item.portfolioSectionId) ?? { views: 0, dwellMs: 0, deploymentId: deploymentOf.get(item.visitEventId)! }; value.views += 1; value.dwellMs += item.dwellMs; sectionMap.set(item.portfolioSectionId, value); }
    const names = new Map<string, { title: string; position: number }>();
    for (const deploymentId of new Set([...sectionMap.values()].map((value) => value.deploymentId))) {
      const row = await db.deployments.findOne({ _id: deploymentId, userId }); if (!row) continue;
      const snapshot = await readSnapshot(this.context, snapshotRefFromStored(row.snapshot));
      outlineOf(snapshot).forEach(({ id, title }, index) => names.set(id, { title: title ?? "", position: index + 1 }));
      (snapshot.sections as Array<{ id?: string }> | undefined ?? []).forEach(({ id }, index) => { if (id && !names.has(id)) names.set(id, { title: "", position: index + 1 }); });
    }
    const sections = [...sectionMap].map(([sectionId, value]) => ({ sectionId, title: names.get(sectionId)?.title ?? "", position: names.get(sectionId)?.position ?? null, views: value.views, dwellMs: value.dwellMs })).sort((a, b) => b.dwellMs - a.dwellMs).slice(0, 50);
    const referrerMap = new Map<string | null, number>(); for (const visit of visits) referrerMap.set(visit.referrer ?? null, (referrerMap.get(visit.referrer ?? null) ?? 0) + 1);
    const referrers = [...referrerMap].map(([origin, count]) => ({ origin, visits: count })).sort((a, b) => b.visits - a.visits).slice(0, 8);
    return { sections, referrers };
  }

  async dashboard(userId: string, portfolioId: string, preset: AnalyticsPeriodPreset) {
    const db = mongoCollections(this.context.db); const { portfolio, deployment, deploymentIds } = await this.#deployment(userId, portfolioId); const period = await this.#period(deploymentIds, preset, isoDate(new Date())); const coverage = await this.#coverage(userId, deploymentIds, period.start, period.end); const current = await this.#metrics(userId, deploymentIds, period.start, period.end); const length = daysBetween(period.start, period.end); const previous = preset === "all" ? null : await this.#metrics(userId, deploymentIds, shiftDate(period.start, -length), shiftDate(period.start, -1));
    const daily = await db.metricsDaily.find({ userId, deploymentId: { $in: deploymentIds }, date: { $gte: period.start, $lte: period.end }, metricKey: { $in: Object.keys(TREND_FIELD) } }).sort({ date: 1 }).toArray(); const trendMap = new Map<string, AnalyticsTrendPoint>(); for (const item of daily) { const point = trendMap.get(item.date) ?? { date: item.date, visits: 0, completes: 0, contactClicks: 0, fileDownloads: 0, linkClicks: 0 }; point[TREND_FIELD[item.metricKey]!] += Number(item.value.toString()); trendMap.set(item.date, point); }
    const { sections, referrers } = await this.#breakdown(userId, await this.#countedVisits(userId, deploymentIds, period.start, period.end));
    const entitlement = await this.#entitlements?.check(userId, "analytics.organization_domains"); const stored = await db.insights.find({ userId, deploymentId: { $in: deploymentIds }, periodStart: period.start, periodEnd: period.end }).sort({ generatedAt: -1 }).limit(1).next(); const views = await db.dashboardViews.find({ userId, portfolioId }).sort({ isDefault: -1, name: 1 }).limit(6).toArray(); const layout = await this.widgets(userId, portfolioId);
    return AnalyticsDashboardSchema.parse({ portfolio: { id: portfolioId, title: portfolio.title, status: portfolio.status === "published" ? "published" : "unlisted" }, deployment: { id: deployment._id, subdomain: portfolio.publicSlug ?? deployment.subdomain, customDomain: deployment.customDomain ?? null, publishedAt: deployment.publishedAt?.toISOString() ?? null }, period, coverage: { days: coverage.days, aggregatedDays: coverage.aggregatedDays, pendingDates: coverage.pendingDates }, metrics: current.metrics, previous: previous?.found ? previous.metrics : null, trend: [...trendMap.values()], sections, referrers, organizations: entitlement?.allowed ? { entitled: true, domains: [] } : { entitled: false }, insight: current.metrics.visits < this.#minimumSample ? { state: "insufficient_sample", sampleSize: current.metrics.visits, minimumSample: this.#minimumSample } : stored ? { state: "ready", narrative: stored.narrative, evidenceMetrics: stored.evidenceMetrics, suggestions: stored.suggestions, generatedAt: stored.generatedAt.toISOString() } : { state: "none" }, views: views.map((item) => ({ id: item._id, name: item.name, period: item.period, isDefault: item.isDefault })), customized: layout.customized, widgets: layout.widgets });
  }

  async requestPendingAggregation(userId: string, portfolioId: string, preset: AnalyticsPeriodPreset) { const { deploymentIds } = await this.#deployment(userId, portfolioId); const period = await this.#period(deploymentIds, preset, isoDate(new Date())); const { pending, pendingDates } = await this.#coverage(userId, deploymentIds, period.start, period.end); const at = new Date(); for (const { deploymentId, date } of pending) await this.requestAggregation(userId, deploymentId, date, at); return { queued: pendingDates }; }
  async catalog(userId: string) { const decisions = new Map<EntitlementCapability, boolean>(); for (const capability of ["analytics.organization_domains", "analytics.returning_visitors"] as const) decisions.set(capability, (await this.#entitlements?.check(userId, capability))?.allowed ?? false); return metricCatalog((capability) => decisions.get(capability) ?? false); }
  async #view(userId: string, portfolioId: string) { return (await mongoCollections(this.context.db).dashboardViews.findOne({ userId, portfolioId, isDefault: true }))?._id ?? null; }
  async #widgetsOf(viewId: string): Promise<Widget[]> { const rows = await mongoCollections(this.context.db).widgets.find({ dashboardViewId: viewId }).sort({ "position.order": 1, _id: 1 }).toArray(); // 세지 않는 지표의 위젯은 그리지 않는다. 행은 지우지 않는다 — 세기 시작하면 그대로 돌아온다.
    return rows.filter((item) => item.metricKey && metricIsCollected(item.metricKey as MetricKey)).map((item, order) => ({ id: item._id, metricKey: item.metricKey as MetricKey, visualization: item.visualization, span: Number(item.position.span ?? 3) as Widget["span"], compareTo: item.compareTo ?? null, order })); }
  async widgets(userId: string, portfolioId: string) { const viewId = await this.#view(userId, portfolioId); return viewId ? { customized: true, widgets: await this.#widgetsOf(viewId) } : { customized: false, widgets: DEFAULT_LAYOUT.map((item) => ({ ...item, id: null })) }; }
  async materializeLayout(userId: string, portfolioId: string, preset: AnalyticsPeriodPreset) { const existing = await this.#view(userId, portfolioId); if (existing) return { customized: true, widgets: await this.#widgetsOf(existing) }; const viewId = await inTransaction(this.context, async (tx) => { const db = mongoCollections(tx.db); const options = { session: tx.session }; const owner = await db.portfolios.updateOne({ _id: portfolioId, userId }, { $set: { updatedAt: new Date() } }, options); if (!owner.matchedCount) throw new AnalyticsError(404, "portfolio not found"); const found = await db.dashboardViews.findOne({ userId, portfolioId, isDefault: true }, options); if (found) return found._id; if (await db.dashboardViews.countDocuments({ userId, portfolioId }, options) >= 6) throw new AnalyticsError(409, "dashboard view limit exceeded"); const id = randomUUID(); await db.dashboardViews.insertOne({ _id: id, userId, portfolioId, name: "기본", period: preset, isDefault: true }, options); await db.widgets.insertMany(DEFAULT_LAYOUT.map((item) => widgetDoc(userId, id, item)), options); return id; }); return { customized: true, widgets: await this.#widgetsOf(viewId) }; }
  async addWidget(userId: string, portfolioId: string, input: AddWidget, preset: AnalyticsPeriodPreset) { if (!metricIsCollected(input.metricKey)) throw new AnalyticsError(409, `${input.metricKey} is not collected yet`); const defaults = metricDefaults(input.metricKey); const visualization = input.visualization ?? defaults.visualization; if (!supports(input.metricKey, visualization)) throw new AnalyticsError(422, `${input.metricKey} cannot be drawn as ${visualization}`); await this.materializeLayout(userId, portfolioId, preset); const viewId = await this.#view(userId, portfolioId); if (!viewId) throw new AnalyticsError(404, "dashboard view not found"); await inTransaction(this.context, async (tx) => { const db = mongoCollections(tx.db); const options = { session: tx.session }; const items = await db.widgets.find({ userId, dashboardViewId: viewId }, options).sort({ "position.order": 1 }).toArray(); const order = Math.min(input.index ?? items.length, items.length); for (const item of items.slice(order)) await db.widgets.updateOne({ _id: item._id }, { $set: { "position.order": Number(item.position.order ?? 0) + 1 } }, options); await db.widgets.insertOne(widgetDoc(userId, viewId, { metricKey: input.metricKey, visualization, span: input.span ?? defaults.span, compareTo: null, order }), options); }); return { customized: true, widgets: await this.#widgetsOf(viewId) }; }
  async reorderWidgets(userId: string, portfolioId: string, widgetIds: string[]) { const viewId = await this.#view(userId, portfolioId); if (!viewId) throw new AnalyticsError(409, "dashboard layout is not customized yet"); const current = await mongoCollections(this.context.db).widgets.find({ userId, dashboardViewId: viewId }).project({ _id: 1 }).toArray(); const known = new Set(current.map(({ _id }) => _id)); if (new Set(widgetIds).size !== widgetIds.length || known.size !== widgetIds.length || widgetIds.some((id) => !known.has(id))) throw new AnalyticsError(409, "widget order does not match the current layout"); await inTransaction(this.context, async (tx) => { const widgets = mongoCollections(tx.db).widgets; for (const [order, id] of widgetIds.entries()) await widgets.updateOne({ _id: id, userId }, { $set: { "position.order": order } }, { session: tx.session }); }); return { customized: true, widgets: await this.#widgetsOf(viewId) }; }
  async updateWidget(userId: string, widgetId: string, input: UpdateWidget) { const db = mongoCollections(this.context.db); const item = await db.widgets.findOne({ _id: widgetId, userId }); if (!item?.metricKey) throw new AnalyticsError(404, "widget not found"); const visualization = input.visualization ?? item.visualization; if (!supports(item.metricKey as MetricKey, visualization)) throw new AnalyticsError(422, `${item.metricKey} cannot be drawn as ${visualization}`); const compareTo = input.compareTo === undefined ? item.compareTo ?? null : input.compareTo; if (compareTo !== null && compareTo !== "prev_period") throw new AnalyticsError(422, `${compareTo} comparison has no data behind it`); await db.widgets.updateOne({ _id: widgetId, userId }, { $set: { visualization, compareTo, position: { ...item.position, span: input.span ?? item.position.span ?? 3 } } }); return { customized: true, widgets: await this.#widgetsOf(item.dashboardViewId) }; }
  async deleteWidget(userId: string, widgetId: string) { const item = await mongoCollections(this.context.db).widgets.findOneAndDelete({ _id: widgetId, userId }); if (!item) throw new AnalyticsError(404, "widget not found"); return { customized: true, widgets: await this.#widgetsOf(item.dashboardViewId) }; }
  async resetLayout(userId: string, portfolioId: string) { await inTransaction(this.context, async (tx) => { const db = mongoCollections(tx.db); const options = { session: tx.session }; const view = await db.dashboardViews.findOne({ userId, portfolioId, isDefault: true }, options); if (view) { await db.widgets.deleteMany({ userId, dashboardViewId: view._id }, options); await db.dashboardViews.deleteOne({ _id: view._id }, options); } }); return this.widgets(userId, portfolioId); }
  async insightForPortfolio(userId: string, portfolioId: string, preset: AnalyticsPeriodPreset) { const { deployment, deploymentIds } = await this.#deployment(userId, portfolioId); const period = await this.#period(deploymentIds, preset, isoDate(new Date())); return this.#insight(userId, deploymentIds, deployment._id, period.start, period.end); }
}

const METRIC_FIELD: Record<string, keyof AnalyticsMetrics> = { visits: "visits", completes: "completes", contact_clicks: "contactClicks", file_downloads: "fileDownloads", link_clicks: "linkClicks", eligible_section_views: "sectionViews", total_section_dwell_ms: "sectionDwellMs" };
const TREND_FIELD: Record<string, Exclude<keyof AnalyticsTrendPoint, "date">> = { visits: "visits", completes: "completes", contact_clicks: "contactClicks", file_downloads: "fileDownloads", link_clicks: "linkClicks" };
/** 스냅샷의 섹션 목록. 목록이 생기기 전 판이나 모양이 어긋난 값이면 빈 배열이다. */
function outlineOf(snapshot: Record<string, unknown>) { const parsed = DeploymentOutlineSectionSchema.array().safeParse(snapshot.outline); return parsed.success ? parsed.data : []; }
const EMPTY_METRICS: AnalyticsMetrics = { visits: 0, completes: 0, contactClicks: 0, fileDownloads: 0, linkClicks: 0, sectionViews: 0, sectionDwellMs: 0 };
const isoDate = (at: Date) => at.toISOString().slice(0, 10);
const shiftDate = (date: string, days: number) => isoDate(new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000));
const daysBetween = (start: string, end: string) => Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1;
function widgetDoc(userId: string, dashboardViewId: string, item: Omit<Widget, "id">) { return { _id: randomUUID(), userId, dashboardViewId, metricKey: item.metricKey, derivedMetricId: null, visualization: item.visualization, compareTo: item.compareTo, position: { order: item.order, span: item.span } }; }

export { AnalyticsService as MongoAnalyticsService };
