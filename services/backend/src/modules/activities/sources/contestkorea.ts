import { addDays, isoDate, seoulDate } from "../dates.js";
import { ActivitySourceError, clip, fetchText, statusOn, type ActivityRow, type ActivitySource, type FetchText } from "./adapter.js";
import { htmlText, isHackathon } from "./text.js";

/**
 * 콘테스트코리아(contestkorea.com) 대회 · 공모전 — 학문•과학•IT 분류.
 *
 * 서버가 그린 목록 HTML을 읽는다(2026-11-20 확인). 마감일 오름차순(`Txt_sortkey=a.str_aedate`)으로 받으면
 * 접수 중인 활동만 마감 순으로 나오고 그 뒤 쪽은 비어 있다.
 * - 한 줄: 제목 · 분류 · 주최 · 대상 · 접수 기간(`11.16~12.24`, 연도 없음) · 남은 날(`D-34`) · 상태.
 * - 연도는 남은 날로 정한다 — 오늘 + 남은 날에 가장 가까운 해의 그 날짜가 마감일이다.
 * - 「IT•소프트웨어•게임」(030510001)은 지금 비어 있는 분류다. IT 공모전은 학문•과학•IT(030310001)에 있다.
 */
const ORIGIN = "https://www.contestkorea.com/sub/";
const CATEGORY = "030310001";
/** 쪽 수 상한. 접수 중 활동이 3쪽(쪽당 12줄) 안팎이다(2026-11-20). */
const MAX_PAGES = 8;

export interface ContestKoreaListRow {
  id: string;
  title: string;
  categories: string[];
  host: string;
  eligibility: string | null;
  /** `MM.DD` 두 개. */
  period: { start: [number, number]; end: [number, number] } | null;
  daysLeft: number | null;
  condition: string;
}

/** 목록 HTML의 줄. 모양이 바뀌어 읽히는 줄이 없으면 빈 목록이다. */
export function parseContestKoreaList(html: string): ContestKoreaListRow[] {
  const start = html.indexOf('<div class="list_style_2">');
  if (start < 0) return [];
  const end = html.indexOf('<div class="pagination">', start);
  const body = html.slice(start, end > start ? end : undefined);
  const rows: ContestKoreaListRow[] = [];
  for (const item of body.split(/<li(?:\s[^>]*)?>\s*(?:<!--[\s\S]*?-->\s*)?(?=<div class="title">)/).slice(1)) {
    const id = /str_no=(\d+)/.exec(item)?.[1];
    const title = htmlText(/<span class="txt">([\s\S]*?)<\/span>/.exec(item)?.[1] ?? "");
    if (!id || !title) continue;
    const field = (label: string) => {
      const match = new RegExp(`<strong>${label}</strong>\\s*\\.([\\s\\S]*?)</li>`).exec(item)?.[1];
      return match ? htmlText(match).replace(/\s*,\s*/g, ", ").replace(/\s*▶$/, "").trim() : "";
    };
    const period = /<em>접수<\/em>\s*(\d{2})\.(\d{2})\s*~\s*(\d{2})\.(\d{2})/.exec(item);
    const day = /<span class="day"[^>]*>\s*D-(\d+)\s*<\/span>/.exec(item)?.[1];
    rows.push({
      id,
      title,
      categories: [...item.matchAll(/<span class="category">([^<]*)<\/span>/g)].map(([, name = ""]) => htmlText(name)).filter(Boolean),
      host: field("주최"),
      eligibility: field("대상") || null,
      period: period ? { start: [Number(period[1]), Number(period[2])], end: [Number(period[3]), Number(period[4])] } : null,
      daysLeft: day === undefined ? null : Number(day),
      condition: htmlText(/<span class="condition"[^>]*>([^<]*)<\/span>/.exec(item)?.[1] ?? ""),
    });
  }
  return rows;
}

/** `MM.DD`에 맞는 해를 고른다 — `target` 날짜에 가장 가까운 해. */
function nearestDate(month: number, day: number, target: string): string | null {
  const year = Number(target.slice(0, 4));
  const distance = (on: string) => Math.abs(Date.parse(on) - Date.parse(target));
  const options = [year - 1, year, year + 1].map((candidate) => isoDate(candidate, month, day)).filter((value): value is string => value !== null);
  return options.sort((a, b) => distance(a) - distance(b))[0] ?? null;
}

export function contestKoreaRow(row: ContestKoreaListRow, at: Date): ActivityRow | null {
  if (!row.period) return null;
  const today = seoulDate(at);
  const deadlineOn = nearestDate(row.period.end[0], row.period.end[1], addDays(today, row.daysLeft ?? 0));
  if (!deadlineOn) return null;
  const [startMonth, startDay] = row.period.start;
  const [endMonth, endDay] = row.period.end;
  const startYear = Number(deadlineOn.slice(0, 4)) - (startMonth * 100 + startDay > endMonth * 100 + endDay ? 1 : 0);
  const applyStartOn = isoDate(startYear, startMonth, startDay);
  return {
    sourceId: row.id,
    kind: isHackathon(row.title) ? "hackathon" : "contest",
    title: row.title.slice(0, 300),
    host: row.host.slice(0, 200),
    fields: row.categories.map((name) => name.slice(0, 60)).slice(0, 12),
    url: `${ORIGIN}view.php?int_gbn=1&Txt_bcode=${CATEGORY}&str_no=${row.id}`,
    homepageUrl: null,
    applyStartOn,
    deadlineOn,
    deadlinePrecision: "day",
    startsOn: null,
    eligibility: clip(row.eligibility, 300),
    prize: null,
    tuition: null,
    nbcardRequired: null,
    status: statusOn(applyStartOn, at),
  };
}

export class ContestKoreaSource implements ActivitySource {
  readonly name = "contestkorea" as const;

  constructor(private readonly fetchPage: FetchText = fetchText) {}

  async fetch(at: Date): Promise<ActivityRow[]> {
    const rows = new Map<string, ActivityRow>();
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const html = await this.fetchPage(`${ORIGIN}list.php?int_gbn=1&Txt_bcode=${CATEGORY}&Txt_sortkey=a.str_aedate&Txt_sortword=asc&page=${page}`);
      const listed = parseContestKoreaList(html);
      if (page === 1 && listed.length === 0) throw new ActivitySourceError("contestkorea: no rows");
      for (const item of listed) {
        const row = contestKoreaRow(item, at);
        if (row) rows.set(row.sourceId, row);
      }
      if (listed.length === 0) break;
    }
    return [...rows.values()];
  }
}
