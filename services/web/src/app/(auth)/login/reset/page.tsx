import { PasswordResetTokenSchema } from "@expresso/contracts";
import { redirect } from "next/navigation";

import { Catchphrase } from "@/components/brand/Catchphrase";

import { AuthAside } from "../../AuthAside";
import styles from "../../auth.module.css";
import { ResetForm } from "./ResetForm";

/**
 * 메일의 링크가 여기로 온다. 토큰의 진위는 제출할 때 백엔드가 본다 — 여기서는 형식만
 * 보고, 형식이 아니면 링크를 다시 받는 자리로 보낸다.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const parsed = PasswordResetTokenSchema.safeParse(token);
  if (!parsed.success) redirect("/login/forgot?error=reset_invalid");

  return (
    <div className={styles.frame}>
      <AuthAside
        eyebrow="NEW PASSWORD"
        headline={<Catchphrase tone="dark" />}
        lede="새 비밀번호를 정하면 이 계정의 다른 기기 로그인은 모두 끊기고, 이 브라우저만 로그인된 상태로 남습니다."
      />

      <div className={styles.formPane}>
        <ResetForm token={parsed.data} />
      </div>
    </div>
  );
}
