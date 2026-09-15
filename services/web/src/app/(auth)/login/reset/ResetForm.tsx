"use client";

import Link from "next/link";
import { useActionState } from "react";

import { confirmPasswordResetAction, type AuthFormState } from "@/app/auth-actions";
import { Icon } from "@/components/ui/Icon";

import styles from "../../auth.module.css";

const INITIAL: AuthFormState = {};

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmPasswordResetAction, INITIAL);

  return (
    <div className={styles.form}>
      <h1 className={styles.title}>새 비밀번호</h1>
      <div className={styles.subtitle}>10자 이상으로 적어 주세요. 두 칸을 같게 채우면 바로 로그인됩니다.</div>

      <form action={action}>
        <input type="hidden" name="token" value={token} />

        {state.error ? (
          <p className={styles.formError} role="alert">
            {state.error}
          </p>
        ) : null}

        <div className={styles.field}>
          <div className={styles.fieldHead}>
            <label className={styles.fieldLabel} htmlFor="password">
              새 비밀번호
            </label>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            autoFocus
            placeholder="10자 이상"
            className={`${styles.input} ${state.fieldErrors?.password ? styles.inputInvalid : ""}`}
            aria-invalid={state.fieldErrors?.password ? true : undefined}
          />
        </div>

        <div className={styles.field}>
          <div className={styles.fieldHead}>
            <label className={styles.fieldLabel} htmlFor="passwordConfirm">
              다시 한 번
            </label>
          </div>
          <input
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            placeholder="같은 비밀번호"
            className={`${styles.input} ${state.fieldErrors?.password ? styles.inputInvalid : ""}`}
          />
          {state.fieldErrors?.password ? (
            <p className={styles.fieldError}>{state.fieldErrors.password}</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className={`${styles.submit} ${styles.submitSpacingLogin}`}
        >
          {pending ? "바꾸는 중" : "비밀번호 바꾸고 로그인"}
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
