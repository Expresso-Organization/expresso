"use client";

import type { BrewJobStatus } from "@expresso/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Icon } from "@/components/ui/Icon";
import { CONSENT_COPY, CONSENT_SETTINGS_HREF } from "@/lib/consent-copy";

import styles from "./Waiting.module.css";

/**
 * 만들어지는 중 · 아직 시작 전 · 실패.
 *
 * 01b·02b가 같은 자리에서 쓰는 화면이다. 계약이 도는 데 1분쯤 걸리므로
 * **얼마나 걸리는지 먼저 말한다** — 기다리는 사람에게 필요한 것은 스피너가
 * 아니라 언제 끝나는지다.
 */
export function Waiting({
  title,
  note,
  job,
  action,
  actionLabel,
  rejectedNote,
  brewId,
  basisJobId,
}: {
  title: string;
  note: string;
  job: BrewJobStatus | null;
  action: (formData: FormData) => Promise<void>;
  actionLabel: string;
  /** 입력이 모자라 거절됐을 때 무엇을 하면 되는지(§13 — 에러는 다음 행동으로 끝난다). */
  rejectedNote: string;
  brewId: string;
  /** 화면이 마지막으로 본 잡. 다시 누르면 이것을 기준으로 새 잡이 돈다. */
  basisJobId: string | null;
}) {
  const running = job?.status === "queued" || job?.status === "running";
  const failed = job?.status === "failed";
  // 동의가 꺼져 실패했으면 어느 동의인지 말하고 그 자리로 보낸다.
  const consent = job?.failure?.code === "CONSENT_REQUIRED" ? job.failure.requiredConsent : null;
  const router = useRouter();

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => router.refresh(), 1_500);
    return () => window.clearInterval(timer);
  }, [router, running]);

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <span className={`${styles.badge} ${running ? "ex-anim-bob" : ""}`}>
          <Icon name="coffee" weight="fill" size={16} color="var(--ex-accent-surface)" />
        </span>
        <h1 className={styles.title}>{running ? `${title} 만드는 중` : title}</h1>
        <p className={styles.note}>{running ? "1분쯤 걸립니다. 이 화면을 닫아도 계속됩니다." : note}</p>

        {running ? (
          <div className={styles.progressGroup} aria-live="polite">
            <div className={styles.progress} role="progressbar" aria-label={`${title} 생성 진행 중`}>
              <span className={styles.progressFill} />
            </div>
            <div className={styles.stage}>
              <span className={styles.spinner} aria-hidden="true" />
              <span>{job?.stage === "queued" ? "차례를 기다리는 중" : "쓰는 중"}</span>
            </div>
          </div>
        ) : null}

        {failed ? (
          <p className={styles.failure}>
            {consent ? (
              <>
                {CONSENT_COPY[consent].title} 동의가 필요해 만들지 못했습니다. 켠 뒤 다시 눌러 주세요.{" "}
                <Link href={CONSENT_SETTINGS_HREF} className={styles.failureLink}>동의 설정 열기</Link>
              </>
            ) : job?.failure?.code === "BREW_INPUT_REJECTED"
              ? rejectedNote
              : "만들지 못했습니다. 다시 시도해 주세요."}
          </p>
        ) : null}

        {running ? null : (
          <form action={action}>
            <input type="hidden" name="brewId" value={brewId} />
            {basisJobId ? <input type="hidden" name="basisJobId" value={basisJobId} /> : null}
            <button type="submit" className={styles.primary}>{actionLabel}</button>
          </form>
        )}
      </div>
    </div>
  );
}
