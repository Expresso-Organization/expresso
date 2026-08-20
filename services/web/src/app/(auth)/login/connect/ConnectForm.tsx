"use client";

import Link from "next/link";
import { useActionState } from "react";

import { linkGoogleAction, type AuthFormState } from "@/app/auth-actions";
import { Icon } from "@/components/ui/Icon";

import styles from "../../auth.module.css";

const INITIAL: AuthFormState = {};

export function ConnectForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(linkGoogleAction, INITIAL);

  return (
    <div className={styles.form}>
      <h1 className={styles.title}>비밀번호를 한 번만 확인합니다</h1>
      <div className={styles.subtitle}>
        <strong>{email}</strong>은(는) 비밀번호로 만든 계정입니다. 이 계정의 주인이
        맞는지 확인한 뒤 Google을 잇습니다. 다음부터는 Google만으로 들어옵니다.
      </div>

      <form action={action}>
        {state.error ? (
          <p className={styles.formError} role="alert">
            {state.error}
          </p>
        ) : null}

        <div className={styles.field}>
          <div className={styles.fieldHead}>
            <label className={styles.fieldLabel} htmlFor="password">
              비밀번호
            </label>
          </div>
          {/* 어느 계정인지 브라우저 비밀번호 관리자에게도 알려 준다. */}
          <input type="hidden" name="email" value={email} autoComplete="username" readOnly />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            placeholder="••••••••"
            className={`${styles.input} ${
              state.fieldErrors?.password ? styles.inputInvalid : ""
            }`}
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
          {pending ? "확인하는 중" : "확인하고 Google 잇기"}
        </button>
      </form>

      <div className={styles.foot}>
        <Link href="/login" className={styles.footLink}>
          <Icon name="arrow-left" size={14} /> 비밀번호로 로그인하기
        </Link>
      </div>
    </div>
  );
}
