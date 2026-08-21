import type { Route } from "next";
import Link from "next/link";

import { AppBody } from "./AppShell";
import styles from "./RouteFallbacks.module.css";

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
