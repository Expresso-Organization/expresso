import type { Route } from "next";
import Link from "next/link";

import { AppHeader, AppShell } from "@/components/shell/AppShell";
import { Sidebar } from "@/components/shell/Sidebar";
import { Icon } from "@/components/ui/Icon";
import { jobs } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { analyzePostingAction } from "./new-brew-actions";
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
 */

type Mode = "list" | "paste" | "company" | "free";

const MODES: { key: Mode; label: string; icon: string; lede: string }[] = [
  {
    key: "list",
    label: "Expresso 공고 목록에서 찾기",
    icon: "target",
    lede: "우리가 모아 둔 공고에서 고릅니다. 고르면 바로 요건을 뽑습니다.",
  },
  {
    key: "paste",
    label: "공고 내용 붙여넣기",
    icon: "clipboard-text",
    lede: "보고 있는 공고를 그대로 붙여넣습니다. 목록에 없는 곳도 됩니다.",
  },
  {
    key: "company",
    label: "기업 URL로 생성",
    icon: "globe",
    lede: "회사 홈페이지 주소로 그 회사를 읽고 채용 중인 자리를 찾습니다.",
  },
  {
    key: "free",
    label: "자유 생성",
    icon: "sparkle",
    lede: "공고 없이, 하고 싶은 말을 적어 포트폴리오를 만듭니다.",
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

  return (
    <AppShell
      sidebar={
        <Sidebar
          active="new-portfolio"
          categories={session.categories}
          displayName={session.user.displayName}
          quotaUsed={session.quota.used}
          quotaLimit={session.quota.limit}
        />
      }
      header={<AppHeader title="새 포트폴리오" />}
    >
      <div className={styles.page}>
        <div className={styles.head}>
          <h1 className={styles.title}>어디에 지원하나요</h1>
          {mode ? <ModeTabs current={mode} /> : null}
        </div>

        {mode === null ? <ModeCards /> : null}
        {mode === "list" ? <PostingPicker query={query} page={page} /> : null}
        {mode === "paste" ? <NotBuilt mode="paste" /> : null}
        {mode === "company" ? <NotBuilt mode="company" /> : null}
        {mode === "free" ? <NotBuilt mode="free" /> : null}
      </div>
    </AppShell>
  );
}

/** 첫 선택. 넷을 나란히 펴 놓고 고르게 한다. */
function ModeCards() {
  return (
    <>
      <p className={styles.lede}>
        겨냥할 자리를 먼저 정합니다. 그 자리가 요구하는 것을 기준으로 내 기록의
        순위가 매겨집니다.
      </p>
      <div className={styles.cards}>
        {MODES.map((mode) => (
          <Link
            key={mode.key}
            href={`/brew/new?mode=${mode.key}` as Route}
            className={styles.card}
          >
            <span className={styles.cardIcon}>
              <Icon name={mode.icon} size={17} color="var(--ex-espresso)" />
            </span>
            <span className={styles.cardLabel}>{mode.label}</span>
            <span className={styles.cardLede}>{mode.lede}</span>
          </Link>
        ))}
      </div>
    </>
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
        <Icon name="magnifying-glass" size={15} color="var(--ex-slate-500)" />
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

/**
 * 아직 짓지 않은 갈래.
 *
 * 빈 칸이 누구 사정인지 밝힌다 — 공고가 없어서가 아니라 **우리가 아직 이 길을
 * 놓지 않았다.** 그러니 대신 갈 수 있는 길을 함께 준다.
 */
function NotBuilt({ mode }: { mode: Mode }) {
  const reason: Record<string, string> = {
    paste:
      "붙여넣기 화면은 아직 짓지 않았습니다. 서버는 이미 받을 준비가 되어 있습니다.",
    company:
      "회사 홈페이지를 읽어 채용 중인 자리를 찾는 길은 아직 놓지 않았습니다.",
    free:
      "공고 없이 만드는 길은 아직 놓지 않았습니다. 지금은 겨냥할 공고가 있어야 재료 순위를 매길 수 있습니다.",
  };

  return (
    <div className={styles.notBuilt}>
      <p className={styles.notBuiltWhy}>{reason[mode]}</p>
      <Link href={"/brew/new?mode=list" as Route} className={styles.notBuiltGo}>
        모아 둔 공고에서 고르기
      </Link>
    </div>
  );
}
