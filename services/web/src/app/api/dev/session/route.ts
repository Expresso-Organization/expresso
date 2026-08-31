import { ApiError } from "@/lib/api/client";
import { auth } from "@/lib/api/endpoints";
import { writeAccessToken } from "@/lib/session";

/**
 * 개발용 세션 발급. 매번 손으로 로그인하지 않고 화면을 확인하기 위한 문이다.
 *
 * 인증을 우회하지 않는다 — 개발자가 자기 기계의 환경 변수에 적어 둔 계정으로
 * 제품의 실제 로그인을 대신 수행할 뿐이다. 그래서 여기서 만들어지는 세션은
 * 사람이 로그인해 얻는 세션과 같은 것이고, 권한도 같다.
 *
 * 다음 셋이 모두 참일 때만 라우트가 응답한다. 하나라도 아니면 404다.
 *  - 프로덕션 빌드가 아니다
 *  - DEV_LOGIN=1 을 명시적으로 켰다
 *  - DEV_LOGIN_EMAIL 과 DEV_LOGIN_PASSWORD 가 둘 다 있다
 */
export const dynamic = "force-dynamic";

interface DevLogin {
  email: string;
  password: string;
  displayName: string;
}

function readDevLogin(): DevLogin | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.DEV_LOGIN !== "1") return null;
  const email = process.env.DEV_LOGIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD;
  if (!email || !password) return null;
  return { email, password, displayName: process.env.DEV_LOGIN_NAME ?? "Dev" };
}

/** 열린 리다이렉트를 만들지 않는다. 같은 출처의 경로만 받는다. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/home";
  return value;
}

export async function GET(request: Request): Promise<Response> {
  const login = readDevLogin();
  if (!login) return new Response(null, { status: 404 });

  const session = await issueSession(login);
  await writeAccessToken(session.accessToken, session.expiresAt);

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
    const { data } = await auth.signup(login);
    return data.session;
  }
}
