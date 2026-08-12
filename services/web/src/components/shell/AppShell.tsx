import type { ReactNode } from "react";

import { CommandPalette } from "@/components/CommandPalette";

import styles from "./AppShell.module.css";

export function AppShell({
  sidebar,
  header,
  children,
}: {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      {sidebar}
      <main className={styles.main}>
        {header}
        <div className={styles.body}>{children}</div>
      </main>
      {/* 00c — ⌘K 검색과 알림은 어느 앱 화면에서든 열린다 */}
      <CommandPalette />
    </div>
  );
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
