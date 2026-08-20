import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/session";

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
 * 거기서 로그인으로 보낸다. 프록시는 모든 요청(프리페치 포함)에서 도므로
 * 쿠키 유무만 본다 — 문서가 경고하는 대로 여기서 백엔드를 부르지 않는다.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
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
    "/site/:path*",
    "/onboarding/consent",
  ],
};
