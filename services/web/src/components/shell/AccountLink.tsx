"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import styles from "./Sidebar.module.css";

/**
 * 사이드바 아래쪽의 사용자 줄. 설정(`/account`)으로 가는 유일한 입구다.
 *
 * 설정은 1차 메뉴에 없으므로 설정 화면에 있는 동안 "지금 여기" 표시는 이 줄이
 * 받는다. 사이드바는 서버 컴포넌트라 주소를 읽을 수 없어서 이 줄만 클라이언트로
 * 둔다.
 */
export function AccountLink({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const active = usePathname().startsWith("/account");

  return (
    <Link
      href="/account"
      className={`${styles.row} ${styles.userLink} ${active ? styles.rowActive : ""}`}
      title={title}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
