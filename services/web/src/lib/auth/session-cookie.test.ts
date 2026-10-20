import { SESSION_POLICY } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import { sessionCookieOptions } from "./session-cookie";

describe("sessionCookieOptions", () => {
  it("유지 켬이면 지금 + 유지 idle 로 만료를 찍는다", () => {
    const now = Date.UTC(2026, 8, 15);
    const options = sessionCookieOptions(true, now);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.expires?.getTime()).toBe(now + SESSION_POLICY.persistent.idleMs);
  });

  it("유지 끔이면 만료를 두지 않는다 — 브라우저 세션 쿠키", () => {
    expect(sessionCookieOptions(false)).not.toHaveProperty("expires");
  });
});
