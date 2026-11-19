/**
 * 탐색이 다루는 종류.
 *
 * 채용 공고는 지금의 공고 목록이다. 공모전과 해커톤은 서버가 수집해 둔 활동(`GET /activities`)을 읽는다.
 * 인턴은 적재한 공고에서 제목으로 찾고, 부트캠프는 출처를 아직 붙이지 않았다.
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
