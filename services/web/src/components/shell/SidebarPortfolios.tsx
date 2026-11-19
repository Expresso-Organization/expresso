"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { GlideMenu } from "@/components/ui/GlideMenu";
import { Icon } from "@/components/ui/Icon";

import { SidebarGroup } from "./SidebarGroup";
import styles from "./Sidebar.module.css";

export interface SidebarPortfolio {
  id: string;
  name: string;
  /** 배포됨이면 도메인, 아니면 "작성 중 · 섹션 4개" 같은 진행 문구. */
  meta: string;
  status: "published" | "draft";
  /** 배포 판 번호(`v3`). */
  delta?: string;
}

/**
 * 사이드바의 「포트폴리오」 묶음. 최근 수정한 몇 개만 세우고, 더 있으면 라이브러리의
 * 포트폴리오 목록으로 가는 줄을 끝에 둔다. 포트폴리오가 없으면 묶음을 세우지 않는다 —
 * 첫 포트폴리오는 바로 위 「새 포트폴리오」 버튼이 만든다.
 */
export function SidebarPortfolios({
  portfolios,
  more,
}: {
  portfolios: readonly SidebarPortfolio[];
  /** 세운 것 말고도 더 있는가. */
  more: boolean;
}) {
  const pathname = usePathname();
  if (portfolios.length === 0) return null;

  return (
    <SidebarGroup id="portfolios" label="포트폴리오">
      <GlideMenu className={`${styles.portfolios} ${styles.navGroup}`}>
        {portfolios.map((portfolio) => {
          const href = `/edit/${portfolio.id}`;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={portfolio.id}
              href={href as Route}
              data-row
              title={portfolio.name}
              className={`${styles.row} ${styles.portfolioItem} ${isActive ? styles.rowActive : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className={styles.thumb}>
                <span
                  className={`${styles.thumbDot} ${
                    portfolio.status === "published"
                      ? styles.thumbDotPublished
                      : styles.thumbDotDraft
                  }`}
                />
              </span>
              <div className={`${styles.copy} ${styles.portfolioBody}`}>
                <div className={styles.portfolioName}>{portfolio.name}</div>
                <div className={styles.portfolioMeta}>{portfolio.meta}</div>
              </div>
              {portfolio.status === "draft" ? (
                <span className={`${styles.copy} ${styles.draftChip}`}>초안</span>
              ) : portfolio.delta ? (
                <div className={`${styles.copy} ${styles.portfolioStat}`}>
                  <div className={`${styles.portfolioDelta} ${styles.portfolioDeltaQuiet}`}>
                    {portfolio.delta}
                  </div>
                </div>
              ) : null}
            </Link>
          );
        })}
        {more ? (
          <Link
            href={{ pathname: "/library", query: { s: "portfolios" } }}
            data-row
            title="포트폴리오 모두 보기"
            className={`${styles.row} ${styles.groupMore}`}
          >
            <span className={styles.rowLead}>
              <Icon name="dots-three" size={14} color="var(--ex-fg-subtle)" />
            </span>
            <span className={`${styles.copy} ${styles.groupMoreLabel}`}>모두 보기</span>
          </Link>
        ) : null}
      </GlideMenu>
    </SidebarGroup>
  );
}
