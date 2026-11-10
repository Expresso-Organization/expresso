import type { Route } from "next";
import Link from "next/link";

import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { WizardSteps } from "@/components/shell/WizardShell";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Icon } from "@/components/ui/Icon";
import { jobs } from "@/lib/api/endpoints";
import { homeEngagement, watchedJobs } from "@/lib/app-data";
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
 * 화면 정의서 01의 위계를 따른다 — 공고가 주인공이고, 붙여넣기 · 주소 · 목표
 * 없이는 곁의 갈래다. 그래서 첫 화면은 공고를 찾는 칸과 저장해 둔 공고로
 * 시작하고, 목록에 없는 공고를 다루는 갈래는 옆 칸에 작게 둔다.
 *
 * 위저드 단계 줄은 여기서부터 선다 — 갈래를 고르는 일이 곧 01 공고 분석의
 * 입력이다. 아직 브루가 없으니 되돌아갈 링크는 없다.
 */

type Mode = "list" | "paste" | "company" | "free";

const MODES: {
  key: Mode;
  /** 고른 뒤 탭에 서는 짧은 이름. 정의서 01의 세그먼트 칩과 같은 길이다. */
  label: string;
  icon: string;
  /** 첫 화면 옆 칸 줄의 이름과 한 줄 설명. 목록은 검색 칸이 대신하므로 비운다. */
  title: string;
  lede: string;
}[] = [
  {
    key: "list",
    label: "공고 목록",
    icon: "target",
    title: "공고 목록에서 찾기",
    lede: "",
  },
  {
    key: "paste",
    label: "공고 붙여넣기",
    icon: "clipboard-text",
    title: "공고 내용 붙여넣기",
    lede: "목록에 없는 공고도 원문으로 분석합니다.",
  },
  {
    key: "company",
    label: "공고 주소",
    icon: "globe",
    title: "공고 주소로 읽기",
    lede: "채용 공고 페이지 주소를 넣으면 내용을 읽어 옵니다.",
  },
  {
    key: "free",
    label: "목표 없이",
    icon: "sparkle",
    title: "공고 없이 만들기",
    lede: "담고 싶은 내용을 적어 바로 초안을 만듭니다.",
  },
];

const PAGE_SIZE = 20;
/** 첫 화면 최신 공고 줄 수. 옆 칸(갈래 · 내 기록)과 높이가 비슷해지는 만큼이다. */
const RECENT_LIMIT = 6;

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
            <ModeHome session={session} recordTotal={recordTotal} />
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

type Session = Awaited<ReturnType<typeof requireSession>>;
type Home = Awaited<ReturnType<typeof homeEngagement>>["data"];

/** 공고 칸의 한 줄. 관심 공고와 추천 공고를 같은 모양으로 그린다. */
type JobRow = {
  id: string;
  title: string;
  company: { name: string; logoUrl: string | null };
  /** 마감(관심) 또는 일치도(추천). */
  meta: string | null;
  metaTone: "plain" | "strong" | "muted";
  /** 이 공고로 시작한 제작이 진행 중이면 그 단계로 가는 길. */
  resume: { href: Route; label: string } | null;
};

/**
 * 첫 선택 화면.
 *
 * 세 층이다 — 만들던 것(있으면), 공고를 찾는 칸, 그리고 바로 시작할 공고 줄과
 * 목록에 없는 공고를 다루는 갈래. 공고 줄은 관심(없으면 추천) 공고와 최신 공고
 * 두 묶음이고, 최신 공고는 모아 둔 공고가 있으면 늘 선다 — 저장해 둔 것도 추천도
 * 없는 사람이 첫 화면에서 고를 공고가 없어지지 않게 한다. 공고 줄의 유무로 격자가
 * 바뀌므로 데이터를 여기서 기다려 서버에서 배치를 정한다. `homeEngagement` ·
 * `watchedJobs`는 사이드바와 같은 요청을 공유한다(cache).
 */
async function ModeHome({ session, recordTotal }: { session: Session; recordTotal: number }) {
  const [{ data: home }, watched, recent] = await Promise.all([
    homeEngagement(session.accessToken),
    watchedJobs(session.accessToken),
    jobs.postings(session.accessToken, { sort: "recent", limit: RECENT_LIMIT }),
  ]);

  const pinned = pickJobsPanel(home, watched, recordTotal);
  // 위 묶음에 이미 선 공고는 최신 공고에서 빼 같은 줄이 두 번 서지 않게 한다.
  const shown = new Set(pinned?.rows.map((row) => row.id) ?? []);
  const recentRows = recent.data.filter((job) => !shown.has(job.id)).map(postingRow);
  const panels = [
    ...(pinned ? [pinned] : []),
    ...(recentRows.length > 0
      ? [{ title: "최신 공고", note: "들어온 순", href: "/brew/new?mode=list" as Route, rows: recentRows }]
      : []),
  ];
  const activeBrew = home.activeBrews[0];

  return (
    <>
      {activeBrew ? <ResumeBanner brew={activeBrew} /> : null}

      <EntrySearch total={recent.summary.total} />

      <div className={panels.length > 0 ? styles.split : styles.splitSolo}>
        {panels.length > 0 ? (
          <div className={styles.main}>
            {panels.map((panel) => (
              <JobsPanel key={panel.title} {...panel} />
            ))}
          </div>
        ) : null}
        <div className={styles.side}>
          <OtherRoutes />
          <MaterialsPanel categories={session.categories} recordTotal={recordTotal} />
        </div>
      </div>
    </>
  );
}

/**
 * 위 묶음의 출처. 관심 공고는 지원하려고 골라 둔 것이라 추천보다 앞선다.
 * 둘 다 없으면 이 묶음은 서지 않고 최신 공고만 선다.
 */
function pickJobsPanel(
  home: Home,
  watched: Awaited<ReturnType<typeof watchedJobs>>,
  recordTotal: number,
): { title: string; note: string; href: Route; rows: JobRow[] } | null {
  const saved = watched.data.filter((job) => job.interest?.stage !== "closed");
  if (saved.length > 0) {
    return {
      title: "관심 공고",
      note: "마감 순",
      href: "/jobs?interested=true" as Route,
      rows: saved.map(postingRow),
    };
  }

  if (home.recommendedJobs.length > 0) {
    return {
      title: "추천 공고",
      href: "/jobs" as Route,
      note: `기록 ${recordTotal}건 기준 일치도`,
      rows: home.recommendedJobs.slice(0, 5).map((job) => ({
        id: job.id,
        title: job.title,
        company: { name: job.company, logoUrl: job.companyLogoUrl },
        meta: String(job.score),
        metaTone: job.score >= 85 ? "strong" : "plain",
        resume: null,
      })),
    };
  }

  return null;
}

/** 모아 둔 공고 한 건을 공고 줄로. 진행 중인 제작이 있으면 새로 만들기 대신 그리로 보낸다. */
function postingRow(job: Awaited<ReturnType<typeof jobs.postings>>["data"][number]): JobRow {
  return {
    id: job.id,
    title: job.title,
    company: { name: job.company.name, logoUrl: job.company.logoUrl },
    ...deadlineMeta(job.daysLeft, job.deadlineNote),
    resume:
      job.brew && job.brew.status !== "done"
        ? {
            href: `/brew/${job.brew.id}/${resumeStep(job.brew.status).segment}` as Route,
            label: "이어서 만들기",
          }
        : null,
  };
}

/** 마감까지 남은 날을 줄 끝 표시로. 일주일 안이면 진하게, 지났으면 흐리게. */
function deadlineMeta(
  daysLeft: number | null,
  note: string | null,
): Pick<JobRow, "meta" | "metaTone"> {
  if (daysLeft === null) return { meta: note, metaTone: "muted" };
  if (daysLeft < 0) return { meta: "마감", metaTone: "muted" };
  if (daysLeft === 0) return { meta: "오늘 마감", metaTone: "strong" };
  return { meta: `D-${daysLeft}`, metaTone: daysLeft <= 7 ? "strong" : "plain" };
}

/** 공고를 찾는 칸. 넣은 말로 좁힌 공고 목록(`mode=list`)을 연다. */
function EntrySearch({ total }: { total: number }) {
  return (
    <form className={styles.entrySearch} method="get" role="search">
      <input type="hidden" name="mode" value="list" />
      <Icon name="magnifying-glass" size={18} color="var(--ex-fg-muted)" />
      <input
        className={styles.entryInput}
        name="q"
        placeholder="회사 · 직무로 찾기"
        aria-label="공고 검색"
        autoComplete="off"
      />
      <span className={styles.entryCount}>공고 {total.toLocaleString("ko-KR")}건</span>
      <button type="submit" className={styles.entryGo}>
        찾기
      </button>
    </form>
  );
}

/** 바로 시작할 공고 줄. 한 번 누르면 공고 분석으로 간다. */
function JobsPanel({
  title,
  note,
  href,
  rows,
}: {
  title: string;
  note: string;
  href: Route;
  rows: JobRow[];
}) {
  return (
    <section className={styles.panel} aria-label={title}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>{title}</span>
        <span className={styles.panelNote}>{note}</span>
        <Link href={href} className={styles.panelLink}>
          전체 보기
        </Link>
      </div>
      <ul className={styles.jobRows}>
        {rows.map((job) => (
          <li key={job.id}>
            <form action={analyzePostingAction} className={styles.jobRow}>
              <input type="hidden" name="jobPostingId" value={job.id} />
              <CompanyAvatar company={job.company} className={styles.quickAvatar} />
              <span className={styles.quickMain}>
                <span className={styles.quickRole}>{job.title}</span>
                <span className={styles.quickCompany}>{job.company.name}</span>
              </span>
              {job.meta ? (
                <span className={`${styles.jobMeta} ${styles[`jobMeta_${job.metaTone}`]}`}>
                  {job.meta}
                </span>
              ) : null}
              {job.resume ? (
                <Link href={job.resume.href} className={styles.jobResume}>
                  {job.resume.label}
                </Link>
              ) : (
                <button type="submit" className={styles.jobGo}>
                  이 공고로
                </button>
              )}
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 목록에 없는 공고를 다루는 갈래. 공고 없이 만들기는 공고가 없는 길이라 따로 떨어뜨린다. */
function OtherRoutes() {
  const withPosting = MODES.filter((mode) => mode.key === "paste" || mode.key === "company");
  const free = MODES.find((mode) => mode.key === "free");
  return (
    <nav className={styles.routes} aria-label="다른 방법으로 시작">
      {withPosting.map((mode) => (
        <RouteLink key={mode.key} mode={mode} />
      ))}
      {free ? (
        <div className={styles.routesApart}>
          <RouteLink mode={free} />
        </div>
      ) : null}
    </nav>
  );
}

function RouteLink({ mode }: { mode: (typeof MODES)[number] }) {
  return (
    <Link href={`/brew/new?mode=${mode.key}` as Route} className={styles.route}>
      <span className={styles.routeIcon}>
        <Icon name={mode.icon} size={16} color="var(--ex-accent-text)" />
      </span>
      <span className={styles.routeMain}>
        <span className={styles.routeTitle}>{mode.title}</span>
        <span className={styles.routeLede}>{mode.lede}</span>
      </span>
      <Icon name="caret-right" size={12} color="var(--ex-fg-subtle)" />
    </Link>
  );
}

/**
 * 만들다 만 포트폴리오가 있으면 새로 시작하는 것보다 먼저 보여야 한다 —
 * 크레딧은 달마다 세고, 같은 공고로 두 번 만드는 것이 가장 흔한 낭비다.
 */
function ResumeBanner({ brew }: { brew: Home["activeBrews"][number] }) {
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
 * 내 기록 현황 — 02 재료 고르기에서 순위가 매겨질 것들.
 *
 * 기록이 없으면 이 화면의 약속("내 기록의 순위가 매겨집니다")이 빈말이 된다.
 * 그 사실을 시작하기 전에 말해 준다.
 */
function MaterialsPanel({
  categories,
  recordTotal,
}: {
  categories: Session["categories"];
  recordTotal: number;
}) {
  return (
    <aside className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>내 기록</span>
        <span className={styles.panelNote}>기록 {recordTotal}건</span>
        <Link href="/career/experience" className={styles.panelLink}>
          기록 관리
        </Link>
      </div>
      {recordTotal === 0 ? (
        <div className={styles.materialsEmpty}>
          <p className={styles.materialsEmptyText}>
            아직 기록이 없습니다. 기록 없이도 만들 수는 있지만, 경험 하나만
            적어 두면 2단계 기록 선택부터 공고에 맞춰 골라 드립니다.
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
