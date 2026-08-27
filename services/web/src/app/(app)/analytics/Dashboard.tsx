"use client";

import type {
  AnalyticsDashboard,
  AnalyticsMetrics,
  AnalyticsPeriodPreset,
  MetricCatalogEntry,
  MetricKey,
  Widget,
  WidgetVisualization,
} from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useActionState, useState, useTransition, type DragEvent, type ReactNode } from "react";

import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";

import {
  aggregateAction,
  insightAction,
  widgetAction,
  type AnalyticsActionResult,
} from "./analytics-actions";
import styles from "./page.module.css";

/**
 * 07 분석.
 *
 * 여기 있는 수는 전부 집계에서 온다. 화면이 만드는 것은 **서식뿐이다** —
 * 완독률은 completes ÷ visits이고, 평균 체류는 섹션 체류 합 ÷ 방문이다. 어느
 * 칸이든 어느 두 수의 나눗셈인지 말할 수 있어야 한다.
 *
 * 지면은 **위젯 목록**이 정한다(07b · 07c). 아직 아무것도 고치지 않았으면 서버가
 * 코드에 적힌 기본 목록을 그대로 주고, "대시보드 편집"을 누르는 순간 그 목록이
 * 내 것으로 굳는다.
 */

const PERIOD_LABEL: Record<AnalyticsPeriodPreset, string> = {
  "7d": "7일",
  "30d": "30일",
  all: "전체",
};

/** 집계 키를 사람 말로. 해설의 근거 칩과 제안이 이걸 쓴다. */
const METRIC_LABEL: Record<string, string> = {
  visits: "방문",
  completes: "완독",
  contact_clicks: "연락처 클릭",
  file_downloads: "파일 내려받기",
  link_clicks: "외부 링크 클릭",
  eligible_section_views: "섹션 조회",
  total_section_dwell_ms: "섹션 체류",
};

const VISUALIZATION_LABEL: Record<WidgetVisualization, { label: string; icon: string }> = {
  number: { label: "숫자", icon: "number-square-one" },
  spark: { label: "스파크", icon: "chart-line" },
  line: { label: "선", icon: "chart-line-up" },
  bar: { label: "막대", icon: "chart-bar" },
  donut: { label: "도넛", icon: "chart-donut" },
  list: { label: "목록", icon: "list-bullets" },
  note: { label: "해설", icon: "coffee" },
};

const SPANS: { value: 3 | 4 | 8 | 12; label: string }[] = [
  { value: 3, label: "1/4" },
  { value: 4, label: "1/3" },
  { value: 8, label: "2/3" },
  { value: 12, label: "전체" },
];

/** 도넛은 4구간 무채색 단계 (§5.4). */
const DONUT_SHADES = ["var(--ex-fg)", "var(--ex-fg-muted)", "var(--ex-fg-subtle)", "var(--ex-border-firm)", "var(--ex-border)"];

function formatCount(value: number): string {
  return value.toLocaleString("ko-KR");
}

/** 밀리초를 분:초로. 시간 단위까지 갈 일은 방문 한 번에 없다. */
function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function formatDate(date: string): string {
  return date.slice(5).replace("-", ".");
}

/** 출처는 origin까지만 남아 있다. 화면에서는 호스트만 읽는다. */
function originLabel(origin: string | null): string {
  if (!origin) return "직접 방문";
  try {
    return new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return origin;
  }
}

interface Delta {
  text: string;
  tone: "up" | "down" | "flat";
}

function delta(current: number, previous: number | null): Delta | null {
  if (previous === null) return null;
  if (previous === 0) return current === 0 ? null : { text: "새로 생김", tone: "up" };
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.05) return { text: "— 0.0%", tone: "flat" };
  return {
    text: `${change > 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%`,
    tone: change > 0 ? "up" : "down",
  };
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

interface Scalar {
  label: string;
  meta: string;
  value: string;
  /** 이 칸이 어느 두 수에서 나왔나. 증감도 같은 계산으로 잰다. */
  amount: number;
  previous: (previous: AnalyticsMetrics) => number;
  note?: string;
}

/**
 * 숫자 하나로 그릴 수 있는 지표들.
 *
 * 값과 증감을 **같은 식**으로 낸다. 비율 타일의 증감을 건수로 재면 방문이 늘 때
 * 비율이 떨어져도 증가로 보인다.
 */
function scalar(
  key: MetricKey,
  metrics: AnalyticsMetrics,
  preset: AnalyticsPeriodPreset,
): Scalar | null {
  switch (key) {
    case "visits":
      return {
        label: "방문", meta: `소유자 제외 · ${PERIOD_LABEL[preset]}`,
        value: formatCount(metrics.visits),
        amount: metrics.visits, previous: (before) => before.visits,
      };
    case "avg_dwell_ms":
      return {
        label: "평균 체류", meta: "섹션 체류 합 ÷ 방문",
        value: formatDuration(ratio(metrics.sectionDwellMs, metrics.visits)),
        amount: ratio(metrics.sectionDwellMs, metrics.visits),
        previous: (before) => ratio(before.sectionDwellMs, before.visits),
        note: `1초 넘게 머문 섹션 조회 ${formatCount(metrics.sectionViews)}건`,
      };
    case "completion_rate":
      return {
        label: "끝까지 읽은 비율", meta: "완독 ÷ 방문",
        value: formatPercent(ratio(metrics.completes, metrics.visits)),
        amount: ratio(metrics.completes, metrics.visits),
        previous: (before) => ratio(before.completes, before.visits),
        note: `${formatCount(metrics.completes)}명이 끝까지 읽었습니다`,
      };
    case "contact_clicks":
      return {
        label: "연락처 클릭", meta: "메일 · 전화 · 링크드인",
        value: formatCount(metrics.contactClicks),
        amount: metrics.contactClicks, previous: (before) => before.contactClicks,
      };
    case "file_downloads":
      return {
        label: "이력서 내려받기", meta: "파일 내려받기 수",
        value: formatCount(metrics.fileDownloads),
        amount: metrics.fileDownloads, previous: (before) => before.fileDownloads,
      };
    case "link_clicks":
      return {
        label: "외부 링크 클릭", meta: "깃허브 · 블로그 등",
        value: formatCount(metrics.linkClicks),
        amount: metrics.linkClicks, previous: (before) => before.linkClicks,
      };
    default:
      return null;
  }
}

/** 추이를 650×190 좌표로. 점이 하나뿐이면 선이 아니라 점으로 그린다. */
function polyline(points: { visits: number }[]): string {
  if (points.length === 0) return "";
  const top = Math.max(...points.map(({ visits }) => visits), 1);
  const step = points.length > 1 ? 620 / (points.length - 1) : 0;
  return points
    .map(({ visits }, index) => `${(15 + index * step).toFixed(1)},${(180 - (visits / top) * 165).toFixed(1)}`)
    .join(" ");
}

export function Dashboard({
  dashboard,
  portfolios,
  catalog,
  editing: startEditing,
}: {
  dashboard: AnalyticsDashboard;
  portfolios: { id: string; title: string }[];
  catalog: MetricCatalogEntry[];
  editing: boolean;
}) {
  const [mode, setMode] = useState<"view" | "edit">(startEditing ? "edit" : "view");
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** 놓으면 들어갈 자리. 지금 목록 기준의 끼워 넣기 위치다. */
  const [slot, setSlot] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { period, coverage, widgets } = dashboard;
  const editing = mode === "edit";
  const chosen = widgets.find(({ id }) => id !== null && id === selected) ?? null;

  function run(fields: Record<string, string | string[]>) {
    const formData = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      if (Array.isArray(value)) for (const item of value) formData.append(name, item);
      else formData.set(name, value);
    }
    setFailed(null);
    startTransition(async () => {
      const result = await widgetAction({}, formData);
      if (result.error) setFailed(result.error);
    });
  }

  /** 끌고 있는 동안 보이는 차례. 실제 저장은 놓을 때 한 번이다. */
  const preview = previewOrder(widgets, drag, slot);

  function endDrag() {
    setDrag(null);
    setSlot(null);
  }

  function drop() {
    if (drag === null || slot === null) return endDrag();
    if (drag.kind === "widget") {
      const ids = preview.map(({ id }) => id).filter((id): id is string => id !== null);
      if (ids.length === widgets.length) {
        run({ intent: "reorder", portfolioId: dashboard.portfolio.id, widgetIds: ids });
      }
    } else {
      run({
        intent: "add",
        portfolioId: dashboard.portfolio.id,
        period: period.preset,
        metricKey: drag.metricKey,
        index: String(slot),
      });
    }
    endDrag();
  }

  /** 07c의 ◀ ▶ — 마우스를 못 쓰는 자리에서도 순서를 바꾼다. */
  function move(widgetId: string, step: -1 | 1) {
    const from = widgets.findIndex(({ id }) => id === widgetId);
    const to = from + step;
    if (from < 0 || to < 0 || to >= widgets.length) return;
    const ids = widgets.map(({ id }) => id).filter((id): id is string => id !== null);
    [ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
    run({ intent: "reorder", portfolioId: dashboard.portfolio.id, widgetIds: ids });
  }
  const href = (next: Partial<{ period: string; portfolio: string }>): Route =>
    `/analytics?portfolio=${next.portfolio ?? dashboard.portfolio.id}&period=${next.period ?? period.preset}` as Route;

  return (
    <>
      <AppHeader
        title={dashboard.portfolio.title}
        actions={
          editing ? (
            <>
              <span className={styles.editingBadge}>
                <Icon name="pencil-simple" size={11} />
                편집 중 · 나에게만 보임
              </span>
              {dashboard.customized ? (
                <WidgetForm
                  intent="reset"
                  portfolioId={dashboard.portfolio.id}
                  preset={period.preset}
                  className={styles.headButton}
                  onDone={() => setSelected(null)}
                >
                  레이아웃 초기화
                </WidgetForm>
              ) : null}
              <button
                type="button"
                className={`${styles.headButton} ${styles.headButtonPrimary}`}
                onClick={() => { setMode("view"); setSelected(null); }}
              >
                편집 완료
              </button>
            </>
          ) : (
            <>
              <span className={styles.headDomain}>{dashboard.deployment.subdomain}.xpresso.me</span>
              <span className={styles.headState}>
                <span className={styles.headStateDot} />
                {dashboard.deployment.publishedAt
                  ? `배포됨 · ${formatDate(dashboard.deployment.publishedAt.slice(0, 10))}`
                  : "배포 준비 중"}
              </span>
              <div className={styles.period}>
                {(["7d", "30d", "all"] as const).map((preset) => (
                  <Link
                    key={preset}
                    href={href({ period: preset })}
                    className={`${styles.periodItem} ${
                      preset === period.preset ? styles.periodItemActive : ""
                    }`}
                  >
                    {PERIOD_LABEL[preset]}
                  </Link>
                ))}
              </div>
              {/* 편집을 시작하는 순간 기본 지면이 내 것으로 굳는다. */}
              <WidgetForm
                intent="edit"
                portfolioId={dashboard.portfolio.id}
                preset={period.preset}
                className={styles.headButton}
                onDone={() => setMode("edit")}
              >
                대시보드 편집
              </WidgetForm>
            </>
          )
        }
      />
      <AppBody>
        <div className={styles.content}>
          <div className={styles.viewBar}>
            {portfolios.map((item) => (
              <Link
                key={item.id}
                href={href({ portfolio: item.id })}
                className={`${styles.viewTab} ${
                  item.id === dashboard.portfolio.id ? styles.viewTabActive : ""
                }`}
              >
                {item.title}
              </Link>
            ))}
            <div className={styles.viewBarRight}>
              <span className={styles.refreshed}>
                {editing
                  ? `위젯 ${widgets.length}개 · 12칼럼 그리드`
                  : `${period.start} ~ ${period.end} · 집계 ${coverage.aggregatedDays}/${coverage.days}일`}
              </span>
            </div>
          </div>

          {coverage.pendingDates.length > 0 ? (
            <Aggregate
              portfolioId={dashboard.portfolio.id}
              preset={period.preset}
              pending={coverage.pendingDates.length}
            />
          ) : null}

          {failed ? <p className={styles.blankBody}>{failed}</p> : null}

          {/* §2.1의 `?edit=1`로 바로 들어오면 아직 굳지 않은 기본 지면 위에 서 있다. */}
          {editing && !dashboard.customized ? (
            <div className={styles.notice}>
              <Icon name="info" size={12} color="var(--ex-fg-muted)" />
              <span className={styles.noticeText}>
                지금 보고 계신 것은 <b>기본 지면</b>입니다. 옮기거나 고치려면 먼저 내 것으로
                가져와야 합니다 — 라이브러리에서 지표를 하나 놓아도 같이 가져옵니다.
              </span>
              <button
                type="button"
                className={styles.noticeAction}
                onClick={() => run({
                  intent: "edit",
                  portfolioId: dashboard.portfolio.id,
                  period: period.preset,
                })}
              >
                내 것으로 가져오기
              </button>
            </div>
          ) : null}

          <div className={styles.grid} onDrop={drop} onDragOver={(event) => event.preventDefault()}>
            {preview.map((widget, index) => (
              widget.id === GHOST ? (
                <div
                  key="ghost"
                  className={styles.dropZone}
                  style={{ gridColumn: `span ${widget.span}` }}
                >
                  <span className={styles.dropZoneText}>
                    여기에 놓기
                    <br />
                    {widget.span} 칼럼
                  </span>
                </div>
              ) : (
                <WidgetCard
                  key={widget.id ?? `${widget.metricKey}-${index}`}
                  widget={widget}
                  dashboard={dashboard}
                  editing={editing}
                  selected={widget.id !== null && widget.id === selected}
                  dragging={drag?.kind === "widget" && drag.id === widget.id}
                  onSelect={() => setSelected(widget.id)}
                  onDragStart={() => { if (widget.id) setDrag({ kind: "widget", id: widget.id }); }}
                  onDragOver={(event) => {
                    if (!drag) return;
                    event.preventDefault();
                    setSlot(slotFor(event, widgets, widget, index));
                  }}
                  onDragEnd={endDrag}
                />
              )
            ))}

            {/* 맨 뒤에 놓을 자리. 편집 중에는 늘 열려 있다(정의서 07b). */}
            {editing ? (
              <div
                className={styles.dropZone}
                style={{ gridColumn: "span 3" }}
                onDragOver={(event) => { event.preventDefault(); setSlot(widgets.length); }}
              >
                <span className={styles.dropZoneText}>
                  여기에 놓기
                  <br />
                  맨 뒤 · 3 칼럼
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {editing && chosen === null ? (
          <MetricLibrary
            catalog={catalog}
            used={new Set(widgets.map(({ metricKey }) => metricKey))}
            portfolioId={dashboard.portfolio.id}
            preset={period.preset}
            onDragStart={(metricKey) => setDrag({ kind: "metric", metricKey })}
            onDragEnd={endDrag}
            onClose={() => { setMode("view"); setSelected(null); }}
          />
        ) : null}
        {editing && chosen !== null ? (
          <WidgetSettings
            widget={chosen}
            entry={catalog.find(({ key }) => key === chosen.metricKey) ?? null}
            position={widgets.findIndex(({ id }) => id === chosen.id)}
            total={widgets.length}
            onMove={(step) => { if (chosen.id) move(chosen.id, step); }}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </AppBody>
    </>
  );
}

/**
 * 끌고 있는 것.
 *
 * 지면의 위젯을 옮기는 것과 라이브러리에서 새로 놓는 것 둘뿐이다. 놓는 자리는
 * 같은 계산을 쓰고, 놓는 순간에 무엇을 할지만 갈린다.
 */
type Drag = { kind: "widget"; id: string } | { kind: "metric"; metricKey: MetricKey };

/** 미리보기 자리에 끼우는 빈 칸. 실제 위젯이 아니다. */
const GHOST = "__ghost__";

/**
 * 놓을 자리를 카드의 가로 중앙으로 정한다.
 *
 * 12칼럼 그리드라 한 줄에 여러 칸이 선다. 세로로 재면 같은 줄의 카드들이 전부
 * 같은 자리로 잡혀 어디에 놓이는지 알 수 없다.
 */
function slotFor(
  event: DragEvent<HTMLDivElement>,
  widgets: Widget[],
  widget: Widget,
  fallback: number,
): number {
  const index = widgets.findIndex(({ id }) => id === widget.id);
  const at = index < 0 ? fallback : index;
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX > box.left + box.width / 2 ? at + 1 : at;
}

/** 끌고 있는 동안의 차례. 저장하지 않고 화면에서만 미리 옮겨 본다. */
function previewOrder(widgets: Widget[], drag: Drag | null, slot: number | null): Widget[] {
  if (drag === null || slot === null) return widgets;
  if (drag.kind === "metric") {
    const ghost: Widget = {
      id: GHOST, metricKey: drag.metricKey, visualization: "number",
      span: 3, compareTo: null, order: slot,
    };
    return [...widgets.slice(0, slot), ghost, ...widgets.slice(slot)];
  }
  const from = widgets.findIndex(({ id }) => id === drag.id);
  if (from < 0) return widgets;
  const next = [...widgets];
  const [moved] = next.splice(from, 1);
  if (!moved) return widgets;
  next.splice(slot > from ? slot - 1 : slot, 0, moved);
  return next;
}

/** 위젯 하나. 무엇을(metricKey)과 어떻게(visualization)가 여기서 만난다. */
function WidgetCard({
  widget,
  dashboard,
  editing,
  selected,
  dragging,
  onSelect,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  widget: Widget;
  dashboard: AnalyticsDashboard;
  editing: boolean;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  const note = widget.metricKey === "insight";
  // 굳히지 않은 기본 지면의 위젯은 id가 없어 옮길 수도 고를 수도 없다.
  const movable = editing && widget.id !== null;
  return (
    <div
      className={[
        note ? styles.baristaCard : styles.widget,
        editing ? styles.widgetEditing : "",
        selected ? styles.widgetSelected : "",
        dragging ? styles.widgetDragging : "",
      ].filter(Boolean).join(" ")}
      style={{ gridColumn: `span ${widget.span}` }}
      draggable={movable}
      onClick={movable ? onSelect : undefined}
      onDragStart={(event) => {
        // Firefox는 데이터가 없으면 끌기를 시작하지 않는다.
        event.dataTransfer.setData("text/plain", widget.id ?? "");
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {/* 손잡이는 없다. 카드 전체가 손잡이고, 잡을 수 있다는 말은 커서와 테두리가 한다. */}
      <WidgetBody widget={widget} dashboard={dashboard} />
    </div>
  );
}

function WidgetBody({ widget, dashboard }: { widget: Widget; dashboard: AnalyticsDashboard }) {
  const { metrics, previous, trend, sections, referrers, period } = dashboard;

  switch (widget.metricKey) {
    case "visits_trend":
      return <Trend trend={trend} />;
    case "section_dwell":
      return (
        <>
          <Head title="섹션별 체류" meta="1회 평균 · 오래 머문 순" />
          <SectionDwell sections={sections} />
        </>
      );
    case "referrers":
      return (
        <>
          <Head title="유입 경로" meta="방문 기준" />
          {referrers.length === 0 ? (
            <p className={styles.blankBody}>아직 유입이 없습니다.</p>
          ) : widget.visualization === "donut" ? (
            <div className={styles.donutRow}>
              <Donut slices={referrers} />
              <ReferrerLegend slices={referrers} />
            </div>
          ) : (
            <ReferrerLegend slices={referrers} />
          )}
        </>
      );
    case "org_domains":
      return <Organizations organizations={dashboard.organizations} />;
    case "insight":
      return (
        <BaristaRead
          insight={dashboard.insight}
          portfolioId={dashboard.portfolio.id}
          preset={period.preset}
        />
      );
    default: {
      const tile = scalar(widget.metricKey, metrics, period.preset);
      if (!tile) return <p className={styles.blankBody}>아직 그릴 수 없는 지표입니다.</p>;
      const change = widget.compareTo === "prev_period" && previous
        ? delta(tile.amount, tile.previous(previous))
        : null;
      return (
        <>
          <div className={styles.tileHead}>
            <span className={styles.tileLabel}>{tile.label}</span>
            <span className={styles.tileMeta}>{tile.meta}</span>
          </div>
          <div className={styles.tileValueRow}>
            <span className={styles.tileValue}>{tile.value}</span>
            {change ? (
              <span
                className={
                  change.tone === "up"
                    ? styles.deltaUp
                    : change.tone === "down"
                      ? styles.deltaDown
                      : styles.deltaFlat
                }
              >
                {change.text}
              </span>
            ) : null}
          </div>
          {widget.visualization === "spark" ? <Spark trend={trend} /> : null}
          {tile.note ? <div className={styles.tileNote}>{tile.note}</div> : null}
        </>
      );
    }
  }
}

function Head({ title, meta }: { title: string; meta: string }) {
  return (
    <div className={styles.chartHead}>
      <span className={styles.chartTitle}>{title}</span>
      <span className={styles.tileMeta}>{meta}</span>
    </div>
  );
}

function Spark({ trend }: { trend: AnalyticsDashboard["trend"] }) {
  const points = trend.slice(-7);
  const top = Math.max(...points.map(({ visits }) => visits), 1);
  return (
    <div className={styles.spark}>
      {points.map((point) => (
        <span
          key={point.date}
          className={styles.sparkBar}
          style={{ height: `${Math.max(6, Math.round((point.visits / top) * 100))}%` }}
        />
      ))}
    </div>
  );
}

function Trend({ trend }: { trend: AnalyticsDashboard["trend"] }) {
  const top = Math.max(...trend.map(({ visits }) => visits), 1);
  return (
    <>
      <Head title="방문 추이" meta={`집계된 날만 · ${trend.length}일`} />
      {trend.length === 0 ? (
        <p className={styles.blankBody}>집계된 날이 아직 없습니다.</p>
      ) : (
        <div className={styles.chartWrap}>
          <div className={styles.chartAxis}>
            {[3, 2, 1, 0].map((step) => (
              <span key={step} className={styles.axisLabel}>
                {Math.round((top * step) / 3)}
              </span>
            ))}
          </div>
          <svg
            width="100%"
            height="196"
            viewBox="0 0 650 190"
            preserveAspectRatio="none"
            style={{ display: "block", overflow: "visible" }}
            aria-label="방문 추이 선 차트"
          >
            <polyline
              points={polyline(trend)}
              fill="none"
              stroke="var(--ex-fg)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          <div className={styles.chartDates}>
            {[0, 1, 2, 3]
              .map((quarter) => trend[Math.round((quarter * (trend.length - 1)) / 3)])
              .map((point, index) => (
                <span key={`${point?.date}-${index}`} className={styles.axisLabel}>
                  {point ? formatDate(point.date) : ""}
                </span>
              ))}
          </div>
        </div>
      )}
    </>
  );
}

function Organizations({
  organizations,
}: {
  organizations: AnalyticsDashboard["organizations"];
}) {
  return (
    <>
      <div className={styles.chartHead}>
        <span className={styles.chartTitle}>기업 도메인 방문</span>
        <span className={styles.proBadge}>PRO</span>
      </div>
      {!organizations.entitled ? (
        <p className={styles.blankBody}>
          어느 회사에서 내 포트폴리오를 봤는지는 PRO에서 볼 수 있습니다.
        </p>
      ) : organizations.domains.length === 0 ? (
        <p className={styles.blankBody}>기업 네트워크에서 온 방문이 아직 없습니다.</p>
      ) : (
        <>
          {organizations.domains.map((visit) => (
            <div key={visit.domain} className={styles.orgRow}>
              <span className={styles.orgInitial}>{visit.domain.slice(0, 1).toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className={styles.orgDomain} style={{ display: "block" }}>
                  {visit.domain}
                </span>
                <span className={styles.orgNote} style={{ display: "block" }}>
                  {formatDate(visit.lastVisitAt.slice(0, 10))} · {visit.visits}회
                </span>
              </span>
              <span className={styles.orgDwell}>
                {formatDuration(ratio(visit.dwellMs, visit.visits))}
              </span>
            </div>
          ))}
          {/* 개인 식별 정보는 UI에 노출하지 않는다 */}
          <div className={styles.privacy}>
            <Icon name="info" size={12} />
            기업 네트워크 접속만 표시 · 개인 식별 안 함
          </div>
        </>
      )}
    </>
  );
}

/** 아직 계산되지 않은 날. 워커가 밤에 하는 일을 지금 당겨 시킨다. */
function Aggregate({
  portfolioId,
  preset,
  pending,
}: {
  portfolioId: string;
  preset: AnalyticsPeriodPreset;
  pending: number;
}) {
  const [result, submit, running] = useActionState<AnalyticsActionResult, FormData>(
    aggregateAction,
    {},
  );

  return (
    <form action={submit} className={styles.notice}>
      <input type="hidden" name="portfolioId" value={portfolioId} />
      <input type="hidden" name="period" value={preset} />
      <Icon name="info" size={12} color="var(--ex-fg-muted)" />
      <span className={styles.noticeText}>
        {result.error
          ? result.error
          : result.queued !== undefined
            ? `${result.queued}일치를 계산하고 있습니다. 잠시 뒤 새로고침해 주세요.`
            : `방문은 있는데 아직 계산되지 않은 날이 ${pending}일 있습니다. 수는 하루에 한 번 정리됩니다.`}
      </span>
      {result.queued === undefined ? (
        <button type="submit" className={styles.noticeAction} disabled={running}>
          {running ? "넣는 중…" : "지금 집계"}
        </button>
      ) : null}
    </form>
  );
}

/** §8.3 분석 해설. 표본이 모자라면 계약을 부르지 않는다. */
function BaristaRead({
  insight,
  portfolioId,
  preset,
}: {
  insight: AnalyticsDashboard["insight"];
  portfolioId: string;
  preset: AnalyticsPeriodPreset;
}) {
  const [result, submit, running] = useActionState<AnalyticsActionResult, FormData>(
    insightAction,
    {},
  );

  return (
    <>
      <div className={styles.baristaHead}>
        <Icon name="coffee" weight="fill" size={14} color="var(--ex-accent-text)" />
        <span className={styles.baristaLabel}>BARISTA&apos;S READ</span>
      </div>

      {insight.state === "insufficient_sample" ? (
        <p className={styles.baristaBody}>
          방문 {insight.sampleSize}건입니다. {insight.minimumSample}건부터 해설을 씁니다 — 표본이
          작으면 무슨 말이든 할 수 있게 되고, 그런 해설은 없느니만 못합니다.
        </p>
      ) : insight.state === "none" ? (
        <p className={styles.baristaBody}>
          아직 읽지 않았습니다. 이 기간의 집계를 두 문장으로 정리해 드립니다.
        </p>
      ) : (
        <>
          <p className={styles.baristaBody}>{insight.narrative}</p>
          <div className={styles.evidenceRow}>
            {insight.evidenceMetrics.map((key) => (
              <span key={key} className={styles.evidenceChip}>
                {METRIC_LABEL[key] ?? key}
              </span>
            ))}
          </div>
          {insight.suggestions.length > 0 ? (
            <>
              <div className={styles.suggestionLabel}>제안 {insight.suggestions.length}건</div>
              {insight.suggestions.map((suggestion) => (
                <div key={suggestion.action} className={styles.suggestionRow}>
                  <span className={styles.suggestionDot} />
                  <span className={styles.suggestionText}>
                    <b>
                      {METRIC_LABEL[suggestion.target] ?? suggestion.target}
                      {suggestion.direction === "up" ? " 올리기" : " 낮추기"}
                    </b>{" "}
                    · {suggestion.action}
                  </span>
                </div>
              ))}
            </>
          ) : null}
        </>
      )}

      {insight.state === "insufficient_sample" ? null : (
        <form action={submit} className={styles.baristaCta}>
          <input type="hidden" name="portfolioId" value={portfolioId} />
          <input type="hidden" name="period" value={preset} />
          <button type="submit" className={styles.baristaButton} disabled={running}>
            {running ? "읽는 중…" : insight.state === "ready" ? "다시 읽기" : "해설 읽기"}
          </button>
          {result.error ? <span className={styles.baristaError}>{result.error}</span> : null}
        </form>
      )}
    </>
  );
}

function SectionDwell({ sections }: { sections: AnalyticsDashboard["sections"] }) {
  if (sections.length === 0) {
    return <p className={styles.blankBody}>아직 읽힌 섹션이 없습니다.</p>;
  }
  const averaged = sections
    .map((section) => ({ ...section, average: ratio(section.dwellMs, section.views) }))
    .sort((left, right) => right.average - left.average);
  const top = averaged[0]?.average ?? 1;

  return (
    <>
      {averaged.map((section, index) => (
        <div key={section.sectionId} className={styles.dwellRow}>
          <span className={styles.dwellLabel}>
            {section.title || `${index + 1}번 섹션`}
            <span className={styles.dwellViews}> · {section.views}회</span>
          </span>
          <span className={styles.dwellTrack}>
            <span
              className={styles.dwellFill}
              style={{ width: `${Math.round((section.average / top) * 100)}%` }}
            />
          </span>
          <span className={styles.dwellTime}>{formatDuration(section.average)}</span>
        </div>
      ))}
    </>
  );
}

function ReferrerLegend({ slices }: { slices: AnalyticsDashboard["referrers"] }) {
  return (
    <div className={styles.donutLegend}>
      {slices.map((slice, index) => (
        <div key={slice.origin ?? "direct"} className={styles.donutLegendRow}>
          <span
            className={styles.donutSwatch}
            style={{ background: DONUT_SHADES[index % DONUT_SHADES.length] }}
          />
          <span className={styles.donutLegendLabel}>{originLabel(slice.origin)}</span>
          <span className={styles.donutLegendValue}>{slice.visits}</span>
        </div>
      ))}
    </div>
  );
}

/** 도넛은 conic-gradient 대신 SVG stroke-dasharray로 그린다 — 4구간 무채색. */
function Donut({ slices }: { slices: AnalyticsDashboard["referrers"] }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, item) => sum + item.visits, 0);
  let offset = 0;

  return (
    <div style={{ position: "relative", width: 132, height: 132, flexShrink: 0 }}>
      <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
        {slices.map((slice, index) => {
          const length = (slice.visits / total) * circumference;
          const element = (
            <circle
              key={slice.origin ?? "direct"}
              cx="66"
              cy="66"
              r={radius}
              fill="none"
              stroke={DONUT_SHADES[index % DONUT_SHADES.length]}
              strokeWidth="18"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 66 66)"
            />
          );
          offset += length;
          return element;
        })}
      </svg>
      <div className={styles.donutCenter}>
        <div>
          <div className={styles.donutValue}>{formatCount(total)}</div>
          <div className={styles.donutLabel}>방문</div>
        </div>
      </div>
    </div>
  );
}

/** 위젯을 놓고 · 고치고 · 지우는 폼. 전부 같은 문으로 간다. */
function WidgetForm({
  intent,
  portfolioId,
  widgetId,
  preset,
  fields,
  className,
  children,
  onDone,
}: {
  intent: "edit" | "reset" | "add" | "update" | "delete";
  portfolioId?: string;
  widgetId?: string;
  preset?: AnalyticsPeriodPreset;
  fields?: Record<string, string>;
  className?: string | undefined;
  children: ReactNode;
  onDone?: () => void;
}) {
  const [result, submit, running] = useActionState<AnalyticsActionResult, FormData>(
    widgetAction,
    {},
  );

  return (
    <form
      action={(formData) => { submit(formData); onDone?.(); }}
      style={{ display: "contents" }}
    >
      <input type="hidden" name="intent" value={intent} />
      {portfolioId ? <input type="hidden" name="portfolioId" value={portfolioId} /> : null}
      {widgetId ? <input type="hidden" name="widgetId" value={widgetId} /> : null}
      {preset ? <input type="hidden" name="period" value={preset} /> : null}
      {Object.entries(fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className={className} disabled={running}>
        {children}
      </button>
      {result.error ? <span className={styles.baristaError}>{result.error}</span> : null}
    </form>
  );
}

/**
 * 07b 지표 라이브러리.
 *
 * 못 쓰는 지표도 목록에 남고, **왜 못 쓰는지가 같이 온다.** 지워 버리면 "이
 * 도구는 그걸 못 본다"는 사실이 아무 데도 남지 않는다.
 */
function MetricLibrary({
  catalog,
  used,
  portfolioId,
  preset,
  onDragStart,
  onDragEnd,
  onClose,
}: {
  catalog: MetricCatalogEntry[];
  used: Set<MetricKey>;
  portfolioId: string;
  preset: AnalyticsPeriodPreset;
  onDragStart: (metricKey: MetricKey) => void;
  onDragEnd: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const found = catalog.filter(({ label, description }) =>
    `${label} ${description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = [...new Set(found.map(({ group }) => group))];

  return (
    <aside className={styles.drawer} aria-label="지표 라이브러리">
      <div className={styles.drawerHead}>
        <span className={styles.drawerTitle}>지표 라이브러리</span>
        <button type="button" className={styles.drawerClose} aria-label="닫기" onClick={onClose}>
          <Icon name="x" size={15} />
        </button>
      </div>
      <div className={styles.drawerBody}>
        <div className={styles.drawerSearch}>
          <Icon name="magnifying-glass" size={14} color="var(--ex-fg-muted)" />
          <input
            className={styles.drawerSearchInput}
            placeholder="지표 이름으로 찾기"
            aria-label="지표 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {groups.map((group) => {
          const entries = found.filter((entry) => entry.group === group);
          return (
            <div key={group} className={styles.metricGroup}>
              <div className={styles.metricGroupHead}>
                <span className={styles.metricGroupLabel}>{group}</span>
                <span className={styles.metricGroupRule} />
                <span className={styles.metricGroupCount}>{entries.length}</span>
              </div>
              {entries.map((entry) => (
                <div
                  key={entry.key}
                  className={`${styles.metricRow} ${
                    entry.availability === "ready" ? styles.metricDraggable : ""
                  }`}
                  draggable={entry.availability === "ready"}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", entry.key);
                    event.dataTransfer.effectAllowed = "copy";
                    onDragStart(entry.key);
                  }}
                  onDragEnd={onDragEnd}
                >
                  <span className={styles.metricBody}>
                    <span className={styles.metricName}>{entry.label}</span>
                    <span className={styles.metricWhat}>
                      {entry.availability === "ready" ? entry.description : entry.reason}
                    </span>
                  </span>
                  {entry.availability !== "ready" ? (
                    <span className={entry.availability === "plan_required" ? styles.statePro : styles.stateNone}>
                      {entry.availability === "plan_required" ? "PRO" : "없음"}
                    </span>
                  ) : used.has(entry.key) ? (
                    <WidgetForm
                      intent="add"
                      portfolioId={portfolioId}
                      preset={preset}
                      fields={{ metricKey: entry.key }}
                      className={styles.metricAddAgain}
                    >
                      하나 더
                    </WidgetForm>
                  ) : (
                    <WidgetForm
                      intent="add"
                      portfolioId={portfolioId}
                      preset={preset}
                      fields={{ metricKey: entry.key }}
                      className={styles.metricAdd}
                    >
                      ＋ 놓기
                    </WidgetForm>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className={styles.drawerFoot}>
        <span className={styles.metricWhat}>
          지면으로 끌어다 놓거나 ＋ 놓기를 누릅니다. 놓은 위젯을 누르면 그림과 폭을 고칩니다.
        </span>
      </div>
    </aside>
  );
}

/** 07c 위젯 설정. 지표는 못 바꾼다 — 다른 지표는 다른 위젯이다. */
function WidgetSettings({
  widget,
  entry,
  position,
  total,
  onMove,
  onClose,
}: {
  widget: Widget;
  entry: MetricCatalogEntry | null;
  position: number;
  total: number;
  onMove: (step: -1 | 1) => void;
  onClose: () => void;
}) {
  const widgetId = widget.id ?? "";

  return (
    <aside className={styles.drawer} aria-label="위젯 설정">
      <div className={styles.drawerHead}>
        <span className={styles.drawerTitle}>위젯 설정</span>
        <button type="button" className={styles.drawerClose} aria-label="닫기" onClick={onClose}>
          <Icon name="x" size={15} />
        </button>
      </div>

      <div className={styles.drawerBody}>
        <div className={styles.settingGroup}>
          <div className={styles.settingGroupTitle}>무엇을</div>
          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>지표</span>
            <span className={styles.settingFixed}>{entry?.label ?? widget.metricKey}</span>
          </div>
          {entry ? <div className={styles.metricWhat}>{entry.description}</div> : null}
        </div>

        <div className={styles.settingGroup}>
          <div className={styles.settingGroupTitle}>어떻게 보여줄까</div>
          <div className={styles.vizGrid}>
            {(entry?.visualizations ?? [widget.visualization]).map((option) => (
              <WidgetForm
                key={option}
                intent="update"
                widgetId={widgetId}
                fields={{ visualization: option }}
                className={`${styles.vizOption} ${
                  option === widget.visualization ? styles.vizOptionActive : ""
                }`}
              >
                <Icon
                  name={VISUALIZATION_LABEL[option].icon}
                  size={15}
                  color={option === widget.visualization ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
                />
                <span className={styles.vizLabel}>{VISUALIZATION_LABEL[option].label}</span>
              </WidgetForm>
            ))}
          </div>
          <div className={styles.settingRow} style={{ marginTop: "10px" }}>
            <span className={styles.settingLabel}>폭</span>
            <span className={styles.spanRow} style={{ flex: 1 }}>
              {SPANS.map((option) => (
                <WidgetForm
                  key={option.value}
                  intent="update"
                  widgetId={widgetId}
                  fields={{ span: String(option.value) }}
                  className={`${styles.spanOption} ${
                    option.value === widget.span ? styles.spanOptionActive : ""
                  }`}
                >
                  {option.label}
                </WidgetForm>
              ))}
            </span>
          </div>
        </div>

        <div className={styles.settingGroup}>
          <div className={styles.settingGroupTitle}>어디에</div>
          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>자리</span>
            <span className={styles.spanRow} style={{ flex: 1 }}>
              <button
                type="button"
                className={styles.spanOption}
                disabled={position <= 0}
                onClick={() => onMove(-1)}
                aria-label="앞으로"
              >
                ◀
              </button>
              <span className={styles.settingFixed} style={{ textAlign: "center" }}>
                {position + 1} / {total}
              </span>
              <button
                type="button"
                className={styles.spanOption}
                disabled={position >= total - 1}
                onClick={() => onMove(1)}
                aria-label="뒤로"
              >
                ▶
              </button>
            </span>
          </div>
          <div className={styles.metricWhat}>지면에서 끌어 옮길 수도 있습니다.</div>
        </div>

        <div className={styles.settingGroup}>
          <div className={styles.settingGroupTitle}>무엇과 비교할까</div>
          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>직전 기간</span>
            <WidgetForm
              intent="update"
              widgetId={widgetId}
              fields={{ compareTo: widget.compareTo === "prev_period" ? "none" : "prev_period" }}
              className={`${styles.toggle} ${widget.compareTo === "prev_period" ? styles.toggleOn : ""}`}
            >
              <span className={styles.toggleKnob} />
            </WidgetForm>
          </div>
          <div className={styles.metricWhat}>
            다른 포트폴리오 · 업계 평균은 비교할 데이터가 없어 켤 수 없습니다.
          </div>
        </div>

        <div className={styles.settingActions}>
          <WidgetForm
            intent="delete"
            widgetId={widgetId}
            className={`${styles.settingAction} ${styles.settingDelete}`}
            onDone={onClose}
          >
            이 위젯 지우기
          </WidgetForm>
        </div>
      </div>
    </aside>
  );
}
