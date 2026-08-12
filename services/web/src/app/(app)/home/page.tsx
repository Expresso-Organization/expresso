import type { Route } from "next";
import Link from "next/link";

import { logoutAction } from "@/app/auth-actions";
import { AppHeader, AppShell, appShellStyles } from "@/components/shell/AppShell";
import { SearchAndNotifications } from "@/components/shell/HeaderActions";
import { Sidebar } from "@/components/shell/Sidebar";
import { Icon } from "@/components/ui/Icon";
import { engagement, portfolios as portfolioApi } from "@/lib/api/endpoints";
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

export default async function HomePage() {
  const session = await requireSession();
  const [{ data: home }, portfolioList] = await Promise.all([
    engagement.home(session.accessToken),
    portfolioApi.list(session.accessToken, { limit: 5 }),
  ]);

  const recordTotal = session.categories.reduce(
    (sum, category) => sum + category.recordCount,
    0,
  );

  return (
    <AppShell
      sidebar={
        <Sidebar
          active="home"
          categories={session.categories}
          portfolios={portfolioList.data.map((portfolio) => ({
            id: portfolio.id,
            name: portfolio.title,
            // 배포된 것은 주소를, 작성 중인 것은 진행 상황을 보여준다.
            meta: portfolio.deployment
              ? `${portfolio.deployment.subdomain}.xpresso.me`
              : `작성 중 · 섹션 ${portfolio.sectionCount}개`,
            status: portfolio.deployment ? "published" : "draft",
            ...(portfolio.deployment
              ? { delta: `v${portfolio.deployment.version}`, deltaTone: "quiet" as const }
              : {}),
          }))}
          interests={home.recommendedJobs.map((job) => ({
            id: job.id,
            initial: job.company.slice(0, 1),
            company: job.company,
            logoUrl: job.companyLogoUrl,
            label: `${job.company} · ${job.title}`,
            score: job.score,
          }))}
          jobCount={
            home.recommendedJobs.length > 0
              ? home.recommendedJobs.length
              : undefined
          }
          displayName={session.user.displayName}
          quotaUsed={session.quota.used}
          quotaLimit={session.quota.limit}
        />
      }
      header={
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
      }
    >
      <div className={styles.content}>
        {/* 영역 1 — AI 검색 바 */}
        <form className={styles.searchBar} action="/jobs">
          <Icon name="sparkle" size={18} color="var(--ex-espresso)" />
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
            <Icon name="bell-simple" size={14} color="var(--ex-slate-500)" />
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
                <Icon name="plus" size={18} color="var(--ex-espresso)" />
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
                    color="var(--ex-slate-500)"
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
    </AppShell>
  );
}
