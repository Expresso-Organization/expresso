import { createHash } from "node:crypto";

import { isoDate } from "../dates.js";
import { ActivitySourceError, fetchText, imageUrl, statusOn, type ActivityRow, type ActivitySource, type FetchText } from "./adapter.js";
import { isHackathon } from "./text.js";

/**
 * Dev-Event(github.com/brave-people/Dev-Event) — 개발자 행사 모음의 대회.
 *
 * README 원문을 읽는다(2026-11-19 갱신분 확인). 달마다 절(`## \`26년 11월\``)이 있고, 행사마다 아래 꼴이다.
 *
 *   - __[제목](주소)__
 *     - 분류: `오프라인(서울 강남구)`, `무료`, `대회`, `AI`
 *     - 주최: 주최 이름
 *     - 접수: 10. 30(금) ~ 11. 17(화) 23:59      (당일 행사는 `일시:`)
 *
 * - `대회` 태그가 붙은 행사만 받는다. 세미나 · 모임 · 교육은 받지 않는다(교육 6건 중 부트캠프는 2건뿐이었다).
 * - 날짜에 연도가 없어 절 제목의 연도를 쓴다. 마감 달이 절의 달보다 반년 넘게 앞이면 다음 해다.
 * - `일시:` 행사(당일 해커톤)는 접수 마감이 없어 행사 시작일을 마감으로 둔다.
 * - 주소가 원 공고라 `url`과 `homepageUrl`이 같다. 출처 안의 번호가 없어 주소의 해시를 번호로 쓴다.
 */
export const DEV_EVENT_README = "https://raw.githubusercontent.com/brave-people/Dev-Event/master/README.md";

const SECTION = /^## `(\d{2})년 (\d{1,2})월`/;
const ITEM = /^- __\[(.+?)\]\((\S+?)\)__\s*$/;
const DATE = /(\d{1,2})\.\s*(\d{1,2})\s*\(/g;
/** 형식 태그. 분야로 옮기지 않는다. */
const FORMAT_TAGS = /^(온라인|오프라인|무료|유료|대회)/;

export interface DevEventItem {
  title: string;
  link: string;
  tags: string[];
  host: string;
  /** `접수` 또는 `일시`. */
  when: { kind: "apply" | "event"; dates: [number, number][] } | null;
  section: { year: number; month: number };
}

/** README에서 달별 절의 행사를 읽는다. `지난 행사 기록` 같은 다른 절은 읽지 않는다. */
export function parseDevEventReadme(markdown: string): DevEventItem[] {
  const items: DevEventItem[] = [];
  let section: { year: number; month: number } | null = null;
  let current: DevEventItem | null = null;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      const match = SECTION.exec(line);
      section = match ? { year: 2000 + Number(match[1]), month: Number(match[2]) } : null;
      current = null;
      continue;
    }
    if (!section) continue;
    const item = ITEM.exec(line);
    if (item) {
      current = { title: item[1]!.trim(), link: item[2]!.trim(), tags: [], host: "", when: null, section };
      items.push(current);
      continue;
    }
    if (!current) continue;
    const detail = /^\s+- (분류|주최|접수|일시):\s*(.*)$/.exec(line);
    if (!detail) continue;
    const [, label, value = ""] = detail;
    if (label === "분류") current.tags = [...value.matchAll(/`([^`]+)`/g)].map(([, tag = ""]) => tag.trim());
    else if (label === "주최") current.host = value.trim();
    else current.when = { kind: label === "접수" ? "apply" : "event", dates: [...value.matchAll(DATE)].map(([, month, day]) => [Number(month), Number(day)] as [number, number]) };
  }
  return items;
}

/** 절의 해 · 달을 기준으로 `MM.DD`의 해를 정한다. */
function dateInSection(month: number, day: number, section: { year: number; month: number }): string | null {
  const year = section.month - month > 6 ? section.year + 1 : month - section.month > 6 ? section.year - 1 : section.year;
  return isoDate(year, month, day);
}

export function devEventRow(item: DevEventItem, at: Date): ActivityRow | null {
  if (!item.tags.includes("대회") || !item.when || item.when.dates.length === 0 || !/^https?:\/\//.test(item.link)) return null;
  const [first, last = first] = [item.when.dates[0]!, item.when.dates.at(-1)!];
  const startOn = dateInSection(first[0], first[1], item.section);
  const endOn = dateInSection(last[0], last[1], item.section);
  if (!startOn || !endOn) return null;
  const apply = item.when.kind === "apply";
  const applyStartOn = apply && item.when.dates.length > 1 && startOn <= endOn ? startOn : null;
  return {
    sourceId: createHash("sha256").update(item.link).digest("hex").slice(0, 16),
    kind: isHackathon(item.title) ? "hackathon" : "contest",
    title: item.title.slice(0, 300),
    host: item.host.slice(0, 200),
    fields: item.tags.filter((tag) => !FORMAT_TAGS.test(tag)).map((tag) => tag.slice(0, 60)).slice(0, 12),
    url: item.link.slice(0, 2_000),
    homepageUrl: item.link.slice(0, 2_000),
    applyStartOn,
    deadlineOn: apply ? endOn : startOn,
    deadlinePrecision: "day",
    startsOn: apply ? null : startOn,
    eligibility: null,
    prize: null,
    tuition: null,
    nbcardRequired: null,
    status: statusOn(applyStartOn, at),
    posterUrl: null,
  };
}

/** 행사 페이지의 대표 그림(`og:image`). 속성 순서가 사이트마다 달라 두 순서를 다 본다. */
export function openGraphImage(html: string, base: string): string | null {
  const head = html.slice(0, 200_000);
  const value = /<meta[^>]+property=["']og:image["'][^>]*\scontent=["']([^"']+)["']/i.exec(head)?.[1]
    ?? /<meta[^>]+content=["']([^"']+)["'][^>]*\sproperty=["']og:image["']/i.exec(head)?.[1];
  return imageUrl(value?.replace(/&amp;/g, "&"), base);
}

export class DevEventSource implements ActivitySource {
  readonly name = "devevent" as const;

  constructor(private readonly fetchPage: FetchText = fetchText) {}

  async fetch(at: Date): Promise<ActivityRow[]> {
    const items = parseDevEventReadme(await this.fetchPage(DEV_EVENT_README));
    if (items.length === 0) throw new ActivitySourceError("devevent: no items");
    const rows = new Map<string, ActivityRow>();
    for (const item of items) {
      const row = devEventRow(item, at);
      if (row) rows.set(row.sourceId, row);
    }
    // README에는 그림이 없다. 행사 페이지(luma · onoffmix 등)의 대표 그림을 찾는다 — 못 읽으면 포스터 없이 남는다.
    await Promise.all([...rows.values()].map(async (row) => {
      row.posterUrl = await this.fetchPage(row.url).then((html) => openGraphImage(html, row.url)).catch(() => null);
    }));
    return [...rows.values()];
  }
}
