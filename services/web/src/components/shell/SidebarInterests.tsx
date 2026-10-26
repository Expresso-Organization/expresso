"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { GlideMenu } from "@/components/ui/GlideMenu";

import type { SidebarInterest } from "./Sidebar";
import styles from "./Sidebar.module.css";

/**
 * 관심 공고 줄. 누르면 그 공고 상세로 가고, 상세를 보는 동안 그 줄이 켜진다.
 *
 * 상세에 `from`을 달지 않는다 — 사이드바는 목록이 아니어서 돌아갈 조건이
 * 없다. 상세의 "목록으로"는 공고 탐색으로 간다.
 */
export function SidebarInterests({
  interests,
}: {
  interests: readonly SidebarInterest[];
}) {
  const pathname = usePathname();

  return (
    <GlideMenu className={`${styles.interests} ${styles.navGroup}`}>
      {interests.map((interest) => {
        const href = `/jobs/${interest.id}`;
        const isActive = pathname === href;
        return (
          <Link
            key={interest.id}
            href={href as Route}
            data-row
            title={interest.label}
            className={`${styles.row} ${styles.interestItem} ${
              isActive ? styles.rowActive : ""
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <CompanyAvatar
              company={{
                name: interest.company,
                initial: interest.initial,
                logoUrl: interest.logoUrl,
              }}
              className={styles.initial}
            />
            <span className={`${styles.copy} ${styles.interestName}`}>
              {interest.label}
            </span>
            {interest.score === null ? (
              <span className={`${styles.copy} ${styles.pending}`}>분석 대기</span>
            ) : (
              <span
                className={`${styles.copy} ${styles.score} ${
                  interest.score >= 85 ? styles.scoreHigh : styles.scoreMid
                }`}
              >
                {interest.score}
              </span>
            )}
          </Link>
        );
      })}
    </GlideMenu>
  );
}
