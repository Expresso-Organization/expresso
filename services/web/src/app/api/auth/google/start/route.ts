import {
  buildAuthorizationUrl,
  createHandshake,
  readGoogleOAuthConfig,
} from "@/lib/auth/google";
import { safeNext } from "@/lib/auth/next-path";
import { writeHandshake } from "@/lib/auth/oauth-cookies";

/** 이 왕복은 매번 새 난수로 시작한다 — 캐시될 수 있는 응답이 아니다. */
export const dynamic = "force-dynamic";

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

/**
 * 로그인 화면의 선택 두 가지를 쿠키에 싣고 Google로 나간다.
 *
 * - `persistent=0`이면 유지 끔. 그 외(없음 포함)는 켬 — 기본과 같다.
 * - `next`는 로그인 뒤 돌아갈 자리. 여기서 한 번 걸러 두면 되돌아온 뒤 다시 볼 필요가 없다.
 */
export async function GET(request: Request): Promise<Response> {
  const config = readGoogleOAuthConfig();
  if (!config) return seeOther("/login?error=google_unavailable");

  const params = new URL(request.url).searchParams;
  const handshake = {
    ...createHandshake(),
    persistent: params.get("persistent") !== "0",
    next: safeNext(params.get("next")),
  };
  await writeHandshake(handshake);
  return seeOther(buildAuthorizationUrl(config, handshake));
}
