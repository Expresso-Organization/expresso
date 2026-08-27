import Link from "next/link";

import { logoutAction } from "@/app/auth-actions";
import { AppHeader, appShellStyles } from "@/components/shell/AppShell";
import { SearchAndNotifications } from "@/components/shell/HeaderActions";
import { Icon } from "@/components/ui/Icon";

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

export function HomeSearch() {
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
    </>
  );
}
