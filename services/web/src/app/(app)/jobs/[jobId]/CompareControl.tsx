"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { Icon } from "@/components/ui/Icon";
import { ANALYSIS_PROGRESS, ANALYSIS_STAGE } from "@/lib/analysis-stage";

import { compareWithRecordsAction, type CompareState } from "./compare-actions";
import styles from "./page.module.css";

type Stage = keyof typeof ANALYSIS_STAGE;

/** 자격 요건 제목 오른쪽이 가리키는 것. 공고 하나에 대해 한 번만 갈린다. */
export type CompareView =
  | { kind: "idle" }
  | { kind: "running"; stage: Stage }
  | { kind: "done"; total: number; covered: number }
  | { kind: "failed"; code: string; retryable: boolean };

/**
 * 06c 자격 요건 머리의 대조 상태.
 *
 * 네 상태가 같은 자리를 쓴다 — 대조 전에는 누를 것이, 도는 동안에는 진행이,
 * 끝나면 숫자가, 실패하면 이유가 선다. 상태마다 다른 자리에 다른 말을 두면
 * 읽는 사람이 매번 어디를 봐야 할지 다시 찾아야 한다.
 *
 * 대조는 워커가 하므로 누른 직후에는 결과가 없다. 도는 동안에만 타이머를 걸어
 * 서버 컴포넌트를 다시 받아 오고, 끝나거나 실패하면 타이머를 걷는다.
 */
export function CompareControl({
  jobPostingId,
  view,
}: {
  jobPostingId: string;
  view: CompareView;
}) {
  const router = useRouter();
  const running = view.kind === "running";

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => router.refresh(), 1_500);
    return () => window.clearInterval(timer);
  }, [running, router]);

  if (view.kind === "done") {
    return (
      <span className={styles.blockTitleNote}>
        {view.total}개 중 {view.covered}개 충족
      </span>
    );
  }

  if (view.kind === "running") {
    const value = ANALYSIS_PROGRESS[view.stage];
    return (
      <span className={styles.compareProgress} aria-live="polite">
        <span
          className={styles.compareTrack}
          role="progressbar"
          aria-label="대조 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
        >
          <span className={styles.compareFill} style={{ width: `${value}%` }} />
        </span>
        <span className={styles.blockTitleNote}>{ANALYSIS_STAGE[view.stage]}</span>
      </span>
    );
  }

  return (
    <CompareForm
      jobPostingId={jobPostingId}
      // 같은 입력으로 같은 자리에서 멈추는 실패에는 누를 것을 주지 않는다.
      label={view.kind === "failed" ? (view.retryable ? "다시 시도" : null) : "내 기록과 대조"}
      failure={view.kind === "failed" ? (FAILURE[view.code] ?? "대조하지 못했습니다") : null}
    />
  );
}

function CompareForm({
  jobPostingId,
  label,
  failure,
}: {
  jobPostingId: string;
  label: string | null;
  failure: string | null;
}) {
  const [state, action, pending] = useActionState<CompareState, FormData>(
    async (_previous, formData) => compareWithRecordsAction(formData),
    { error: null },
  );

  return (
    <form action={action} className={styles.compareForm}>
      <input type="hidden" name="jobPostingId" value={jobPostingId} />
      {failure ? (
        <span className={styles.compareFailure}>
          <Icon name="warning-circle" weight="fill" size={13} color="var(--ex-status-danger-text)" />
          {failure}
        </span>
      ) : null}
      {label ? (
        <button type="submit" className={styles.compareButton} disabled={pending}>
          {label}
        </button>
      ) : null}
      {state.error && !pending ? (
        <span role="status" className={styles.compareError}>
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/**
 * 분석이 멈춘 이유(`job_analysis.failure_code`).
 *
 * 모르는 코드는 그대로 보이지 않는다 — 사용자가 할 수 있는 일이 없는 문자열이다.
 */
const FAILURE: Record<string, string> = {
  EXTRACTOR_UNAVAILABLE: "요건을 읽지 못했습니다",
  INVALID_SOURCE_SPAN: "원문과 맞지 않았습니다",
  EXTRACTION_FAILED: "대조하지 못했습니다",
};
