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
  /** 포트폴리오는 편집 화면, 끝나지 않은 제작은 멈춘 단계. */
  href: Route;
  /** 배포됨이면 도메인, 아니면 "작성 중 · 섹션 4개" · "만드는 중 · 디자인 선택" 같은 진행 문구. */
  meta: string;
  status: "published" | "draft";
  /** 배포 판 번호(`v3`). */
  delta?: string;
}

/**
 * 사이드바의 「포트폴리오」 묶음. 라이브러리의 「포트폴리오」처럼 끝나지 않은 제작과
 * 포트폴리오를 마지막 작업 순으로 몇 개만 세우고, 더 있으면 라이브러리로 가는 줄을 끝에 둔다.
 * 하나도 없으면 묶음을 세우지 않는다 — 첫 포트폴리오는 바로 위 「새 포트폴리오」 버튼이 만든다.
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
          const { href } = portfolio;
          // 제작은 단계마다 주소 끝이 바뀐다(`/brew/{id}/design`). 활성 표시는 제작 전체에 건다.
          const base = href.startsWith("/brew/") ? href.slice(0, href.lastIndexOf("/")) : href;
          const isActive = pathname === base || pathname.startsWith(`${base}/`);
          return (
            <Link
              key={portfolio.id}
              href={href}
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
