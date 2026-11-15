import type { ActivityKind } from "@expresso/contracts";

/**
 * 위비티(wevity.com) 공모전 목록 읽기.
 *
 * 공식 API나 피드가 없어 목록 화면을 읽는다(2026-11-15 조사). 한 줄에서 제목 · 주최 · 분야 ·
 * 남은 날 · 접수 상태 · 원문 번호를 얻는다. 목록 모양이 바뀌면 읽히는 줄이 0건이 된다 —
 * 그때 수집은 저장분을 건드리지 않는다(`ActivityService.collect`).
 */
export const WEVITY_ORIGIN = "https://www.wevity.com/";

/** 읽는 분야 번호 — 웹/모바일/IT(20) · 게임/소프트웨어(21). 출처의 분류 메뉴에서 확인한 번호다. */
export const WEVITY_FIELDS = [20, 21] as const;

/** 목록의 한 줄. 남은 날은 출처가 `D-14`로 적은 값이다. */
export interface WevityRow {
  id: string;
  kind: ActivityKind;
  title: string;
  host: string;
  fields: string[];
  url: string;
  daysLeft: number;
  status: string;
}

const ROW = /<li[^>]*>(?:<!--.*?-->)?\s*<div class="tit">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<div class="sub-tit">([^<]*)<\/div>\s*<\/div>\s*<div class="organ">([^<]*)<\/div>\s*<div class="day">\s*D([-+])(\d+)\s*<span class="dday \w+">([^<]*)<\/span>/g;
const HACKATHON = /해커톤|메이커톤|아이디어톤|프롬프톤|데이터톤/;

function decode(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
}

/** 해커톤인가. 출처에 해커톤 분류가 없어 제목으로 가른다. */
export function isHackathon(title: string): boolean {
  return HACKATHON.test(title);
}

/** 목록 HTML에서 접수 중 · 접수 예정인 줄을 읽는다. 상단 고정 광고 줄(SPECIAL)과 접수가 끝난 줄(D+)은 뺀다. */
export function parseWevityRows(html: string): WevityRow[] {
  const rows: WevityRow[] = [];
  for (const match of html.matchAll(ROW)) {
    const [, href = "", rawTitle = "", sub = "", host = "", sign, days = "0", status = ""] = match;
    if (rawTitle.includes("stat spec") || sign === "+") continue;
    const id = new URLSearchParams(decode(href).replace(/^\?/, "")).get("ix");
    if (!id) continue;
    const title = decode(rawTitle.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!title) continue;
    rows.push({
      id,
      kind: isHackathon(title) ? "hackathon" : "contest",
      title: title.slice(0, 300),
      host: decode(host).trim().slice(0, 200),
      fields: decode(sub).replace("분야 :", "").split(",").map((field) => field.trim().slice(0, 60)).filter(Boolean).slice(0, 12),
      url: `${WEVITY_ORIGIN}?c=find&s=1&gbn=view&ix=${id}`,
      daysLeft: Number(days),
      status: status.trim().slice(0, 40),
    });
  }
  return rows;
}

/** 분야 한 쪽을 받아 온다. 응답이 정상이 아니면 null — 부르는 쪽이 그 분야를 건너뛴다. */
export type WevityFetcher = (field: number) => Promise<string | null>;

export const fetchWevityPage: WevityFetcher = async (field) => {
  const response = await fetch(`${WEVITY_ORIGIN}?c=find&s=1&gub=1&cidx=${field}`, {
    headers: { "user-agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20_000),
  });
  return response.ok ? response.text() : null;
};
