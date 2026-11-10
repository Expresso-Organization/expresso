"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { allJobsQuery, jobsTabShown, type JobsTab } from "./home-model";
import styles from "./page.module.css";

/**
 * 00 공고 카드의 탭 머리와 목록 자리.
 *
 * 두 탭의 행은 서버가 이미 그려 슬롯으로 넘긴다. 여기서는 주소(`?tab=`)를 읽어 어느 쪽을
 * 보일지만 정한다. 탭을 누르면 `history.replaceState`로 주소만 바꾼다 — Next 라우터가 이
 * 호출을 받아 `useSearchParams`를 갱신하고 서버는 다시 부르지 않는다. 탭을 상태로 따로 들지
 * 않으므로 사이드바 「홈」처럼 주소로 다시 들어와도 주소와 탭이 어긋나지 않는다.
 */
export function HomeJobsTabs({
  role,
  interested,
}: {
  role: { label: string; family: string | null; total: number; rows: ReactNode };
  interested: { total: number; rows: ReactNode };
}) {
  const tab: JobsTab = useSearchParams().get("tab") === "interested" ? "interested" : "role";
  const shown = jobsTabShown(tab, interested.total);

  function choose(next: JobsTab) {
    window.history.replaceState(null, "", next === "interested" ? "/home?tab=interested" : "/home");
  }

  return (
    <>
      <div className={styles.cardHead}>
        <div className={styles.segment}>
          <button
            type="button"
            aria-pressed={shown === "role"}
            onClick={() => choose("role")}
            className={`${styles.segmentItem} ${shown === "role" ? styles.segmentItemActive : ""}`}
          >
            {role.label} {role.total}
          </button>
          {interested.total > 0 ? (
            <button
              type="button"
              aria-pressed={shown === "interested"}
              onClick={() => choose("interested")}
              className={`${styles.segmentItem} ${shown === "interested" ? styles.segmentItemActive : ""}`}
            >
              관심 {interested.total}
            </button>
          ) : null}
        </div>
        <Link href={{ pathname: "/jobs", query: allJobsQuery(shown, role.family) }} className={styles.cardLink}>
          전체
        </Link>
      </div>
      {shown === "interested" ? interested.rows : role.rows}
    </>
  );
}
