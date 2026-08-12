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
