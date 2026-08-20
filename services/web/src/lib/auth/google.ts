import { createHash, randomBytes } from "node:crypto";

/**
 * Google OAuth의 왕복은 **웹이 돈다.**
 *
 * 인가 코드를 토큰으로 바꾸려면 client secret이 필요하고, 그건 한 곳에만 둔다.
 * 백엔드는 그렇게 받아 온 ID 토큰이 진짜인지만 판단한다 — 그래서 나중에 다른
 * 클라이언트가 붙어도 백엔드의 문은 하나 그대로다.
 *
 * 이 방식의 또 다른 이유: 세션 쿠키는 지금도 웹이 굽는다. 백엔드가 리디렉션
 * 도중에 쿠키를 구우려면 로컬(웹 :3000 / API :4000)에서는 도메인이 달라 공유가
 * 안 된다. 개발과 운영이 다른 길이 되는 것을 피한다.
 */

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * 설정이 없으면 null. 화면은 이걸 보고 버튼을 열지 말지 정한다 —
 * 눌러도 안 되는 버튼을 켜 두지 않는다.
 */
export function readGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Google은 리디렉션 주소를 글자 그대로 비교한다. 요청 헤더에서 추측하지 않고
  // 명시된 값에서만 만든다 — 앞단이 nginx라 헤더는 믿을 것이 못 된다.
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return { clientId, clientSecret, redirectUri: `${baseUrl}/api/auth/google/callback` };
}

export function isGoogleSignInEnabled(): boolean {
  return readGoogleOAuthConfig() !== null;
}

function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

export interface OAuthHandshake {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export function createHandshake(): OAuthHandshake {
  return {
    state: base64url(randomBytes(32)),
    nonce: base64url(randomBytes(32)),
    codeVerifier: base64url(randomBytes(32)),
  };
}

export function buildAuthorizationUrl(
  config: GoogleOAuthConfig,
  handshake: OAuthHandshake,
): string {
  const challenge = base64url(createHash("sha256").update(handshake.codeVerifier).digest());
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", handshake.state);
  // 백엔드가 ID 토큰 안에서 이 값을 확인한다. 다른 데서 받아 온 토큰의 재생을 막는다.
  url.searchParams.set("nonce", handshake.nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // 계정을 여럿 쓰는 사람이 매번 어느 계정인지 고를 수 있게 한다.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export class GoogleTokenExchangeError extends Error {
  constructor(detail: string) {
    super(`google token exchange failed: ${detail}`);
    this.name = "GoogleTokenExchangeError";
  }
}

/** 인가 코드를 ID 토큰으로 바꾼다. 여기가 client secret을 쓰는 유일한 자리다. */
export async function exchangeCodeForIdToken(
  config: GoogleOAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<string> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    // 본문에는 우리 client secret이 섞이지 않지만, 그래도 상태 코드만 남긴다.
    throw new GoogleTokenExchangeError(`http ${response.status}`);
  }

  const body = (await response.json()) as { id_token?: unknown };
  if (typeof body.id_token !== "string" || body.id_token.length === 0) {
    throw new GoogleTokenExchangeError("response has no id_token");
  }
  return body.id_token;
}
