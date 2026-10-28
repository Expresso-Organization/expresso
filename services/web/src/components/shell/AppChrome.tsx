import type { ReactNode } from "react";
import { Suspense } from "react";

import { homeEngagement, recentPortfolios, watchedJobs } from "@/lib/app-data";
import { requireSession } from "@/lib/require-session";

import { AppShell } from "./AppShell";
import { ImpersonationBar } from "./ImpersonationBar";
import { Sidebar } from "./Sidebar";
import { SidebarSkeleton } from "./SidebarSkeleton";

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
      banner={
        <Suspense fallback={null}>
          <ImpersonationBar />
        </Suspense>
      }
      sidebar={
        <Suspense fallback={<SidebarSkeleton />}>
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
  const [portfolioList, { data: home }, watched] = await Promise.all([
    recentPortfolios(session.accessToken),
    homeEngagement(session.accessToken),
    watchedJobs(session.accessToken),
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
      // 관심 공고는 내가 담은 공고다. 일치도 상위 목록(`recommendedJobs`)이 아니다 —
      // 그 목록으로 채우면 담아도 여기 나타나지 않고, 일치도가 없는 공고의
      // "분석 대기" 줄은 나올 수가 없다.
      interests={watched.data.map((job) => ({
        id: job.id,
        initial: job.company.initial ?? job.company.name.slice(0, 1),
        company: job.company.name,
        logoUrl: job.company.logoUrl,
        label: `${job.company.name} · ${job.title}`,
        score: job.match?.total ?? null,
      }))}
      interestTotal={watched.summary.total}
      jobCount={
        home.recommendedJobs.length > 0 ? home.recommendedJobs.length : undefined
      }
      displayName={session.user.displayName}
      // 대신 로그인 중이면 세션 주인이 관리자다.
      admin={session.user.role === "admin" || session.user.impersonation !== null}
      quotaUsed={session.quota.used}
      quotaLimit={session.quota.limit}
    />
  );
}

