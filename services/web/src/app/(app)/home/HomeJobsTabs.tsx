"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { allJobsQuery, jobsTabShown, type JobsTab } from "./home-model";
import styles from "./page.module.css";

/**
 * 00 공고 카드의 탭 머리와 목록 자리.
 *
 * 두 탭의 행은 서버가 이미 그려 슬롯으로 넘긴다. 여기서는 어느 쪽을 보일지만 정하고,
 * 주소는 `history.replaceState`로 맞춘다 — Next 라우터가 이 호출을 받아 주소만 바꾸고
 * 서버를 다시 부르지 않는다. 새로고침하면 서버가 `?tab=`을 읽어 같은 탭으로 그린다.
 */
export function HomeJobsTabs({
  initialTab,
  role,
  interested,
}: {
  initialTab: JobsTab;
  role: { label: string; family: string | null; total: number; rows: ReactNode };
  interested: { total: number; rows: ReactNode };
}) {
  const [tab, setTab] = useState(initialTab);
  const shown = jobsTabShown(tab, interested.total);

  function choose(next: JobsTab) {
    setTab(next);
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
