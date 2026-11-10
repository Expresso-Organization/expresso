import type { InterviewQuestionBase } from "@expresso/contracts";

import { Icon } from "@/components/ui/Icon";

import { basisKind } from "./basis-kind";
import styles from "./QuestionBases.module.css";

/**
 * 질문을 만드는 동안 먼저 보여 주는 근거 목록.
 *
 * 질문 생성이 고르는 자리와 같은 계산이다 — 공고 요건 중 못 채운 것 · 일부만 채운 것, 고른 기록 중
 * 수치가 빠진 것. AI가 이 가운데에서 골라 질문을 쓰므로, 질문이 나오기 전에 무엇을 물을지 미리 안다.
 */
export function QuestionBases({ bases }: { bases: InterviewQuestionBase[] }) {
  return (
    <section className={styles.bases} aria-label="물어볼 자리">
      <div className={styles.head}>
        <span className={styles.title}>물어볼 자리 {bases.length}곳</span>
        <span className={styles.note}>이 가운데에서 질문을 고릅니다</span>
      </div>
      <ul className={styles.list}>
        {bases.map(({ basis, label }) => (
          <li key={basis.type === "requirement" ? basis.requirementId : basis.recordId} className={styles.row}>
            <Icon
              name={basis.type === "requirement" ? "target" : "file-text"}
              size={14}
              color="var(--ex-fg-muted)"
            />
            <div className={styles.text}>
              <span className={styles.kind}>{basisKind(basis)}</span>
              <span className={styles.label}>{label}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
