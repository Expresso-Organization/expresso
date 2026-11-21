import { isoDate, lastDayOfMonth } from "../dates.js";
import { ActivitySourceError, clip, fetchText, imageUrl, statusOn, type ActivityRow, type ActivitySource, type FetchText } from "./adapter.js";

/**
 * 부트텐트(boottent.com) 부트캠프 — 모집 중인 과정 전체.
 *
 * `/camps` 한 쪽이 모집 중 과정을 모두 Next.js 서버 컴포넌트 데이터(`self.__next_f.push`)로 싣는다(2026-11-20: 과정 675개,
 * sitemap의 과정 주소 701개). 문서 없는 내부 형식이라 과정 객체를 하나도 못 찾으면 던진다.
 * - 과정 객체: `campId` · `batchId` · `batchName` · `title` · `brandName` · `regDate` · `regEndDate` · `startDate` ·
 *   `tuition`(만 원, 소수 있음 — 상세 화면에 「교육비용 총 60만원」) · `nbcardRequired` · `qualification` · `keywords` · `campUrl`.
 * - 날짜의 일이 `98`이면(`2026-12-98 23:59`) 상세 화면에 「2026년 12월중」으로 보인다 — 그달 말일을 마감으로 두고 정밀도를 `month`로 적는다.
 * - `startDate`가 모집 시작일과 같은 과정이 있다(`endDate`도 모집 마감과 같다 — 수업 일정 대신 모집 일정이 들어간 값).
 *   그때와 모집 시작보다 이른 값은 수업 시작일로 쓰지 않는다.
 */
export const BOOTTENT_CAMPS = "https://boottent.com/camps";

export interface BoottentCamp {
  campId: string;
  batchId?: string | number;
  batchName?: string;
  title?: string;
  brandName?: string;
  regDate?: string;
  regEndDate?: string;
  startDate?: string;
  tuition?: number;
  nbcardRequired?: boolean;
  qualification?: string;
  keywords?: string[];
  campUrl?: string;
  /** 캠프 머리 배너(`cdn.sayun.studio`). 733건 모두 있음(2026-11-20 확인). */
  image?: string;
}

/** 서버 컴포넌트 데이터 조각을 이어 붙인다. */
function flightData(html: string): string {
  let data = "";
  for (const [, chunk = ""] of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try { data += JSON.parse(`"${chunk}"`) as string; } catch { /* 깨진 조각은 건너뛴다 */ }
  }
  return data;
}

/** `"regEndDate":`를 품은 가장 안쪽 JSON 객체를 괄호 짝으로 잘라 읽는다. */
export function parseBoottentCamps(html: string): BoottentCamp[] {
  const data = flightData(html);
  const camps = new Map<string, BoottentCamp>();
  for (const match of data.matchAll(/"regEndDate":/g)) {
    let depth = 0;
    let open = match.index;
    for (; open >= 0; open -= 1) {
      const char = data[open];
      if (char === "}") depth += 1;
      else if (char === "{") { if (depth === 0) break; depth -= 1; }
    }
    let close = open; let level = 0; let quoted = false;
    for (; close < data.length; close += 1) {
      const char = data[close];
      if (quoted) { if (char === "\\") close += 1; else if (char === '"') quoted = false; continue; }
      if (char === '"') quoted = true;
      else if (char === "{") level += 1;
      else if (char === "}") { level -= 1; if (level === 0) break; }
    }
    if (open < 0 || close >= data.length) continue;
    try {
      const camp = JSON.parse(data.slice(open, close + 1)) as BoottentCamp;
      if (typeof camp.campId === "string" && typeof camp.regEndDate === "string") camps.set(`${camp.campId}:${camp.batchId ?? ""}`, camp);
    } catch { /* 객체가 아닌 곳에 걸린 경우 */ }
  }
  return [...camps.values()];
}

/** `2026-12-29` · `2026-12-98 23:59`를 날짜로. 일이 달 안에 없으면 그달 말일과 `month`. */
export function boottentDate(value: string | undefined): { on: string; precision: "day" | "month" } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const exact = isoDate(year, month, day);
  if (exact) return { on: exact, precision: "day" };
  return month >= 1 && month <= 12 ? { on: lastDayOfMonth(year, month), precision: "month" } : null;
}

/** 광고 추적 인자(`utm_*`)를 뺀 원 과정 주소. */
function cleanUrl(value: string | undefined): string | null {
  if (!value || !/^https?:\/\//.test(value)) return null;
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key);
    return url.toString().slice(0, 2_000);
  } catch { return null; }
}

export function boottentRow(camp: BoottentCamp, at: Date): ActivityRow | null {
  const deadline = boottentDate(camp.regEndDate);
  const title = [camp.title?.trim(), camp.batchName?.trim()].filter(Boolean).join(" ");
  if (!deadline || !title) return null;
  const applyStart = boottentDate(camp.regDate);
  const applyStartOn = applyStart?.precision === "day" ? applyStart.on : null;
  const start = boottentDate(camp.startDate);
  const startsOn = start?.precision === "day" && (!applyStartOn || start.on > applyStartOn) ? start.on : null;
  return {
    sourceId: `${camp.campId}:${camp.batchId ?? ""}`.slice(0, 100),
    kind: "bootcamp",
    title: title.slice(0, 300),
    host: (camp.brandName ?? "").trim().slice(0, 200),
    fields: (camp.keywords ?? []).filter((keyword) => typeof keyword === "string" && keyword.trim()).map((keyword) => keyword.trim().slice(0, 60)).slice(0, 12),
    url: `${BOOTTENT_CAMPS}/${encodeURIComponent(camp.campId)}`,
    homepageUrl: cleanUrl(camp.campUrl),
    applyStartOn,
    deadlineOn: deadline.on,
    deadlinePrecision: deadline.precision,
    startsOn,
    eligibility: clip(camp.qualification?.replace(/^\s*-\s*/gm, "").split("\n").map((line) => line.trim()).filter(Boolean).join(" · "), 300),
    prize: null,
    tuition: typeof camp.tuition === "number" && camp.tuition >= 0 ? Math.round(camp.tuition * 10_000) : null,
    nbcardRequired: typeof camp.nbcardRequired === "boolean" ? camp.nbcardRequired : null,
    status: statusOn(applyStartOn, at),
    posterUrl: imageUrl(camp.image),
  };
}

export class BoottentSource implements ActivitySource {
  readonly name = "boottent" as const;

  constructor(private readonly fetchPage: FetchText = fetchText) {}

  async fetch(at: Date): Promise<ActivityRow[]> {
    const camps = parseBoottentCamps(await this.fetchPage(BOOTTENT_CAMPS));
    if (camps.length === 0) throw new ActivitySourceError("boottent: no camps");
    return camps.flatMap((camp) => boottentRow(camp, at) ?? []);
  }
}
