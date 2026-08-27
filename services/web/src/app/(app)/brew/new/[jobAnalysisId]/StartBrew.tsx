"use client";

import { useActionState, useEffect, useRef } from "react";

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
  const form = useRef<HTMLFormElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    form.current?.requestSubmit();
  }, []);

  return (
    <>
      <form ref={form} action={submit}>
        <input type="hidden" name="jobAnalysisId" value={jobAnalysisId} />
        <input type="hidden" name="lengthPreset" value={lengthPreset} />
        <button type="submit" className={styles.waitAction} disabled={pending}>
          {state.error ? null : <span className={styles.waitSpinnerLight} aria-hidden="true" />}
          {state.error ? "다시 시도" : "다음 단계로 이동 중"}
        </button>
      </form>
      {state.error ? <p className={styles.waitError}>{state.error}</p> : null}
    </>
  );
}
