import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { WizardSteps } from "@/components/shell/WizardShell";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Icon } from "@/components/ui/Icon";
import { jobs } from "@/lib/api/endpoints";
import { homeEngagement } from "@/lib/app-data";
import { requireSession } from "@/lib/require-session";

import { analyzePostingAction } from "./new-brew-actions";
import { CompanyUrlForm, FreeBrewForm, PastePostingForm } from "./NewBrewForms";
import { resumeStep } from "./resume-step";
import styles from "./page.module.css";

/**
 * 01 어디에 지원하나요 — 제작의 입구.
 *
 * 여기서 갈리는 것은 **무엇을 겨냥하는가**다. 겨냥할 것이 정해져야 재료 순위를
 * 매길 기준이 생기고, 그래야 아래 단계가 전부 의미를 갖는다.
 *
 * 네 갈래를 첫 화면에 그대로 편다. 하나를 미리 골라 두면 나머지 셋은 사실상
 * 없는 길이 된다 — 붙여넣기가 기본으로 펴져 있으면 목록에 이미 165건이 모여
 * 있다는 것을 아무도 모른다.
 *
 * 위저드 단계 줄은 여기서부터 선다 — 갈래를 고르는 일이 곧 01 공고 분석의
 * 입력이다. 아직 브루가 없으니 되돌아갈 링크는 없다.
 */

type Mode = "list" | "paste" | "company" | "free";

const MODES: {
  key: Mode;
  label: string;
  icon: string;
  lede: string;
  /** 이 갈래를 고르면 지나는 길. 카드 발치에 화살표로 잇는다. */
  path: string[];
}[] = [
  {
    key: "list",
    label: "Expresso 공고 목록에서 찾기",
    icon: "target",
    lede: "우리가 모아 둔 공고에서 고릅니다. 고르면 바로 요건을 뽑습니다.",
    path: ["공고 고르기", "요건 분석", "재료 순위"],
  },
  {
    key: "paste",
    label: "공고 내용 붙여넣기",
    icon: "clipboard-text",
    lede: "보고 있는 공고를 그대로 붙여넣습니다. 목록에 없는 곳도 됩니다.",
    path: ["붙여넣기", "요건 분석", "재료 순위"],
  },
  {
    key: "company",
    label: "기업 URL로 생성",
    icon: "globe",
    lede: "회사 홈페이지 주소로 그 회사를 읽고 채용 중인 자리를 찾습니다.",
    path: ["주소 읽기", "요건 분석", "재료 순위"],
  },
  {
    key: "free",
    label: "자유 생성",
    icon: "sparkle",
    lede: "공고 없이, 하고 싶은 말을 적어 포트폴리오를 만듭니다.",
    path: ["설명 적기", "분석 없이 레시피", "바로 초안"],
  },
];

const PAGE_SIZE = 20;

function isMode(value: string | undefined): value is Mode {
  return MODES.some((mode) => mode.key === value);
}

export default async function NewBrewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; q?: string; page?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const mode = isMode(params.mode) ? params.mode : null;
  const query = params.q?.trim() ?? "";
  const page = Number.parseInt(params.page ?? "1", 10) || 1;

  const recordTotal = session.categories.reduce(
    (sum, category) => sum + category.recordCount,
    0,
  );

  return (
    <>
      <AppHeader title="새 포트폴리오" />
      <WizardSteps current="analyze" situation="예상 3분" />
      <AppBody>
        <div className={styles.page}>
          <div className={styles.head}>
            <h1 className={styles.title}>어디에 지원하나요</h1>
            {mode ? <ModeTabs current={mode} /> : null}
          </div>

          {mode === null ? (
            <ModeHome
              accessToken={session.accessToken}
              categories={session.categories}
              recordTotal={recordTotal}
            />
          ) : null}
          {mode === "list" ? <PostingPicker query={query} page={page} /> : null}
          {mode === "paste" ? <PastePostingForm /> : null}
          {mode === "company" ? <CompanyUrlForm /> : null}
          {mode === "free" ? <FreeBrewForm /> : null}
        </div>
      </AppBody>
    </>
  );
}

/**
 * 첫 선택 화면.
 *
 * 카드 넷이 전부였을 때 이 화면은 비어 보였고, 고른 다음에 무슨 일이 벌어지는지
 * 아무 데도 적혀 있지 않았다. 지금은 세 층이다 — 만들던 것(있으면), 네 갈래,
 * 그리고 고르기 전에 바로 쓸 수 있는 것들(추천 공고 · 내 재료).
 */
function ModeHome({
  accessToken,
  categories,
  recordTotal,
}: {
  accessToken: string;
  categories: Awaited<ReturnType<typeof requireSession>>["categories"];
  recordTotal: number;
}) {
  return (
    <>
      <p className={styles.lede}>
        겨냥할 자리를 먼저 정합니다. 그 자리가 요구하는 것을 기준으로 내 기록의
        순위가 매겨집니다.
      </p>

      <Suspense fallback={null}>
        <ResumeBanner accessToken={accessToken} />
      </Suspense>

      <ModeCards />

      <div className={styles.below}>
        <Suspense fallback={null}>
          <QuickStart accessToken={accessToken} recordTotal={recordTotal} />
        </Suspense>
        <MaterialsPanel categories={categories} recordTotal={recordTotal} />
      </div>
    </>
  );
}

/** 첫 선택. 넷을 나란히 펴 놓고 고르게 한다. */
function ModeCards() {
  return (
    <div className={styles.cards}>
      {MODES.map((mode) => (
        <Link
          key={mode.key}
          href={`/brew/new?mode=${mode.key}` as Route}
          className={styles.card}
        >
          <span className={styles.cardIcon}>
            <Icon name={mode.icon} size={17} color="var(--ex-accent-text)" />
          </span>
          <span className={styles.cardLabel}>{mode.label}</span>
          <span className={styles.cardLede}>{mode.lede}</span>
          <span className={styles.cardPath}>
            {mode.path.map((stop, index) => (
              <span key={stop} style={{ display: "contents" }}>
                {index > 0 ? (
                  <Icon name="caret-right" size={9} color="var(--ex-fg-subtle)" />
                ) : null}
                <span className={styles.cardStop}>{stop}</span>
              </span>
            ))}
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * 만들다 만 포트폴리오가 있으면 새로 시작하는 것보다 먼저 보여야 한다 —
 * 추출 횟수는 달마다 세고, 같은 공고로 두 번 만드는 것이 가장 흔한 낭비다.
 */
async function ResumeBanner({ accessToken }: { accessToken: string }) {
  const { data: home } = await homeEngagement(accessToken);
  const brew = home.activeBrews[0];
  if (!brew) return null;

  const step = resumeStep(brew.status);
  return (
    <Link
      href={`/brew/${brew.id}/${step.segment}` as Route}
      className={styles.resume}
    >
      <span className={`${styles.resumeDot} ex-anim-pulse`} aria-hidden="true" />
      <span className={styles.resumeText}>
        만들던 포트폴리오가 <b>{step.label}</b> 단계에 멈춰 있습니다
      </span>
      <span className={styles.resumeTime}>
        마지막 작업{" "}
        {new Date(brew.updatedAt).toLocaleString("ko-KR", {
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>
      <span className={styles.resumeGo}>이어서 만들기</span>
    </Link>
  );
}

/**
 * 추천 공고로 바로 시작.
 *
 * 일치도는 이미 매겨져 있다(`match_score`) — 여기서 한 번 누르면 곧장 분석으로
 * 간다. 점수가 없는 사람(기록 없음)에게는 이 구획이 서지 않고, 재료 패널이
 * 그 이유를 말한다.
 */
async function QuickStart({
  accessToken,
  recordTotal,
}: {
  accessToken: string;
  recordTotal: number;
}) {
  const { data: home } = await homeEngagement(accessToken);
  if (home.recommendedJobs.length === 0) return null;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>바로 시작</span>
        <span className={styles.panelNote}>기록 {recordTotal}건 기준 일치도</span>
        <Link href="/jobs" className={styles.panelLink}>
          공고 전체
        </Link>
      </div>
      <div className={styles.quickRows}>
        {home.recommendedJobs.slice(0, 3).map((job) => (
          <form action={analyzePostingAction} className={styles.quickRow} key={job.id}>
            <input type="hidden" name="jobPostingId" value={job.id} />
            <CompanyAvatar
              company={{ name: job.company, logoUrl: job.companyLogoUrl }}
              className={styles.quickAvatar}
            />
            <span className={styles.quickMain}>
              <span className={styles.quickRole}>{job.title}</span>
              <span className={styles.quickCompany}>{job.company}</span>
            </span>
            <span
              className={`${styles.quickScore} ${job.score >= 85 ? styles.quickScoreHigh : ""}`}
            >
              {job.score}
            </span>
            <button type="submit" className={styles.rowGo}>
              이 공고로
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}

/**
 * 내 재료 현황 — 02 재료 고르기에서 순위가 매겨질 것들.
 *
 * 기록이 없으면 이 화면의 약속("내 기록의 순위가 매겨집니다")이 빈말이 된다.
 * 그 사실을 시작하기 전에 말해 준다.
 */
function MaterialsPanel({
  categories,
  recordTotal,
}: {
  categories: Awaited<ReturnType<typeof requireSession>>["categories"];
  recordTotal: number;
}) {
  return (
    <aside className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>내 재료</span>
        <span className={styles.panelNote}>기록 {recordTotal}건</span>
        <Link href="/career/experience" className={styles.panelLink}>
          기록 관리
        </Link>
      </div>
      {recordTotal === 0 ? (
        <div className={styles.materialsEmpty}>
          <p className={styles.materialsEmptyText}>
            아직 기록이 없습니다. 기록 없이도 만들 수는 있지만, 경험 하나만
            적어 두면 2단계 재료 고르기부터 공고에 맞춰 골라 드립니다.
          </p>
          <Link href="/career/experience" className={styles.materialsCta}>
            <Icon name="coffee" weight="fill" size={13} />
            경험 기록하기
          </Link>
        </div>
      ) : (
        <ul className={styles.materialsList}>
          {categories
            .filter((category) => category.recordCount > 0)
            .map((category) => (
              <li key={category.id}>
                <Link
                  href={`/career/${category.key}`}
                  className={styles.materialsChip}
                >
                  {category.name}
                  <span className={styles.materialsCount}>
                    {category.recordCount}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </aside>
  );
}

/** 고르고 난 뒤의 세그먼트. 다른 갈래로 갈아탈 수 있어야 한다. */
function ModeTabs({ current }: { current: Mode }) {
  return (
    <div className={styles.tabs}>
      {MODES.map((mode) => (
        <Link
          key={mode.key}
          href={`/brew/new?mode=${mode.key}` as Route}
          className={mode.key === current ? styles.tabOn : styles.tab}
        >
          {mode.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * 모아 둔 공고에서 고른다.
 *
 * 정렬은 최근 순이다 — 일치도 순이 더 낫지만 일치도는 요건을 뽑은 공고에서만
 * 나오고, 모아 온 공고는 아직 요건이 없다. 없는 기준으로 줄 세우는 대신
 * 들어온 순서로 둔다.
 */
async function PostingPicker({ query, page }: { query: string; page: number }) {
  const session = await requireSession();
  const result = await jobs.postings(session.accessToken, {
    ...(query ? { q: query } : {}),
    sort: "recent",
    page,
    limit: PAGE_SIZE,
  });

  const href = (next: number) =>
    `/brew/new?mode=list${query ? `&q=${encodeURIComponent(query)}` : ""}&page=${next}` as Route;

  return (
    <>
      <form className={styles.search} method="get">
        <input type="hidden" name="mode" value="list" />
        <Icon name="magnifying-glass" size={15} color="var(--ex-fg-muted)" />
        <input
          className={styles.searchInput}
          name="q"
          defaultValue={query}
          placeholder="회사 · 직무로 좁히기"
          aria-label="공고 검색"
        />
        <button type="submit" className={styles.searchGo}>찾기</button>
      </form>

      <div className={styles.count}>
        {query ? `"${query}" ` : ""}
        공고 {result.summary.total}건
      </div>

      {result.data.length === 0 ? (
        <p className={styles.empty}>
          {query
            ? "이 말로는 찾지 못했습니다. 다른 말로 찾거나 공고를 직접 붙여넣어 주세요."
            : "아직 모아 둔 공고가 없습니다. 공고를 직접 붙여넣어 주세요."}
        </p>
      ) : (
        <ul className={styles.rows}>
          {result.data.map((job) => (
            <li key={job.id}>
              <form action={analyzePostingAction} className={styles.row}>
                <input type="hidden" name="jobPostingId" value={job.id} />
                <span className={styles.rowMain}>
                  <span className={styles.rowRole}>{job.title}</span>
                  <span className={styles.rowCompany}>
                    {[job.company.name, job.location, job.experienceLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {job.family ? <span className={styles.rowFamily}>{job.family}</span> : null}
                <button type="submit" className={styles.rowGo}>
                  이 공고로
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {result.page.totalPages > 1 ? (
        <div className={styles.pager}>
          {result.page.hasPrevPage ? (
            <Link href={href(page - 1)} className={styles.pagerLink}>이전</Link>
          ) : null}
          <span className={styles.pagerAt}>
            {result.page.page} / {result.page.totalPages}
          </span>
          {result.page.hasNextPage ? (
            <Link href={href(page + 1)} className={styles.pagerLink}>다음</Link>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
