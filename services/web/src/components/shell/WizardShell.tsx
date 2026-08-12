import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./WizardShell.module.css";

/** §4.2 6단계 — 순서는 고정이다. */
export const WIZARD_STEPS = [
  { key: "analyze", label: "공고 분석", segment: "analyze" },
  { key: "materials", label: "재료 고르기", segment: "materials" },
  { key: "counter", label: "AI 대화", segment: "counter" },
  { key: "outline", label: "레시피", segment: "outline" },
  { key: "design", label: "디자인 선택", segment: "design" },
  { key: "edit", label: "다듬기", segment: "edit" },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];

export function WizardHeader({
  portfolioTitle,
  saveState = "자동 저장됨",
}: {
  portfolioTitle: string;
  saveState?: string;
}) {
  return (
    <div className={styles.buildHeader}>
      <Link href="/home" className={styles.back} aria-label="뒤로">
        <Icon name="caret-left" size={15} />
      </Link>
      <span className={styles.buildLabel}>새 포트폴리오</span>
      <button type="button" className={styles.titleChip}>
        <span className={styles.titleChipText}>{portfolioTitle}</span>
        <Icon name="pencil-simple" size={11} color="var(--ex-slate-400)" />
      </button>
      <div className={styles.buildRight}>
        <span className={styles.saveState}>
          <Icon name="cloud-check" size={14} />
          {saveState}
        </span>
        <span className={styles.headerRule} />
        <Link href="/home" className={styles.back} aria-label="닫기">
          <Icon name="x" size={16} />
        </Link>
      </div>
    </div>
  );
}

export function WizardSteps({
  brewId,
  current,
  situation,
}: {
  brewId: string;
  current: WizardStepKey;
  /** 우측 끝 상황 문구 — "예상 3분", "남은 질문 2개", "초안 완성 · 섹션 6개". */
  situation: string;
}) {
  const currentIndex = WIZARD_STEPS.findIndex((step) => step.key === current);

  return (
    <nav className={styles.steps} aria-label="포트폴리오 제작 단계">
      {WIZARD_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const isCurrent = index === currentIndex;
        const className = [
          styles.step,
          done ? styles.stepDone : null,
          isCurrent ? styles.stepCurrent : null,
        ]
          .filter(Boolean)
          .join(" ");
        const mark = (
          <>
            <span className={styles.stepMark}>
              {done ? (
                <Icon name="check" size={11} color="var(--ex-espresso)" />
              ) : (
                <span className={styles.stepNumber}>
                  {String(index + 1).padStart(2, "0")}
                </span>
              )}
            </span>
            <span className={styles.stepLabel}>{step.label}</span>
          </>
        );

        return (
          <span key={step.key} style={{ display: "contents" }}>
            {index > 0 ? <span className={styles.connector} aria-hidden="true" /> : null}
            {/* 완료 단계만 클릭으로 되돌아갈 수 있다. 미래 단계는 비활성. */}
            {done ? (
              <Link
                href={`/brew/${brewId}/${step.segment}` as Route}
                className={className}
              >
                {mark}
              </Link>
            ) : (
              <span className={className} aria-current={isCurrent ? "step" : undefined}>
                {mark}
              </span>
            )}
          </span>
        );
      })}
      <span className={styles.situation}>{situation}</span>
    </nav>
  );
}

export function WizardStage({
  tinted = false,
  children,
}: {
  /** 02 · 02b는 surface-50 지면 위에 카드를 얹는다. */
  tinted?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.stage} ${tinted ? styles.stageTinted : ""}`}>
      {children}
    </div>
  );
}
