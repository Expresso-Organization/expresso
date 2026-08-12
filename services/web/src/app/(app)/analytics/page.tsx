import type { AnalyticsPeriodPreset } from "@expresso/contracts";

import { Sidebar } from "@/components/shell/Sidebar";
import { ApiError } from "@/lib/api/client";
import { analytics, portfolios } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { Dashboard } from "./Dashboard";
import { NothingPublished } from "./NothingPublished";

/**
 * 07 · 07b · 07c 분석.
 *
 * 배포한 포트폴리오만 볼 것이 있다 — 방문은 공개 사이트에서만 생긴다. 아직
 * 배포한 것이 없으면 빈 대시보드 대신 왜 비었는지를 보여준다.
 *
 * §2.1의 `?edit=1`은 대시보드 편집 모드이고, 위젯을 고르면 07c 설정 드로어로
 * 바뀐다 — 그 상태는 Dashboard가 가진다.
 */

function period(value: string | string[] | undefined): AnalyticsPeriodPreset {
  return value === "7d" || value === "all" ? value : "30d";
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const { data: published } = await portfolios.list(session.accessToken, {
    status: "published",
  });

  const sidebar = (
    <Sidebar
      active="analytics"
      categories={session.categories}
      displayName={session.user.displayName}
      quotaUsed={session.quota.used}
      quotaLimit={session.quota.limit}
    />
  );

  const asked = typeof query.portfolio === "string" ? query.portfolio : null;
  const selected = published.find(({ id }) => id === asked) ?? published[0];
  if (!selected) return <NothingPublished sidebar={sidebar} />;

  const preset = period(query.period);
  try {
    const [{ data }, { data: catalog }] = await Promise.all([
      analytics.dashboard(session.accessToken, selected.id, preset),
      analytics.metrics(session.accessToken),
    ]);
    return (
      <Dashboard
        sidebar={sidebar}
        dashboard={data}
        catalog={catalog}
        portfolios={published.map(({ id, title }) => ({ id, title }))}
        editing={query.edit === "1"}
      />
    );
  } catch (error) {
    // 목록에는 published인데 배포가 없는 경우 — 배포를 지웠거나 되돌린 상태다.
    if (error instanceof ApiError && error.status === 409) {
      return <NothingPublished sidebar={sidebar} />;
    }
    throw error;
  }
}
