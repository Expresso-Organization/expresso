import { cookies } from "next/headers";

/**
 * OAuth 왕복 중에만 사는 쿠키들.
 *
 * 전부 httpOnly다 — 자바스크립트가 읽을 수 없어야 한다. 세션 쿠키와 같은 원칙이고
 * 같은 이유다(`lib/session.ts`).
 */

const HANDSHAKE_COOKIE = "ex_oauth";
const PENDING_COOKIE = "ex_google_pending";

/**
 * 10분. 동의 화면에서 사람이 머뭇거릴 시간은 되고, 남의 브라우저에 남아
 * 쓸모를 유지할 시간은 안 된다.
 */
const HANDSHAKE_TTL_SEC = 10 * 60;

function options(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export interface Handshake {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export async function writeHandshake(handshake: Handshake): Promise<void> {
  const store = await cookies();
  store.set(HANDSHAKE_COOKIE, JSON.stringify(handshake), options(HANDSHAKE_TTL_SEC));
}

export async function takeHandshake(): Promise<Handshake | null> {
  const store = await cookies();
  const raw = store.get(HANDSHAKE_COOKIE)?.value;
  // 한 번 쓰면 버린다. 같은 왕복을 두 번 완성할 수 없다.
  store.delete(HANDSHAKE_COOKIE);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { state, nonce, codeVerifier } = parsed as Record<string, unknown>;
    if (typeof state !== "string" || typeof nonce !== "string" || typeof codeVerifier !== "string") {
      return null;
    }
    return { state, nonce, codeVerifier };
  } catch {
    return null;
  }
}

/**
 * 비밀번호 확인을 기다리는 Google 신원.
 *
 * ID 토큰을 잠깐 들고 있는 것이라 httpOnly에 10분이다. 이것만으로는 아무것도
 * 안 된다 — 백엔드가 비밀번호를 함께 요구한다.
 */
export interface PendingGoogleLink {
  idToken: string;
  nonce: string;
  email: string;
}

export async function writePendingLink(pending: PendingGoogleLink): Promise<void> {
  const store = await cookies();
  store.set(PENDING_COOKIE, JSON.stringify(pending), options(HANDSHAKE_TTL_SEC));
}

export async function readPendingLink(): Promise<PendingGoogleLink | null> {
  const store = await cookies();
  const raw = store.get(PENDING_COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { idToken, nonce, email } = parsed as Record<string, unknown>;
    if (typeof idToken !== "string" || typeof nonce !== "string" || typeof email !== "string") {
      return null;
    }
    return { idToken, nonce, email };
  } catch {
    return null;
  }
}

export async function clearPendingLink(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_COOKIE);
}
