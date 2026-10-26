import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/Logo";

import styles from "./legal.module.css";

/** 약관 · 개인정보 처리방침. 셸 없이 읽는 문서라 로고와 돌아갈 곳 하나만 둔다. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.top}>
          <Link href="/" aria-label="Expresso">
            <LogoMark size={26} />
          </Link>
          <Link href="/signup" className={styles.back}>
            회원가입으로
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
