import { isGoogleSignInEnabled } from "@/lib/auth/google";

import { socialNotice } from "../social-notice";
import { LoginForm } from "./LoginForm";
import { readDemoAccount } from "./demo-account";

/**
 * 10 로그인 — "소셜 우선. 이메일은 대안으로 둡니다".
 *
 * Google 로그인 활성화 여부와 개발용 데모 계정 표시를 서버에서 정한다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <LoginForm
      googleEnabled={isGoogleSignInEnabled()}
      notice={socialNotice(error)}
      demoAccount={readDemoAccount()}
    />
  );
}
