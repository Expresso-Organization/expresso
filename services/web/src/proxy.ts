import { SCENE_RUNTIME_DIRECTORY } from "@expresso/contracts";
import { NextResponse, type NextRequest } from "next/server";

import { loginPath, PATHNAME_HEADER } from "@/lib/auth/next-path";
import {
  SESSION_COOKIE,
  SESSION_KEEP_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session-cookie";
import { publicSiteFromHost, publicSiteUrl } from "@/lib/public-site";

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
 * 세션이 필요한 구간. 로그인·가입·온보딩 도입부는 세션 없이 열려야 하고, `/`는
 * 스스로 로그인 여부를 보고 갈 곳을 정한다. 발행된 `/site/:slug`는 누구나 읽고,
 * 소유자 후보자 화면만 세션이 필요하다.
 */
const SESSION_PATHS = [
  /^\/(?:home|jobs|analytics|career|account|brew|edit)(?:\/|$)/,
  /^\/site\/[^/]+\/candidates(?:\/|$)/,
  /^\/onboarding\/consent$/,
];

/**
 * 공개 사이트 호스트(`{slug}.expresso.ai.kr`)의 요청.
 *
 * 그 호스트에서 열리는 것은 사이트 첫 화면 · 그 화면이 iframe으로 여는 문서(`/document`) ·
 * 방문 기록을 받는 라우트뿐이다. 앱 화면이 남의 이름 아래에서 열리면 안 된다. 사이트 화면이
 * 부르는 `/_next/` 파일과 문서가 부르는 장면 런타임(`/scene-runtime/`)은 통과시킨다.
 */
function servePublicSite(request: NextRequest, slug: string | null): NextResponse {
  const path = request.nextUrl.pathname;
  if (slug && path === "/") return NextResponse.rewrite(new URL(`/site/${slug}${request.nextUrl.search}`, request.url));
  if (slug && path === "/document") return NextResponse.rewrite(new URL(`/site/${slug}/document`, request.url));
  if (slug && (path === "/api/analytics/events" || path.startsWith("/_next/") || path.startsWith(SCENE_RUNTIME_DIRECTORY))) {
    return NextResponse.next();
  }
  // 앱 경로로 다른 사이트를 가리키면(옛 주소가 앱 경로로 넘긴 경우 등) 그 사이트의 공개 주소로 보낸다.
  const other = /^\/site\/([a-z0-9-]+)$/.exec(path)?.[1];
  const target = other ? publicSiteFromHost(new URL(publicSiteUrl(other)).host) : null;
  if (other && target?.site && target.slug) return NextResponse.redirect(publicSiteUrl(other), 308);
  return new NextResponse(null, { status: 404 });
}

export function proxy(request: NextRequest) {
  const site = publicSiteFromHost(request.headers.get("host"));
  if (site.site) return servePublicSite(request, site.slug);

  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (!SESSION_PATHS.some((pattern) => pattern.test(request.nextUrl.pathname))) return NextResponse.next();
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

  return redirectToLogin(request, target);
}

/**
 * 로그인 주소로 보낸다. 주소는 하나이고, 요청 종류에 따라 응답 모양만 다르다.
 *
 * **서버 액션 POST에는 3xx를 내지 않는다.** 307은 POST를 그대로 GET 전용 로그인
 * 경로로 넘겨 405가 나거나, fetch가 따라간 로그인 화면 HTML을 받은 클라이언트가
 * "unexpected response"로 오류 경계에 빠진다. Next 서버가 액션 안의 `redirect()`를
 * 낼 때와 같은 형식을 쓴다(`next/dist/server/app-render/action-handler.js`) —
 * fetch 액션(`next-action` 헤더)은 200 + `x-action-redirect`, 스크립트 없는 폼
 * POST는 303 + `Location`. 클라이언트는 그 헤더를 보고 로그인으로 전체 이동한다.
 */
function redirectToLogin(request: NextRequest, target: string): NextResponse {
  const destination = devLoginEnabled()
    ? new URL(`/api/dev/session?${new URLSearchParams({ next: target })}`, request.url)
    : new URL(loginPath(target), request.url);

  if (request.method === "GET" || request.method === "HEAD") {
    return NextResponse.redirect(destination);
  }
  if (request.headers.has("next-action")) {
    // 경로만 넣는다. 클라이언트가 지금 화면 주소 기준으로 풀어 브라우저의 호스트를
    // 그대로 쓴다 — 프록시가 보는 `request.url`의 호스트는 브라우저 주소와 다를 수 있다.
    return new NextResponse(null, {
      status: 200,
      headers: { "x-action-redirect": `${destination.pathname}${destination.search};replace` },
    });
  }
  return NextResponse.redirect(destination, 303);
}

export const config = {
  /**
   * 공개 사이트 호스트는 경로가 아니라 호스트로 갈리므로 모든 요청을 받는다. 호스트는
   * 실행할 때 정해지는 값이라 matcher에 넣을 수 없다. 세션 구간은 `SESSION_PATHS`가 고른다.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};
