import { afterEach, describe, expect, it, vi } from "vitest";

import { readDemoAccount } from "./demo-account";

afterEach(() => vi.unstubAllEnvs());

describe("로그인 화면 개발용 데모 계정", () => {
  it("개발 서버에서는 자동 로그인 스위치와 무관하게 설정된 계정을 보여준다", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_LOGIN", "");
    vi.stubEnv("DEV_LOGIN_EMAIL", "demo@example.com");
    vi.stubEnv("DEV_LOGIN_PASSWORD", "demo-password");

    expect(readDemoAccount()).toEqual({
      email: "demo@example.com",
      password: "demo-password",
    });
  });

  it.each(["DEV_LOGIN_EMAIL", "DEV_LOGIN_PASSWORD"])("%s가 비면 미설정 상태를 보여준다", (key) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_LOGIN_EMAIL", "demo@example.com");
    vi.stubEnv("DEV_LOGIN_PASSWORD", "demo-password");
    vi.stubEnv(key, "");

    expect(readDemoAccount()).toBeNull();
  });

  it.each(["production", "test"])("%s 환경에는 계정 정보를 전달하지 않는다", (env) => {
    vi.stubEnv("NODE_ENV", env);
    vi.stubEnv("DEV_LOGIN", "1");
    vi.stubEnv("DEV_LOGIN_EMAIL", "demo@example.com");
    vi.stubEnv("DEV_LOGIN_PASSWORD", "demo-password");

    expect(readDemoAccount()).toBeUndefined();
  });
});
