import type { Activity, ActivitySource } from "@expresso/contracts";

/**
 * 탐색이 다루는 종류.
 *
 * 채용 공고는 지금의 공고 목록이다. 공모전 · 해커톤 · 부트캠프는 서버가 수집해 둔 활동(`GET /activities`)을 읽는다.
 * 인턴은 적재한 공고에서 제목으로 찾는다.
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

/** 활동 출처의 화면 이름. */
export const ACTIVITY_SOURCE_LABEL: Record<ActivitySource, string> = {
  wevity: "위비티",
  linkareer: "링커리어",
  contestkorea: "콘테스트코리아",
  devevent: "Dev-Event",
  boottent: "부트텐트",
};

/** 활동 목록 한 쪽의 수(계약의 `limit` 최댓값). */
export const ACTIVITY_PAGE_SIZE = 100;

/** `YYYY-MM-DD` → `11월 23일`. */
function monthDay(on: string): string {
  return `${Number(on.slice(5, 7))}월 ${Number(on.slice(8, 10))}일`;
}

/** 원 → `60만원` · `4.9만원`. 0이면 무료. */
export function tuitionLabel(tuition: number): string {
  if (tuition === 0) return "무료";
  const man = Math.round(tuition / 1_000) / 10;
  return `${man.toLocaleString("ko-KR")}만원`;
}

/**
 * 활동 한 줄에 보일 글 — 도메인 값을 화면의 글로 바꾼다.
 *
 * - 둘째 줄: 주최, 그다음 부트캠프는 학비 · 내일배움카드 · 수업 시작일, 공모전 · 해커톤은 대상 · 상금.
 *   접수 전이면 접수 시작일을 앞에 둔다.
 * - 마감: 출처가 달로만 적었으면 「12월 중」, 아니면 남은 날.
 */
export function activityLine(activity: Activity): { meta: string; deadline: string; urgent: boolean } {
  const parts: string[] = [activity.host];
  if (activity.status === "접수예정" && activity.applyStartOn) parts.push(`${monthDay(activity.applyStartOn)} 접수 시작`);
  if (activity.kind === "bootcamp") {
    if (activity.tuition !== null) parts.push(tuitionLabel(activity.tuition));
    if (activity.nbcardRequired) parts.push("내일배움카드");
    if (activity.startsOn) parts.push(`${monthDay(activity.startsOn)} 수업 시작`);
  } else {
    if (activity.eligibility) parts.push(activity.eligibility);
    if (activity.prize) parts.push(activity.prize);
  }
  const monthly = activity.deadlinePrecision === "month";
  return {
    meta: parts.filter(Boolean).join(" · "),
    deadline: monthly ? `${Number(activity.deadlineOn.slice(5, 7))}월 중` : `D-${activity.daysLeft}`,
    urgent: !monthly && activity.daysLeft <= 7,
  };
}

/** 목록에 실린 활동의 출처 이름. 많이 실린 순서. */
export function activitySourceNote(rows: readonly Activity[]): string {
  const counts = new Map<ActivitySource, number>();
  for (const row of rows) counts.set(row.source, (counts.get(row.source) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([source]) => ACTIVITY_SOURCE_LABEL[source]).join(" · ");
}
