import { addDays, isoDate } from "../dates.js";
import { ActivitySourceError, clip, fetchText, imageUrl, statusOn, type ActivityRow, type ActivitySource, type FetchText } from "./adapter.js";
import { decodeEntities, htmlText, isHackathon } from "./text.js";

/**
 * 위비티(wevity.com) 공모전.
 *
 * 공식 API나 피드가 없어 목록 화면과 상세 화면을 읽는다(2026-11-15 조사, 2026-11-20 재조사).
 * - 목록 한 줄: 제목 · 주최 · 분야 · 남은 날(`D-14`) · 원문 번호. 접수 중인 줄이 앞에 서고 마감한 줄(`D+`)이 뒤따른다.
 *   상단 `SPECIAL` 줄은 광고 상품이지만 그 분야로 분류된 실제 공모전이라 함께 읽는다(일반 줄에 다시 나오지 않는다).
 * - 상세(`gbn=viewok`): `ul.cd-info-list`에 접수기간(시작 ~ 마감 날짜) · 응모대상 · 총 상금 · 1등 상금 · 홈페이지가 있다.
 *   목록의 남은 날은 서울 0–9시에 하루 늦게 센다(2026-11-20 01:44 측정에서 15건 모두 +1일). 그래서 마감일은 상세의 날짜를 쓴다.
 */
export const WEVITY_ORIGIN = "https://www.wevity.com/";

/** 읽는 분야 번호 — 웹/모바일/IT(20) · 게임/소프트웨어(21). 출처의 분류 메뉴에서 확인한 번호다. */
export const WEVITY_FIELDS = [20, 21] as const;

/** 한 분야에서 읽는 쪽 수의 상한. 접수 중인 줄이 한 쪽(15줄)을 넘길 때를 위한 것이다. */
export const WEVITY_MAX_PAGES = 5;

/** 목록의 한 줄. */
export interface WevityListRow {
  id: string;
  title: string;
  host: string;
  fields: string[];
  /** 출처가 적은 남은 날. 마감했으면 음수. */
  daysLeft: number;
  status: string;
}

/** 상세 쪽에서 읽은 것. */
export interface WevityDetail {
  applyStartOn: string | null;
  deadlineOn: string | null;
  eligibility: string | null;
  prize: string | null;
  homepageUrl: string | null;
  /** 상세 머리의 포스터(`div.thumb` 안의 첫 그림). 아래 목록의 다른 공모전 그림과 섞이지 않게 그 자리만 본다. */
  posterUrl: string | null;
}

const ROW = /<li[^>]*>(?:<!--[\s\S]*?-->)?\s*<div class="tit">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<div class="sub-tit">([^<]*)<\/div>\s*<\/div>\s*<div class="organ">([^<]*)<\/div>\s*<div class="day">\s*D([-+])(\d+|day)\s*<span class="dday \w+">([^<]*)<\/span>/gi;
/** 제목 뒤에 붙는 배지(`SPECIAL` · `신규` · `IDEA`). 글자까지 지운다. */
const BADGE = /<span class=['"]stat [^'"]*['"]>[\s\S]*?<\/span>/g;

/** 목록 HTML의 모든 줄(마감한 줄 포함). 모양이 바뀌어 읽히는 줄이 없으면 빈 목록이다. */
export function parseWevityList(html: string): WevityListRow[] {
  const rows: WevityListRow[] = [];
  for (const match of html.matchAll(ROW)) {
    const [, href = "", rawTitle = "", sub = "", host = "", sign, days = "0", status = ""] = match;
    const id = new URLSearchParams(decodeEntities(href).replace(/^\?/, "")).get("ix");
    const title = htmlText(rawTitle.replace(BADGE, ""));
    if (!id || !title) continue;
    const count = days.toLowerCase() === "day" ? 0 : Number(days);
    rows.push({
      id,
      title,
      host: htmlText(host),
      fields: htmlText(sub).replace(/^분야\s*:/, "").split(",").map((field) => field.trim()).filter(Boolean),
      daysLeft: sign === "+" ? -count : count,
      status: htmlText(status),
    });
  }
  return rows;
}

/** 상세 HTML의 정보 목록. 사이드 메뉴에도 같은 낱말(응모대상)이 있어 `cd-info-list` 안만 본다. */
export function parseWevityDetail(html: string): WevityDetail | null {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  const block = /<ul class="cd-info-list">([\s\S]*?)<\/ul>/.exec(clean)?.[1];
  if (!block) return null;
  const items = new Map<string, { text: string; html: string }>();
  for (const [, label = "", rest = ""] of block.matchAll(/<li[^>]*>\s*<span class="tit">([^<]*)<\/span>([\s\S]*?)<\/li>/g)) {
    items.set(htmlText(label), { text: htmlText(rest.replace(/<span class="cil-dday">[\s\S]*?<\/span>/, "")), html: rest });
  }
  const period = /(\d{4})-(\d{2})-(\d{2})\s*~\s*(\d{4})-(\d{2})-(\d{2})/.exec(items.get("접수기간")?.text ?? "");
  const total = clip(items.get("총 상금")?.text, 100);
  const first = clip(items.get("1등 상금")?.text, 90);
  const href = /href="(https?:\/\/[^"]+)"/.exec(items.get("홈페이지")?.html ?? "")?.[1];
  return {
    applyStartOn: period ? isoDate(Number(period[1]), Number(period[2]), Number(period[3])) : null,
    deadlineOn: period ? isoDate(Number(period[4]), Number(period[5]), Number(period[6])) : null,
    eligibility: clip(items.get("응모대상")?.text, 300),
    prize: total && first ? `총 ${total} · 1등 ${first}` : total ? `총 ${total}` : first ? `1등 ${first}` : null,
    homepageUrl: href ? clip(decodeEntities(href), 2_000) : null,
    posterUrl: imageUrl(/<div class="thumb">\s*<img[^>]*\ssrc="([^"]+)"/.exec(clean)?.[1], WEVITY_ORIGIN),
  };
}

export class WevitySource implements ActivitySource {
  readonly name = "wevity" as const;

  constructor(private readonly fetchPage: FetchText = fetchText) {}

  async fetch(at: Date): Promise<ActivityRow[]> {
    const open = new Map<string, WevityListRow>();
    for (const field of WEVITY_FIELDS) {
      for (let page = 1; page <= WEVITY_MAX_PAGES; page += 1) {
        const rows = parseWevityList(await this.fetchPage(`${WEVITY_ORIGIN}?c=find&s=1&gub=1&cidx=${field}&gp=${page}`));
        // 첫 쪽에 마감한 줄조차 없으면 목록 모양이 바뀐 것이다.
        if (rows.length === 0 && page === 1) throw new ActivitySourceError(`wevity field ${field}: no rows`);
        const live = rows.filter((row) => row.daysLeft >= 0);
        for (const row of live) open.set(row.id, row);
        if (live.length === 0) break;
      }
    }
    const result: ActivityRow[] = [];
    for (const row of open.values()) {
      // 상세를 못 읽으면 목록의 남은 날로 마감을 구한다. 위비티는 UTC 날짜 기준으로 세는 것으로 보인다(두 측정 시각에서 맞음).
      const detail = await this.fetchPage(`${WEVITY_ORIGIN}?c=find&s=1&gbn=viewok&ix=${row.id}`).then(parseWevityDetail).catch(() => null);
      const deadlineOn = detail?.deadlineOn ?? addDays(at.toISOString().slice(0, 10), row.daysLeft);
      const applyStartOn = detail?.applyStartOn ?? null;
      result.push({
        sourceId: row.id,
        kind: isHackathon(row.title) ? "hackathon" : "contest",
        title: row.title.slice(0, 300),
        host: row.host.slice(0, 200),
        fields: row.fields.map((field) => field.slice(0, 60)).slice(0, 12),
        url: `${WEVITY_ORIGIN}?c=find&s=1&gbn=view&ix=${row.id}`,
        homepageUrl: detail?.homepageUrl ?? null,
        applyStartOn,
        deadlineOn,
        deadlinePrecision: "day",
        startsOn: null,
        eligibility: detail?.eligibility ?? null,
        prize: detail?.prize ?? null,
        tuition: null,
        nbcardRequired: null,
        status: statusOn(applyStartOn, at),
        posterUrl: detail?.posterUrl ?? null,
      });
    }
    return result;
  }
}
