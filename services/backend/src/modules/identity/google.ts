import type { webcrypto } from "node:crypto";
import { createPublicKey, timingSafeEqual, verify as verifySignature } from "node:crypto";

/**
 * Google ID 토큰 검증.
 *
 * 새 의존성을 들이지 않고 `node:crypto`로 짠다 — 이 모듈의 scrypt(`password.ts`)와
 * 같은 결이다. 대신 JWT 검증에서 사람이 실제로 틀리는 자리를 하나씩 못 박는다.
 *
 * 1. **알고리즘을 고정한다.** 토큰 헤더가 뭐라 주장하든 `RS256`이 아니면 거부한다.
 *    `alg: none`도, 공개키를 HMAC 비밀로 쓰는 혼동 공격도 여기서 끝난다.
 * 2. **`aud`를 우리 클라이언트 ID와 비교한다.** 이게 없으면 남의 앱에 발급된
 *    멀쩡한 Google 토큰으로 우리 계정에 들어올 수 있다.
 * 3. **`nonce`를 웹이 시작 단계에 심어 둔 값과 비교한다.** 다른 데서 주운 토큰의
 *    재생을 막는다.
 * 4. **`exp`/`iat`를 본다.** 서명이 맞아도 만료된 토큰은 토큰이 아니다.
 *
 * 서명 검증 전에 읽는 것은 헤더의 `kid`뿐이고, 그것도 (1)로 좁혀 둔 뒤에 쓴다.
 */

/** JWKS 한 항목. Node는 이 형태를 `createPublicKey({ format: "jwk" })`에 그대로 받는다. */
type Jwk = webcrypto.JsonWebKey;

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
/** Google은 두 형태를 모두 쓴다. 둘 다 정본이다. */
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
/** 기계 시계 차이. RFC 7519가 권하는 "작은 여유"의 통상값. */
const CLOCK_SKEW_SEC = 60;
/** 모르는 `kid`가 와도 이 간격보다 자주 JWKS를 다시 받지 않는다 — 위조 kid로 우리를 시켜 Google을 두드리게 두지 않는다. */
const JWKS_MIN_REFETCH_MS = 60_000;
const JWKS_FALLBACK_TTL_MS = 60 * 60 * 1_000;

export interface GoogleIdentity {
  /** 제공자의 계정 식별자. 이메일과 달리 바뀌지 않는다. */
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
}

export class GoogleIdTokenError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`google id token rejected: ${reason}`);
    this.name = "GoogleIdTokenError";
    this.reason = reason;
  }
}

export class GoogleSignInUnavailableError extends Error {
  constructor() {
    super("google sign-in is not configured (GOOGLE_CLIENT_ID is unset)");
    this.name = "GoogleSignInUnavailableError";
  }
}

export interface GoogleIdTokenVerifier {
  verify(idToken: string, expectedNonce: string): Promise<GoogleIdentity>;
}

/**
 * `GOOGLE_CLIENT_ID`가 없을 때 꽂는 검증기. 조용히 통과시키는 대신 크게 실패한다 —
 * 이 저장소가 규칙 기반 폴백을 걷어낸 것과 같은 이유다.
 */
export class UnavailableGoogleIdTokenVerifier implements GoogleIdTokenVerifier {
  async verify(): Promise<never> {
    throw new GoogleSignInUnavailableError();
  }
}

interface JwksEntry {
  keys: Map<string, Jwk>;
  expiresAt: number;
  fetchedAt: number;
}

function decodeSegment(segment: string, what: string): Record<string, unknown> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new GoogleIdTokenError(`${what} is not valid JSON`);
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw new GoogleIdTokenError(`${what} is not an object`);
  }
  return decoded as Record<string, unknown>;
}

function requireString(
  payload: Record<string, unknown>,
  key: string,
): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new GoogleIdTokenError(`${key} is missing`);
  }
  return value;
}

/** 길이가 달라도 같은 비용을 치른다. nonce는 비밀이므로 비교 시간으로 흘리지 않는다. */
function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) {
    // 같은 길이로 맞춰 한 번 더 비교해 조기 반환의 시간차를 없앤다.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export interface GoogleIdTokenVerifierOptions {
  clientId: string;
  /** 테스트에서 JWKS와 시계를 갈아 끼우는 자리. */
  fetchJwks?: () => Promise<{ keys: unknown; cacheTtlMs?: number }>;
  now?: () => number;
}

export class RemoteGoogleIdTokenVerifier implements GoogleIdTokenVerifier {
  readonly #clientId: string;
  readonly #fetchJwks: () => Promise<{ keys: unknown; cacheTtlMs?: number }>;
  readonly #now: () => number;
  #cache: JwksEntry | null = null;
  #inFlight: Promise<JwksEntry> | null = null;

  constructor(options: GoogleIdTokenVerifierOptions) {
    if (options.clientId.length === 0) {
      throw new RangeError("GOOGLE_CLIENT_ID must not be empty");
    }
    this.#clientId = options.clientId;
    this.#fetchJwks = options.fetchJwks ?? defaultFetchJwks;
    this.#now = options.now ?? Date.now;
  }

  async verify(idToken: string, expectedNonce: string): Promise<GoogleIdentity> {
    const segments = idToken.split(".");
    if (segments.length !== 3) throw new GoogleIdTokenError("not a three-part JWT");
    const [encodedHeader, encodedPayload, encodedSignature] = segments as [
      string,
      string,
      string,
    ];

    const header = decodeSegment(encodedHeader, "header");
    // (1) 알고리즘 고정. 헤더의 주장으로 검증 방식을 고르지 않는다.
    if (header["alg"] !== "RS256") {
      throw new GoogleIdTokenError("alg is not RS256");
    }
    const kid = header["kid"];
    if (typeof kid !== "string" || kid.length === 0) {
      throw new GoogleIdTokenError("kid is missing");
    }

    const jwk = await this.#resolveKey(kid);
    const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8");
    const signature = Buffer.from(encodedSignature, "base64url");
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    if (!verifySignature("RSA-SHA256", signingInput, publicKey, signature)) {
      throw new GoogleIdTokenError("signature does not verify");
    }

    const payload = decodeSegment(encodedPayload, "payload");

    if (!GOOGLE_ISSUERS.has(requireString(payload, "iss"))) {
      throw new GoogleIdTokenError("iss is not Google");
    }

    // (2) 우리 앱에 발급된 토큰인가.
    const audience = payload["aud"];
    const audiences = Array.isArray(audience) ? audience : [audience];
    if (!audiences.includes(this.#clientId)) {
      throw new GoogleIdTokenError("aud is not this client");
    }

    // (3) 우리가 시작시킨 왕복인가.
    if (!constantTimeEquals(requireString(payload, "nonce"), expectedNonce)) {
      throw new GoogleIdTokenError("nonce does not match");
    }

    // (4) 아직 살아 있는가.
    const nowSec = Math.floor(this.#now() / 1_000);
    const exp = payload["exp"];
    const iat = payload["iat"];
    if (typeof exp !== "number" || exp + CLOCK_SKEW_SEC < nowSec) {
      throw new GoogleIdTokenError("token is expired");
    }
    if (typeof iat !== "number" || iat - CLOCK_SKEW_SEC > nowSec) {
      throw new GoogleIdTokenError("token is issued in the future");
    }

    const displayName = payload["name"];
    return {
      subject: requireString(payload, "sub"),
      email: requireString(payload, "email"),
      emailVerified: payload["email_verified"] === true,
      displayName: typeof displayName === "string" && displayName.trim().length > 0
        ? displayName.trim()
        : null,
    };
  }

  async #resolveKey(kid: string): Promise<Jwk> {
    const now = this.#now();
    let entry = this.#cache;

    if (!entry || entry.expiresAt <= now) {
      entry = await this.#loadJwks();
    }

    let jwk = entry.keys.get(kid);
    if (jwk) return jwk;

    // Google이 키를 돌렸을 수 있다. 단 위조 kid로 무한히 부르게 두지는 않는다.
    if (now - entry.fetchedAt >= JWKS_MIN_REFETCH_MS) {
      entry = await this.#loadJwks();
      jwk = entry.keys.get(kid);
      if (jwk) return jwk;
    }

    throw new GoogleIdTokenError("kid is not in Google's key set");
  }

  async #loadJwks(): Promise<JwksEntry> {
    // 동시에 들어온 요청이 같은 왕복을 여러 번 내지 않게 한 번만 부른다.
    this.#inFlight ??= this.#fetchJwks()
      .then((result) => {
        const entry = toJwksEntry(result, this.#now());
        this.#cache = entry;
        return entry;
      })
      .finally(() => {
        this.#inFlight = null;
      });
    return this.#inFlight;
  }
}

function toJwksEntry(
  result: { keys: unknown; cacheTtlMs?: number },
  now: number,
): JwksEntry {
  if (!Array.isArray(result.keys)) {
    throw new GoogleIdTokenError("JWKS has no key array");
  }
  const keys = new Map<string, Jwk>();
  for (const candidate of result.keys) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const jwk = candidate as Record<string, unknown>;
    // RSA 서명 키만 받는다. 다른 종류가 섞여 있으면 우리 쪽에서 쓰지 않는다.
    if (jwk["kty"] !== "RSA") continue;
    if (jwk["alg"] !== undefined && jwk["alg"] !== "RS256") continue;
    const kid = jwk["kid"];
    if (typeof kid !== "string" || kid.length === 0) continue;
    keys.set(kid, jwk as Jwk);
  }
  if (keys.size === 0) throw new GoogleIdTokenError("JWKS has no usable RSA key");

  return {
    keys,
    fetchedAt: now,
    expiresAt: now + (result.cacheTtlMs ?? JWKS_FALLBACK_TTL_MS),
  };
}

async function defaultFetchJwks(): Promise<{ keys: unknown; cacheTtlMs?: number }> {
  const response = await fetch(GOOGLE_JWKS_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new GoogleIdTokenError(`JWKS fetch failed with ${response.status}`);
  }
  const body = (await response.json()) as { keys?: unknown };
  const maxAge = /max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "");
  return {
    keys: body.keys,
    ...(maxAge?.[1] ? { cacheTtlMs: Number(maxAge[1]) * 1_000 } : {}),
  };
}
