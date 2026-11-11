import type {
  AnalyticsDashboard,
  CareerProfile,
  HomeReadModel,
  JobPostingMatch,
  PortfolioSummary,
  TargetRole,
} from "@expresso/contracts";

/**
 * 00 홈이 계약 데이터를 화면 모양으로 바꾸는 규칙. 순수 함수만 둔다 — 화면이
 * 무엇을 보여 주는지가 여기서 정해지고, 테스트가 그 규칙을 지킨다.
 */

/**
 * 온보딩의 목표 직군(닫힌 목록 8개)을 공고의 직군 이름으로.
 *
 * 공고 직군은 수집 때 분류기가 붙인 이름이라 두 목록이 다르다. `DevOps`는 공고에서
 * 「인프라 · 플랫폼」으로 묶인다. 기획 · PM과 디자인은 개발 공고 분류에 대응하는
 * 직군이 없어 null이다 — 이 직군만 고른 사람에게는 「전체 공고」를 보여 준다.
 */
export const TARGET_ROLE_FAMILY: Record<TargetRole, string | null> = {
  백엔드: "백엔드",
  프론트엔드: "프론트엔드",
  데이터: "데이터",
  "ML · AI": "ML · AI",
  모바일: "모바일",
  DevOps: "인프라 · 플랫폼",
  "기획 · PM": null,
  디자인: null,
};

/** 공고 카드 첫 탭이 무엇을 보여 주는가. 공고 직군으로 바꿀 수 있는 첫 목표 직군을 쓴다. */
export function roleTab(profile: CareerProfile | null): { label: string; family: string | null } {
  for (const role of profile?.targetRoles ?? []) {
    const family = TARGET_ROLE_FAMILY[role];
    if (family) return { label: role, family };
  }
  return { label: "전체 공고", family: null };
}

export type JobsTab = "role" | "interested";

/** 공고 카드가 실제로 보여 주는 탭. 관심 공고가 없으면 관심 탭을 세우지 않으므로 첫 탭이다. */
export function jobsTabShown(tab: JobsTab, interestedTotal: number): JobsTab {
  return tab === "interested" && interestedTotal > 0 ? "interested" : "role";
}

/** 공고 카드 「전체」가 여는 06 공고 목록의 조건. 보고 있는 탭을 따른다. */
export function allJobsQuery(shown: JobsTab, family: string | null): Record<string, string> {
  if (shown === "interested") return { interested: "true" };
  return family ? { family } : {};
}

/**
 * 검색창 아래 예시 질문. 목표 직군과 경력에서 만든다.
 * 목표 직군이 없으면 비운다 — 아무에게나 맞는 예시는 아무에게도 맞지 않는다.
 */
export function exampleQueries(profile: CareerProfile | null): string[] {
  const { family, label } = roleTab(profile);
  if (!family || !profile) return [];
  const years = profile.experienceYears;
  return [
    years > 0 ? `경력 ${years}년 ${label}` : `신입 ${label}`,
    `서울 ${label}`,
    `리모트 ${label}`,
  ];
}

/** 일치도에서 기록에 근거가 없는 요건. 네 축을 정해진 순서로 이어 붙여 앞에서부터 자른다. */
export function missingRequirements(match: JobPostingMatch, limit = 2): string[] {
  const { technology, role, impact, conditions } = match.axes;
  return [...technology.missing, ...role.missing, ...impact.missing, ...conditions.missing].slice(0, limit);
}

export type ActiveBrew = HomeReadModel["activeBrews"][number];

export type GridItem =
  | { kind: "brew"; brew: ActiveBrew; updatedAt: string }
  | { kind: "portfolio"; portfolio: PortfolioSummary; updatedAt: string };

/**
 * 「내 포트폴리오」 격자의 칸. 끝나지 않은 제작과 포트폴리오를 마지막 작업 순으로 섞는다.
 *
 * 생성이 끝난 제작은 이미 포트폴리오로 서 있으므로 제작 칸을 따로 세우지 않는다.
 */
export function gridItems(
  brews: ActiveBrew[],
  portfolios: PortfolioSummary[],
  limit: number,
): GridItem[] {
  const built = new Set(portfolios.map(({ brewId }) => brewId));
  return [
    ...brews
      .filter(({ id }) => !built.has(id))
      .map((brew) => ({ kind: "brew" as const, brew, updatedAt: brew.updatedAt })),
    ...portfolios.map((portfolio) => ({ kind: "portfolio" as const, portfolio, updatedAt: portfolio.updatedAt })),
  ]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

/** 오른쪽 차트에 그릴 사이트 하나. 07 분석이 내는 대시보드에서 필요한 것만 남긴다. */
export type SiteInsight = {
  portfolioId: string;
  subdomain: string;
  version: number;
  /** 지금 판을 배포한 날(서울 날짜). 차트 선은 이날부터 그린다. */
  publishedOn: string | null;
  visits: number;
  completes: number;
  contactClicks: number;
  /** 기간의 첫날부터 마지막 날까지 하루도 빠짐없이. 집계가 없던 날은 0이다. */
  days: Array<{ date: string; visits: number; contactClicks: number }>;
  sections: AnalyticsDashboard["sections"];
  referrers: AnalyticsDashboard["referrers"];
};

export function seoulDate(at: string): string {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/** 07의 추이는 집계된 날만 준다. 차트는 빈 날도 자리가 있어야 선이 날짜와 맞는다. */
export function dailySeries(
  start: string,
  end: string,
  trend: AnalyticsDashboard["trend"],
): SiteInsight["days"] {
  const byDate = new Map(trend.map((point) => [point.date, point]));
  const days: SiteInsight["days"] = [];
  for (let at = Date.parse(`${start}T00:00:00Z`); at <= Date.parse(`${end}T00:00:00Z`); at += 86_400_000) {
    const date = new Date(at).toISOString().slice(0, 10);
    const point = byDate.get(date);
    days.push({ date, visits: point?.visits ?? 0, contactClicks: point?.contactClicks ?? 0 });
  }
  return days;
}

export function siteInsight(portfolio: PortfolioSummary, dashboard: AnalyticsDashboard): SiteInsight {
  return {
    portfolioId: portfolio.id,
    subdomain: dashboard.deployment.subdomain,
    version: portfolio.deployment?.version ?? 1,
    publishedOn: dashboard.deployment.publishedAt ? seoulDate(dashboard.deployment.publishedAt) : null,
    visits: dashboard.metrics.visits,
    completes: dashboard.metrics.completes,
    contactClicks: dashboard.metrics.contactClicks,
    days: dailySeries(dashboard.period.start, dashboard.period.end, dashboard.trend),
    sections: dashboard.sections,
    referrers: dashboard.referrers,
  };
}

/** 여러 사이트의 유입 경로를 출처마다 더한다. 많은 순서, 같으면 출처 이름 순서. */
export function mergeReferrers(sites: SiteInsight[]): Array<{ origin: string | null; visits: number }> {
  const totals = new Map<string | null, number>();
  for (const site of sites) {
    for (const referrer of site.referrers) {
      totals.set(referrer.origin, (totals.get(referrer.origin) ?? 0) + referrer.visits);
    }
  }
  return [...totals]
    .map(([origin, visits]) => ({ origin, visits }))
    .sort((left, right) => right.visits - left.visits || (left.origin ?? "").localeCompare(right.origin ?? ""));
}

/**
 * 앞 섹션보다 읽은 수가 가장 많이 줄어든 섹션의 자리. 방문자가 거기서 떠났다.
 * 첫 섹션은 방문 수와 견준다. 줄어든 곳이 없으면 -1.
 */
export function biggestDrop(visits: number, views: number[]): number {
  let at = -1;
  let biggest = 0;
  views.forEach((count, index) => {
    const before = index === 0 ? visits : (views[index - 1] ?? visits);
    if (before - count > biggest) {
      biggest = before - count;
      at = index;
    }
  });
  return at;
}
