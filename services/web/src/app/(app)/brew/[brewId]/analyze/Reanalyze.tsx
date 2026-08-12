"use client";

import { useActionState } from "react";

import { reanalyzeAction, type AnalyzeResult } from "./analyze-actions";
import styles from "./page.module.css";

/**
 * "다시 분석".
 *
 * 누르기 전에 무엇이 흔들리는지는 알 수 없다 — 영향 범위는 서버가 세어 돌려준다.
 * 그래서 누른 **뒤에** 무엇이 다시 계산되는지를 말한다.
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
        <button type="submit" className={styles.sourceAction} disabled={disabled || running}>
          {running ? "맡기는 중…" : "다시 분석"}
        </button>
      </form>
      {result.error ? <span className={styles.sourceNotice}>{result.error}</span> : null}
      {result.queued ? (
        <span className={styles.sourceNotice}>
          v{result.queued.targetVersion} 분석을 맡겼습니다 — 요건을 다시 뽑고 내 기록과 다시
          맞춰 봅니다. 제작 {result.queued.brewCount}건 · 레시피 {result.queued.recipeCount}건이
          이 분석에 기대고 있습니다.
        </span>
      ) : null}
    </>
  );
}
