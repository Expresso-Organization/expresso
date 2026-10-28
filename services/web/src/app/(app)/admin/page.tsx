import { notFound } from "next/navigation";

import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { ApiError } from "@/lib/api/client";
import { admin } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { DummyRow } from "./DummyRow";
import styles from "./page.module.css";

/** 마지막 대신 로그인 시각. 서버에서 한국 시각으로 적어 넘긴다 — 브라우저마다 시간대가 다르다. */
function formatAt(timestamp: string): string {
  return new Date(timestamp).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/**
 * 관리 — 더미 계정. 세션 주인이 관리자가 아니면 페이지가 없는 것처럼 404다.
 *
 * 대신 로그인 중이면 세션 주인은 관리자다(`impersonation`이 있다는 것 자체가 그 뜻이다).
 * 그래서 대신 로그인 중에도 이 화면이 열리고, 다른 더미 계정으로 바로 옮겨 갈 수 있다.
 */
export default async function AdminPage() {
  const session = await requireSession();
  if (session.user.role !== "admin" && !session.user.impersonation) notFound();
  const dummies = await admin.dummies(session.accessToken).then(({ data }) => data).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const most = Math.max(...dummies.map((dummy) => dummy.sourceRecordCount));
  const actingAs = session.user.impersonation ? session.user.id : null;

  return (
    <>
      <DocumentHeader crumbs={["관리"]} />
      <AppBody>
        <div className={styles.main}>
          <h1 className={styles.title}>더미 계정</h1>
          <div className={styles.rows}>
            {dummies.map((dummy) => (
              <DummyRow
                key={dummy.key}
                dummy={dummy}
                volume={most > 0 ? dummy.sourceRecordCount / most : 0}
                acting={dummy.account !== null && dummy.account.userId === actingAs}
                lastImpersonation={dummy.lastImpersonation
                  ? { at: formatAt(dummy.lastImpersonation.at), by: dummy.lastImpersonation.adminDisplayName }
                  : null}
              />
            ))}
          </div>
        </div>
      </AppBody>
    </>
  );
}
