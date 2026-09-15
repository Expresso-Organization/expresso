"use client";

import { useActionState } from "react";

import { resendVerificationAction, type ResendVerificationState } from "@/app/auth-actions";

import styles from "./EmailVerificationNotice.module.css";

const INITIAL: ResendVerificationState = {};

/** 띠 안의 "인증 메일 다시 보내기". 결과는 옆에 한 줄로 선다. */
export function ResendVerificationForm() {
  const [state, action, pending] = useActionState(resendVerificationAction, INITIAL);

  return (
    <>
      <form action={action}>
        <button type="submit" className={styles.action} disabled={pending || state.sent}>
          {pending ? "보내는 중" : state.sent ? "메일을 보냈습니다" : "인증 메일 다시 보내기"}
        </button>
      </form>
      {state.sent ? <span className={styles.status}>받은 편지함을 확인해 주세요. 링크는 24시간 동안 유효합니다.</span> : null}
      {state.error ? <span className={styles.status} role="alert">{state.error}</span> : null}
    </>
  );
}
