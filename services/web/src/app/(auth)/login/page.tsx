"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type AuthFormState } from "@/app/auth-actions";
import { Icon } from "@/components/ui/Icon";

import { AuthAside } from "../AuthAside";
import styles from "../auth.module.css";

const INITIAL: AuthFormState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, INITIAL);

  return (
    <div className={styles.frame}>
      <AuthAside
        eyebrow="WELCOME BACK"
        headline={
          <>
            기록은 쌓아 두고,
            <br />
            공고가 뜨면 꺼내 씁니다
          </>
        }
        lede="한 번 적은 경험은 사라지지 않습니다. 지원할 때마다 처음부터 쓰지 말고, 쌓아 둔 재료에서 골라 뽑아내십시오."
      />

      <div className={styles.formPane}>
        <div className={styles.form}>
          <h1 className={styles.title}>다시 오셨군요</h1>
          <div className={styles.subtitle}>
            계정에 로그인하고 이어서 작업하십시오.
          </div>

          {/* 소셜 로그인은 백엔드에 OAuth 경로가 생기면 연결한다 */}
          <div className={styles.socials}>
            <button type="button" className={styles.social} disabled>
              <Icon name="github-logo" weight="fill" size={16} />
              GitHub으로 계속
            </button>
            <button type="button" className={styles.social} disabled>
              <Icon name="google-chrome-logo" weight="fill" size={16} />
              Google로 계속
            </button>
          </div>

          <div className={styles.divider}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerLabel}>또는 이메일로</span>
            <span className={styles.dividerLine} />
          </div>

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
                <span className={styles.fieldAside}>잊으셨나요?</span>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className={styles.input}
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className={`${styles.submit} ${styles.submitSpacingLogin}`}
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
