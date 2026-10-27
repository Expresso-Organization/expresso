"use client";

import type { RecentJobSearch } from "@expresso/contracts";
import Link from "next/link";
import { useActionState } from "react";

import { Icon } from "@/components/ui/Icon";

import { clearRecentSearchesAction, type ClearRecentState } from "./jobs-actions";
import styles from "./page.module.css";

/**
 * 00b 레일의 「비슷한 검색」과 「최근 검색」.
 *
 * 둘 다 같은 최근 검색 목록에서 나온다 — 비슷한 검색은 지금 검색어를 뺀 나머지다.
 * 그래서 「지우기」가 둘을 함께 비운다. 비어 있는 묶음은 띄우지 않는다 —
 * 예시 문장으로 채우면 사용자가 한 적 없는 검색이 기록처럼 보인다.
 */
export function RecentSearches({
  recent,
  query,
}: {
  recent: readonly RecentJobSearch[];
  query: string;
}) {
  const [state, action, pending] = useActionState(
    async (_previous: ClearRecentState) => clearRecentSearchesAction(),
    { cleared: false, error: null },
  );
  // 서버는 바로 앞 검색과 같은 문장일 때만 줄을 합친다. 사이에 다른 검색이 끼면
  // 같은 문장이 두 줄 남으므로, 최근 것 하나만 둔다(목록은 최근 순으로 온다).
  const shown = state.cleared
    ? []
    : recent.filter(
        (search, index) => recent.findIndex((other) => other.query === search.query) === index,
      );
  const similar = shown.filter((search) => search.query !== query).slice(0, 3);

  return (
    <>
      {similar.length > 0 ? (
        <div className={styles.railCard}>
          <div className={styles.railTitle}>비슷한 검색</div>
          <div className={styles.chipWrap}>
            {similar.map((search) => (
              <Link
                key={search.id}
                href={{ pathname: "/jobs", query: { q: search.query } }}
                className={styles.railChip}
              >
                {search.query}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {shown.length > 0 ? (
        <div className={styles.railCard}>
          <div className={styles.railHeadRow}>
            <span className={styles.railTitle} style={{ marginBottom: 0 }}>
              최근 검색
            </span>
            <form action={action} className={styles.railHeadForm}>
              <button type="submit" className={styles.railHeadAction} disabled={pending}>
                {pending ? "지우는 중" : "지우기"}
              </button>
            </form>
          </div>
          {state.error && !pending ? (
            <p role="status" className={styles.railError}>
              {state.error}
            </p>
          ) : null}
          <div className={styles.recentList}>
            {shown.slice(0, 2).map((search) => (
              <Link
                key={search.id}
                href={{ pathname: "/jobs", query: { q: search.query } }}
                className={styles.recentRow}
              >
                <Icon name="clock-counter-clockwise" size={14} color="var(--ex-fg-muted)" />
                <span className={styles.recentText}>{search.query}</span>
                <span className={styles.recentCount}>{search.resultCount}건</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
