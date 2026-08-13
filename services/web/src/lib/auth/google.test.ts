import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildAuthorizationUrl,
  createHandshake,
  isGoogleSignInEnabled,
  readGoogleOAuthConfig,
} from "./google";

const KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_BASE_URL"] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

function configure(overrides: Partial<Record<(typeof KEYS)[number], string>> = {}): void {
  process.env["GOOGLE_CLIENT_ID"] = "expresso.apps.googleusercontent.com";
  process.env["GOOGLE_CLIENT_SECRET"] = "secret-value";
  process.env["APP_BASE_URL"] = "https://expresso.ai.kr";
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
}

describe("readGoogleOAuthConfig", () => {
  it("시크릿이 없으면 설정이 아니다 — 절반만 켜진 상태를 만들지 않는다", () => {
    configure();
    delete process.env["GOOGLE_CLIENT_SECRET"];
    expect(readGoogleOAuthConfig()).toBeNull();
    expect(isGoogleSignInEnabled()).toBe(false);
  });

  it("클라이언트 ID가 없어도 설정이 아니다", () => {
    configure();
    delete process.env["GOOGLE_CLIENT_ID"];
    expect(readGoogleOAuthConfig()).toBeNull();
  });

  it("리디렉션 주소를 APP_BASE_URL에서 만든다", () => {
    configure();
    expect(readGoogleOAuthConfig()?.redirectUri).toBe(
      "https://expresso.ai.kr/api/auth/google/callback",
    );
  });

  it("APP_BASE_URL 끝의 슬래시를 흘리지 않는다 — Google은 글자 그대로 비교한다", () => {
    configure({ APP_BASE_URL: "https://expresso.ai.kr///" });
    expect(readGoogleOAuthConfig()?.redirectUri).toBe(
      "https://expresso.ai.kr/api/auth/google/callback",
    );
  });

  it("APP_BASE_URL이 없으면 로컬 개발 주소를 쓴다", () => {
    configure();
    delete process.env["APP_BASE_URL"];
    expect(readGoogleOAuthConfig()?.redirectUri).toBe(
      "http://localhost:3000/api/auth/google/callback",
    );
  });
});

describe("buildAuthorizationUrl", () => {
  it("PKCE 챌린지가 검증자의 S256이다", () => {
    configure();
    const config = readGoogleOAuthConfig();
    if (!config) throw new Error("config should be present");
    const handshake = createHandshake();

    const url = new URL(buildAuthorizationUrl(config, handshake));
    const expected = createHash("sha256")
      .update(handshake.codeVerifier)
      .digest()
      .toString("base64url");

    expect(url.searchParams.get("code_challenge")).toBe(expected);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("Google에 보내는 값이 전부 붙는다", () => {
    configure();
    const config = readGoogleOAuthConfig();
    if (!config) throw new Error("config should be present");
    const handshake = createHandshake();
    const url = new URL(buildAuthorizationUrl(config, handshake));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe(handshake.state);
    expect(url.searchParams.get("nonce")).toBe(handshake.nonce);
  });

  it("client secret은 주소에 실리지 않는다", () => {
    configure();
    const config = readGoogleOAuthConfig();
    if (!config) throw new Error("config should be present");
    const url = buildAuthorizationUrl(config, createHandshake());
    expect(url).not.toContain("secret-value");
  });
});

describe("createHandshake", () => {
  it("매번 다른 값이다 — 왕복끼리 섞이지 않는다", () => {
    const a = createHandshake();
    const b = createHandshake();
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    // RFC 7636은 code_verifier를 43자 이상으로 요구한다.
    expect(a.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });
});
