import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { logoutAction } from "@/app/auth-actions";
import { AppBody, AppHeader, appShellStyles } from "@/components/shell/AppShell";
import { SearchAndNotifications } from "@/components/shell/HeaderActions";
import { Icon } from "@/components/ui/Icon";
import { homeEngagement, recentPortfolios } from "@/lib/app-data";
import { requireSession } from "@/lib/require-session";

import styles from "./page.module.css";

const CATEGORY_ICONS: Record<string, string> = {
  experience: "chat-circle-dots",
  project: "briefcase",
  education_history: "graduation-cap",
  certification_award: "certificate",
  academic_writing: "article",
  activity_leadership: "users-three",
  skill_tool: "code",
};

/** 00 영역 1 — 예시 칩 4개는 확정 문구다. */
const EXAMPLE_QUERIES = [
  "리모트 되는 데이터 엔지니어",
  "Kafka 안 쓰는 곳",
  "이번 주 마감 임박",
  "시리즈 B 이상 스타트업",
];

/**
 * 00 홈.
 *
 * 검색 바 · 예시 칩 · 내 커리어 요약은 세션만 있으면 그릴 수 있다. 추천 공고와
 * 포트폴리오 격자는 각각 API 하나를 기다린다. 그래서 기다리는 두 구획만
 * Suspense로 감싼다 — 응답 하나가 늦어도 나머지 화면은 먼저 나간다.
 *
 * 사이드바는 `layout.tsx`가 그린다. 여기서 읽는 두 응답을 사이드바도 보는데,
 * `lib/app-data`가 `cache()`로 감싸 두어 실제 호출은 각각 한 번이다.
 */
export default async function HomePage() {
  const session = await requireSession();

  const recordTotal = session.categories.reduce(
    (sum, category) => sum + category.recordCount,
    0,
  );

  return (
    <>
      <AppHeader
        title="홈"
        actions={
          <>
            <SearchAndNotifications />
            <form action={logoutAction}>
              <button
                type="submit"
                className={appShellStyles.iconButton}
                aria-label="로그아웃"
              >
                <Icon name="sign-out" size={17} />
              </button>
            </form>
          </>
        }
      />
      <AppBody>
        <div className={styles.content}>
          {/* 영역 1 — AI 검색 바 */}
          <form className={styles.searchBar} action="/jobs">
            <Icon name="sparkle" size={18} color="var(--ex-accent-text)" />
            <input
              name="q"
              className={styles.searchInput}
              placeholder='"내 파이프라인 경험을 살릴 수 있는 자리" 처럼 문장으로 물어보세요'
              aria-label="공고 검색"
            />
            <span className={styles.searchShortcut}>⌘K</span>
            <button type="submit" className={styles.searchSubmit}>
              물어보기
            </button>
          </form>

          <div className={styles.examples}>
            <span className={styles.examplesLabel}>이렇게 물어볼 수 있어요</span>
            {EXAMPLE_QUERIES.map((query) => (
              <Link
                key={query}
                href={{ pathname: "/jobs", query: { q: query } }}
                className={styles.exampleChip}
              >
                {query}
              </Link>
            ))}
            <button type="button" className={styles.savedSearches}>
              <Icon name="bell-simple" size={14} color="var(--ex-fg-muted)" />
              저장한 검색
            </button>
          </div>

          {/*
            00 빈 상태 — 기록 0건이면 추천·일치도 UI를 모두 숨기고
            대화 시작 CTA 하나만 남긴다.
          */}
          {recordTotal === 0 ? (
            <div className={styles.firstRun}>
              <p className={styles.firstRunTitle}>
                기록 3건만 있으면 추천이 시작됩니다
              </p>
              <p className={styles.firstRunBody}>
                먼저 경험 하나를 적어 두면, 공고에 맞춰 다시 골라 드립니다.
                <br />
                직접 쓰거나 바리스타에게 질문을 받아 채울 수 있습니다.
              </p>
              <Link href="/career/experience" className={styles.firstRunCta}>
                <Icon name="coffee" weight="fill" size={15} />
                경험 기록하기
              </Link>
            </div>
          ) : null}

          <Suspense fallback={<div className={styles.midRow} />}>
            <Recommended accessToken={session.accessToken} recordTotal={recordTotal} />
          </Suspense>

          <Suspense fallback={<div />}>
            <Portfolios accessToken={session.accessToken} />
          </Suspense>

          {/* 내 커리어 요약 — 추천이 시작되기 전까지 홈의 실질 내용이다 */}
          <div>
            <div className={styles.sectionHead}>
              <span className={styles.sectionTitle}>내 커리어</span>
              <span className={styles.sectionNote}>기록 {recordTotal}건</span>
              <Link href="/career/experience" className={styles.sectionLink}>
                전체 보기
              </Link>
            </div>
            <div className={styles.categoryGrid}>
              {session.categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/career/${category.key}`}
                  className={styles.categoryCard}
                >
                  <span className={styles.categoryCardIcon}>
                    <Icon
                      name={CATEGORY_ICONS[category.key] ?? "file-text"}
                      size={15}
                      color="var(--ex-fg-muted)"
                    />
                  </span>
                  <span className={styles.categoryCardName}>{category.name}</span>
                  <span className={styles.categoryCardCount}>
                    {category.recordCount}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </AppBody>
    </>
  );
}

/** 영역 2·3 — 추천 공고와 이어서 답하기. `GET /v1/home` 하나를 기다린다. */
async function Recommended({
  accessToken,
  recordTotal,
}: {
  accessToken: string;
  recordTotal: number;
}) {
  const { data: home } = await homeEngagement(accessToken);

  return (
    <>
      {/* 영역 2·3 — 지금 나에게 맞는 공고 + 이어서 답하기 */}
      {home.recommendedJobs.length > 0 || home.activeBrews.length > 0 ? (
        <div className={styles.midRow}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>지금 나에게 맞는 공고</span>
              <div className={styles.segment}>
                <button
                  type="button"
                  className={`${styles.segmentItem} ${styles.segmentItemActive}`}
                >
                  추천 {home.recommendedJobs.length}
                </button>
              </div>
              <span className={styles.cardNote}>
                기록 {recordTotal}건 기준
              </span>
              <Link href="/jobs" className={styles.cardLink}>
                전체
              </Link>
            </div>
            {home.recommendedJobs.slice(0, 3).map((job) => (
              <div key={job.id} className={styles.jobRow}>
                <span className={styles.jobInitial}>
                  {job.company.slice(0, 1)}
                </span>
                <div className={styles.jobBody}>
                  <div className={styles.jobHead}>
                    <span className={styles.jobName}>
                      {job.company} · {job.title}
                    </span>
                    <span
                      className={`${styles.jobScore} ${
                        job.score >= 85 ? styles.jobScoreHigh : ""
                      }`}
                    >
                      {job.score}
                    </span>
                  </div>
                </div>
                <button type="button" className={styles.jobCta}>
                  만들기
                </button>
              </div>
            ))}
          </div>

          <div className={styles.sideColumn}>
            {home.activeBrews.slice(0, 1).map((brew) => (
              <div key={brew.id} className={styles.plainCard}>
                <div className={styles.draftHead}>
                  <span className={styles.workingChip}>
                    <span className={`${styles.workingDot} ex-anim-pulse`} />
                    작성 중
                  </span>
                </div>
                <div className={styles.draftTitle}>진행 중인 포트폴리오</div>
                <div className={styles.draftMeta}>
                  마지막 작업{" "}
                  {new Date(brew.updatedAt).toLocaleString("ko-KR", {
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
                <button type="button" className={styles.draftCta}>
                  이어서 답하기
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** 영역 4 — 내 포트폴리오. `GET /v1/portfolios` 하나를 기다린다. */
async function Portfolios({ accessToken }: { accessToken: string }) {
  const portfolioList = await recentPortfolios(accessToken);

  return (
    <>
      {/* 영역 4 — 내 포트폴리오 */}
      <div>
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle}>내 포트폴리오</span>
          <span className={styles.sectionNote}>
            {portfolioList.data.length === 0
              ? "아직 없습니다"
              : `배포된 사이트 ${
                  portfolioList.data.filter((item) => item.deployment).length
                }개`}
          </span>
          {portfolioList.page.hasNextPage ? (
            <Link href="/home" className={styles.sectionLink}>
              전체 보기
            </Link>
          ) : null}
        </div>
        <div className={styles.portfolioGrid}>
          {portfolioList.data.map((portfolio) => (
            <Link
              key={portfolio.id}
              href={`/edit/${portfolio.id}` as Route}
              className={styles.categoryCard}
              style={{ alignItems: "flex-start", flexDirection: "column", gap: "6px" }}
            >
              <span className={styles.categoryCardName}>{portfolio.title}</span>
              <span className={styles.sectionNote}>
                {portfolio.deployment
                  ? `${portfolio.deployment.subdomain}.xpresso.me · v${portfolio.deployment.version}`
                  : `초안 · 섹션 ${portfolio.sectionCount}개`}
              </span>
              <span className={styles.sectionNote}>
                마지막 편집{" "}
                {new Date(portfolio.updatedAt).toLocaleString("ko-KR", {
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </Link>
          ))}
          <Link href="/brew/new" className={styles.newPortfolio}>
            <span className={styles.newPortfolioIcon}>
              <Icon name="plus" size={18} color="var(--ex-accent-text)" />
            </span>
            <span>
              <span className={styles.newPortfolioTitle}>새 포트폴리오</span>
              <span className={styles.newPortfolioBody}>
                공고를 붙여넣으면 그 기업에
                <br />
                맞춰 기록을 다시 고릅니다
              </span>
            </span>
          </Link>
        </div>
      </div>
    </>
  );
}
