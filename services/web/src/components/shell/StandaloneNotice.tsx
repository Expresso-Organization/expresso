import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/Logo";

import styles from "./StandaloneNotice.module.css";

/**
 * 앱 셸 밖에서 쓰는 알림 화면 — 에디터 · 공개 지면 · 없는 주소.
 *
 * 셸이 없으므로 로고 하나를 세워 여기가 어디인지는 알 수 있게 둔다.
 */
export function StandaloneNotice({
  title,
  body,
  backHref,
  backLabel,
  digest,
  children,
}: {
  title: string;
  body: string;
  backHref: Route;
  backLabel: string;
  /** 서버 로그에서 이 오류를 찾는 번호. Next가 붙인다. */
  digest?: string | undefined;
  /** 재시도 버튼처럼 화면이 더 붙이는 것. */
  children?: ReactNode;
}) {
  return (
    <div className={styles.wrap}>
      <span className={styles.mark}>
        <LogoMark size={26} />
      </span>
      <p className={styles.title}>{title}</p>
      <p className={styles.body}>{body}</p>
      <div className={styles.actions}>
        {children}
        <Link
          href={backHref}
          className={`${styles.action} ${children ? styles.actionGhost : ""}`}
        >
          {backLabel}
        </Link>
      </div>
      {digest ? <p className={styles.digest}>요청 번호 {digest}</p> : null}
    </div>
  );
}

export { styles as standaloneNoticeStyles };
