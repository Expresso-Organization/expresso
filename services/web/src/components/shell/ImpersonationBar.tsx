import { endImpersonationAction } from "@/app/admin-actions";
import { Icon } from "@/components/ui/Icon";
import { requireSession } from "@/lib/require-session";

import styles from "./AppShell.module.css";

/**
 * 대신 로그인 띠. 관리자가 더미 계정으로 보고 있는 동안 모든 앱 화면 맨 위에 선다.
 *
 * 어두운 지면이 셸 위를 가로질러 지금 화면이 관리자 본인의 것이 아님을 보여 주고,
 * 오른쪽 버튼 하나로 관리 화면에 돌아간다. 대신 로그인이 아니면 아무것도 그리지 않는다.
 */
export async function ImpersonationBar() {
  const { user } = await requireSession();
  if (!user.impersonation) return null;
  return (
    <div className={styles.impersonation} role="status">
      <Icon name="user-switch" size={15} />
      <span className={styles.impersonationName}>{user.displayName}</span>
      <form action={endImpersonationAction} className={styles.impersonationForm}>
        <button type="submit" className={styles.impersonationReturn}>관리자로 돌아가기</button>
      </form>
    </div>
  );
}
