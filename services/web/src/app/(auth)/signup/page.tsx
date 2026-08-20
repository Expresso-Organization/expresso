import { isGoogleSignInEnabled } from "@/lib/auth/google";

import { socialNotice } from "../social-notice";
import { SignupForm } from "./SignupForm";

/** 10b 회원가입 — 가입과 동시에 카테고리 7종이 생긴다. */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <SignupForm googleEnabled={isGoogleSignInEnabled()} notice={socialNotice(error)} />
  );
}
