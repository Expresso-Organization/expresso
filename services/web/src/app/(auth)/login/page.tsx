import { isGoogleSignInEnabled } from "@/lib/auth/google";

import { socialNotice } from "../social-notice";
import { LoginForm } from "./LoginForm";

/**
 * 10 로그인 — "소셜 우선. 이메일은 대안으로 둡니다".
 *
 * 서버에서 정하는 것은 하나다: **Google 버튼을 열 수 있는가.** 클라이언트 ID와
 * 시크릿이 있어야 왕복이 돌고, 없으면 버튼을 켜 두지 않는다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <LoginForm googleEnabled={isGoogleSignInEnabled()} notice={socialNotice(error)} />
  );
}
