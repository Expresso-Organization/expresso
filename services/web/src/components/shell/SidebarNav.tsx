"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { GlideMenu } from "@/components/ui/GlideMenu";
import { Icon } from "@/components/ui/Icon";

import styles from "./Sidebar.module.css";

export type SidebarSection = "home" | "library" | "explore" | "analytics";

const PRIMARY_ITEMS: readonly {
  key: SidebarSection;
  label: string;
  href: Route;
  icon: string;
}[] = [
  { key: "home", label: "홈", href: "/home", icon: "house" },
  { key: "library", label: "라이브러리", href: "/library" as Route, icon: "books" },
  { key: "explore", label: "탐색", href: "/jobs", icon: "compass" },
  { key: "analytics", label: "분석", href: "/analytics", icon: "chart-bar" },
];

/**
 * 주소로 활성 항목을 정한다.
 *
 * 예전에는 화면마다 `active="jobs"`를 손으로 넘겼다. 사이드바가 레이아웃으로
 * 올라가면서 그 자리가 없어졌고, 어차피 "지금 어느 메뉴냐"는 주소가 이미
 * 알고 있는 사실이다. 설정(`/account`)은 1차 메뉴가 아니므로 `null`이고, 그
 * 화면의 활성 표시는 사이드바 아래쪽 사용자 줄(`AccountLink`)이 받는다.
 */
export function sectionForPath(pathname: string): SidebarSection | null {
  // 에이전트 대화와 구직 목표는 홈이다. 기록과 포트폴리오는 어디서 열었든 라이브러리에 속한다.
  if (pathname === "/home" || pathname.startsWith("/agent") || pathname.startsWith("/goal")) return "home";
  if (pathname.startsWith("/library") || pathname.startsWith("/career") || pathname.startsWith("/edit")) return "library";
  if (pathname.startsWith("/jobs")) return "explore";
  if (pathname.startsWith("/analytics")) return "analytics";
  return null;
}

export function SidebarNav() {
  const active = sectionForPath(usePathname());

  return (
    <nav aria-label="주요 이동">
      <Link href="/brew/new" className={styles.brew} title="새 포트폴리오">
        <span className={styles.brewLead}><Icon name="coffee" weight="fill" size={15} /></span>
        <span className={`${styles.copy} ${styles.brewLabel}`}>새 포트폴리오</span>
      </Link>
      <GlideMenu className={`${styles.primary} ${styles.navGroup}`}>
        {PRIMARY_ITEMS.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            data-row
            title={item.label}
            className={`${styles.row} ${styles.primaryItem} ${
              active === item.key
                ? `${styles.rowActive} ${styles.primaryItemActive}`
                : ""
            }`}
            aria-current={active === item.key ? "page" : undefined}
          >
            <span className={styles.rowLead}>
              <Icon
                name={item.icon}
                weight={active === item.key ? "fill" : "regular"}
                size={14}
                color={active === item.key ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
              />
            </span>
            <span className={`${styles.copy} ${styles.primaryLabel}`}>
              {item.label}
            </span>
          </Link>
        ))}
      </GlideMenu>
    </nav>
  );
}
