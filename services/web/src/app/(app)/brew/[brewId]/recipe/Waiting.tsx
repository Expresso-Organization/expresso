"use client";

import type { BrewJobStatus } from "@expresso/contracts";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./Waiting.module.css";

/**
 * 레시피가 짜이는 동안.
 *
 * 여기서 할 일은 없다 — 무엇을 쓸지는 앞 화면에서 이미 골랐다. 얼마나 걸리는지
 * 만 말하고 끝나면 문서로 넘어간다.
 */
export function Waiting({ job }: { job: BrewJobStatus }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 1_500);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <span className={`${styles.badge} ex-anim-bob`}>
          <Icon name="coffee" weight="fill" size={16} color="var(--ex-accent-surface)" />
        </span>
        <h1>레시피를 짜는 중</h1>
        <p>고른 기록과 공고를 읽고 무엇을 어떤 순서로 담을지 정합니다. 1분쯤 걸리고, 이 화면을 닫아도 계속됩니다.</p>
        <div className={styles.progress} role="progressbar" aria-label="레시피 생성 진행 중">
          <span className={styles.fill} />
        </div>
        <span className={styles.stage} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          {job.stage === "queued" ? "차례를 기다리는 중" : "짜는 중"}
        </span>
      </div>
    </div>
  );
}
