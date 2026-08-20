"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/Icon";

import styles from "./Sidebar.module.css";

export type SidebarSection =
  | "home"
  | "new-portfolio"
  | "jobs"
  | "analytics"
  | "career";

const PRIMARY_ITEMS: readonly {
  key: SidebarSection;
  label: string;
  href: Route;
  icon: string;
}[] = [
  { key: "home", label: "홈", href: "/home", icon: "house" },
  { key: "new-portfolio", label: "새 포트폴리오", href: "/brew/new", icon: "coffee" },
  { key: "jobs", label: "공고 탐색", href: "/jobs", icon: "target" },
  { key: "analytics", label: "분석", href: "/analytics", icon: "chart-bar" },
];

/**
 * 주소로 활성 항목을 정한다.
 *
 * 예전에는 화면마다 `active="jobs"`를 손으로 넘겼다. 사이드바가 레이아웃으로
 * 올라가면서 그 자리가 없어졌고, 어차피 "지금 어느 메뉴냐"는 주소가 이미
 * 알고 있는 사실이다. 설정(`/account`)은 별도 메뉴가 아니라 홈 밑이다.
 */
export function sectionForPath(pathname: string): SidebarSection | null {
  if (pathname === "/home" || pathname.startsWith("/account")) return "home";
  if (pathname.startsWith("/jobs")) return "jobs";
  if (pathname.startsWith("/analytics")) return "analytics";
  if (pathname.startsWith("/career")) return "career";
  if (pathname.startsWith("/brew") || pathname.startsWith("/edit")) {
    return "new-portfolio";
  }
  return null;
}

export function SidebarNav({ jobCount }: { jobCount?: number | undefined }) {
  const active = sectionForPath(usePathname());

  return (
    <nav className={styles.primary} aria-label="주요 이동">
      <div className={styles.primaryItem}>
        <Icon name="magnifying-glass" size={14} color="var(--ex-slate-500)" />
        <span className={styles.primaryLabel}>검색</span>
        <span className={styles.shortcut}>⌘K</span>
      </div>
      {PRIMARY_ITEMS.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`${styles.primaryItem} ${
            active === item.key ? styles.primaryItemActive : ""
          }`}
          aria-current={active === item.key ? "page" : undefined}
        >
          <Icon
            name={item.icon}
            weight={active === item.key ? "fill" : "regular"}
            size={14}
            color={active === item.key ? "var(--ex-ink-900)" : "var(--ex-slate-500)"}
          />
          <span className={styles.primaryLabel}>{item.label}</span>
          {item.key === "jobs" && jobCount !== undefined ? (
            <span className={styles.primaryCount}>{jobCount}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
