import { loginPath } from "@/lib/auth/next-path";
import { clearAccessToken } from "@/lib/session";

/**
 * 백엔드가 401로 답한 세션 쿠키를 지우고 로그인으로 보낸다.
 *
 * 왜 라우트 핸들러인가 — `requireSession()`은 Server Component 렌더 중에 401을 만나는데,
 * 그 자리에서는 Next.js가 쿠키를 지우지 못하게 한다. 지우지 않으면 `/`가 쿠키만 보고
 * `/home`으로 보내고, `/home`이 다시 `/login`으로 보내는 왕복이 매번 반복된다.
 *
 * 지우는 것은 브라우저의 쿠키뿐이다. 서버 세션은 이미 만료·취소된 상태라 여기서 더 할 일이
 * 없다. 링크 하나로 남을 여기에 보내 쿠키를 지우게 할 수는 있지만 그건 로그아웃일 뿐이고,
 * `next`는 `safeNext`가 걸러 열린 리다이렉트가 되지 않는다.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  await clearAccessToken();
  const next = new URL(request.url).searchParams.get("next");
  return new Response(null, { status: 303, headers: { location: loginPath(next) } });
}
