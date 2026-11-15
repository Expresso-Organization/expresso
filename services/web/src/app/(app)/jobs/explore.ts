/**
 * 탐색이 다루는 종류.
 *
 * 채용 공고는 지금의 공고 목록이다. 나머지 종류는 수집기와 저장소가 아직 없다 —
 * 시안은 출처를 그 자리에서 읽어 실제 항목을 보여 준다.
 */
export type ExploreKind = "jobs" | "intern" | "contest" | "hackathon" | "bootcamp";

export const EXPLORE_KINDS: readonly { key: ExploreKind; label: string; icon: string }[] = [
  { key: "jobs", label: "채용 공고", icon: "briefcase" },
  { key: "intern", label: "인턴", icon: "student" },
  { key: "contest", label: "공모전", icon: "trophy" },
  { key: "hackathon", label: "해커톤", icon: "lightning" },
  { key: "bootcamp", label: "부트캠프", icon: "chalkboard-teacher" },
];

export function readKind(value: unknown): ExploreKind {
  return EXPLORE_KINDS.find((kind) => kind.key === value)?.key ?? "jobs";
}

export function exploreHref(kind: ExploreKind) {
  return { pathname: "/jobs", query: kind === "jobs" ? {} : { kind } } as const;
}

/** 공모전 · 해커톤 한 건. 위비티 목록의 한 줄에서 읽는다. */
export type Activity = {
  id: string;
  title: string;
  url: string;
  host: string;
  fields: string[];
  /** 접수 마감까지 남은 날. 목록이 `D-14`로 적은 값이다. */
  daysLeft: number;
  status: string;
};

const WEVITY = "https://www.wevity.com/";
/** 위비티 분야 번호 — 웹/모바일/IT · 게임/소프트웨어. */
const WEVITY_FIELDS = [20, 21];
const HACKATHON = /해커톤|메이커톤|아이디어톤|프롬프톤|데이터톤/;

const ROW = /<li[^>]*>(?:<!--.*?-->)?\s*<div class="tit">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<div class="sub-tit">([^<]*)<\/div>\s*<\/div>\s*<div class="organ">([^<]*)<\/div>\s*<div class="day">\s*D([-+])(\d+)\s*<span class="dday \w+">([^<]*)<\/span>/g;

function decode(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
}

/** 위비티 목록 HTML에서 접수 중 · 접수 예정인 줄을 읽는다. 상단 고정 광고 줄(SPECIAL)과 접수가 끝난 줄(D+)은 뺀다. */
export function parseWevityRows(html: string): Activity[] {
  const rows: Activity[] = [];
  for (const match of html.matchAll(ROW)) {
    const [, href = "", rawTitle = "", sub = "", host = "", sign, days = "0", status = ""] = match;
    if (rawTitle.includes("stat spec") || sign === "+") continue;
    const id = new URLSearchParams(decode(href).replace(/^\?/, "")).get("ix");
    if (!id) continue;
    rows.push({
      id,
      title: decode(rawTitle.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(),
      url: `${WEVITY}?c=find&s=1&gbn=view&ix=${id}`,
      host: decode(host).trim(),
      fields: decode(sub).replace("분야 :", "").split(",").map((field) => field.trim()).filter(Boolean),
      daysLeft: Number(days),
      status: status.trim(),
    });
  }
  return rows;
}

async function wevityPage(field: number): Promise<Activity[]> {
  const response = await fetch(`${WEVITY}?c=find&s=1&gub=1&cidx=${field}`, {
    headers: { "user-agent": "Mozilla/5.0" },
    next: { revalidate: 3600 },
  });
  return response.ok ? parseWevityRows(await response.text()) : [];
}

/** 해커톤인가. 위비티에 해커톤 분류가 없어 제목으로 가른다. */
export function isHackathon(title: string): boolean {
  return HACKATHON.test(title);
}

/** 접수 중이거나 접수 예정인 공모전 · 해커톤. 마감이 가까운 순서. 해커톤은 제목으로 가른다. */
export async function activities(kind: "contest" | "hackathon"): Promise<Activity[]> {
  const pages = await Promise.all(WEVITY_FIELDS.map((field) => wevityPage(field).catch(() => [])));
  const seen = new Set<string>();
  return pages
    .flat()
    .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
    .filter((row) => isHackathon(row.title) === (kind === "hackathon"))
    .sort((left, right) => left.daysLeft - right.daysLeft);
}
