import { TERMS_VERSION } from "@expresso/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { MongoCareerService } from "./service.js";
import { MongoIdentityService } from "../identity/index.js";
import { createMongoFixture } from "../../../test/support/mongodb.js";

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-career-profile-test",
};

describe.skipIf(!process.env.TEST_MONGODB_URL)("커리어 프로필", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let app: ReturnType<typeof buildApi>;

  const email = `career-profile-${crypto.randomUUID()}@example.com`;
  let accessToken: string;
  const auth = () => ({ authorization: `Bearer ${accessToken}` });

  // `app.inject`는 체이닝 객체도 겸해서 반환한다. 여기서 await해 응답으로 좁힌다.
  const save = async (payload: Record<string, unknown>) =>
    await app.inject({ method: "PUT", url: "/v1/career/profile", headers: auth(), payload });
  const read = async () =>
    await app.inject({ method: "GET", url: "/v1/career/profile", headers: auth() });

  beforeAll(async () => {
    fixture = await createMongoFixture("career-profile");
    app = buildApi({ config, identityService: new MongoIdentityService(fixture.resource), careerService: new MongoCareerService(fixture.resource) });
    await app.ready();
    const signup = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: { email, password: "correct-horse-battery", displayName: "프로필 테스트", termsVersion: TERMS_VERSION },
    });
    expect(signup.statusCode).toBe(201);
    accessToken = signup.json().data.session.accessToken;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await fixture?.dispose();
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
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().data).toMatchObject({
      targetRoles: ["백엔드", "데이터", "DevOps"],
      experienceYears: 7,
    });

    expect((await read()).json().data).toMatchObject({
      targetRoles: ["백엔드", "데이터", "DevOps"],
      experienceYears: 7,
    });
  });

  it("다시 저장하면 통째로 덮어쓴다 — 예전 직무가 남지 않는다", async () => {
    await save({ targetRoles: ["디자인"], experienceYears: 0 });
    expect((await read()).json().data).toMatchObject({
      targetRoles: ["디자인"],
      experienceYears: 0,
    });
  });

  it("같은 직무를 두 번 담아 보내도 한 번만 남는다", async () => {
    const saved = await save({
      targetRoles: ["모바일", "모바일", "백엔드"],
      experienceYears: 3,
    });
    expect(saved.json().data.targetRoles).toEqual(["모바일", "백엔드"]);
  });

  it("직무를 하나도 안 고를 수 있다 — 그것도 답이다", async () => {
    const saved = await save({ targetRoles: [], experienceYears: 5 });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().data.targetRoles).toEqual([]);
  });

  it("신입(0)과 12년 이상(12)이 양 끝이다", async () => {
    for (const years of [0, 12]) {
      const saved = await save({ targetRoles: ["백엔드"], experienceYears: years });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().data.experienceYears).toBe(years);
    }
  });

  it("범위 밖의 연차는 거절한다", async () => {
    for (const years of [-1, 13, 1.5]) {
      expect((await save({ targetRoles: [], experienceYears: years })).statusCode).toBe(400);
    }
  });

  it("목록에 없는 직무는 거절한다 — 나중에 맞춰 볼 수 없는 문자열을 받지 않는다", async () => {
    const response = await save({
      targetRoles: ["백엔드", "점성술사"],
      experienceYears: 3,
    });
    expect(response.statusCode).toBe(400);
  });

  it("예전 칸(「지금 가장 급한 것」)이 남은 문서도 프로필이 읽힌다", async () => {
    await save({ targetRoles: ["백엔드"], experienceYears: 2 });
    // 0033 이전에 저장된 문서의 모양. 검증 규칙은 모르는 칸을 막지 않는다.
    await fixture.resource.db.collection("users").updateOne({ email }, { $set: { "profile.primaryGoal": "build" } });
    const response = await read();
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json().data).sort()).toEqual(["experienceYears", "targetRoles", "updatedAt"]);
  });

  describe("구직 목표", () => {
    const saveGoal = async (payload: Record<string, unknown>) =>
      await app.inject({ method: "PUT", url: "/v1/career/goal", headers: auth(), payload });
    const readGoal = async () => await app.inject({ method: "GET", url: "/v1/career/goal", headers: auth() });

    it("적기 전에는 null이다", async () => {
      expect((await readGoal()).json().data).toBeNull();
    });

    it("세 답을 쓴 말 그대로 저장하고, 다시 저장하면 통째로 덮어쓴다", async () => {
      const saved = await saveGoal({ work: "  커머스 프론트엔드 개발  ", place: "사용자가 많은 서비스", timing: "내년 상반기 이직", source: "onboarding" });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().data).toMatchObject({ work: "커머스 프론트엔드 개발", place: "사용자가 많은 서비스", timing: "내년 상반기 이직", source: "onboarding" });

      await saveGoal({ work: "디자인 시스템", place: "", timing: "", source: "app" });
      expect((await readGoal()).json().data).toMatchObject({ work: "디자인 시스템", place: "", timing: "", source: "app" });
    });

    it("셋 다 비었거나, 너무 길거나, 대화 출처로 보낸 것은 거절한다", async () => {
      expect((await saveGoal({ work: " ", place: "", timing: "", source: "app" })).statusCode).toBe(400);
      expect((await saveGoal({ work: "가".repeat(301), place: "", timing: "", source: "app" })).statusCode).toBe(400);
      expect((await saveGoal({ work: "프론트엔드", place: "", timing: "", source: "chat" })).statusCode).toBe(400);
      // 거절된 저장은 앞의 목표를 건드리지 않는다.
      expect((await readGoal()).json().data).toMatchObject({ work: "디자인 시스템" });
    });

    it("로그인하지 않으면 읽지도 쓰지도 못한다", async () => {
      expect((await app.inject({ method: "GET", url: "/v1/career/goal" })).statusCode).toBe(401);
      expect((await app.inject({ method: "PUT", url: "/v1/career/goal", payload: { work: "가", place: "", timing: "", source: "app" } })).statusCode).toBe(401);
    });
  });

  it("로그인하지 않으면 읽지도 쓰지도 못한다", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/career/profile" })).statusCode).toBe(401);
    expect(
      (await app.inject({
        method: "PUT",
        url: "/v1/career/profile",
        payload: { targetRoles: [], experienceYears: 1 },
      })).statusCode,
    ).toBe(401);
  });
});
