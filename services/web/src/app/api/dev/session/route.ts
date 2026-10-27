import { TERMS_VERSION } from "@expresso/contracts";

import { ApiError } from "@/lib/api/client";
import { auth } from "@/lib/api/endpoints";
import { readDevLogin, type DevLogin } from "@/lib/auth/dev-login";
import { safeNext } from "@/lib/auth/next-path";
import { writeAccessToken } from "@/lib/session";

/**
 * 개발용 세션 발급. 매번 손으로 로그인하지 않고 화면을 확인하기 위한 문이다.
 *
 * 인증을 우회하지 않는다 — 환경 변수에 적어 둔 계정으로 제품의 실제 로그인을
 * 대신 수행할 뿐이다. 그래서 여기서 만들어지는 세션은 사람이 로그인해 얻는
 * 세션과 같은 것이고, 권한도 같다.
 *
 * 응답하는 조건은 `readDevLogin()` 한 곳에 있다 — `DEV_LOGIN=1` 과
 * `DEV_LOGIN_EMAIL` · `DEV_LOGIN_PASSWORD`. 하나라도 아니면 404다.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const login = readDevLogin();
  if (!login) return new Response(null, { status: 404 });

  await writeAccessToken(await issueSession(login));

  const next = safeNext(new URL(request.url).searchParams.get("next"));
  return new Response(null, { status: 303, headers: { location: next } });
}

/** 계정이 아직 없으면 한 번 만든다. 그 뒤로는 평범한 로그인이다. */
async function issueSession(login: DevLogin) {
  try {
    const { data } = await auth.login({ email: login.email, password: login.password });
    return data.session;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    // 개발자 자신의 계정이다. 현재 판의 약관에 동의한 것으로 적는다.
    const { data } = await auth.signup({ ...login, termsVersion: TERMS_VERSION });
    return data.session;
  }
}
