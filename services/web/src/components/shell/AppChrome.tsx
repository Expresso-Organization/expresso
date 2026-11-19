import type { ReactNode } from "react";
import { Suspense } from "react";

import { recentPortfolios } from "@/lib/app-data";
import { publicSiteHost } from "@/lib/public-site";
import { requireSession } from "@/lib/require-session";

import { AppShell } from "./AppShell";
import { ImpersonationBar } from "./ImpersonationBar";
import { Sidebar } from "./Sidebar";
import { SidebarSkeleton } from "./SidebarSkeleton";

/**
 * 앱 셸 화면의 공통 껍데기. 각 구간의 `layout.tsx`가 이것 하나만 그린다.
 *
 * 자체는 `async`가 아니다 — 사이드바가 읽는 응답을 레이아웃이 기다리면
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
  const portfolioList = await recentPortfolios(session.accessToken);

  return (
    <Sidebar
      categories={session.categories}
      portfolios={portfolioList.data.map((portfolio) => {
        // 공개를 중단해도 배포 기록은 남는다. 지금 열리는 주소가 있을 때만 배포됨으로 보인다.
        const live = portfolio.status === "published" ? portfolio.deployment : null;
        return {
          id: portfolio.id,
          name: portfolio.title,
          // 배포된 것은 주소를, 아닌 것은 진행 상황을 보여 준다.
          meta: live
            ? publicSiteHost(live.subdomain)
            : portfolio.status === "unlisted"
              ? "공개 중단"
              : `작성 중 · 섹션 ${portfolio.sectionCount}개`,
          status: live ? ("published" as const) : ("draft" as const),
          ...(live ? { delta: `v${live.version}` } : {}),
        };
      })}
      morePortfolios={portfolioList.page.hasNextPage}
      displayName={session.user.displayName}
      // 대신 로그인 중이면 세션 주인이 관리자다.
      admin={session.user.role === "admin" || session.user.impersonation !== null}
      quotaUsed={session.quota.used}
      quotaLimit={session.quota.limit}
    />
  );
}
