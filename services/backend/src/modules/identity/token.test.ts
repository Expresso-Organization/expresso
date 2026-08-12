import { describe, expect, it } from "vitest";

import {
  createAccessToken,
  hashAccessToken,
  isAccessToken,
  parseBearerAuthorization,
} from "./token.js";

describe("opaque identity tokens", () => {
  it("creates a fixed-format token and stores only a deterministic hash", () => {
    const accessToken = createAccessToken();
    const tokenHash = hashAccessToken(accessToken);

    expect(isAccessToken(accessToken)).toBe(true);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(accessToken);
    expect(hashAccessToken(accessToken)).toBe(tokenHash);
  });

  it("accepts only a complete bearer credential", () => {
    const accessToken = createAccessToken();

    expect(parseBearerAuthorization(`Bearer ${accessToken}`)).toBe(accessToken);
    expect(parseBearerAuthorization(`bearer ${accessToken}`)).toBe(accessToken);
    expect(parseBearerAuthorization(accessToken)).toBeNull();
    expect(parseBearerAuthorization("Bearer short")).toBeNull();
    expect(parseBearerAuthorization(undefined)).toBeNull();
  });
});
