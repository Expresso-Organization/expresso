import { z } from "zod";
import { SlugSchema } from "./publishing.js";
import { TimestampSchema, UuidSchema } from "./common.js";

export const AnalyticsEventSchema = z.strictObject({
  eventId: UuidSchema,
  slug: SlugSchema,
  sessionId: z.string().min(16).max(128).regex(/^[A-Za-z0-9._~-]+$/),
  type: z.enum(["visit", "complete", "section_view", "contact_click", "file_download", "link_click"]),
  occurredAt: TimestampSchema,
  referrer: z.url().max(2_000).optional(),
  sectionId: UuidSchema.optional(),
  dwellMs: z.number().int().min(0).max(86_400_000).optional(),
  scrollDepth: z.number().min(0).max(1).optional(),
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
  target: z.string().min(1).max(500).optional(),
}).superRefine((value, context) => {
  if (value.type === "section_view" && (!value.sectionId || value.dwellMs === undefined || value.scrollDepth === undefined)) {
    context.addIssue({ code: "custom", message: "section view details are required" });
  }
  if (["contact_click", "file_download", "link_click"].includes(value.type) && !value.target) {
    context.addIssue({ code: "custom", message: "conversion target is required" });
  }
});

export const DashboardViewInputSchema = z.strictObject({
  name: z.string().min(1).max(80),
  period: z.enum(["7d", "30d", "all"]),
  isDefault: z.boolean().default(false),
});

export const DerivedMetricInputSchema = z.strictObject({
  numeratorKey: z.string().min(1).max(80),
  denominatorKey: z.string().min(1).max(80),
});

/**
 * 무엇을 어느 쪽으로 움직이자는 제안(§8.3 분석 해설).
 *
 * 문장 하나로 두면 "잘 하세요" 같은 말이 섞인다. **어느 지표를 · 어느 쪽으로 ·
 * 무엇을 해서**로 쪼개면 그 세 칸이 비어 있는 제안은 만들 수 없다.
 */
export const InsightSuggestionSchema = z.strictObject({
  direction: z.enum(["up", "down"]),
  /** 움직이려는 지표. 집계에 실제로 있는 키여야 한다. */
  target: z.string().min(1).max(80),
  /** 무엇을 하면 되는지. 한 문장. */
  action: z.string().trim().min(1).max(300),
});

export const InsightSchema = z.discriminatedUnion("visibility", [
  z.strictObject({ visibility: z.literal("hidden"), reason: z.literal("INSUFFICIENT_SAMPLE"), sampleSize: z.number().int().nonnegative(), minimumSample: z.number().int().positive() }),
  z.strictObject({
    visibility: z.literal("visible"),
    narrative: z.string().min(1).max(2_000),
    evidenceMetrics: z.array(z.string().min(1)).min(1),
    period: z.strictObject({ start: z.iso.date(), end: z.iso.date() }),
    sampleSize: z.number().int().positive(),
    suggestions: z.array(InsightSuggestionSchema).max(2),
  }),
]);

/**
 * 07 분석이 한 번에 읽는 것.
 *
 * 화면이 그리는 것은 전부 여기서 온다. 숫자는 **집계(`metric_daily`)에서만**
 * 오고, 화면이 스스로 계산해 채우는 칸은 없다 — 완독률도 평균 체류도 여기
 * 있는 두 수의 나눗셈이라 어디서 왔는지 되짚을 수 있다.
 *
 * 서식은 화면이 맡는다. 여기 있는 것은 수와 밀리초뿐이다.
 */

export const AnalyticsPeriodPresetSchema = z.enum(["7d", "30d", "all"]);

export const AnalyticsMetricsSchema = z.strictObject({
  visits: z.number().int().nonnegative(),
  completes: z.number().int().nonnegative(),
  contactClicks: z.number().int().nonnegative(),
  fileDownloads: z.number().int().nonnegative(),
  linkClicks: z.number().int().nonnegative(),
  /** 1초 넘게 머문 섹션 조회만 센다(집계 규칙). */
  sectionViews: z.number().int().nonnegative(),
  sectionDwellMs: z.number().int().nonnegative(),
});

export const AnalyticsTrendPointSchema = z.strictObject({
  date: z.iso.date(),
  visits: z.number().int().nonnegative(),
  completes: z.number().int().nonnegative(),
});

export const AnalyticsSectionDwellSchema = z.strictObject({
  sectionId: UuidSchema,
  /** 레시피가 지은 섹션 제목. 없으면 빈 문자열 — 화면이 순번으로 부른다. */
  title: z.string().max(300),
  views: z.number().int().nonnegative(),
  dwellMs: z.number().int().nonnegative(),
});

export const AnalyticsReferrerSchema = z.strictObject({
  /** 출처는 origin까지만 남긴다(§9 수집 최소화). null이면 어디서 왔는지 없다. */
  origin: z.string().min(1).max(500).nullable(),
  visits: z.number().int().positive(),
});

export const AnalyticsOrganizationSchema = z.strictObject({
  domain: z.string().min(1).max(253),
  visits: z.number().int().positive(),
  dwellMs: z.number().int().nonnegative(),
  lastVisitAt: TimestampSchema,
});

/**
 * 기업 도메인 방문은 PRO다.
 *
 * 자격이 없으면 목록 자리에 빈 배열이 아니라 **자격이 없다는 사실**이 온다.
 * 빈 배열은 "방문이 없었다"는 거짓말이 된다.
 */
export const AnalyticsOrganizationsSchema = z.discriminatedUnion("entitled", [
  z.strictObject({ entitled: z.literal(false) }),
  z.strictObject({
    entitled: z.literal(true),
    domains: z.array(AnalyticsOrganizationSchema).max(20),
  }),
]);

/**
 * 이 기간의 집계가 어디까지 끝났나.
 *
 * 집계는 밤에 한 번 도는 일이라(`analytics_daily`), 오늘 들어온 방문은 아직
 * 어느 수에도 들어 있지 않다. 그 사실을 화면이 감추면 사용자는 우리가 방문을
 * 놓쳤다고 생각한다.
 */
export const AnalyticsCoverageSchema = z.strictObject({
  /** 방문 기록이 있는 날. */
  days: z.number().int().nonnegative(),
  /** 그중 집계가 끝난 날. */
  aggregatedDays: z.number().int().nonnegative(),
  /** 아직 집계되지 않은 날짜. 07의 "지금 집계"가 이걸 큐에 넣는다. */
  pendingDates: z.array(z.iso.date()).max(400),
});

/**
 * 저장된 해설(§8.3 분석 해설).
 *
 * 07은 **읽기만 한다.** 해설을 새로 쓰는 것은 모델을 부르는 일이라 화면을 여는
 * 것만으로 일어나서는 안 된다 — 사용자가 누를 때 쓴다.
 */
export const DashboardInsightSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("insufficient_sample"),
    sampleSize: z.number().int().nonnegative(),
    minimumSample: z.number().int().positive(),
  }),
  /** 표본은 찼는데 아직 아무도 읽지 않았다. */
  z.strictObject({ state: z.literal("none") }),
  z.strictObject({
    state: z.literal("ready"),
    narrative: z.string().min(1).max(2_000),
    evidenceMetrics: z.array(z.string().min(1)).min(1),
    suggestions: z.array(InsightSuggestionSchema).max(2),
    generatedAt: TimestampSchema,
  }),
]);

export const DashboardViewSummarySchema = z.strictObject({
  id: UuidSchema,
  name: z.string().min(1).max(80),
  period: z.enum(["7d", "30d", "all"]),
  isDefault: z.boolean(),
});

// ── 07b 지표 라이브러리 · 위젯 ─────────────────────────────────────────

/**
 * 위젯이 그릴 수 있는 것.
 *
 * **무엇을**(metric)과 **어떻게**(visualization)를 갈라 놓는다. 짝이 아무렇게나
 * 되지는 않는다 — 유입 경로를 숫자 하나로 그릴 수 없고 방문 수를 도넛으로 나눌 수
 * 없다. 어느 지표가 어느 그림을 낼 수 있는지는 카탈로그가 말한다.
 */
export const WidgetVisualizationSchema = z.enum([
  "number", "spark", "line", "bar", "donut", "list", "note",
]);

/** 12칼럼 그리드의 폭 — 1/4 · 1/3 · 2/3 · 전체. */
export const WidgetSpanSchema = z.union([
  z.literal(3), z.literal(4), z.literal(8), z.literal(12),
]);

export const MetricKeySchema = z.enum([
  "visits", "visits_trend", "unique_visitors", "returning_rate", "region_device", "referrers",
  "avg_dwell_ms", "completion_rate", "section_dwell", "exit_points",
  "contact_clicks", "file_downloads", "link_clicks", "inquiry_mail",
  "org_domains", "org_returning",
  "insight",
]);

export const MetricGroupSchema = z.enum(["방문", "참여", "전환", "채용담당자", "해설"]);

/**
 * 왜 못 쓰는가.
 *
 * 목록에서 지우지 않고 **왜 없는지를 적는다.** 지워 버리면 "이 도구는 그걸 못 본다"는
 * 사실이 아무 데도 남지 않아, 같은 질문이 계속 돌아온다.
 */
export const MetricAvailabilitySchema = z.enum([
  "ready",
  /** 요금제가 막는다. */
  "plan_required",
  /** 우리가 그 값을 세고 있지 않다. */
  "not_collected",
]);

export const MetricCatalogEntrySchema = z.strictObject({
  key: MetricKeySchema,
  group: MetricGroupSchema,
  label: z.string().min(1).max(40),
  /** 이 지표가 정확히 무엇인지 한 줄. 07b가 이름 아래 그린다. */
  description: z.string().min(1).max(120),
  availability: MetricAvailabilitySchema,
  /** `ready`가 아닐 때만. 왜 못 쓰는지를 그대로 화면에 적는다. */
  reason: z.string().max(200).nullable(),
  visualizations: z.array(WidgetVisualizationSchema).min(1),
  defaultVisualization: WidgetVisualizationSchema,
  defaultSpan: WidgetSpanSchema,
});

export const MetricCatalogResponseSchema = z.strictObject({
  data: z.array(MetricCatalogEntrySchema),
});

export const WidgetSchema = z.strictObject({
  /** 아직 굳히지 않은 기본 지면의 위젯은 id가 없다 — 고치려면 먼저 굳혀야 한다. */
  id: UuidSchema.nullable(),
  metricKey: MetricKeySchema,
  visualization: WidgetVisualizationSchema,
  span: WidgetSpanSchema,
  compareTo: z.enum(["prev_period", "other_portfolio", "industry"]).nullable(),
  order: z.number().int().nonnegative(),
});

export const AddWidgetSchema = z.strictObject({
  metricKey: MetricKeySchema,
  visualization: WidgetVisualizationSchema.optional(),
  span: WidgetSpanSchema.optional(),
  /** 끌어다 놓은 자리. 없으면 맨 뒤에 붙는다. */
  index: z.number().int().nonnegative().max(39).optional(),
});

/**
 * 순서 바꾸기.
 *
 * **목록 전체를 보낸다.** 한 위젯의 순서만 고치면 나머지가 따라 밀리지 않아 자리가
 * 겹친다. 보낸 id가 지금 지면의 위젯과 정확히 같지 않으면 거절한다 — 화면이
 * 낡았다는 뜻이고, 낡은 목록으로 순서를 덮으면 방금 놓은 위젯이 사라진다.
 */
export const ReorderWidgetsSchema = z.strictObject({
  widgetIds: z.array(UuidSchema).min(1).max(40),
});

/**
 * 07c가 고칠 수 있는 것.
 *
 * 지표는 없다 — 다른 지표를 그리면 그건 **다른 위젯**이다. 순서도 없다. 한 위젯의
 * 순서만 바꾸면 나머지가 따라 밀리지 않아 자리가 겹친다. 끌어 놓기를 붙일 때
 * 영향받는 위젯을 한꺼번에 보내는 자리를 만든다.
 */
export const UpdateWidgetSchema = z.strictObject({
  visualization: WidgetVisualizationSchema.optional(),
  span: WidgetSpanSchema.optional(),
  compareTo: z.enum(["prev_period", "other_portfolio", "industry"]).nullable().optional(),
});

export const WidgetListResponseSchema = z.strictObject({
  data: z.strictObject({
    /** 내 것으로 굳혔는가. false면 코드가 정한 기본 지면을 보고 있다. */
    customized: z.boolean(),
    widgets: z.array(WidgetSchema).max(40),
  }),
});

export const AnalyticsDashboardSchema = z.strictObject({
  portfolio: z.strictObject({
    id: UuidSchema,
    title: z.string().min(1).max(300),
  }),
  deployment: z.strictObject({
    id: UuidSchema,
    subdomain: z.string().min(1).max(63),
    customDomain: z.string().max(253).nullable(),
    publishedAt: TimestampSchema.nullable(),
  }),
  period: z.strictObject({
    preset: AnalyticsPeriodPresetSchema,
    start: z.iso.date(),
    end: z.iso.date(),
  }),
  coverage: AnalyticsCoverageSchema,
  metrics: AnalyticsMetricsSchema,
  /** 같은 길이의 직전 기간. 비교할 것이 없으면 null이고, 화면은 증감을 숨긴다. */
  previous: AnalyticsMetricsSchema.nullable(),
  trend: z.array(AnalyticsTrendPointSchema).max(400),
  sections: z.array(AnalyticsSectionDwellSchema).max(50),
  referrers: z.array(AnalyticsReferrerSchema).max(8),
  organizations: AnalyticsOrganizationsSchema,
  insight: DashboardInsightSchema,
  views: z.array(DashboardViewSummarySchema).max(6),
  /** 이 지면에 놓인 위젯. 굳히지 않았으면 코드가 정한 기본 목록이 온다. */
  customized: z.boolean(),
  widgets: z.array(WidgetSchema).max(40),
});

export const AnalyticsDashboardResponseSchema = z.strictObject({
  data: AnalyticsDashboardSchema,
});

export const AnalyticsPeriodQuerySchema = z.strictObject({
  period: AnalyticsPeriodPresetSchema.default("30d"),
});

export const AnalyticsAggregationRequestSchema = z.strictObject({
  /** 큐에 넣은 날짜. 빈 배열이면 집계할 것이 없었다는 뜻이다. */
  queued: z.array(z.iso.date()).max(400),
});

export const AnalyticsAggregationResponseSchema = z.strictObject({
  data: AnalyticsAggregationRequestSchema,
});

export const InsightResponseSchema = z.strictObject({ data: InsightSchema });

export type Insight = z.infer<typeof InsightSchema>;
export type InsightSuggestion = z.infer<typeof InsightSuggestionSchema>;
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
export type DashboardViewInput = z.infer<typeof DashboardViewInputSchema>;
export type AnalyticsPeriodPreset = z.infer<typeof AnalyticsPeriodPresetSchema>;
export type AnalyticsMetrics = z.infer<typeof AnalyticsMetricsSchema>;
export type AnalyticsTrendPoint = z.infer<typeof AnalyticsTrendPointSchema>;
export type AnalyticsSectionDwell = z.infer<typeof AnalyticsSectionDwellSchema>;
export type AnalyticsReferrer = z.infer<typeof AnalyticsReferrerSchema>;
export type AnalyticsOrganization = z.infer<typeof AnalyticsOrganizationSchema>;
export type AnalyticsDashboard = z.infer<typeof AnalyticsDashboardSchema>;
export type DashboardInsight = z.infer<typeof DashboardInsightSchema>;
export type MetricKey = z.infer<typeof MetricKeySchema>;
export type MetricCatalogEntry = z.infer<typeof MetricCatalogEntrySchema>;
export type MetricAvailability = z.infer<typeof MetricAvailabilitySchema>;
export type Widget = z.infer<typeof WidgetSchema>;
export type WidgetVisualization = z.infer<typeof WidgetVisualizationSchema>;
export type WidgetSpan = z.infer<typeof WidgetSpanSchema>;
export type AddWidget = z.infer<typeof AddWidgetSchema>;
export type UpdateWidget = z.infer<typeof UpdateWidgetSchema>;

