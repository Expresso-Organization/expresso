"use client";

import { useActionState } from "react";

import { reanalyzeAction, type AnalyzeResult } from "./analyze-actions";
import styles from "./page.module.css";

/**
 * "다시 분석".
 *
 * 맡긴 뒤에는 단추가 상태를 말한다. 다시 그리면 머리말의 단계가 이어받는다.
 */
export function Reanalyze({
  brewId,
  jobAnalysisId,
  disabled,
}: {
  brewId: string;
  jobAnalysisId: string;
  disabled: boolean;
}) {
  const [result, run, running] = useActionState<AnalyzeResult, FormData>(reanalyzeAction, {});

  return (
    <>
      <form action={run} style={{ display: "contents" }}>
        <input type="hidden" name="brewId" value={brewId} />
        <input type="hidden" name="jobAnalysisId" value={jobAnalysisId} />
        <button type="submit" className={styles.sourceAction} disabled={disabled || running || Boolean(result.queued)}>
          {running ? "맡기는 중…" : result.queued ? "맡겼습니다" : "다시 분석"}
        </button>
      </form>
      {result.error ? <span className={styles.sourceNotice}>{result.error}</span> : null}
    </>
  );
}
