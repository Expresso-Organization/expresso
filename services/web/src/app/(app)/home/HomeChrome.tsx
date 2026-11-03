import Link from "next/link";

import { logoutAction } from "@/app/auth-actions";
import { AppHeader, appShellStyles } from "@/components/shell/AppShell";
import { SearchAndNotifications } from "@/components/shell/HeaderActions";
import { Icon } from "@/components/ui/Icon";

import styles from "./page.module.css";

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

/**
 * 영역 1 — 공고를 문장으로 찾는 검색창과 예시 질문.
 *
 * 예시 질문은 목표 직군과 경력으로 만든다(`exampleQueries`). 목표 직군을 정하지 않았으면
 * 줄을 그리지 않는다. ⌘K는 이 검색창이 아니라 통합 검색을 열므로 여기 적지 않는다.
 */
export function HomeSearch({ examples }: { examples: string[] }) {
  return (
    <>
      <form className={styles.searchBar} action="/jobs">
        <Icon name="sparkle" size={18} color="var(--ex-accent-text)" />
        <input
          name="q"
          className={styles.searchInput}
          placeholder="어떤 자리를 찾나요?"
          aria-label="공고 검색"
        />
        <button type="submit" className={styles.searchSubmit} aria-label="물어보기">
          <Icon name="arrow-right" size={16} className={styles.searchSubmitIcon} />
          <span className={styles.searchSubmitText}>물어보기</span>
        </button>
      </form>

      {examples.length > 0 ? (
        <div className={styles.examples}>
          {examples.map((query) => (
            <Link
              key={query}
              href={{ pathname: "/jobs", query: { q: query } }}
              className={styles.exampleChip}
            >
              {query}
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
