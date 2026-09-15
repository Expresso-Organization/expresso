import { createHash, randomBytes } from "node:crypto";

const ACCESS_TOKEN_PATTERN = /^exps_[A-Za-z0-9_-]{43}$/;

export function createAccessToken(): string {
  return `exps_${randomBytes(32).toString("base64url")}`;
}

export function isAccessToken(value: string): boolean {
  return ACCESS_TOKEN_PATTERN.test(value);
}

export function hashAccessToken(accessToken: string): string {
  return createHash("sha256").update(accessToken, "utf8").digest("hex");
}

export function parseBearerAuthorization(
  authorization: string | undefined,
): string | null {
  if (!authorization) return null;
  const match = /^Bearer (exps_[A-Za-z0-9_-]{43})$/i.exec(authorization);
  const accessToken = match?.[1];
  return accessToken && isAccessToken(accessToken) ? accessToken : null;
}

/**
 * 일회용 토큰 — 비밀번호 재설정(`exrt_`) · 이메일 인증(`exvt_`). 세션 토큰과 같은 난수와
 * 같은 해시(`hashAccessToken`)를 쓴다. 접두어가 종류를 가른다.
 */
export type OneTimeTokenKind = "password_reset" | "email_verification";

const ONE_TIME_PREFIX: Record<OneTimeTokenKind, string> = {
  password_reset: "exrt_",
  email_verification: "exvt_",
};

export function createOneTimeToken(kind: OneTimeTokenKind): string {
  return `${ONE_TIME_PREFIX[kind]}${randomBytes(32).toString("base64url")}`;
}

export function isOneTimeToken(kind: OneTimeTokenKind, value: string): boolean {
  return new RegExp(`^${ONE_TIME_PREFIX[kind]}[A-Za-z0-9_-]{43}$`).test(value);
}
