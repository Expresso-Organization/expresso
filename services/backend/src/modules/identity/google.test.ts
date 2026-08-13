import { createHmac, generateKeyPairSync, sign as signWith } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  GoogleIdTokenError,
  GoogleSignInUnavailableError,
  RemoteGoogleIdTokenVerifier,
  UnavailableGoogleIdTokenVerifier,
} from "./google.js";

const CLIENT_ID = "1234567890-expresso.apps.googleusercontent.com";
const NONCE = "n-0S6_WzA2Mj";
const NOW_MS = 1_770_000_000_000;
const NOW_SEC = Math.floor(NOW_MS / 1_000);

const primary = generateKeyPairSync("rsa", { modulusLength: 2048 });
const rotated = generateKeyPairSync("rsa", { modulusLength: 2048 });

function jwkFor(pair: typeof primary, kid: string): Record<string, unknown> {
  return { ...(pair.publicKey.export({ format: "jwk" }) as object), kid, alg: "RS256", use: "sig" };
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function basePayload(): Record<string, unknown> {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "108214736251837462518",
    email: "jiwon@example.com",
    email_verified: true,
    name: "박지원",
    nonce: NONCE,
    iat: NOW_SEC - 30,
    exp: NOW_SEC + 3_570,
  };
}

/** RS256으로 실제 서명한 토큰. 검증기가 통과시켜야 하는 유일한 형태다. */
function issue(
  overrides: {
    payload?: Record<string, unknown>;
    header?: Record<string, unknown>;
    key?: typeof primary;
  } = {},
): string {
  const header = { alg: "RS256", kid: "primary", typ: "JWT", ...overrides.header };
  const payload = { ...basePayload(), ...overrides.payload };
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const key = (overrides.key ?? primary).privateKey;
  const signature = signWith("RSA-SHA256", Buffer.from(signingInput, "utf8"), key);
  return `${signingInput}.${signature.toString("base64url")}`;
}

function verifierWith(
  keys: Record<string, unknown>[] = [jwkFor(primary, "primary")],
): { verifier: RemoteGoogleIdTokenVerifier; calls: () => number } {
  let calls = 0;
  const verifier = new RemoteGoogleIdTokenVerifier({
    clientId: CLIENT_ID,
    now: () => NOW_MS,
    fetchJwks: async () => {
      calls += 1;
      return { keys };
    },
  });
  return { verifier, calls: () => calls };
}

async function rejectionReason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(GoogleIdTokenError);
    return (error as GoogleIdTokenError).reason;
  }
  throw new Error("expected the token to be rejected, but it was accepted");
}

describe("RemoteGoogleIdTokenVerifier", () => {
  it("제대로 서명된 토큰에서 신원을 읽는다", async () => {
    const { verifier } = verifierWith();
    await expect(verifier.verify(issue(), NONCE)).resolves.toEqual({
      subject: "108214736251837462518",
      email: "jiwon@example.com",
      emailVerified: true,
      displayName: "박지원",
    });
  });

  it("email_verified가 거짓이면 그대로 거짓으로 전한다 — 판단은 서비스가 한다", async () => {
    const { verifier } = verifierWith();
    const identity = await verifier.verify(
      issue({ payload: { email_verified: false } }),
      NONCE,
    );
    expect(identity.emailVerified).toBe(false);
  });

  it("이름이 없으면 null이다 — 빈 문자열로 계정을 만들지 않는다", async () => {
    const { verifier } = verifierWith();
    const identity = await verifier.verify(issue({ payload: { name: "   " } }), NONCE);
    expect(identity.displayName).toBeNull();
  });

  /* ── 위조 경로 ── */

  it("alg를 none으로 바꾼 무서명 토큰을 거부한다", async () => {
    const { verifier } = verifierWith();
    const header = encode({ alg: "none", kid: "primary", typ: "JWT" });
    const payload = encode(basePayload());
    const forged = `${header}.${payload}.`;
    expect(await rejectionReason(verifier.verify(forged, NONCE))).toBe("alg is not RS256");
  });

  it("공개키를 HMAC 비밀로 쓴 alg 혼동 토큰을 거부한다", async () => {
    const { verifier } = verifierWith();
    const publicPem = primary.publicKey.export({ type: "spki", format: "pem" }).toString();
    const header = encode({ alg: "HS256", kid: "primary", typ: "JWT" });
    const payload = encode(basePayload());
    const mac = createHmac("sha256", publicPem).update(`${header}.${payload}`).digest("base64url");
    const forged = `${header}.${payload}.${mac}`;
    expect(await rejectionReason(verifier.verify(forged, NONCE))).toBe("alg is not RS256");
  });

  it("다른 키로 서명한 토큰을 거부한다", async () => {
    const { verifier } = verifierWith();
    const forged = issue({ key: rotated });
    expect(await rejectionReason(verifier.verify(forged, NONCE))).toBe(
      "signature does not verify",
    );
  });

  it("서명은 그대로 두고 본문만 바꾼 토큰을 거부한다", async () => {
    const { verifier } = verifierWith();
    const [header, , signature] = issue().split(".") as [string, string, string];
    const swapped = encode({ ...basePayload(), email: "attacker@example.com" });
    expect(
      await rejectionReason(verifier.verify(`${header}.${swapped}.${signature}`, NONCE)),
    ).toBe("signature does not verify");
  });

  it("남의 앱에 발급된 토큰(aud 불일치)을 거부한다", async () => {
    const { verifier } = verifierWith();
    const other = issue({ payload: { aud: "999-someone-else.apps.googleusercontent.com" } });
    expect(await rejectionReason(verifier.verify(other, NONCE))).toBe("aud is not this client");
  });

  it("Google이 아닌 발급자를 거부한다", async () => {
    const { verifier } = verifierWith();
    const other = issue({ payload: { iss: "https://accounts.example.com" } });
    expect(await rejectionReason(verifier.verify(other, NONCE))).toBe("iss is not Google");
  });

  it("nonce가 다르면 거부한다 — 주워 온 토큰의 재생을 막는다", async () => {
    const { verifier } = verifierWith();
    expect(await rejectionReason(verifier.verify(issue(), "다른-nonce"))).toBe(
      "nonce does not match",
    );
  });

  it("만료된 토큰을 거부한다", async () => {
    const { verifier } = verifierWith();
    const stale = issue({ payload: { exp: NOW_SEC - 120, iat: NOW_SEC - 3_700 } });
    expect(await rejectionReason(verifier.verify(stale, NONCE))).toBe("token is expired");
  });

  it("미래에 발급된 토큰을 거부한다", async () => {
    const { verifier } = verifierWith();
    const ahead = issue({ payload: { iat: NOW_SEC + 600, exp: NOW_SEC + 4_000 } });
    expect(await rejectionReason(verifier.verify(ahead, NONCE))).toBe(
      "token is issued in the future",
    );
  });

  it("세 조각이 아닌 문자열을 거부한다", async () => {
    const { verifier } = verifierWith();
    expect(await rejectionReason(verifier.verify("not-a-jwt", NONCE))).toBe(
      "not a three-part JWT",
    );
  });

  /* ── 키 집합 ── */

  it("모르는 kid면 JWKS를 한 번 다시 받고, 그래도 없으면 거부한다", async () => {
    const { verifier, calls } = verifierWith();
    const unknown = issue({ header: { kid: "rotated" } });
    expect(await rejectionReason(verifier.verify(unknown, NONCE))).toBe(
      "kid is not in Google's key set",
    );
    // 최초 1회. 재조회는 JWKS_MIN_REFETCH_MS(60초) 안이라 일어나지 않는다.
    expect(calls()).toBe(1);
  });

  it("연속 검증에 JWKS를 다시 받지 않는다", async () => {
    const { verifier, calls } = verifierWith();
    await verifier.verify(issue(), NONCE);
    await verifier.verify(issue(), NONCE);
    expect(calls()).toBe(1);
  });

  it("RSA가 아닌 키만 있는 JWKS를 거부한다", async () => {
    const { verifier } = verifierWith([{ kty: "EC", kid: "primary", crv: "P-256" }]);
    await expect(verifier.verify(issue(), NONCE)).rejects.toThrow(
      /JWKS has no usable RSA key/,
    );
  });
});

describe("UnavailableGoogleIdTokenVerifier", () => {
  it("설정이 없으면 통과시키지 않고 크게 실패한다", async () => {
    await expect(
      new UnavailableGoogleIdTokenVerifier().verify(),
    ).rejects.toBeInstanceOf(GoogleSignInUnavailableError);
  });
});
