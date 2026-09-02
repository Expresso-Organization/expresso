import type { CareerCategory } from "@expresso/contracts";
import Link from "next/link";

import { GlideMenu } from "@/components/ui/GlideMenu";
import { Icon } from "@/components/ui/Icon";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { SidebarCategories } from "./SidebarCategories";
import { SidebarFrame } from "./SidebarFrame";
import { SidebarNav, type SidebarSection } from "./SidebarNav";
import styles from "./Sidebar.module.css";

export type { SidebarSection };

export interface SidebarPortfolio {
  id: string;
  name: string;
  /** 배포됨이면 도메인, 초안이면 "작성 중 · 질문 4/6" 같은 진행 문구. */
  meta: string;
  status: "published" | "draft";
  visits?: number;
  delta?: string;
  deltaTone?: "up" | "quiet";
}

export interface SidebarInterest {
  id: string;
  initial: string;
  /** 회사 이름 — 로고가 없을 때 첫 글자를 뽑는 자리. */
  company: string;
  logoUrl: string | null;
  label: string;
  score: number | null;
}

export interface SidebarProps {
  categories: readonly CareerCategory[];
  portfolios?: readonly SidebarPortfolio[];
  interests?: readonly SidebarInterest[];
  /** 공고 탐색 배지 = 관심 + 추천 건수. */
  jobCount?: number | undefined;
  displayName: string;
  quotaUsed: number;
  /** 무제한 요금제는 상한이 없다. 없는 상한을 999로 적으면 그것도 거짓말이다. */
  quotaLimit: number | null;
}

export function Sidebar({
  categories,
  portfolios = [],
  interests = [],
  jobCount,
  displayName,
  quotaUsed,
  quotaLimit,
}: SidebarProps) {
  const quotaRatio = !quotaLimit ? 0 : Math.min(1, quotaUsed / quotaLimit);

  return (
    <SidebarFrame
      footer={
        <>
          <div className={styles.quotaSlot}>
            <div className={`${styles.copy} ${styles.quotaCard}`}>
              <div className={styles.quotaHead}>
                <span className={styles.quotaLabel}>이번 달 추출</span>
                <span className={styles.quotaValue}>
                  {quotaUsed} / {quotaLimit ?? "무제한"}
                </span>
              </div>
              <div
                className={styles.quotaTrack}
                role="meter"
                aria-valuenow={quotaUsed}
                aria-valuemin={0}
                aria-valuemax={quotaLimit ?? undefined}
                aria-label={quotaLimit === null
                  ? `이번 달 추출 ${quotaUsed}회 · 상한 없음`
                  : `이번 달 추출 ${quotaLimit}회 중 ${quotaUsed}회 사용`}
              >
                <div
                  className={styles.quotaFill}
                  style={{ width: `${quotaRatio * 100}%` }}
                />
              </div>
              <Link href="/account" className={styles.upgradeLink}>
                Double Shot 추가
              </Link>
            </div>
          </div>
          <Link
            href="/account"
            className={`${styles.row} ${styles.userLink}`}
            title={`${displayName} · 설정`}
          >
            <span className={styles.avatar}>{displayName.slice(0, 1)}</span>
            <span className={`${styles.copy} ${styles.userName}`}>{displayName}</span>
            <span className={`${styles.copy} ${styles.userAction}`}>
              <Icon name="gear-six" size={14} />
            </span>
          </Link>
        </>
      }
    >
      <SidebarNav jobCount={jobCount} />

      {portfolios.length > 0 ? (
        <>
          <div className={`${styles.groupHead} ${styles.groupHeadFirst}`}>
            <div className={`${styles.copy} ${styles.groupHeadRow}`}>
              <span className={styles.groupLabel}>내 포트폴리오</span>
              <div className={styles.groupActions}>
                <span className={styles.groupCount}>{portfolios.length}</span>
                <button type="button" className={styles.groupAction} aria-label="포트폴리오 추가">
                  <Icon name="plus" size={13} />
                </button>
              </div>
            </div>
          </div>
          <GlideMenu className={`${styles.portfolios} ${styles.navGroup}`}>
            {portfolios.map((portfolio) => (
              <div
                key={portfolio.id}
                data-row
                title={portfolio.name}
                className={`${styles.row} ${styles.portfolioItem}`}
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
                ) : (
                  <div className={`${styles.copy} ${styles.portfolioStat}`}>
                    <div className={styles.portfolioVisits}>
                      {portfolio.visits?.toLocaleString("ko-KR") ?? "—"}
                    </div>
                    <div
                      className={`${styles.portfolioDelta} ${
                        portfolio.deltaTone === "quiet"
                          ? styles.portfolioDeltaQuiet
                          : ""
                      }`}
                    >
                      {portfolio.delta}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </GlideMenu>
        </>
      ) : null}

      {interests.length > 0 ? (
        <>
          <div className={styles.groupHead}>
            <div className={`${styles.copy} ${styles.groupHeadRow}`}>
              <span className={styles.groupLabel}>관심 공고</span>
              <div className={styles.groupActions}>
                <span className={styles.groupCount}>{interests.length}</span>
                <button type="button" className={styles.groupAction} aria-label="관심 공고 추가">
                  <Icon name="plus" size={13} />
                </button>
              </div>
            </div>
          </div>
          <GlideMenu className={`${styles.interests} ${styles.navGroup}`}>
            {interests.map((interest) => (
              <div
                key={interest.id}
                data-row
                title={interest.label}
                className={`${styles.row} ${styles.interestItem}`}
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
              </div>
            ))}
          </GlideMenu>
        </>
      ) : null}

      <div className={styles.groupHead}>
        <div className={`${styles.copy} ${styles.groupHeadRow}`}>
          <span className={styles.groupLabel}>내 커리어</span>
          <div className={styles.groupActions}>
            <button type="button" className={styles.groupAction} aria-label="카테고리 더 보기">
              <Icon name="dots-three" size={13} />
            </button>
            <button type="button" className={styles.groupAction} aria-label="카테고리 추가">
              <Icon name="plus" size={13} />
            </button>
          </div>
        </div>
      </div>
      <SidebarCategories categories={categories} />
    </SidebarFrame>
  );
}
