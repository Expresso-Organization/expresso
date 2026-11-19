"use client";

import type { JobGoal } from "@expresso/contracts";
import Link from "next/link";
import { useActionState } from "react";

import { JobGoalFields } from "@/features/job-goal/JobGoalFields";

import { saveJobGoalAction, type JobGoalFormState } from "./goal-actions";
import styles from "./goal.module.css";

const INITIAL: JobGoalFormState = {};

/** 구직 목표를 적거나 고치는 폼. 질문은 온보딩과 같다. */
export function GoalEditor({ goal }: { goal: JobGoal | null }) {
  const [state, action, pending] = useActionState(saveJobGoalAction, INITIAL);
  return (
    <form action={action} className={styles.form}>
      <JobGoalFields goal={goal} />
      {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
      <div className={styles.foot}>
        <Link href="/home" className={styles.cancel}>취소</Link>
        <button type="submit" disabled={pending} className={styles.save}>{pending ? "저장하는 중" : "저장"}</button>
      </div>
    </form>
  );
}
