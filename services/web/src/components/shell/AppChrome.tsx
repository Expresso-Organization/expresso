import type { Route } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { resumeStep } from "@/lib/brew-resume-step";
import { gridItems } from "@/app/(app)/home/home-model";
import { homeEngagement, recentPortfolios } from "@/lib/app-data";
import { publicSiteHost } from "@/lib/public-site";
import { requireSession } from "@/lib/require-session";

import { AppShell } from "./AppShell";
import { ImpersonationBar } from "./ImpersonationBar";
import { Sidebar } from "./Sidebar";
import { SidebarSkeleton } from "./SidebarSkeleton";

/**
 * 앱 셸 화면의 공통 껍데기. `app/(app)/layout.tsx` 한 곳이 그린다 — 화면을 옮겨도
 * 다시 마운트되지 않으므로 사이드바는 처음 한 번만 불러온다. 사이드바 값이 바뀌면
 * 바꾼 쪽이 `router.refresh()`나 `revalidatePath`를 부르는 Server Action으로 다시 그린다.
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

/** 사이드바 「포트폴리오」 묶음에 세우는 줄 수. 넘으면 「모두 보기」가 라이브러리로 보낸다. */
const SIDEBAR_PORTFOLIOS = 5;

async function AppSidebar() {
  const session = await requireSession();
  const [{ data: home }, portfolioList] = await Promise.all([
    homeEngagement(session.accessToken),
    recentPortfolios(session.accessToken),
  ]);
  // 라이브러리의 「포트폴리오」와 같은 규칙 — 끝나지 않은 제작과 포트폴리오를 마지막 작업 순으로 섞는다.
  const items = gridItems(home.activeBrews, portfolioList.data, SIDEBAR_PORTFOLIOS + 1);

  return (
    <Sidebar
      categories={session.categories}
      portfolios={items.slice(0, SIDEBAR_PORTFOLIOS).map((item) => {
        if (item.kind === "brew") {
          const step = resumeStep(item.brew.status);
          return {
            id: item.brew.id,
            name: item.brew.title ?? "만들던 포트폴리오",
            href: `/brew/${item.brew.id}` as Route,
            meta: `만드는 중 · ${step.label}`,
            status: "draft" as const,
          };
        }
        const { portfolio } = item;
        // 공개를 중단해도 배포 기록은 남는다. 지금 열리는 주소가 있을 때만 배포됨으로 보인다.
        const live = portfolio.status === "published" ? portfolio.deployment : null;
        return {
          id: portfolio.id,
          name: portfolio.title,
          href: `/edit/${portfolio.id}` as Route,
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
      morePortfolios={items.length > SIDEBAR_PORTFOLIOS || portfolioList.page.hasNextPage}
      displayName={session.user.displayName}
      // 대신 로그인 중이면 세션 주인이 관리자다.
      admin={session.user.role === "admin" || session.user.impersonation !== null}
      quotaUsed={session.quota.used}
      quotaLimit={session.quota.limit}
    />
  );
}
