import { Catchphrase } from "@/components/brand/Catchphrase";

import { AuthAside } from "../../AuthAside";
import styles from "../../auth.module.css";
import { socialNotice } from "../../social-notice";
import { ForgotForm } from "./ForgotForm";

/** 10 로그인의 "잊으셨나요?" — 이메일 하나를 받아 재설정 링크를 보낸다. */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className={styles.frame}>
      <AuthAside
        eyebrow="RESET PASSWORD"
        headline={<Catchphrase tone="dark" />}
        lede="가입한 이메일로 링크를 보냅니다. 링크는 30분 동안 한 번만 쓸 수 있습니다."
      />

      <div className={styles.formPane}>
        <ForgotForm notice={socialNotice(error)} />
      </div>
    </div>
  );
}
