import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";

import styles from "./onboarding.module.css";

/**
 * 온보딩 단계. 진행 표시 · 「STEP n / N」 · 하단 「n / N」이 모두 여기서 나온다.
 *
 * 정의서 10d 재료(이력서 · GitHub 가져오기)는 뺐다 — 이력서와 주소에서 기록을
 * 뽑는 백엔드가 없어 화면이 샘플만 보여 줬다. 기록은 내 커리어에서 직접 쓴다.
 */
const STEPS = ["목표", "동의", "첫 포트폴리오"] as const;

export type OnboardingStep = 1 | 2 | 3;

/** 본문 머리의 「STEP n / N」. */
export function OnboardingStepLabel({ step }: { step: OnboardingStep }) {
  return (
    <div className={styles.stepLabelMono}>
      STEP {step} / {STEPS.length}
    </div>
  );
}

/** 10c · 10d 동의 · 10e 공통 뼈대. 앱 셸 없이 단계 인디케이터와 하단 액션 바만 둔다. */
export function OnboardingShell({
  step,
  wide = false,
  children,
  footLeft,
  footRight,
}: {
  step: OnboardingStep;
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
        <Link href="/home" className={styles.skip}>
          나중에 하기
        </Link>
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
