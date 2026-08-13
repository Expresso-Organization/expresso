import { redirect } from "next/navigation";

import { Catchphrase } from "@/components/brand/Catchphrase";
import { readPendingLink } from "@/lib/auth/oauth-cookies";

import { AuthAside } from "../../AuthAside";
import styles from "../../auth.module.css";
import { ConnectForm } from "./ConnectForm";

/**
 * Google로 들어왔는데 그 이메일이 이미 비밀번호 계정일 때 서는 자리.
 *
 * 여기까지 온 사람에게는 **아직 세션이 없다.** 비밀번호를 확인해야 잇고, 그
 * 확인이 소유 증명이다 — 이 서비스에는 이메일 인증이 없어서 주소가 같다는
 * 것만으로는 같은 사람이라고 볼 근거가 없다.
 */
export default async function ConnectGooglePage() {
  const pending = await readPendingLink();
  // 대기 중인 신원이 없으면 볼 것이 없다. 10분이 지났거나 직접 들어온 주소다.
  if (!pending) redirect("/login");

  return (
    <div className={styles.frame}>
      <AuthAside
        eyebrow="ONE MORE STEP"
        headline={<Catchphrase tone="dark" />}
        lede="이 이메일로 만든 계정이 이미 있습니다. 확인만 하면 두 방법이 한 계정으로 합쳐집니다."
      />

      <div className={styles.formPane}>
        <ConnectForm email={pending.email} />
      </div>
    </div>
  );
}
