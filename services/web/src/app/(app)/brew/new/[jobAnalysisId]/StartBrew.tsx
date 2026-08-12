"use client";

import { useActionState } from "react";

import { startBrewAction, type NewBrewState } from "../new-brew-actions";
import styles from "../page.module.css";

/** 제작 시작 버튼. 여기서 재료 순위가 매겨지므로 사람이 눌러야 한다. */
export function StartBrew({
  jobAnalysisId,
  lengthPreset,
}: {
  jobAnalysisId: string;
  lengthPreset: string;
}) {
  const [state, submit, pending] = useActionState<NewBrewState, FormData>(
    startBrewAction,
    { error: null },
  );

  return (
    <>
      <form action={submit}>
        <input type="hidden" name="jobAnalysisId" value={jobAnalysisId} />
        <input type="hidden" name="lengthPreset" value={lengthPreset} />
        <button type="submit" className={styles.waitAction} disabled={pending}>
          {pending ? "재료 순위를 매기는 중" : "제작 시작하기"}
        </button>
      </form>
      {state.error ? <p className={styles.waitError}>{state.error}</p> : null}
    </>
  );
}
