import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/service.js";
import { CareerService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  databaseUrl: databaseUrl ?? "postgres://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-career-profile-test",
};

describeWithDatabase("커리어 프로필 (온보딩 1단계)", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1/unused", { max: 2 });
  const app = buildApi({
    config,
    identityService: new IdentityService(sql),
    careerService: new CareerService(sql),
  });

  const email = `career-profile-${crypto.randomUUID()}@example.com`;
  let accessToken: string;
  const auth = () => ({ authorization: `Bearer ${accessToken}` });

  // `app.inject`는 체이닝 객체도 겸해서 반환한다. 여기서 await해 응답으로 좁힌다.
  const save = async (payload: Record<string, unknown>) =>
    await app.inject({ method: "PUT", url: "/v1/career/profile", headers: auth(), payload });
  const read = async () =>
    await app.inject({ method: "GET", url: "/v1/career/profile", headers: auth() });

  beforeAll(async () => {
    await sql`
      insert into plan (code, generation_quota) values ('free', 3)
      on conflict (code) do update set generation_quota = plan.generation_quota
    `;
    await app.ready();
    const signup = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: { email, password: "correct-horse-battery", displayName: "프로필 테스트" },
    });
    expect(signup.statusCode).toBe(201);
    accessToken = signup.json().data.session.accessToken;
  });

  afterAll(async () => {
    await sql`delete from "user" where email = ${email}`;
    await app.close();
    await sql.end({ timeout: 5 });
  });

  it("온보딩을 지나기 전에는 null이다 — 없는 것을 기본값으로 꾸미지 않는다", async () => {
    const response = await read();
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toBeNull();
  });

  it("직무 여러 개와 연차를 저장하고 그대로 읽는다", async () => {
    const saved = await save({
      targetRoles: ["백엔드", "데이터", "DevOps"],
      experienceYears: 7,
      primaryGoal: "build",
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().data).toMatchObject({
      targetRoles: ["백엔드", "데이터", "DevOps"],
      experienceYears: 7,
      primaryGoal: "build",
    });

    expect((await read()).json().data).toMatchObject({
      targetRoles: ["백엔드", "데이터", "DevOps"],
      experienceYears: 7,
    });
  });

  it("다시 저장하면 통째로 덮어쓴다 — 예전 직무가 남지 않는다", async () => {
    await save({ targetRoles: ["디자인"], experienceYears: 0, primaryGoal: "organize" });
    expect((await read()).json().data).toMatchObject({
      targetRoles: ["디자인"],
      experienceYears: 0,
      primaryGoal: "organize",
    });
  });

  it("같은 직무를 두 번 담아 보내도 한 번만 남는다", async () => {
    const saved = await save({
      targetRoles: ["모바일", "모바일", "백엔드"],
      experienceYears: 3,
      primaryGoal: "explore",
    });
    expect(saved.json().data.targetRoles).toEqual(["모바일", "백엔드"]);
  });

  it("직무를 하나도 안 고를 수 있다 — 그것도 답이다", async () => {
    const saved = await save({ targetRoles: [], experienceYears: 5, primaryGoal: "build" });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().data.targetRoles).toEqual([]);
  });

  it("신입(0)과 12년 이상(12)이 양 끝이다", async () => {
    for (const years of [0, 12]) {
      const saved = await save({ targetRoles: ["백엔드"], experienceYears: years, primaryGoal: "build" });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().data.experienceYears).toBe(years);
    }
  });

  it("범위 밖의 연차는 거절한다", async () => {
    for (const years of [-1, 13, 1.5]) {
      expect((await save({ targetRoles: [], experienceYears: years, primaryGoal: "build" })).statusCode).toBe(400);
    }
  });

  it("목록에 없는 직무는 거절한다 — 나중에 맞춰 볼 수 없는 문자열을 받지 않는다", async () => {
    const response = await save({
      targetRoles: ["백엔드", "점성술사"],
      experienceYears: 3,
      primaryGoal: "build",
    });
    expect(response.statusCode).toBe(400);
  });

  it("로그인하지 않으면 읽지도 쓰지도 못한다", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/career/profile" })).statusCode).toBe(401);
    expect(
      (await app.inject({
        method: "PUT",
        url: "/v1/career/profile",
        payload: { targetRoles: [], experienceYears: 1, primaryGoal: "build" },
      })).statusCode,
    ).toBe(401);
  });
});
