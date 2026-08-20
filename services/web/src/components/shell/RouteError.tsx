"use client";

import type { Route } from "next";
import Link from "next/link";

import { AppBody } from "./AppShell";
import styles from "./RouteFallbacks.module.css";

/**
 * 구간에서 잡히지 않은 예외 — `error.tsx`가 그린다. 오류 경계는 클라이언트
 * 컴포넌트여야 한다.
 *
 * `error.message`는 내보내지 않는다. 서버에서 난 오류의 본문은 프로덕션에서
 * 어차피 가려지고, 가려지지 않는 경우엔 내부 사정이 새어 나간다. 대신 Next가
 * 붙이는 `digest`를 보여준다 — 서버 로그에서 그 줄을 바로 찾는 번호다.
 *
 * Next 16에서 재시도 콜백의 이름은 `reset`이 아니라 `retry`다.
 */
export function RouteError({
  error,
  retry,
  title,
  body,
  backHref,
  backLabel,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title: string;
  body: string;
  backHref: Route;
  backLabel: string;
}) {
  return (
    <AppBody>
      <div className={styles.notice} role="alert">
        <p className={styles.noticeTitle}>{title}</p>
        <p className={styles.noticeBody}>{body}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={() => retry()}>
            다시 시도
          </button>
          <Link href={backHref} className={`${styles.action} ${styles.actionGhost}`}>
            {backLabel}
          </Link>
        </div>
        {error.digest ? (
          <p className={styles.digest}>요청 번호 {error.digest}</p>
        ) : null}
      </div>
    </AppBody>
  );
}
