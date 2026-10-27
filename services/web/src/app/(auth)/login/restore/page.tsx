import { cookies } from "next/headers";

import { DELETION_CODE_COOKIE } from "@/lib/auth/deletion-code";
import { Catchphrase } from "@/components/brand/Catchphrase";

import { AuthAside } from "../../AuthAside";
import styles from "../../auth.module.css";
import { RestoreForm } from "./RestoreForm";

/**
 * 09 계정 삭제 취소 — 삭제를 요청할 때 한 번 받은 코드로 30일 안에 되돌린다.
 *
 * 방금 삭제를 요청하고 넘어왔으면 취소 코드가 쿠키로 함께 온다. 그때만 코드를 보인다.
 */
export default async function RestoreAccountPage() {
  const issuedCode = (await cookies()).get(DELETION_CODE_COOKIE)?.value ?? null;
  return (
    <div className={styles.frame}>
      <AuthAside
        eyebrow="RESTORE ACCOUNT"
        headline={<Catchphrase tone="dark" />}
        lede="삭제를 요청한 뒤 30일 동안은 받은 취소 코드로 계정을 되돌릴 수 있습니다. 되돌리면 기록과 포트폴리오가 요청 전 그대로 돌아옵니다."
      />

      <div className={styles.formPane}>
        <RestoreForm issuedCode={issuedCode} />
      </div>
    </div>
  );
}
