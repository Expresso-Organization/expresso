import type { CareerCategory } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";

import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import styles from "./Sidebar.module.css";

export type SidebarSection =
  | "home"
  | "new-portfolio"
  | "jobs"
  | "analytics"
  | "career";

/** §3.5 카테고리 7종의 아이콘은 고정 매핑이다. 다른 아이콘으로 대체하지 않는다. */
const CATEGORY_ICONS: Record<string, string> = {
  experience: "chat-circle-dots",
  project: "briefcase",
  education_history: "graduation-cap",
  certification_award: "certificate",
  academic_writing: "article",
  activity_leadership: "users-three",
  skill_tool: "code",
};

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
  active: SidebarSection;
  activeCategoryKey?: string | undefined;
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
  active,
  activeCategoryKey,
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
    <aside className={styles.sidebar}>
      <div className={styles.scroll}>
        <div className={styles.brand}>
          <LogoMark size={22} />
          <span className={styles.brandName}>
            <Wordmark />
          </span>
          <Icon name="caret-up-down" size={13} color="var(--ex-slate-500)" />
        </div>

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
                color={
                  active === item.key ? "var(--ex-ink-900)" : "var(--ex-slate-500)"
                }
              />
              <span className={styles.primaryLabel}>{item.label}</span>
              {item.key === "jobs" && jobCount !== undefined ? (
                <span className={styles.primaryCount}>{jobCount}</span>
              ) : null}
            </Link>
          ))}
        </nav>

        {portfolios.length > 0 ? (
          <>
            <div className={`${styles.groupHead} ${styles.groupHeadFirst}`}>
              <span className={styles.groupLabel}>내 포트폴리오</span>
              <div className={styles.groupActions}>
                <span className={styles.groupCount}>{portfolios.length}</span>
                <button type="button" className={styles.groupAction} aria-label="포트폴리오 추가">
                  <Icon name="plus" size={13} />
                </button>
              </div>
            </div>
            <div className={styles.portfolios}>
              {portfolios.map((portfolio) => (
                <div key={portfolio.id} className={styles.portfolioItem}>
                  <span className={styles.thumb}>
                    <span
                      className={`${styles.thumbDot} ${
                        portfolio.status === "published"
                          ? styles.thumbDotPublished
                          : styles.thumbDotDraft
                      }`}
                    />
                  </span>
                  <div className={styles.portfolioBody}>
                    <div className={styles.portfolioName}>{portfolio.name}</div>
                    <div className={styles.portfolioMeta}>{portfolio.meta}</div>
                  </div>
                  {portfolio.status === "draft" ? (
                    <span className={styles.draftChip}>초안</span>
                  ) : (
                    <div className={styles.portfolioStat}>
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
            </div>
          </>
        ) : null}

        {interests.length > 0 ? (
          <>
            <div className={styles.groupHead}>
              <span className={styles.groupLabel}>관심 공고</span>
              <div className={styles.groupActions}>
                <span className={styles.groupCount}>{interests.length}</span>
                <button type="button" className={styles.groupAction} aria-label="관심 공고 추가">
                  <Icon name="plus" size={13} />
                </button>
              </div>
            </div>
            <div className={styles.interests}>
              {interests.map((interest) => (
                <div key={interest.id} className={styles.interestItem}>
                  <CompanyAvatar
                    company={{
                      name: interest.company,
                      initial: interest.initial,
                      logoUrl: interest.logoUrl,
                    }}
                    className={styles.initial}
                  />
                  <span className={styles.interestName}>{interest.label}</span>
                  {interest.score === null ? (
                    <span className={styles.pending}>분석 대기</span>
                  ) : (
                    <span
                      className={`${styles.score} ${
                        interest.score >= 85 ? styles.scoreHigh : styles.scoreMid
                      }`}
                    >
                      {interest.score}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : null}

        <div className={styles.groupHead}>
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
        <div className={styles.categories}>
          {categories.map((category) => {
            const isActive =
              active === "career" && activeCategoryKey === category.key;
            return (
              <Link
                key={category.id}
                href={`/career/${category.key}` as Route}
                className={`${styles.categoryItem} ${
                  isActive ? styles.categoryItemActive : ""
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon name="caret-right" size={10} color="var(--ex-border-strong)" />
                <Icon
                  name={CATEGORY_ICONS[category.key] ?? "file-text"}
                  weight={isActive ? "fill" : "regular"}
                  size={14}
                  color={isActive ? "var(--ex-ink-900)" : "var(--ex-slate-500)"}
                />
                <span className={styles.categoryName}>{category.name}</span>
                <span className={styles.categoryCount}>{category.recordCount}</span>
                <Icon name="plus" size={11} color="var(--ex-border-strong)" />
              </Link>
            );
          })}
          <div className={styles.addCategory}>
            <Icon name="plus" size={13} color="var(--ex-slate-500)" />
            <span className={styles.addCategoryLabel}>카테고리 추가</span>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.quotaCard}>
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
        <div className={styles.user}>
          <span className={styles.avatar}>{displayName.slice(0, 1)}</span>
          <span className={styles.userName}>{displayName}</span>
          <Link href="/account" className={styles.userAction} aria-label="설정">
            <Icon name="gear-six" size={14} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
