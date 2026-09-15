import { NextResponse, type NextRequest } from "next/server";

import { loginPath, PATHNAME_HEADER } from "@/lib/auth/next-path";
import {
  SESSION_COOKIE,
  SESSION_KEEP_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session-cookie";

/**
 * 세션 쿠키가 아예 없는 요청을 화면에 닿기 전에 로그인으로 돌린다.
 *
 * 왜 필요한가 — 구간마다 `loading.tsx`가 생기면서 화면 위에 Suspense 경계가
 * 놓였다. 그 아래에서 `redirect()`가 일어나면 응답은 이미 200으로 시작해
 * 껍데기가 흘러간 뒤라, 로그인하지 않은 사람이 앱 셸 스켈레톤을 한 번 보고
 * 나서야 로그인으로 넘어간다. 여기서 먼저 걸러 내면 307 한 번으로 끝난다.
 *
 * **낙관적 검사다.** 쿠키가 있다는 것과 그 토큰이 살아 있다는 것은 다르다.
 * 진짜 확인은 `requireSession()`이 백엔드에 물어서 하고, 만료된 토큰의 401도
 * 거기서 처리한다. 프록시는 모든 요청(프리페치 포함)에서 도므로 쿠키 유무만
 * 본다 — 문서가 경고하는 대로 여기서 백엔드를 부르지 않는다.
 *
 * **쿠키 만료도 여기서 민다.** 백엔드는 인증된 요청마다 세션 만료를 "지금 + idle"로
 * 연장한다. 쿠키가 그대로면 서버 세션은 살아 있는데 브라우저가 먼저 쿠키를 버려
 * 로그아웃처럼 보인다. 유지 플래그(`ex_session_keep`)가 있는 요청은 두 쿠키를 같은
 * 규칙으로 다시 찍는다. 플래그가 없는 세션은 브라우저 세션 쿠키라 손대지 않는다.
 */
/**
 * 개발 로그인이 켜져 있으면 로그인 대신 그 문으로 보낸다.
 *
 * 화면을 볼 때마다 손으로 로그인하지 않으려고 만든 문인데, 여기서 먼저
 * `/login` 으로 돌려 버리면 주소를 직접 열 때마다 여전히 막힌다. 켜져 있을
 * 때는 보려던 자리를 `next` 로 넘겨 로그인 뒤 그 자리로 돌아오게 한다.
 *
 * 판단은 `/api/dev/session` 이 다시 한다 — 프로덕션이거나 계정 정보가 없으면
 * 그 라우트가 404 다. 여기서 보는 것은 스위치 하나뿐이다.
 */
function devLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "1";
}

export function proxy(request: NextRequest) {
  const target = request.nextUrl.pathname + request.nextUrl.search;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    const headers = new Headers(request.headers);
    headers.set(PATHNAME_HEADER, target);
    const response = NextResponse.next({ request: { headers } });

    if (request.cookies.has(SESSION_KEEP_COOKIE)) {
      const options = sessionCookieOptions(true);
      response.cookies.set(SESSION_COOKIE, token, options);
      response.cookies.set(SESSION_KEEP_COOKIE, "1", options);
    }
    return response;
  }

  if (devLoginEnabled()) {
    const dev = new URL("/api/dev/session", request.url);
    dev.searchParams.set("next", target);
    return NextResponse.redirect(dev);
  }

  return NextResponse.redirect(new URL(loginPath(target), request.url));
}

export const config = {
  /**
   * 세션이 필요한 구간만 건다. 로그인·가입·온보딩 도입부는 세션 없이 열려야
   * 하고, `/`는 스스로 로그인 여부를 보고 갈 곳을 정한다.
   */
  matcher: [
    "/home/:path*",
    "/jobs/:path*",
    "/analytics/:path*",
    "/career/:path*",
    "/account/:path*",
    "/brew/:path*",
    "/edit/:path*",
    // 발행된 `/site/:slug`는 누구나 읽는다. 소유자 후보자 화면만 세션이 필요하다.
    "/site/:slug/candidates/:path*",
    "/onboarding/consent",
  ],
};
