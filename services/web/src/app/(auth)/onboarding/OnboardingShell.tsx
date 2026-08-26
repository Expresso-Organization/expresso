import type { ReactNode } from "react";

import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";

import styles from "./onboarding.module.css";

const STEPS = ["목표", "동의", "재료", "첫 포트폴리오"] as const;

/** 10c–10e 공통 뼈대. 앱 셸 없이 단계 인디케이터와 하단 액션 바만 둔다. */
export function OnboardingShell({
  step,
  wide = false,
  children,
  footLeft,
  footRight,
}: {
  step: 1 | 2 | 3 | 4;
  wide?: boolean;
  children: ReactNode;
  footLeft?: ReactNode;
  footRight: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <div className={styles.head}>
        <LogoMark size={22} />
        <Wordmark />
        <nav className={styles.steps} aria-label="온보딩 단계">
          {STEPS.map((label, index) => {
            const no = index + 1;
            const done = no < step;
            const current = no === step;
            return (
              <span key={label} style={{ display: "contents" }}>
                {index > 0 ? <span className={styles.connector} /> : null}
                <span
                  className={[
                    styles.step,
                    done ? styles.stepDone : null,
                    current ? styles.stepCurrent : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={current ? "step" : undefined}
                >
                  <span className={styles.stepMark}>
                    {done ? <Icon name="check" size={11} color="var(--ex-accent-text)" /> : no}
                  </span>
                  <span className={styles.stepLabel}>{label}</span>
                </span>
              </span>
            );
          })}
        </nav>
        <button type="button" className={styles.skip}>
          나중에 하기
        </button>
      </div>

      <div className={styles.body}>
        <div className={`${styles.panel} ${wide ? styles.panelWide : ""}`}>{children}</div>
      </div>

      <div className={styles.foot}>
        <span className={styles.footProgress}>{step} / {STEPS.length}</span>
        {footLeft}
        <div className={styles.footRight}>{footRight}</div>
      </div>
    </div>
  );
}

export { styles as onboardingStyles };
