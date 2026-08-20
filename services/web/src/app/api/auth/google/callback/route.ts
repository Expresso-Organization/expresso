import { timingSafeEqual } from "node:crypto";

import { ApiError } from "@/lib/api/client";
import { auth } from "@/lib/api/endpoints";
import { exchangeCodeForIdToken, readGoogleOAuthConfig } from "@/lib/auth/google";
import { takeHandshake, writePendingLink } from "@/lib/auth/oauth-cookies";
import { writeAccessToken } from "@/lib/session";

export const dynamic = "force-dynamic";

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

function sameState(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Google이 사람을 여기로 되돌려보낸다.
 *
 * 순서가 곧 방어다. **state를 먼저 본다** — 우리가 시작시키지 않은 왕복이면
 * 코드 교환까지 가지 않는다(CSRF). 그다음 PKCE 검증자와 함께 코드를 토큰으로
 * 바꾸고, 토큰의 진위는 백엔드가 판단한다. 여기서는 아무것도 신뢰하지 않는다.
 */
export async function GET(request: Request): Promise<Response> {
  const config = readGoogleOAuthConfig();
  if (!config) return seeOther("/login?error=google_unavailable");

  // 시작 쿠키는 읽는 즉시 버린다. 성공하든 실패하든 한 번 쓰고 끝이다.
  const handshake = await takeHandshake();
  const params = new URL(request.url).searchParams;

  // 사용자가 동의 화면에서 취소했다. 오류가 아니라 선택이므로 조용히 되돌린다.
  if (params.get("error") === "access_denied") return seeOther("/login");
  if (params.get("error")) return seeOther("/login?error=google_failed");

  const code = params.get("code");
  const state = params.get("state");
  if (!handshake || !code || !state || !sameState(state, handshake.state)) {
    return seeOther("/login?error=google_expired");
  }

  let idToken: string;
  try {
    idToken = await exchangeCodeForIdToken(config, code, handshake.codeVerifier);
  } catch {
    return seeOther("/login?error=google_failed");
  }

  try {
    const { data } = await auth.google({ idToken, nonce: handshake.nonce });
    await writeAccessToken(data.session.accessToken, data.session.expiresAt);
    // 10b → 10c. 새로 만든 계정만 온보딩으로 들어간다.
    return seeOther(data.created ? "/onboarding/goal" : "/home");
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    // 같은 이메일의 비밀번호 계정이 있다. 세션은 아직 없다 — 비밀번호를 확인받는다.
    if (error.status === 409 && error.details?.["reason"] === "password_confirmation_required") {
      const email = error.details["email"];
      if (typeof email === "string") {
        await writePendingLink({ idToken, nonce: handshake.nonce, email });
        return seeOther("/login/connect");
      }
    }
    if (error.status === 503) return seeOther("/login?error=google_unavailable");
    return seeOther("/login?error=google_failed");
  }
}
