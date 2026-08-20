import type { ReactNode } from "react";

import { CommandPalette } from "@/components/CommandPalette";

import styles from "./AppShell.module.css";

/**
 * 앱 셸의 바깥 틀 — 레이아웃이 그린다.
 *
 * 헤더는 여기 없다. 화면마다 제목·breadcrumb·마법사 단계로 달라지고, 같은
 * 화면 안에서도 상태에 따라 바뀌기 때문이다. 레이아웃은 자식에게 데이터를
 * 넘길 수 없으므로 헤더는 화면이 `AppBody` 앞에 직접 놓는다.
 */
export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      {sidebar}
      <main className={styles.main}>{children}</main>
      {/* 00c — ⌘K 검색과 알림은 어느 앱 화면에서든 열린다 */}
      <CommandPalette />
    </div>
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
      <span className={styles.title}>{title}</span>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </div>
  );
}

/** 내 커리어(05) 헤더 — 46px, breadcrumb + 편집 시각. */
export function DocumentHeader({
  crumbs,
  actions,
}: {
  crumbs: readonly string[];
  actions?: ReactNode;
}) {
  return (
    <div className={`${styles.header} ${styles.headerDocument}`}>
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <span key={crumb} style={{ display: "contents" }}>
            {index > 0 ? <span className={styles.crumbSeparator}>/</span> : null}
            <span className={last ? styles.crumbCurrent : styles.crumb}>
              {crumb}
            </span>
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
