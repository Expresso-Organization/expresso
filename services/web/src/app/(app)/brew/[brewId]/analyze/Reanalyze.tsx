"use client";

import { useActionState } from "react";

import { useRefreshWhile } from "../use-refresh-while";
import { reanalyzeAction, type AnalyzeResult } from "./analyze-actions";
import styles from "./page.module.css";

/**
 * "다시 분석".
 *
 * 분석이 도는 동안 단추가 상태를 말하고 화면을 다시 읽는다. 끝나면 새 판정이 그려지고
 * 단추가 돌아온다.
 */
export function Reanalyze({
  brewId,
  jobAnalysisId,
  analyzing,
}: {
  brewId: string;
  jobAnalysisId: string;
  analyzing: boolean;
}) {
  const [result, run, running] = useActionState<AnalyzeResult, FormData>(reanalyzeAction, {});
  useRefreshWhile(analyzing);

  return (
    <>
      <form action={run} style={{ display: "contents" }}>
        <input type="hidden" name="brewId" value={brewId} />
        <input type="hidden" name="jobAnalysisId" value={jobAnalysisId} />
        <button type="submit" className={styles.sourceAction} disabled={analyzing || running}>
          {running ? "맡기는 중…" : analyzing ? "분석 중…" : "다시 분석"}
        </button>
      </form>
      {result.error ? <span className={styles.sourceNotice}>{result.error}</span> : null}
    </>
  );
}
