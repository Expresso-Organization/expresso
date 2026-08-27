import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CommandPalette } from "@/components/CommandPalette";

import {
  ShellNavDrawer,
  ShellNavProvider,
  ShellNavTrigger,
  ShellTabBar,
} from "./ShellNav";
import { Skel } from "./Skeleton";
import styles from "./AppShell.module.css";

/**
 * 앱 셸의 바깥 틀 — 레이아웃이 그린다.
 *
 * 헤더는 여기 없다. 화면마다 제목·breadcrumb·마법사 단계로 달라지고, 같은
 * 화면 안에서도 상태에 따라 바뀌기 때문이다. 레이아웃은 자식에게 데이터를
 * 넘길 수 없으므로 헤더는 화면이 `AppBody` 앞에 직접 놓는다.
 *
 * 좁은 화면에서는 사이드바가 서랍으로 물러나고 아래에 탭바가 붙는다. 무엇이
 * 언제 나오는지는 `ShellNav`가 안다.
 */
export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <ShellNavProvider>
      <div className={styles.frame}>
        <ShellNavDrawer>{sidebar}</ShellNavDrawer>
        <main className={styles.main}>
          {children}
          <ShellTabBar />
        </main>
        {/* 00c — ⌘K 검색과 알림은 어느 앱 화면에서든 열린다 */}
        <CommandPalette />
      </div>
    </ShellNavProvider>
  );
}

/** 헤더 아래 본문 영역. 화면이 헤더 다음에 놓는다. */
export function AppBody({ children }: { children: ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}

/** 홈(00) 헤더 — 56px, 제목 + 우측 아이콘 액션. */
export function AppHeader({
  title,
  actions,
}: {
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <ShellNavTrigger />
      <span className={styles.title}>{title}</span>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </div>
  );
}

/**
 * 빵부스러기 한 조각. 글자만 주면 글자로 서고, 갈 곳을 함께 주면 링크가 된다.
 *
 * 마지막 조각은 **지금 보고 있는 화면**이라 갈 곳을 줘도 링크로 만들지 않는다 —
 * 제자리로 가는 링크는 눌러도 아무 일이 없고, 그런 링크가 있으면 나머지 조각도
 * 눌러 봐야 아는 것이 된다.
 *
 * `null`은 **아직 모르는 조각**이다 — 이름이 응답에서 오는 자리를 `loading.tsx`가
 * 그릴 때 쓴다. 자리는 지키고 글자만 비운다.
 */
export type Crumb = string | { label: string; href: Route } | null;

/** 내 커리어(05) 헤더 — 46px, breadcrumb + 편집 시각. */
export function DocumentHeader({
  crumbs,
  actions,
}: {
  crumbs: readonly Crumb[];
  actions?: ReactNode;
}) {
  return (
    <div className={`${styles.header} ${styles.headerDocument}`}>
      <ShellNavTrigger />
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        const label = crumb === null || typeof crumb === "string" ? crumb : crumb.label;
        const href = crumb === null || typeof crumb === "string" ? null : crumb.href;
        return (
          <span key={index} style={{ display: "contents" }}>
            {index > 0 ? <span className={styles.crumbSeparator}>/</span> : null}
            {label === null ? (
              <Skel w={104} h={12} />
            ) : href && !last ? (
              <Link href={href} className={`${styles.crumb} ${styles.crumbLink}`}>
                {label}
              </Link>
            ) : (
              <span className={last ? styles.crumbCurrent : styles.crumb}>
                {label}
              </span>
            )}
          </span>
        );
      })}
      {actions ? (
        <div className={`${styles.headerActions} ${styles.headerActionsWide}`}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export { styles as appShellStyles };
