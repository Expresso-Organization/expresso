import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

const KEYS = ["NODE_ENV", "DEV_LOGIN", "DEV_LOGIN_EMAIL", "DEV_LOGIN_PASSWORD"] as const;
const saved = new Map(KEYS.map((key) => [key, process.env[key]]));

function set(values: Partial<Record<(typeof KEYS)[number], string | undefined>>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of saved) set({ [key]: value });
});

const request = new Request("http://localhost:3000/api/dev/session");

describe("개발용 세션 라우트", () => {
  it("켜지 않으면 라우트가 없는 것과 같다", async () => {
    set({ NODE_ENV: "development", DEV_LOGIN: undefined, DEV_LOGIN_EMAIL: "a@b.co", DEV_LOGIN_PASSWORD: "0123456789" });
    expect((await GET(request)).status).toBe(404);
  });

  it("프로덕션에서는 켜도 응답하지 않는다", async () => {
    set({ NODE_ENV: "production", DEV_LOGIN: "1", DEV_LOGIN_EMAIL: "a@b.co", DEV_LOGIN_PASSWORD: "0123456789" });
    expect((await GET(request)).status).toBe(404);
  });

  it("계정 값이 하나라도 비면 응답하지 않는다", async () => {
    set({ NODE_ENV: "development", DEV_LOGIN: "1", DEV_LOGIN_EMAIL: "a@b.co", DEV_LOGIN_PASSWORD: undefined });
    expect((await GET(request)).status).toBe(404);
    set({ DEV_LOGIN_EMAIL: undefined, DEV_LOGIN_PASSWORD: "0123456789" });
    expect((await GET(request)).status).toBe(404);
  });
});
