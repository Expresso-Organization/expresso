import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isDevLoginAutoRedirectEnabled,
  isDevLoginEnabled,
  readDevLogin,
} from "./dev-login";

afterEach(() => vi.unstubAllEnvs());

function stub(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

describe("개발 로그인 스위치", () => {
  it("스위치와 계정 정보가 모두 있으면 켜진다", () => {
    stub({
      NODE_ENV: "development",
      DEV_LOGIN: "1",
      DEV_LOGIN_EMAIL: "dev@example.com",
      DEV_LOGIN_PASSWORD: "0123456789",
      DEV_LOGIN_NAME: "윤하린",
    });

    expect(readDevLogin()).toEqual({
      email: "dev@example.com",
      password: "0123456789",
      displayName: "윤하린",
    });
    expect(isDevLoginEnabled()).toBe(true);
  });

  it("프로덕션 빌드에서도 같은 조건으로 켜진다", () => {
    stub({
      NODE_ENV: "production",
      DEV_LOGIN: "1",
      DEV_LOGIN_EMAIL: "dev@example.com",
      DEV_LOGIN_PASSWORD: "0123456789",
    });

    expect(isDevLoginEnabled()).toBe(true);
  });

  it("개발 서버에서는 로그인 화면을 건너뛰고 바로 보낸다", () => {
    stub({
      NODE_ENV: "development",
      DEV_LOGIN: "1",
      DEV_LOGIN_EMAIL: "dev@example.com",
      DEV_LOGIN_PASSWORD: "0123456789",
    });

    expect(isDevLoginAutoRedirectEnabled()).toBe(true);
  });

  it("배포본에서는 건너뛰지 않는다 — 버튼을 누른 사람만 들어간다", () => {
    stub({
      NODE_ENV: "production",
      DEV_LOGIN: "1",
      DEV_LOGIN_EMAIL: "dev@example.com",
      DEV_LOGIN_PASSWORD: "0123456789",
    });

    expect(isDevLoginAutoRedirectEnabled()).toBe(false);
  });

  it.each(["", "0", "true"])("스위치가 %o 이면 꺼진다", (value) => {
    stub({
      NODE_ENV: "development",
      DEV_LOGIN: value,
      DEV_LOGIN_EMAIL: "dev@example.com",
      DEV_LOGIN_PASSWORD: "0123456789",
    });

    expect(readDevLogin()).toBeNull();
    expect(isDevLoginEnabled()).toBe(false);
  });

  it.each(["DEV_LOGIN_EMAIL", "DEV_LOGIN_PASSWORD"])("%s가 비면 꺼진다", (key) => {
    stub({
      NODE_ENV: "production",
      DEV_LOGIN: "1",
      DEV_LOGIN_EMAIL: "dev@example.com",
      DEV_LOGIN_PASSWORD: "0123456789",
      [key]: "",
    });

    expect(readDevLogin()).toBeNull();
    expect(isDevLoginEnabled()).toBe(false);
  });

  it("표시 이름이 없으면 기본값으로 가입한다", () => {
    stub({
      DEV_LOGIN: "1",
      DEV_LOGIN_EMAIL: "dev@example.com",
      DEV_LOGIN_PASSWORD: "0123456789",
      DEV_LOGIN_NAME: "",
    });

    expect(readDevLogin()?.displayName).toBe("Dev");
  });
});
