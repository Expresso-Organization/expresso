import { redirect } from "next/navigation";

import { isGoogleSignInEnabled } from "@/lib/auth/google";
import { safeNext } from "@/lib/auth/next-path";
import { readAccessToken } from "@/lib/session";

import { socialNotice } from "../social-notice";
import { SignupForm } from "./SignupForm";

/** 10b 회원가입 — 가입과 동시에 카테고리 7종이 생긴다. 이미 로그인한 사람은 홈으로. */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (await readAccessToken()) redirect(safeNext(null));

  return (
    <SignupForm googleEnabled={isGoogleSignInEnabled()} notice={socialNotice(error)} />
  );
}
