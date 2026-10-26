import { SESSION_POLICY } from "@expresso/contracts";

/**
 * 세션 쿠키의 이름과 옵션. `next/headers`를 가져오지 않는다 — 프록시(`proxy.ts`)와
 * 서버 액션(`lib/session.ts`)이 같은 값을 보게 하려는 파일이다.
 *
 * - `ex_session` — 토큰. httpOnly 하나에만 둔다는 원칙은 그대로다.
 * - `ex_session_keep` — "로그인 상태 유지"를 켰다는 표시(값 `1`). 토큰이 아니라
 *   프록시가 백엔드를 묻지 않고도 쿠키 만료를 앞으로 밀어도 되는지 알기 위한 플래그다.
 *   유지를 끈 세션에는 이 쿠키가 없고, 두 쿠키 모두 브라우저를 닫으면 사라진다.
 */
export const SESSION_COOKIE = "ex_session";
export const SESSION_KEEP_COOKIE = "ex_session_keep";

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  expires?: Date;
}

/**
 * 유지 켬이면 `expires`를 "지금 + 유지 idle" 로 찍는다. 서버 세션은 요청마다 같은 규칙으로
 * 연장되므로 쿠키도 같은 시각까지 살면 된다. 절대 상한은 백엔드가 지키고, 상한에 걸린
 * 세션은 401로 드러나 그 자리에서 지워진다(`/api/auth/expired`).
 *
 * 유지 끔이면 `expires`를 두지 않는다 — 브라우저 세션 쿠키.
 */
export function sessionCookieOptions(persistent: boolean, now = Date.now()): SessionCookieOptions {
  const base: SessionCookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  return persistent ? { ...base, expires: new Date(now + SESSION_POLICY.persistent.idleMs) } : base;
}
