import { TERMS_VERSION } from "@expresso/contracts";
import type { ReactNode } from "react";

import styles from "./legal.module.css";

/**
 * 문서 한 장의 뼈대. 판 번호는 계약의 `TERMS_VERSION`에서 온다 — 가입 화면이 동의를 받는
 * 판과 여기 적힌 판이 어긋날 수 없다.
 *
 * 본문 문안은 아직 없다. 자리를 숨기지 않고 "준비 중"이라고 적는다 — 빈 약관을 있는 것처럼
 * 보이게 하지 않는다.
 */
export function LegalDocument({
  title,
  sections,
}: {
  title: string;
  sections: { heading: string; body: ReactNode }[];
}) {
  return (
    <article>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.meta}>제 {TERMS_VERSION}판 · 시행일은 문안이 확정되는 날 적습니다.</p>
      <div className={styles.pending}>
        이 문서의 본문은 준비 중입니다. 아래 항목은 담을 내용의 차례이며, 확정된 문안이 오면
        같은 자리에 들어갑니다. 문안이 바뀌면 판 번호가 오르고 가입 시 다시 동의를 묻습니다.
      </div>
      {sections.map((section) => (
        <section key={section.heading} className={styles.section}>
          <h2 className={styles.heading}>{section.heading}</h2>
          {section.body}
        </section>
      ))}
    </article>
  );
}
