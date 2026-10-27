import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/auth-actions";
import { AppHeader, appShellStyles } from "@/components/shell/AppShell";
import { SearchAndNotifications } from "@/components/shell/HeaderActions";
import { Icon } from "@/components/ui/Icon";
import { jobs } from "@/lib/api/endpoints";

import styles from "./page.module.css";

/** 00 영역 1 — 예시 칩 4개는 확정 문구다. */
const EXAMPLE_QUERIES = [
  "리모트 되는 데이터 엔지니어",
  "Kafka 안 쓰는 곳",
  "이번 주 마감 임박",
  "시리즈 B 이상 스타트업",
];

/**
 * 홈에서 **데이터를 기다리지 않는 부분** — 화면과 `loading.tsx`가 함께 쓴다.
 *
 * 기다리는 동안 이 자리를 회색 막대로 덮지 않는다. 헤더도 검색 바도 세션이
 * 없어도 그릴 수 있고, 덮어 두면 응답이 온 순간 한 번 튀는 데다 그 사이에
 * 검색을 시작할 수도 없다. 스켈레톤은 정말 기다리는 자리에만 둔다.
 */
export function HomeHeader() {
  return (
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
  );
}

export function HomeSearch({
  savedSearches = null,
}: {
  /** 저장한 검색 목록. 응답을 기다리는 부분이라 화면이 Suspense로 감싸 넘긴다. */
  savedSearches?: ReactNode;
}) {
  return (
    <>
      <form className={styles.searchBar} action="/jobs">
        <Icon name="sparkle" size={18} color="var(--ex-accent-text)" />
        <input
          name="q"
          className={styles.searchInput}
          placeholder='"내 파이프라인 경험을 살릴 수 있는 자리" 처럼 문장으로 물어보세요'
          aria-label="공고 검색"
        />
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
        {savedSearches}
      </div>
    </>
  );
}

/**
 * 06에서 저장한 검색(`GET /jobs/saved-searches`). 누르면 목록이 펼쳐지고, 고르면
 * 그 문장으로 다시 검색한다 — 조건은 검색 화면이 문장을 해석해 다시 세운다.
 *
 * 저장한 것이 없으면 아무것도 그리지 않는다. 비어 있는 단추는 누를 이유가 없다.
 */
export async function SavedSearches({ accessToken }: { accessToken: string }) {
  const { data: searches } = await jobs.savedSearches(accessToken);
  if (searches.length === 0) return null;

  return (
    <details className={styles.savedSearches}>
      <summary className={styles.savedSummary}>
        <Icon name="bell-simple" size={14} color="var(--ex-fg-muted)" />
        저장한 검색 {searches.length}
      </summary>
      <div className={styles.savedPanel}>
        <div className={styles.savedList}>
          {searches.map((search) => (
            <Link
              key={search.id}
              href={{ pathname: "/jobs", query: { q: search.originalQuery } }}
              className={styles.savedRow}
            >
              <Icon name="magnifying-glass" size={13} color="var(--ex-fg-muted)" />
              <span className={styles.savedName}>{search.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </details>
  );
}
