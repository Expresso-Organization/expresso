import { requireSession } from "@/lib/require-session";

import { ResendVerificationForm } from "./ResendVerificationForm";
import styles from "./EmailVerificationNotice.module.css";

/**
 * 미인증 계정에 보이는 띠. `AppChrome`이 본문 위에 Suspense로 놓는다.
 *
 * `requireSession()`은 요청 안에서 캐시되므로 사이드바가 이미 부른 것을 그대로 쓴다 —
 * 백엔드 호출이 늘지 않는다.
 */
export async function EmailVerificationNotice() {
  const session = await requireSession();
  if (session.user.emailVerifiedAt) return null;

  return (
    <div className={styles.strip} role="status">
      <span className={styles.text}>
        <span className={styles.email}>{session.user.email}</span>이(가) 본인 주소인지 아직
        확인하지 않았습니다. 확인 전에는 포트폴리오를 공개 주소에 올릴 수 없습니다.
      </span>
      <ResendVerificationForm />
    </div>
  );
}
