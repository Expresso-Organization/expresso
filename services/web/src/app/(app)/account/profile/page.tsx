import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { requireSession } from "@/lib/require-session";

import { AccountNav } from "../AccountNav";
import styles from "../page.module.css";

import { ResendVerificationForm } from "./ResendVerificationForm";

/** ISO 시각에서 날짜만. 결제 내역 줄과 같은 `2026.07.12` 형식이다. */
function formatDay(timestamp: string): string {
  return timestamp.slice(0, 10).replace(/-/g, ".");
}

/**
 * 09 설정 · 프로필 — 계정에 붙어 있는 사실만 보인다.
 *
 * 이메일 인증은 여기 하나로 들어온다. 예전에는 앱 셸 위의 띠가 같은 일을 했는데,
 * 지금 하려던 일과 무관한 안내가 모든 화면의 첫 줄을 차지했다.
 */
export default async function ProfilePage() {
  const session = await requireSession();
  const verifiedAt = session.user.emailVerifiedAt;

  return (
    <>
      <DocumentHeader crumbs={["설정", "프로필"]} />
      <AppBody>
        <div className={styles.body}>
          <AccountNav active="profile" />

          <div className={styles.main}>
            <h1 className={styles.title}>프로필</h1>

            <div className={styles.section}>
              <div className={styles.dataRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.dataTitle}>{session.user.displayName}</div>
                  <div className={styles.dataNote}>표시 이름</div>
                </div>
              </div>

              {/* 확인된 계정은 오른쪽 자리가 비고 날짜만 남는다. 아직이면 보낼 것이 선다. */}
              <div className={`${styles.dataRow} ${styles.verifyRow}`}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.dataTitle}>{session.user.email}</div>
                  {verifiedAt ? (
                    <div className={styles.dataNote}>{formatDay(verifiedAt)} 확인됨</div>
                  ) : (
                    <div className={styles.consentRenew}>
                      인증 전에는 포트폴리오를 공개 주소에 올릴 수 없습니다
                    </div>
                  )}
                </div>
                {verifiedAt ? null : <ResendVerificationForm />}
              </div>
            </div>
          </div>
        </div>
      </AppBody>
    </>
  );
}
