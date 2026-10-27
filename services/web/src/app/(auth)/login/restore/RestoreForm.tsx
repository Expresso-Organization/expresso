"use client";

import Link from "next/link";
import { useActionState } from "react";

import { cancelDeletionAction, dismissDeletionCodeAction, type RestoreState } from "@/app/account-actions";
import { Icon } from "@/components/ui/Icon";

import styles from "../../auth.module.css";

const INITIAL: RestoreState = {};

export function RestoreForm({ issuedCode }: { issuedCode: string | null }) {
  const [state, action, pending] = useActionState(cancelDeletionAction, INITIAL);

  if (state.restored) {
    return (
      <div className={styles.form}>
        <h1 className={styles.title}>계정을 되돌렸습니다</h1>
        <div className={styles.subtitle}>
          삭제 요청을 취소했습니다. 공개했던 포트폴리오도 요청 전 상태로 돌아갔습니다. 다시
          로그인해 주세요.
        </div>
        <div className={styles.foot}>
          <Link href="/login" className={styles.footLink}>
            <Icon name="arrow-left" size={14} /> 로그인으로 가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <h1 className={styles.title}>계정 삭제 취소</h1>
      <div className={styles.subtitle}>삭제를 요청할 때 받은 취소 코드를 붙여 넣어 주세요.</div>

      {issuedCode ? (
        <div className={styles.issuedCode} role="status">
          <div>
            삭제를 요청했고 로그아웃했습니다. 30일 뒤 모두 지웁니다. 그 전에 되돌리려면 아래
            코드가 필요합니다. 10분이 지나거나 「코드를 적어 뒀습니다」를 누르면 다시 볼 수
            없으니 지금 적어 두세요.
          </div>
          <code className={styles.issuedCodeValue}>{issuedCode}</code>
          <form action={dismissDeletionCodeAction}>
            <button type="submit" className={styles.issuedCodeDismiss}>
              코드를 적어 뒀습니다
            </button>
          </form>
        </div>
      ) : null}

      <form action={action}>
        {state.error ? (
          <p className={styles.formError} role="alert">
            {state.error}
          </p>
        ) : null}

        <div className={styles.field}>
          <div className={styles.fieldHead}>
            <label className={styles.fieldLabel} htmlFor="cancellationToken">
              취소 코드
            </label>
          </div>
          <input
            id="cancellationToken"
            name="cancellationToken"
            required
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className={styles.input}
          />
        </div>

        <button type="submit" disabled={pending} className={`${styles.submit} ${styles.submitSpacingLogin}`}>
          {pending ? "되돌리는 중" : "삭제 취소하기"}
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
