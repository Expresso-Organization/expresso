import type { Route } from "next";
import Link from "next/link";

import { AppBody } from "./AppShell";
import styles from "./RouteFallbacks.module.css";

/**
 * 구간이 데이터를 기다리는 동안의 자리 — `loading.tsx`가 그린다.
 *
 * 앱 셸과 사이드바는 레이아웃이 이미 냈으므로 여기서는 본문만 채운다.
 * 사람이 보는 것은 "빈 화면"이 아니라 "곧 글이 앉을 자리"다.
 */
export function RouteSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <AppBody>
      <div className={styles.skeleton}>
        <div className={`${styles.bar} ${styles.barTitle} ex-anim-shimmer`} />
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className={`${styles.bar} ${styles.card} ex-anim-shimmer`}
          />
        ))}
      </div>
    </AppBody>
  );
}

/**
 * 없는 것을 찾았을 때 — `not-found.tsx`가 그린다.
 *
 * §13 — 에러는 다음 행동으로 끝난다. 사과문만 남기지 않는다.
 */
export function RouteNotFound({
  title,
  body,
  backHref,
  backLabel,
}: {
  title: string;
  body: string;
  backHref: Route;
  backLabel: string;
}) {
  return (
    <AppBody>
      <div className={styles.notice}>
        <p className={styles.noticeTitle}>{title}</p>
        <p className={styles.noticeBody}>{body}</p>
        <div className={styles.actions}>
          <Link href={backHref} className={styles.action}>
            {backLabel}
          </Link>
        </div>
      </div>
    </AppBody>
  );
}
