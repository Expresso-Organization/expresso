"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { loginAction, type AuthFormState } from "@/app/auth-actions";
import { Catchphrase } from "@/components/brand/Catchphrase";
import { Icon } from "@/components/ui/Icon";

import { AuthAside } from "../AuthAside";
import { SocialSignIn } from "../SocialSignIn";
import styles from "../auth.module.css";

const INITIAL: AuthFormState = {};

export function LoginForm({
  googleEnabled,
  notice,
  next,
}: {
  googleEnabled: boolean;
  /** 소셜 왕복이 중간에 끊겼을 때 그 이유. 화면 위쪽에 한 줄로 선다. */
  notice?: string | undefined;
  /** 로그인 뒤 돌아갈 자리. 서버가 이미 걸러 준 값이다. */
  next: string;
}) {
  const [state, action, pending] = useActionState(loginAction, INITIAL);
  // "로그인 상태 유지". 기본 켬 — 끄면 브라우저를 닫을 때 끝나는 세션을 받는다.
  const [persistent, setPersistent] = useState(true);

  return (
    <div className={styles.frame}>
      <AuthAside
        eyebrow="WELCOME BACK"
        headline={<Catchphrase tone="dark" />}
        lede="한 번 적은 경험은 사라지지 않습니다. 지원할 때마다 처음부터 쓰지 말고, 쌓아 둔 재료에서 골라 뽑아내십시오."
      />

      <div className={styles.formPane}>
        <div className={styles.form}>
          <h1 className={styles.title}>다시 오셨군요</h1>
          <div className={styles.subtitle}>
            계정에 로그인하고 이어서 작업하십시오.
          </div>

          {notice ? (
            <p className={styles.formError} role="alert">
              {notice}
            </p>
          ) : null}

          <SocialSignIn googleEnabled={googleEnabled} persistent={persistent} next={next} />

          <div className={styles.divider}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerLabel}>또는 이메일로</span>
            <span className={styles.dividerLine} />
          </div>

          <form action={action}>
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="persistent" value={persistent ? "1" : "0"} />

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
                placeholder="jiwon@example.com"
                className={`${styles.input} ${
                  state.fieldErrors?.email ? styles.inputInvalid : ""
                }`}
                aria-invalid={state.fieldErrors?.email ? true : undefined}
              />
              {state.fieldErrors?.email ? (
                <p className={styles.fieldError}>{state.fieldErrors.email}</p>
              ) : null}
            </div>

            <div className={styles.field}>
              <div className={styles.fieldHead}>
                <label className={styles.fieldLabel} htmlFor="password">
                  비밀번호
                </label>
                <Link href="/login/forgot" className={styles.fieldAside}>
                  잊으셨나요?
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className={`${styles.input} ${
                  state.fieldErrors?.password ? styles.inputInvalid : ""
                }`}
                aria-invalid={state.fieldErrors?.password ? true : undefined}
              />
              {state.fieldErrors?.password ? (
                <p className={styles.fieldError}>{state.fieldErrors.password}</p>
              ) : null}
            </div>

            <label className={styles.consent}>
              <input
                type="checkbox"
                className={styles.consentInput}
                checked={persistent}
                aria-labelledby="persistent-label"
                onChange={(event) => setPersistent(event.currentTarget.checked)}
              />
              <span
                className={`${styles.consentBox} ${persistent ? styles.consentBoxOn : ""}`}
                aria-hidden="true"
              >
                {persistent ? (
                  <Icon name="check" weight="bold" size={10} color="var(--ex-fg-on-accent)" />
                ) : null}
              </span>
              <span id="persistent-label" className={styles.consentText}>
                로그인 상태 유지 — 공용 기기에서는 끄십시오
              </span>
            </label>

            <button
              type="submit"
              disabled={pending}
              className={`${styles.submit} ${styles.submitSpacingSignup}`}
            >
              {pending ? "확인하는 중" : "로그인"}
            </button>
          </form>

          <div className={styles.foot}>
            계정이 없으신가요?{" "}
            <Link href="/signup" className={styles.footLink}>
              회원가입
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
