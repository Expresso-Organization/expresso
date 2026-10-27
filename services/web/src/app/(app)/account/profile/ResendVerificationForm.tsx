"use client";

import { useActionState } from "react";

import { resendVerificationAction, type ResendVerificationState } from "@/app/auth-actions";

import styles from "../page.module.css";

const INITIAL: ResendVerificationState = {};

/** 로그인 주소 줄의 "인증 메일 보내기". 결과는 같은 줄 아래로 내려선다. */
export function ResendVerificationForm() {
  const [state, action, pending] = useActionState(resendVerificationAction, INITIAL);

  return (
    <>
      <form action={action}>
        <button type="submit" className={styles.dataAction} disabled={pending || state.sent}>
          {pending ? "보내는 중" : state.sent ? "메일을 보냈습니다" : "인증 메일 보내기"}
        </button>
      </form>
      {state.sent ? (
        <span className={styles.verifyResult}>
          받은 편지함을 확인해 주세요. 링크는 24시간 동안 유효합니다.
        </span>
      ) : null}
      {state.error ? (
        <span className={styles.verifyResult} role="alert">
          {state.error}
        </span>
      ) : null}
    </>
  );
}
