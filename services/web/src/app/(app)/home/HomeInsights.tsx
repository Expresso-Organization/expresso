"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  useEffect,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { publicSiteHost } from "@/lib/public-site";

import { biggestDrop, mergeReferrers, type SiteInsight } from "./home-model";
import styles from "./page.module.css";

/**
 * 00 홈 오른쪽 열 — 배포한 사이트의 반응. 차트마다 홈에서 내릴 결정 하나에 답한다.
 *
 * - 지원 반응: 보낸 포트폴리오가 읽히는가.
 * - 섹션 체류: 어디까지 읽는가, 어느 섹션을 다듬을까.
 * - 유입 경로: 어디서 오는가, 링크를 어디에 더 걸까.
 *
 * 모두 공개 사이트가 이미 모으는 방문 · 섹션 조회를 07 분석이 집계한 것이다.
 * 둘 이상이면 단추로 바꿔 보고, 손대지 않으면 차례로 넘어간다. 포인터나 초점이
 * 카드 안에 있는 동안은 멈추고, 움직임을 줄이도록 설정한 사람에게는 넘기지 않는다.
 */

/** 차트 하나를 보여 주는 시간. 큰 숫자 하나와 그림 하나를 읽을 만큼이다. */
const ROTATE_MS = 8000;

/** 사이트 선의 색. 검증한 차트 토큰이 셋이라 사이트도 셋까지다(`home-data.ts`가 자른다). */
const SITE_COLORS = ["var(--ex-chart-1)", "var(--ex-chart-2)", "var(--ex-chart-3)"];

type Chart =
  | { kind: "response"; title: string; meta: string }
  | { kind: "sections"; title: string; meta: string; site: SiteInsight }
  | { kind: "referrers"; title: string; meta: string; rows: Array<{ origin: string | null; visits: number }> };

/** 그릴 수 있는 차트만 고른다. 섹션 조회가 없는 사이트, 유입이 없는 기간은 그 차트를 빼고 단추도 없다. */
function charts(sites: SiteInsight[]): Chart[] {
  const list: Chart[] = [{ kind: "response", title: "지원 반응", meta: "최근 30일" }];
  const busiest = [...sites].sort((left, right) => right.visits - left.visits)[0];
  if (busiest && busiest.sections.length > 0) {
    list.push({ kind: "sections", title: "섹션 체류", meta: `${busiest.subdomain} · 30일`, site: busiest });
  }
  const referrers = mergeReferrers(sites);
  if (referrers.length > 0) {
    list.push({ kind: "referrers", title: "유입 경로", meta: `사이트 ${sites.length}개 · 30일`, rows: referrers });
  }
  return list;
}

export function HomeInsights({ sites }: { sites: SiteInsight[] }) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const list = charts(sites);
  const current = list[index] ?? list[0];
  if (!current) return null;
  const rotating = list.length > 1 && !reduced;

  function release(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
  }

  return (
    <div
      className={`${styles.plainCard} ${styles.chartCard}`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={release}
    >
      <div className={styles.chartHead}>
        {list.length > 1 ? (
          <div className={styles.segment} role="tablist" aria-label="차트">
            {list.map((chart, at) => (
              <button
                key={chart.kind}
                type="button"
                role="tab"
                aria-selected={at === index}
                className={`${styles.segmentItem} ${styles.chartTab} ${at === index ? styles.segmentItemActive : ""}`}
                onClick={() => setIndex(at)}
              >
                {chart.title}
                {/* 다음 차트까지 남은 시간. 다 차면 넘어가고, 멈춘 동안은 그 자리에 선다. */}
                {at === index && rotating ? (
                  <span
                    key={index}
                    className={styles.rotateBar}
                    style={{
                      animationDuration: `${ROTATE_MS}ms`,
                      animationPlayState: held ? "paused" : "running",
                    }}
                    onAnimationEnd={() => setIndex((at + 1) % list.length)}
                  />
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <span className={styles.chartTitle}>{current.title}</span>
        )}
        <span className={styles.chartMeta}>{current.meta}</span>
      </div>

      {/* 모든 차트를 한 칸에 겹쳐 둔다. 카드가 가장 큰 차트의 높이를 지켜서 넘길 때 아래가 출렁이지 않는다. */}
      <div className={styles.chartStage}>
        {list.map((chart, at) => (
          <div
            key={chart.kind}
            role="tabpanel"
            className={`${styles.chartPanel} ${at === index ? styles.chartPanelActive : ""}`}
            aria-hidden={at !== index}
            inert={at !== index}
          >
            {chart.kind === "response" ? (
              <ResponseBody sites={sites} />
            ) : chart.kind === "sections" ? (
              <SectionsBody site={chart.site} />
            ) : (
              <ReferrersBody rows={chart.rows} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const PLOT_W = 300;
const PLOT_H = 110;

/** 배포한 날마다 눈금 하나. 그날 배포한 사이트의 색 자리와 판 번호를 모은다. */
function deployMarks(sites: SiteInsight[], days: SiteInsight["days"]) {
  const marks = new Map<number, { index: number; slots: number[]; versions: number[] }>();
  sites.forEach((site, slot) => {
    const index = site.publishedOn ? days.findIndex(({ date }) => date === site.publishedOn) : -1;
    if (index < 0) return;
    const mark = marks.get(index) ?? { index, slots: [], versions: [] };
    mark.slots.push(slot);
    mark.versions.push(site.version);
    marks.set(index, mark);
  });
  return [...marks.values()];
}

function dayLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

/**
 * 지원 반응 — 사이트마다 선 하나. 바닥에 그 판을 배포한 날, 선 위에 연락처를 누른 날.
 * 선은 배포한 날부터 그린다. 배포 전은 0이 아니라 없는 날이다.
 */
function ResponseBody({ sites }: { sites: SiteInsight[] }) {
  const [active, setActive] = useState<number | null>(null);
  const days = sites[0]?.days ?? [];
  const top = Math.max(...sites.flatMap((site) => site.days.map(({ visits }) => visits)), 1);
  const x = (index: number) => (index / Math.max(days.length - 1, 1)) * PLOT_W;
  const y = (value: number) => PLOT_H - (value / top) * (PLOT_H - 8);
  const at = (index: number) => `${(x(index) / PLOT_W) * 100}%`;
  const startOf = (site: SiteInsight) =>
    Math.max(0, site.publishedOn ? days.findIndex(({ date }) => date >= site.publishedOn!) : 0);
  const contacts = sites.reduce((sum, site) => sum + site.contactClicks, 0);
  const visits = sites.reduce((sum, site) => sum + site.visits, 0);
  const shown = active ?? days.length - 1;

  function track(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    setActive(Math.round(ratio * (days.length - 1)));
  }

  function step(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    setActive(Math.min(Math.max(shown + delta, 0), days.length - 1));
  }

  return (
    <>
      <div className={styles.kpiRow}>
        <div>
          <div className={styles.kpiValue}>{contacts.toLocaleString("ko-KR")}</div>
          <div className={styles.kpiLabel}>연락처 클릭</div>
        </div>
        <div>
          <div className={`${styles.kpiValue} ${styles.kpiValueSecondary}`}>{visits.toLocaleString("ko-KR")}</div>
          <div className={styles.kpiLabel}>방문</div>
        </div>
      </div>

      <div
        className={styles.plot}
        tabIndex={0}
        role="img"
        aria-label={`최근 30일 방문 ${visits}회, 연락처 클릭 ${contacts}회. 좌우 화살표로 날짜를 옮깁니다.`}
        onPointerMove={track}
        onPointerLeave={() => setActive(null)}
        onKeyDown={step}
        onBlur={() => setActive(null)}
      >
        <svg className={styles.plotSvg} viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2={PLOT_W} y1={PLOT_H} y2={PLOT_H} className={styles.plotBaseline} vectorEffect="non-scaling-stroke" />
          {sites.map((site, slot) => (
            <polyline
              key={site.portfolioId}
              points={site.days
                .map((point, index) => ({ point, index }))
                .filter(({ index }) => index >= startOf(site))
                .map(({ point, index }) => `${x(index).toFixed(1)},${y(point.visits).toFixed(1)}`)
                .join(" ")}
              className={styles.siteLine}
              style={{ stroke: SITE_COLORS[slot] }}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* 연락처를 누른 날 — 그 사이트 선 위의 점 */}
        {sites.flatMap((site, slot) =>
          site.days.flatMap((point, index) =>
            point.contactClicks > 0 && index >= startOf(site)
              ? [
                  <span
                    key={`${site.portfolioId}-${point.date}`}
                    className={styles.contactDot}
                    style={{ left: at(index), top: `${(y(point.visits) / PLOT_H) * 100}%`, background: SITE_COLORS[slot] }}
                  />,
                ]
              : [],
          ),
        )}

        {/*
          지금 판을 배포한 날 — 바닥의 눈금. 기간보다 앞서 배포했으면 그리지 않는다.
          같은 날 배포한 사이트는 눈금을 나란히 세우고 판 번호를 한 줄로 묶는다. 따로 찍으면 글자가 겹친다.
        */}
        {deployMarks(sites, days).map((mark) => (
          <span key={mark.index} className={styles.deployMark} style={{ left: at(mark.index) }}>
            <span className={styles.deployTicks}>
              {mark.slots.map((slot) => (
                <span key={slot} className={styles.deployTick} style={{ background: SITE_COLORS[slot] }} />
              ))}
            </span>
            <span className={styles.deployLabel}>{mark.versions.map((version) => `v${version}`).join(" · ")}</span>
          </span>
        ))}

        {active !== null ? <span className={styles.crosshair} style={{ left: at(shown) }} /> : null}
        {active !== null && days[shown] ? (
          <span className={`${styles.tooltip} ${shown > days.length / 2 ? styles.tooltipLeft : ""}`} style={{ left: at(shown) }}>
            <span className={styles.tooltipDate}>{dayLabel(days[shown].date)}</span>
            {sites.map((site, slot) => {
              const point = site.days[shown];
              if (!point || shown < startOf(site)) return null;
              return (
                <span key={site.portfolioId} className={styles.tooltipRow}>
                  <span className={styles.lineKey} style={{ background: SITE_COLORS[slot] }} />
                  <b>{point.visits}</b> {site.subdomain}
                  {point.contactClicks > 0 ? ` · 연락처 ${point.contactClicks}` : ""}
                </span>
              );
            })}
          </span>
        ) : null}
      </div>
      <div className={styles.axisRow}>
        <span>{days[0] ? dayLabel(days[0].date) : ""}</span>
        <span>{days.at(-1) ? dayLabel(days.at(-1)!.date) : ""}</span>
      </div>

      {/* 범례가 사이트 목록이다. 누르면 그 사이트의 분석으로 간다. */}
      <div className={styles.legend}>
        {sites.map((site, slot) => (
          <Link
            key={site.portfolioId}
            href={{ pathname: "/analytics", query: { portfolio: site.portfolioId } }}
            className={styles.legendRow}
          >
            <span className={styles.lineKey} style={{ background: SITE_COLORS[slot] }} />
            <span className={styles.legendName}>{publicSiteHost(site.subdomain)}</span>
            <span className={styles.legendValue}>
              <b>{site.visits}</b> 방문 · <b>{site.contactClicks}</b> 연락처
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

/**
 * 섹션 체류 — 지면 순서대로 섹션마다 몇 명이 읽었고 평균 얼마나 머물렀나.
 * 막대는 읽은 수 하나만 그린다. 앞 섹션보다 가장 많이 줄어든 섹션만 강조색이다 —
 * 방문자가 거기서 떠났다. 줄을 누르면 그 포트폴리오를 다듬으러 간다.
 */
function SectionsBody({ site }: { site: SiteInsight }) {
  const rows = [...site.sections].sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  const top = Math.max(site.visits, ...rows.map(({ views }) => views), 1);
  const dropAt = biggestDrop(site.visits, rows.map(({ views }) => views));

  return (
    <>
      <div className={styles.kpiRow}>
        <div>
          <div className={styles.kpiValue}>
            {site.completes}
            <span className={styles.kpiOf}> / {site.visits}</span>
          </div>
          <div className={styles.kpiLabel}>끝까지 읽음</div>
        </div>
      </div>
      <div className={`${styles.hbarHead} ${styles.hbarRowSections}`}>
        <span>섹션</span>
        <span />
        <span>읽음</span>
        <span>평균</span>
      </div>
      <div className={styles.hbarList}>
        {rows.map((row, index) => {
          const name = row.title || `${row.position ?? index + 1}번째 섹션`;
          const seconds = row.views > 0 ? Math.round(row.dwellMs / row.views / 1000) : 0;
          return (
            <Link
              key={row.sectionId}
              href={`/edit/${site.portfolioId}` as Route}
              className={`${styles.hbarRow} ${styles.hbarRowSections}`}
              aria-label={`${name} — ${row.views}명 읽음, 평균 ${seconds}초`}
            >
              <span className={`${styles.hbarName} ${index === dropAt ? styles.hbarNameHot : ""}`}>{name}</span>
              <span className={styles.hbarTrack}>
                <span
                  className={`${styles.hbarBar} ${index === dropAt ? styles.hbarBarHot : ""}`}
                  style={{ width: `${(row.views / top) * 100}%` }}
                />
              </span>
              <span className={styles.hbarCount}>{row.views}</span>
              <span className={`${styles.hbarCount} ${styles.hbarDwell}`}>{seconds}초</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function originLabel(origin: string | null): string {
  if (!origin) return "직접 방문";
  try {
    return new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return origin;
  }
}

/** 유입 경로 — 방문이 어디서 왔나. 많은 순서의 가로 막대. 출처가 없는 방문은 「직접 방문」으로 묶는다. */
function ReferrersBody({ rows }: { rows: Array<{ origin: string | null; visits: number }> }) {
  const total = rows.reduce((sum, row) => sum + row.visits, 0);
  const top = Math.max(...rows.map((row) => row.visits), 1);
  const linked = rows.filter((row) => row.origin).length;
  return (
    <>
      <div className={styles.kpiRow}>
        <div>
          <div className={styles.kpiValue}>{linked}</div>
          <div className={styles.kpiLabel}>링크가 들어온 곳</div>
        </div>
        <div>
          <div className={`${styles.kpiValue} ${styles.kpiValueSecondary}`}>{total}</div>
          <div className={styles.kpiLabel}>방문</div>
        </div>
      </div>
      {/* 막대는 여섯 줄까지 — 섹션 체류와 같은 높이에서 멈춘다. 위 숫자는 모든 출처를 센다. */}
      <div className={styles.hbarList}>
        {rows.slice(0, 6).map((row) => (
          <div key={row.origin ?? "direct"} className={styles.hbarRow}>
            <span className={`${styles.hbarName} ${row.origin ? styles.hbarNameMono : ""}`}>{originLabel(row.origin)}</span>
            <span className={styles.hbarTrack}>
              <span className={styles.hbarBar} style={{ width: `${(row.visits / top) * 100}%` }} />
            </span>
            <span className={styles.hbarCount}>{row.visits}</span>
          </div>
        ))}
      </div>
    </>
  );
}
