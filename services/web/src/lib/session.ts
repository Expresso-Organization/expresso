import { cookies } from "next/headers";

/**
 * 세션 토큰은 httpOnly 쿠키에만 둔다. 클라이언트 자바스크립트가 읽을 수 없으므로
 * XSS로 토큰이 새어 나가지 않는다.
 */
export const SESSION_COOKIE = "ex_session";

export async function readAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function writeAccessToken(
  accessToken: string,
  expiresAt: string,
): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearAccessToken(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
