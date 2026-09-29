import type { IssuedIdentitySession } from "@expresso/contracts";
import { cookies } from "next/headers";

import {
  SESSION_COOKIE,
  SESSION_KEEP_COOKIE,
  sessionCookieOptions,
} from "./auth/session-cookie";

export { SESSION_COOKIE } from "./auth/session-cookie";

/**
 * 세션 토큰은 httpOnly 쿠키에만 둔다. 클라이언트 자바스크립트가 읽을 수 없으므로
 * XSS로 토큰이 새어 나가지 않는다.
 */
export async function readAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * 발급된 세션을 쿠키로 옮긴다. 유지 모드는 백엔드가 응답에 적어 준 것을 그대로 따른다 —
 * 쿠키 수명과 서버 세션 수명이 한 곳(`SESSION_POLICY`)에서 나오게.
 */
export async function writeAccessToken(session: IssuedIdentitySession): Promise<void> {
  const store = await cookies();
  const options = sessionCookieOptions(session.persistent);
  store.set(SESSION_COOKIE, session.accessToken, options);
  if (session.persistent) store.set(SESSION_KEEP_COOKIE, "1", options);
  else store.delete(SESSION_KEEP_COOKIE);
}

export async function clearAccessToken(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(SESSION_KEEP_COOKIE);
}
