"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import styles from "../page.module.css";

const PROGRESS = {
  queued: 10,
  extracting: 38,
  validating: 66,
  covering: 88,
  done: 100,
  failed: 100,
} as const;

export function AnalysisProgress({
  stage,
  label,
}: {
  stage: keyof typeof PROGRESS;
  label: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 1_500);
    return () => window.clearInterval(timer);
  }, [router]);

  const value = PROGRESS[stage];
  return (
    <div className={styles.waitProgressGroup} aria-live="polite">
      <div
        className={styles.waitProgress}
        role="progressbar"
        aria-label="공고 분석 진행률"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span className={styles.waitProgressFill} style={{ width: `${value}%` }} />
      </div>
      <div className={styles.waitStage}>
        <span className={styles.waitSpinner} aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  );
}
