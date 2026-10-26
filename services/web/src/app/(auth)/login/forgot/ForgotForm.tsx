"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordResetAction, type PasswordResetRequestState } from "@/app/auth-actions";
import { Icon } from "@/components/ui/Icon";

import styles from "../../auth.module.css";

const INITIAL: PasswordResetRequestState = {};

export function ForgotForm({ notice }: { notice?: string | undefined }) {
  const [state, action, pending] = useActionState(requestPasswordResetAction, INITIAL);

  if (state.sent) {
    return (
      <div className={styles.form}>
        <h1 className={styles.title}>메일을 확인해 주세요</h1>
        <div className={styles.subtitle}>
          그 주소로 가입한 계정이 있으면 재설정 링크가 갔습니다. 몇 분 안에 오지 않으면
          스팸함을 보고, 그래도 없으면 주소를 확인해 다시 요청해 주세요.
        </div>
        <div className={styles.foot}>
          <Link href="/login" className={styles.footLink}>
            <Icon name="arrow-left" size={14} /> 로그인으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <h1 className={styles.title}>비밀번호를 잊으셨나요</h1>
      <div className={styles.subtitle}>
        가입한 이메일을 적어 주세요. 새 비밀번호를 정할 수 있는 링크를 보냅니다.
      </div>

      {notice ? (
        <p className={styles.formError} role="alert">
          {notice}
        </p>
      ) : null}

      <form action={action}>
        {state.error ? (
          <p className={styles.formError} role="alert">
            {state.error}
          </p>
        ) : null}

        <div className={styles.field}>
          <div className={styles.fieldHead}>
            <label className={styles.fieldLabel} htmlFor="email">
              이메일
            </label>
          </div>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            placeholder="jiwon@example.com"
            className={`${styles.input} ${state.fieldErrors?.email ? styles.inputInvalid : ""}`}
            aria-invalid={state.fieldErrors?.email ? true : undefined}
          />
          {state.fieldErrors?.email ? (
            <p className={styles.fieldError}>{state.fieldErrors.email}</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className={`${styles.submit} ${styles.submitSpacingLogin}`}
        >
          {pending ? "보내는 중" : "재설정 링크 보내기"}
        </button>
      </form>

      <div className={styles.foot}>
        <Link href="/login" className={styles.footLink}>
          <Icon name="arrow-left" size={14} /> 로그인으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
