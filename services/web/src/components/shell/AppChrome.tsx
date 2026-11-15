import type { ReactNode } from "react";
import { Suspense } from "react";

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
  return (
    <Sidebar
      displayName={session.user.displayName}
      // 대신 로그인 중이면 세션 주인이 관리자다.
      admin={session.user.role === "admin" || session.user.impersonation !== null}
      quotaUsed={session.quota.used}
      quotaLimit={session.quota.limit}
    />
  );
}
