"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { signupAction, type AuthFormState } from "@/app/auth-actions";
import { Catchphrase } from "@/components/brand/Catchphrase";
import { Icon } from "@/components/ui/Icon";

import { AuthAside } from "../AuthAside";
import { SocialSignIn } from "../SocialSignIn";
import styles from "../auth.module.css";

const INITIAL: AuthFormState = {};

/** 화면 정의서의 4칸 강도 표시. 서버가 요구하는 최소 길이는 10자다. */
function passwordStrength(value: string): { slots: number; label: string } {
  if (value.length === 0) return { slots: 0, label: "" };
  let slots = 1;
  if (value.length >= 10) slots += 1;
  if (/[^A-Za-z0-9]/.test(value)) slots += 1;
  if (/\d/.test(value) && /[A-Za-z]/.test(value)) slots += 1;
  const label = slots >= 4 ? "매우 강함" : slots === 3 ? "강함" : slots === 2 ? "보통" : "약함";
  return { slots, label };
}

export function SignupForm({
  googleEnabled,
  notice,
}: {
  googleEnabled: boolean;
  notice?: string | undefined;
}) {
  const [state, action, pending] = useActionState(signupAction, INITIAL);
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const strength = passwordStrength(password);

  return (
    <div className={styles.frame}>
      <AuthAside
        eyebrow="GET STARTED"
        headline={<Catchphrase tone="dark" />}
        lede="가입하면 커리어 카테고리 7종이 자동으로 만들어집니다. 이력서 한 장만 올려도 기록이 채워지기 시작합니다."
      />

      <div className={styles.formPane}>
        <div className={styles.form}>
          <h1 className={styles.title}>계정 만들기</h1>
          <div className={styles.subtitle}>
            무료로 시작하고, 필요할 때 올리십시오.
          </div>

          {notice ? (
            <p className={styles.formError} role="alert">
              {notice}
            </p>
          ) : null}

          <SocialSignIn googleEnabled={googleEnabled} verb="가입" />

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
                <label className={styles.fieldLabel} htmlFor="displayName">
                  이름
                </label>
              </div>
              <input
                id="displayName"
                name="displayName"
                autoComplete="name"
                required
                placeholder="김지원"
                className={`${styles.input} ${
                  state.fieldErrors?.displayName ? styles.inputInvalid : ""
                }`}
              />
              {state.fieldErrors?.displayName ? (
                <p className={styles.fieldError}>
                  {state.fieldErrors.displayName}
                </p>
              ) : null}
            </div>

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
                {strength.label ? (
                  <span className={`${styles.fieldAside} ${styles.strengthLabel}`}>
                    {strength.label}
                  </span>
                ) : null}
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                placeholder="10자 이상"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                className={`${styles.input} ${
                  state.fieldErrors?.password ? styles.inputInvalid : ""
                }`}
              />
              <div className={styles.strength} aria-hidden="true">
                {[1, 2, 3, 4].map((slot) => (
                  <span
                    key={slot}
                    className={`${styles.strengthSlot} ${
                      slot <= strength.slots ? styles.strengthOn : ""
                    }`}
                  />
                ))}
              </div>
              {state.fieldErrors?.password ? (
                <p className={styles.fieldError}>{state.fieldErrors.password}</p>
              ) : null}
            </div>

            <div className={styles.consent}>
              <button
                type="button"
                role="checkbox"
                aria-checked={agreed}
                aria-label="이용약관과 개인정보 처리방침에 동의"
                onClick={() => setAgreed(!agreed)}
                className={`${styles.consentBox} ${agreed ? styles.consentBoxOn : ""}`}
              >
                {agreed ? (
                  <Icon name="check" weight="bold" size={10} color="var(--ex-fg-on-accent)" />
                ) : null}
              </button>
              <span className={styles.consentText}>
                <span className={styles.consentLink}>이용약관</span>과{" "}
                <span className={styles.consentLink}>개인정보 처리방침</span>에
                동의합니다
              </span>
            </div>

            <button
              type="submit"
              disabled={pending || !agreed}
              className={`${styles.submit} ${styles.submitSpacingSignup}`}
            >
              {pending ? "만드는 중" : "무료로 시작하기"}
            </button>
          </form>

          <div className={styles.foot}>
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className={styles.footLink}>
              로그인
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
