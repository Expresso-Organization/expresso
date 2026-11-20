import type { ActivityKind, ActivitySource } from "@expresso/contracts";

/**
 * 같은 활동 묶기 — 여러 출처(또는 한 출처의 여러 글)에 올라온 같은 공모전 · 해커톤을 하나로 본다.
 *
 * 마감일이 같고 다음 중 하나가 같으면 같은 활동이다.
 * - 원 공고 주소의 등록 도메인(`sto.or.kr` ↔ `prompt2026.sto.or.kr`). 여러 행사를 싣는 곳(luma · 이벤터스 등)은 경로까지.
 * - 정규화한 제목. 연도 · 회차 · 괄호 · 「참가자 모집」 꼬리를 지운다. 대괄호 머리말(`[주최]`)을 지운 꼴도 함께 본다.
 *
 * 2026-11-20 측정에서 겹친 네 쌍(서울관광 프롬프톤 · 대구 기후 AI 활용대회 · 성평등 AI 벤치마크 · 대구 로컬 AI)과
 * 링커리어에 다섯 번 올라온 「사회보장 데이터 AI 혁신 아이디어 경진대회」가 이 규칙으로 묶인다. 제목이 비슷하기만 한 것은 묶지 않는다.
 *
 * 부트캠프는 묶지 않는다 — 출처가 하나이고, 같은 이름 · 마감의 과정이 캠퍼스마다 따로 있다.
 */
export interface DedupeRow {
  id: string;
  source: ActivitySource;
  kind: ActivityKind;
  title: string;
  deadlineOn: string;
  homepageUrl: string | null;
}

/** 대표를 고르는 순서. 상세 항목(대상 · 상금 · 원 공고)이 많은 출처가 앞이다. */
const SOURCE_ORDER: Record<ActivitySource, number> = { wevity: 0, linkareer: 1, contestkorea: 2, devevent: 3, boottent: 4 };

/** 한 도메인에 여러 주최의 행사가 올라오는 곳. 도메인만으로는 같은 활동이라 할 수 없다. */
const SHARED_HOSTS = new Set([
  "luma.com", "lu.ma", "daker.ai", "event-us.kr", "onoffmix.com", "forms.gle", "google.com", "hackon.kr", "blaybus.com",
  "linkareer.com", "wevity.com", "contestkorea.com", "notion.site", "instagram.com", "github.com", "festa.io", "ticketa.co",
  "naver.com", "kakao.com", "bit.ly", "dacon.io", "aifactory.space", "goorm.io", "programmers.co.kr", "inflearn.com",
]);
/** 한국 2단계 접미사. `sto.or.kr`의 등록 도메인은 `sto.or.kr`이다. */
const KR_SECOND_LEVEL = new Set(["co", "or", "go", "ac", "re", "ne", "pe", "ms", "hs", "es", "kg", "sc", "mil"]);

export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  const take = labels.length >= 3 && labels.at(-1) === "kr" && KR_SECOND_LEVEL.has(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-take).join(".");
}

/** 원 공고 주소의 묶음 열쇠. 공용 호스트면 경로까지 넣는다. */
export function homepageKey(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const domain = registrableDomain(url.hostname);
    if (!domain.includes(".")) return null;
    if (!SHARED_HOSTS.has(domain)) return domain;
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    return path ? `${domain}${path}${url.search}` : null;
  } catch {
    return null;
  }
}

function normalized(title: string): string {
  return title.toLowerCase()
    .replace(/20\d\d년?/g, "")
    .replace(/제\s*\d+\s*회/g, "")
    .replace(/참가(?:자|팀)?\s*모집|모집/g, "")
    .replace(/공모전$/, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

/** 제목 열쇠들 — 괄호 글자만 지운 꼴과 괄호 안까지 지운 꼴. 네 글자 미만은 묶음 열쇠로 쓰지 않는다. */
export function titleKeys(title: string): string[] {
  const unwrapped = normalized(title.replace(/[[\]()「」『』<>《》〈〉]/g, " "));
  const stripped = normalized(title.replace(/\[[^\]]*\]|\([^)]*\)|<[^>]*>/g, " "));
  return [...new Set([unwrapped, stripped])].filter((key) => key.length >= 4);
}

/** 활동마다 대표 `id`를 돌려준다. 대표 자신과 묶이지 않은 활동은 null. */
export function findDuplicates(rows: readonly DedupeRow[]): Map<string, string | null> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const join = (a: string, b: string) => parent.set(find(a), find(b));
  const byTitle = new Map<string, string>();
  const byHome = new Map<string, Map<ActivitySource, string>>();
  for (const row of rows) {
    parent.set(row.id, row.id);
    if (row.kind === "bootcamp") continue;
    for (const key of titleKeys(row.title)) {
      const id = `${row.deadlineOn}|${key}`;
      const other = byTitle.get(id);
      if (other === undefined) byTitle.set(id, row.id);
      else join(row.id, other);
    }
    // 같은 기관이 같은 날 마감하는 다른 공모전을 한 출처에 따로 올리는 일이 있다(링커리어의 국어문화원 공모전 둘).
    // 그래서 도메인으로는 서로 다른 출처끼리만 묶는다.
    const home = homepageKey(row.homepageUrl);
    if (!home) continue;
    const id = `${row.deadlineOn}|${home}`;
    const owners = byHome.get(id) ?? new Map<ActivitySource, string>();
    for (const [source, other] of owners) if (source !== row.source) join(row.id, other);
    if (!owners.has(row.source)) owners.set(row.source, row.id);
    byHome.set(id, owners);
  }
  const groups = new Map<string, DedupeRow[]>();
  for (const row of rows) groups.set(find(row.id), [...(groups.get(find(row.id)) ?? []), row]);
  const result = new Map<string, string | null>();
  for (const members of groups.values()) {
    const [primary] = [...members].sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || a.id.localeCompare(b.id));
    for (const member of members) result.set(member.id, member.id === primary!.id ? null : primary!.id);
  }
  return result;
}
