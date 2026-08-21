import type { ReactNode } from "react";
import { Suspense } from "react";

import { homeEngagement, recentPortfolios } from "@/lib/app-data";
import { requireSession } from "@/lib/require-session";

import { AppShell } from "./AppShell";
import { Sidebar } from "./Sidebar";
import styles from "./Sidebar.module.css";

/**
 * 앱 셸 화면의 공통 껍데기. 각 구간의 `layout.tsx`가 이것 하나만 그린다.
 *
 * 자체는 `async`가 아니다 — 사이드바가 읽는 세 응답을 레이아웃이 기다리면
 * 그 아래 화면 전체가 같이 막힌다. 대신 사이드바만 Suspense 안에 두어,
 * 셸과 본문이 먼저 나가고 사이드바가 뒤따라 채워지게 한다.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <AppShell
      sidebar={
        <Suspense fallback={<SidebarFallback />}>
          <AppSidebar />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}

async function AppSidebar() {
  const session = await requireSession();
  const [portfolioList, { data: home }] = await Promise.all([
    recentPortfolios(session.accessToken),
    homeEngagement(session.accessToken),
  ]);

  return (
    <Sidebar
      categories={session.categories}
      portfolios={portfolioList.data.map((portfolio) => ({
        id: portfolio.id,
        name: portfolio.title,
        // 배포된 것은 주소를, 작성 중인 것은 진행 상황을 보여준다.
        meta: portfolio.deployment
          ? `${portfolio.deployment.subdomain}.xpresso.me`
          : `작성 중 · 섹션 ${portfolio.sectionCount}개`,
        status: portfolio.deployment ? "published" : "draft",
        ...(portfolio.deployment
          ? { delta: `v${portfolio.deployment.version}`, deltaTone: "quiet" as const }
          : {}),
      }))}
      interests={home.recommendedJobs.map((job) => ({
        id: job.id,
        initial: job.company.slice(0, 1),
        company: job.company,
        logoUrl: job.companyLogoUrl,
        label: `${job.company} · ${job.title}`,
        score: job.score,
      }))}
      jobCount={
        home.recommendedJobs.length > 0 ? home.recommendedJobs.length : undefined
      }
      displayName={session.user.displayName}
      quotaUsed={session.quota.used}
      quotaLimit={session.quota.limit}
    />
  );
}

/**
 * 사이드바가 도착하기 전의 자리. 폭이 같아야 본문이 흔들리지 않는다.
 */
function SidebarFallback() {
  return <aside className={styles.sidebar} aria-hidden="true" />;
}
