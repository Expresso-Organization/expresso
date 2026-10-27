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

/** 쿠키 없는 POST. `action`이 있으면 Next 클라이언트가 보내는 fetch 서버 액션이다. */
function post(path: string, action?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: action ? { "next-action": action, accept: "text/x-component" } : { "content-type": "multipart/form-data; boundary=x" },
  });
}

describe("session proxy for server actions", () => {
  it("fetch 서버 액션에는 3xx 대신 x-action-redirect로 로그인 주소를 준다", () => {
    delete process.env.DEV_LOGIN;
    const response = proxy(post("/edit/abc?tab=chat", "7f00aa"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    const [location, type] = response.headers.get("x-action-redirect")!.split(";");
    expect(type).toBe("replace");
    // 경로만 준다 — 클라이언트가 브라우저 주소의 호스트로 푼다.
    expect(location!.startsWith("/login?")).toBe(true);
    expect(new URL(location!, "http://browser.test").searchParams.get("next")).toBe("/edit/abc?tab=chat");
  });

  it("스크립트 없는 폼 POST는 303으로 GET 이동시킨다", () => {
    delete process.env.DEV_LOGIN;
    const response = proxy(post("/account"));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/account");
  });

  it("개발 로그인이 켜져 있으면 액션도 개발 로그인으로 보낸다", () => {
    process.env.DEV_LOGIN = "1";
    const response = proxy(post("/edit/abc", "7f00aa"));
    const location = new URL(response.headers.get("x-action-redirect")!.split(";")[0]!, "http://browser.test");
    expect(location.pathname).toBe("/api/dev/session");
    expect(location.searchParams.get("next")).toBe("/edit/abc");
  });
});
