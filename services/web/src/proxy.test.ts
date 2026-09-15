import { SESSION_POLICY } from "@expresso/contracts";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { PATHNAME_HEADER } from "@/lib/auth/next-path";
import { SESSION_COOKIE, SESSION_KEEP_COOKIE } from "@/lib/auth/session-cookie";

import { config, proxy } from "./proxy";

const TOKEN = `exps_${"a".repeat(43)}`;
const savedDevLogin = process.env.DEV_LOGIN;

afterEach(() => {
  if (savedDevLogin === undefined) delete process.env.DEV_LOGIN;
  else process.env.DEV_LOGIN = savedDevLogin;
});

function request(path: string, cookies: Record<string, string> = {}): NextRequest {
  const cookie = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; ");
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie, [PATHNAME_HEADER]: "/spoofed" } : { [PATHNAME_HEADER]: "/spoofed" },
  });
}

describe("session proxy matcher", () => {
  it("공개 포트폴리오는 열고 후보자 편집 화면만 보호한다", () => {
    expect(config.matcher).not.toContain("/site/:path*");
    expect(config.matcher).toContain("/site/:slug/candidates/:path*");
  });
});

describe("session proxy", () => {
  it("쿠키가 없으면 보려던 자리를 next로 들고 로그인으로 보낸다", () => {
    delete process.env.DEV_LOGIN;
    const response = proxy(request("/career/experience?view=table"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe(
      "/career/experience?view=table",
    );
  });

  it("홈으로 가던 요청은 next 없이 로그인으로 보낸다", () => {
    delete process.env.DEV_LOGIN;
    const response = proxy(request("/home"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("쿠키가 있으면 통과시키고 경로 헤더를 덮어쓴다", () => {
    const response = proxy(request("/jobs/abc", { [SESSION_COOKIE]: TOKEN }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-override-headers")).toContain(PATHNAME_HEADER);
    expect(response.headers.get(`x-middleware-request-${PATHNAME_HEADER}`)).toBe("/jobs/abc");
    // 유지 플래그가 없는 세션은 브라우저 세션 쿠키다. 만료를 찍지 않는다.
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("유지 플래그가 있으면 두 쿠키의 만료를 지금 + 30일로 다시 찍는다", () => {
    const before = Date.now();
    const response = proxy(request("/jobs/abc", { [SESSION_COOKIE]: TOKEN, [SESSION_KEEP_COOKIE]: "1" }));
    const session = response.cookies.get(SESSION_COOKIE);
    const keep = response.cookies.get(SESSION_KEEP_COOKIE);
    expect(session?.value).toBe(TOKEN);
    expect(session?.httpOnly).toBe(true);
    expect(keep?.value).toBe("1");
    for (const cookie of [session!, keep!]) {
      const expires = new Date(cookie.expires!).getTime();
      expect(expires).toBeGreaterThanOrEqual(before + SESSION_POLICY.persistent.idleMs - 5_000);
      expect(expires).toBeLessThanOrEqual(Date.now() + SESSION_POLICY.persistent.idleMs + 5_000);
    }
  });
});
