import { randomUUID } from "node:crypto";

import { API_PREFIX, CurrentUserResponseSchema, DummyAccountListResponseSchema, DummyAccountResponseSchema } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { CareerService } from "../career/index.js";
import { ConsentService } from "../consent/index.js";
import { IdentityService } from "../identity/index.js";
import { PERSONAS } from "./personas/index.js";
import { AdminService, type AdminServiceDependencies } from "./service.js";

const config: RuntimeConfig = {
  nodeEnv: "test", host: "127.0.0.1", port: 4_000, logLevel: "silent", databaseUrl: "mysql://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1", outboxPollIntervalMs: 1_000, outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: "expresso-admin-test",
};

describe.skipIf(!(process.env.TEST_MONGODB_URL ?? process.env.TEST_MONGODB_ADMIN_URL))("admin dummy accounts (mongodb)", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let identity: IdentityService;
  let career: CareerService;
  let admin: AdminService;
  let app: ReturnType<typeof buildApi>;
  let adminEmail: string;
  let adminToken: string;
  let memberToken: string;

  const call = (method: "GET" | "POST" | "DELETE", url: string, token: string) =>
    app.inject({ method, url: `${API_PREFIX}${url}`, headers: { authorization: `Bearer ${token}` } });
  const me = async (token: string) => {
    const response = await call("GET", "/me", token);
    return response.statusCode === 200 ? CurrentUserResponseSchema.parse(response.json()).data : response.statusCode;
  };
  const audits = (dummyKey: string) => mongoCollections(fixture.resource.db).adminAuditEvents.find({ dummyKey }).sort({ at: 1 }).toArray();

  beforeAll(async () => {
    fixture = await createMongoFixture("admin");
    identity = new IdentityService(fixture.resource);
    career = new CareerService(fixture.resource);
    admin = new AdminService(fixture.resource, { identity, career, consent: new ConsentService(fixture.resource) });
    app = buildApi({ config, identityService: identity, careerService: career, adminService: admin });
    await app.ready();
    adminEmail = `admin-${randomUUID()}@example.com`;
    adminToken = (await identity.signup({ email: adminEmail, displayName: "운영자", password: "correct-horse-battery" })).session.accessToken;
    memberToken = (await identity.signup({ email: `member-${randomUUID()}@example.com`, displayName: "Member", password: "correct-horse-battery" })).session.accessToken;
    expect(await admin.setRole(adminEmail, "admin")).toBe("changed");
  }, 60_000);
  afterAll(async () => { await app?.close(); await fixture?.dispose(); });

  it("hides admin routes from members and lists every persona to admins", async () => {
    expect((await call("GET", "/admin/dummy-accounts", memberToken)).statusCode).toBe(404);
    expect((await call("POST", "/admin/dummy-accounts/dummy-newgrad", memberToken)).statusCode).toBe(404);
    const listed = DummyAccountListResponseSchema.parse((await call("GET", "/admin/dummy-accounts", adminToken)).json()).data;
    expect(listed.map(({ key, account }) => [key, account])).toEqual(PERSONAS.map(({ key }) => [key, null]));
    expect((await me(adminToken) as { role: string }).role).toBe("admin");
  });

  it("creates a dummy account through the domain services", async () => {
    const response = await call("POST", "/admin/dummy-accounts/dummy-newgrad", adminToken);
    expect(response.statusCode).toBe(201);
    const created = DummyAccountResponseSchema.parse(response.json()).data;
    expect(created.account?.recordCount).toBe(3);
    const userId = created.account!.userId;
    const db = mongoCollections(fixture.resource.db);
    const user = await db.users.findOne({ _id: userId });
    expect(user).toMatchObject({ dummyKey: "dummy-newgrad", passwordHash: null, role: "user", emailVerifiedAt: expect.any(Date), profile: { targetRoles: ["백엔드"] } });
    expect((await db.plans.findOne({ _id: user!.planId }))?.code).toBe("team");
    expect((await db.consents.find({ userId, revokedAt: null }).toArray()).map(({ scope }) => scope).sort()).toEqual(["career_records", "job_posting_analysis"]);
    const records = await db.careerRecords.find({ userId }).toArray();
    expect(records.map(({ status }) => status).sort()).toEqual(["draft", "organized", "organized"]);
    expect(await db.careerRecordRelations.countDocuments({ userId })).toBeGreaterThan(0);
    expect((await call("POST", "/admin/dummy-accounts/dummy-newgrad", adminToken)).statusCode).toBe(409);
  });

  it("never lets a dummy sign in with a password or receive mail", async () => {
    const login = await app.inject({ method: "POST", url: `${API_PREFIX}/auth/login`, payload: { email: "dummy-newgrad@expresso.test", password: "correct-horse-battery" } });
    expect(login.statusCode).toBe(401);
    await identity.requestPasswordReset("dummy-newgrad@expresso.test");
    const user = await mongoCollections(fixture.resource.db).users.findOne({ dummyKey: "dummy-newgrad" });
    expect(await mongoCollections(fixture.resource.db).identityTokens.countDocuments({ userId: user!._id })).toBe(0);
    await expect(admin.setRole("dummy-newgrad@expresso.test", "admin")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("acts as a dummy on the admin's own session and returns to the admin", async () => {
    expect((await call("POST", "/admin/dummy-accounts/dummy-career-switch/impersonation", adminToken)).statusCode).toBe(404);
    expect((await call("POST", "/admin/dummy-accounts/dummy-newgrad/impersonation", adminToken)).statusCode).toBe(204);
    const acting = await me(adminToken) as Exclude<Awaited<ReturnType<typeof me>>, number>;
    expect(acting).toMatchObject({ email: "dummy-newgrad@expresso.test", role: "user", impersonation: { adminDisplayName: "운영자" } });
    // 대신 로그인 중에도 관리 화면은 세션 주인 기준으로 열린다.
    expect((await call("GET", "/admin/dummy-accounts", adminToken)).statusCode).toBe(200);
    const categories = (await call("GET", "/career/categories", adminToken)).json() as { data: { recordCount: number }[] };
    expect(categories.data.reduce((sum, category) => sum + category.recordCount, 0)).toBe(3);

    expect((await call("DELETE", "/admin/impersonation", adminToken)).statusCode).toBe(204);
    expect(await me(adminToken)).toMatchObject({ email: adminEmail, role: "admin", impersonation: null });
    expect((await audits("dummy-newgrad")).map(({ action }) => action)).toEqual(["dummy.create", "impersonation.start", "impersonation.end"]);
    const listed = DummyAccountListResponseSchema.parse((await call("GET", "/admin/dummy-accounts", adminToken)).json()).data;
    expect(listed.find(({ key }) => key === "dummy-newgrad")?.lastImpersonation?.adminDisplayName).toBe("운영자");
  });

  it("refuses to act as a real account", async () => {
    const memberId = ((await me(memberToken)) as { id: string }).id;
    const session = await mongoCollections(fixture.resource.db).identitySessions.findOne({ userId: (await me(adminToken) as { id: string }).id, revokedAt: null });
    await expect(identity.actAs(session!._id, memberId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("drops the impersonation when the admin loses the role or the dummy disappears", async () => {
    await call("POST", "/admin/dummy-accounts/dummy-newgrad/impersonation", adminToken);
    await admin.setRole(adminEmail, "user");
    expect(await me(adminToken)).toMatchObject({ email: adminEmail, impersonation: null });
    expect((await call("GET", "/admin/dummy-accounts", adminToken)).statusCode).toBe(404);
    await admin.setRole(adminEmail, "admin");
    expect(await me(adminToken)).toMatchObject({ email: adminEmail, impersonation: null });

    await call("POST", "/admin/dummy-accounts/dummy-newgrad/impersonation", adminToken);
    expect((await call("DELETE", "/admin/dummy-accounts/dummy-newgrad", adminToken)).statusCode).toBe(200);
    expect(await me(adminToken)).toMatchObject({ email: adminEmail, impersonation: null });
    expect(await mongoCollections(fixture.resource.db).users.countDocuments({ dummyKey: "dummy-newgrad" })).toBe(0);
    expect((await admin.listDummies()).find(({ key }) => key === "dummy-newgrad")?.account).toBeNull();
  });

  it("refills a dummy to its source records under the same account ID", async () => {
    const first = DummyAccountResponseSchema.parse((await call("POST", "/admin/dummy-accounts/dummy-newgrad", adminToken)).json()).data;
    const userId = first.account!.userId;
    const categoryId = (await career.listCategories(userId)).find(({ key }) => key === "project")!.id;
    await career.createRecord(userId, randomUUID(), { categoryId, title: "시험 중에 더한 기록", properties: {}, bodyMd: "" });
    const refilled = DummyAccountResponseSchema.parse((await call("POST", "/admin/dummy-accounts/dummy-newgrad/refill", adminToken)).json()).data;
    expect(refilled.account).toMatchObject({ userId, recordCount: 3 });
  });

  it("logs out the admin session even while acting as a dummy", async () => {
    const token = (await identity.login({ email: adminEmail, password: "correct-horse-battery" })).session.accessToken;
    await call("POST", "/admin/dummy-accounts/dummy-newgrad/impersonation", token);
    expect((await call("POST", "/auth/logout", token)).statusCode).toBe(204);
    expect(await me(token)).toBe(401);
  });

  it("keeps building when a worker bumps record versions in between", async () => {
    // 실제 서버에서는 워커의 계산이 기록 버전을 올린다. 관계를 잇기 직전에 같은 일을 흉내 낸다.
    const records = mongoCollections(fixture.resource.db).careerRecords;
    const bumped = new Set<string>();
    const racing: AdminServiceDependencies["career"] = Object.assign(Object.create(career) as CareerService, {
      replaceTargets: async (...args: Parameters<CareerService["replaceTargets"]>) => {
        if (!bumped.has(args[1])) { bumped.add(args[1]); await records.updateOne({ _id: args[1] }, { $inc: { version: 1 } }); }
        return career.replaceTargets(...args);
      },
    });
    const raced = new AdminService(fixture.resource, { identity, career: racing, consent: new ConsentService(fixture.resource) });
    const principal = { sessionId: randomUUID(), user: null as never, owner: { userId: ((await me(adminToken)) as { id: string }).id, displayName: "운영자", role: "admin" as const } };
    expect((await raced.refillDummy(principal, "dummy-newgrad")).account?.recordCount).toBe(3);
    expect(bumped.size).toBeGreaterThan(0);
  });

  it("builds every persona to its source record count", async () => {
    for (const persona of PERSONAS.filter(({ key }) => key !== "dummy-newgrad")) {
      const response = await call("POST", `/admin/dummy-accounts/${persona.key}`, adminToken);
      expect(response.statusCode, persona.key).toBe(201);
      expect(DummyAccountResponseSchema.parse(response.json()).data.account?.recordCount, persona.key).toBe(persona.records.length);
    }
  }, 300_000);

  it("records the end of one impersonation when switching straight to another dummy", async () => {
    expect((await call("POST", "/admin/dummy-accounts/dummy-newgrad/impersonation", adminToken)).statusCode).toBe(204);
    expect((await call("POST", "/admin/dummy-accounts/dummy-career-switch/impersonation", adminToken)).statusCode).toBe(204);
    expect(await me(adminToken)).toMatchObject({ email: "dummy-career-switch@expresso.test" });
    expect((await audits("dummy-newgrad")).at(-1)?.action).toBe("impersonation.end");
    expect((await call("DELETE", "/admin/impersonation", adminToken)).statusCode).toBe(204);
    expect((await audits("dummy-career-switch")).map(({ action }) => action).slice(-2)).toEqual(["impersonation.start", "impersonation.end"]);
  });
});
