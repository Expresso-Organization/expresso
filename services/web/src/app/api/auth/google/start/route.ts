import {
  buildAuthorizationUrl,
  createHandshake,
  readGoogleOAuthConfig,
} from "@/lib/auth/google";
import { writeHandshake } from "@/lib/auth/oauth-cookies";

/** 이 왕복은 매번 새 난수로 시작한다 — 캐시될 수 있는 응답이 아니다. */
export const dynamic = "force-dynamic";

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

export async function GET(): Promise<Response> {
  const config = readGoogleOAuthConfig();
  if (!config) return seeOther("/login?error=google_unavailable");

  const handshake = createHandshake();
  await writeHandshake(handshake);
  return seeOther(buildAuthorizationUrl(config, handshake));
}
