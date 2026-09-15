import { redirect } from "next/navigation";

import { isGoogleSignInEnabled } from "@/lib/auth/google";
import { safeNext } from "@/lib/auth/next-path";
import { readAccessToken } from "@/lib/session";

import { socialNotice } from "../social-notice";
import { LoginForm } from "./LoginForm";

/**
 * 10 로그인 — "소셜 우선. 이메일은 대안으로 둡니다".
 *
 * 서버에서 정하는 것은 둘이다. **Google 버튼을 열 수 있는가** — 클라이언트 ID와
 * 시크릿이 있어야 왕복이 돌고, 없으면 버튼을 켜 두지 않는다. 그리고 **이미 로그인한
 * 사람인가** — 쿠키가 있으면 폼을 보이지 않고 보려던 자리로 보낸다. 쿠키만 보는
 * 낙관적 판단이라 만료된 세션이면 그쪽 화면이 401을 받아 쿠키를 지우고 다시 여기로 온다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  if (await readAccessToken()) redirect(safeNext(next));

  return (
    <LoginForm
      googleEnabled={isGoogleSignInEnabled()}
      notice={socialNotice(error)}
      next={safeNext(next)}
    />
  );
}
