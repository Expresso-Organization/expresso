import {
  ApiErrorResponseSchema,
  AuthSessionResponseSchema,
  CareerCategoriesResponseSchema,
  CurrentUserResponseSchema,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";
import { createMysqlResource } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { CareerService } from "../career/service.js";
import { IdentityService } from "./service.js";
import { MongoIdentityService, type IdentityApi } from "./index.js";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { mongoCollections } from "@expresso/database";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "./mongo-user-guard.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  databaseUrl: databaseUrl ?? "mysql://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-auth-test",
};

const PASSWORD = "correct-horse-battery";

for (const engine of ["mysql", "mongodb"] as const) {
describe.skipIf(engine === "mysql" ? !databaseUrl : !(process.env.TEST_MONGODB_URL ?? process.env.TEST_MONGODB_ADMIN_URL))(`auth HTTP integration (${engine})`, () => {
  let sql: SqlTag;
  let fixture: Awaited<ReturnType<typeof createMongoFixture>> | undefined;
  let identityService: IdentityApi;
  let app: ReturnType<typeof buildApi>;
  const email = `signup-${crypto.randomUUID()}@example.com`;
  const createdEmails: string[] = [email];

  beforeAll(async () => {
    if (engine === "mongodb") {
      fixture = await createMongoFixture("auth");
      identityService = new MongoIdentityService(fixture.resource);
      app = buildApi({ config, identityService });
    } else {
      sql = createMysqlResource(databaseUrl!).sql;
      identityService = new IdentityService(sql);
      app = buildApi({ config, identityService, careerService: new CareerService(sql) });
      await sql`
      insert into plan (code, generation_quota)
      values ('free', 3)
      as new on duplicate key update generation_quota = plan.generation_quota
    `;
    }
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (fixture) await fixture.dispose();
    else if (sql) { await sql`delete from \`user\` where email in ${sql(createdEmails)}`; await sql.end({ timeout: 5 }); }
  });

  async function signup(body: Record<string, unknown>) {
    return app.inject({ method: "POST", url: "/v1/auth/signup", payload: body });
  }

  it("signs up on the free plan, authenticates, and exposes the seven default categories", async () => {
    const created = await signup({
      email,
      password: PASSWORD,
      displayName: "김지원",
    });
    expect(created.statusCode).toBe(201);

    const session = AuthSessionResponseSchema.parse(created.json()).data;
    expect(session.user.email).toBe(email);
    expect(session.user.planCode).toBe("free");
    expect(new Date(session.session.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const authorization = `Bearer ${session.session.accessToken}`;
    const me = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization },
    });
    expect(me.statusCode).toBe(200);
    expect(CurrentUserResponseSchema.parse(me.json()).data.id).toBe(session.user.id);

    // MongoDB 카테고리 HTTP 경로는 T05에서 검증하며 여기서는 계정과 무관한 기본 정의를 확인합니다.
    if (fixture) {
      expect(await mongoCollections(fixture.resource.db).careerCategories.countDocuments({ isSystem: true })).toBe(7);
      return;
    }
    // 10b — "가입과 동시에 카테고리 7종이 생깁니다"
    const categories = await app.inject({
      method: "GET",
      url: "/v1/career/categories",
      headers: { authorization },
    });
    expect(categories.statusCode).toBe(200);
    const system = CareerCategoriesResponseSchema.parse(categories.json()).data
      .filter((category) => category.isSystem);
    expect(system).toHaveLength(7);
    expect(system.every((category) => category.recordCount === 0)).toBe(true);
  });

  it("never stores the password in plaintext and rejects a duplicate email", async () => {
    const stored = fixture ? [{ password_hash: (await mongoCollections(fixture.resource.db).users.findOne({ email }))?.passwordHash }] : await sql<{ password_hash: string | null }[]>`
      select password_hash from \`user\` where email = ${email}
    `;
    expect(stored[0]?.password_hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(stored[0]?.password_hash).not.toContain(PASSWORD);

    const duplicate = await signup({
      email,
      password: PASSWORD,
      displayName: "다른 사람",
    });
    expect(duplicate.statusCode).toBe(409);
    expect(ApiErrorResponseSchema.parse(duplicate.json()).error.code).toBe("CONFLICT");
  });

  it("logs in with the right password and answers the same way for wrong password and unknown email", async () => {
    const ok = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email, password: PASSWORD },
    });
    expect(ok.statusCode).toBe(200);
    const session = AuthSessionResponseSchema.parse(ok.json()).data;
    expect(session.user.email).toBe(email);

    const wrongPassword = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email, password: `${PASSWORD}-nope` },
    });
    const unknownEmail = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: `absent-${crypto.randomUUID()}@example.com`, password: PASSWORD },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    // 응답이 구분되면 이메일 가입 여부가 새어 나간다.
    expect(unknownEmail.json().error.code).toBe(wrongPassword.json().error.code);
    expect(unknownEmail.json().error.message).toBe(wrongPassword.json().error.message);
  });

  it("logs out the current session without needing its ID and leaves other sessions alive", async () => {
    const first = AuthSessionResponseSchema.parse(
      (await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email, password: PASSWORD },
      })).json(),
    ).data;
    const second = AuthSessionResponseSchema.parse(
      (await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email, password: PASSWORD },
      })).json(),
    ).data;
    expect(first.session.sessionId).not.toBe(second.session.sessionId);

    const loggedOut = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${first.session.accessToken}` },
    });
    expect(loggedOut.statusCode).toBe(204);

    const reused = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${first.session.accessToken}` },
    });
    expect(reused.statusCode).toBe(401);

    const untouched = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${second.session.accessToken}` },
    });
    expect(untouched.statusCode).toBe(200);
  });

  it("rejects a short password before it reaches the database", async () => {
    const shortPassword = `short-${crypto.randomUUID()}@example.com`;
    const rejected = await signup({
      email: shortPassword,
      password: "short",
      displayName: "짧은 비밀번호",
    });
    expect(rejected.statusCode).toBe(400);
    expect(ApiErrorResponseSchema.parse(rejected.json()).error.code).toBe(
      "VALIDATION_ERROR",
    );

    const rows = fixture ? await mongoCollections(fixture.resource.db).users.find({ email: shortPassword }).toArray() : await sql`select 1 from \`user\` where email = ${shortPassword}`;
    expect(rows).toHaveLength(0);
  });

  it.skipIf(engine !== "mongodb")("allows one concurrent signup and rejects expired or deleted-account sessions", async () => {
    const concurrent = { email: `concurrent-${crypto.randomUUID()}@example.com`, displayName: "Same", password: PASSWORD };
    const outcomes = await Promise.allSettled([identityService.signup(concurrent), identityService.signup(concurrent)]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const created = outcomes.find(result => result.status === "fulfilled")!;
    if (created.status !== "fulfilled") throw new Error("signup did not succeed");
    const collections = mongoCollections(fixture!.resource.db);
    expect(await collections.users.countDocuments({ email: concurrent.email })).toBe(1);
    await collections.identitySessions.updateOne({ _id: created.value.session.sessionId }, { $set: { expiresAt: new Date(0) } });
    expect(await identityService.verifyAccessToken(created.value.session.accessToken)).toBeNull();
    const session = await identityService.issueSession({ userId: created.value.user.id });
    await collections.users.updateOne({ _id: created.value.user.id }, { $set: { deletionRequestedAt: new Date() } });
    expect(await identityService.verifyAccessToken(session.accessToken)).toBeNull();
    await expect(identityService.issueSession({ userId: created.value.user.id })).rejects.toMatchObject({ statusCode: 401 });
  });

  it.skipIf(engine !== "mongodb")("rolls back account creation if its first session cannot be inserted", async () => {
    const db = fixture!.resource.db;
    const schema = (await db.listCollections({ name: "identity_sessions" }, { nameOnly: false }).toArray())[0]!.options!.validator;
    const email = `atomic-${crypto.randomUUID()}@example.com`;
    try {
      await db.command({ collMod: "identity_sessions", validator: { impossibleTestField: { $exists: true } } });
      await expect(identityService.signup({ email, displayName: "Atomic", password: PASSWORD })).rejects.toMatchObject({ code: 121 });
      expect(await mongoCollections(db).users.countDocuments({ email })).toBe(0);
      await expect(identityService.signInWithGoogle({ subject: email, email, emailVerified: true, displayName: "Atomic Google" })).rejects.toMatchObject({ code: 121 });
      expect(await mongoCollections(db).users.countDocuments({ email })).toBe(0);
      expect(await mongoCollections(db).identityOauthAccounts.countDocuments({ providerAccountId: email })).toBe(0);
    } finally { await db.command({ collMod: "identity_sessions", validator: schema }); }
  });

  it.skipIf(engine !== "mongodb")("rechecks an active-user guard after a concurrent deletion invalidates its snapshot", async () => {
    const account = await identityService.signup({ email: `guard-${crypto.randomUUID()}@example.com`, displayName: "Guard", password: PASSWORD });
    let notify!: () => void;
    let release!: () => void;
    const seen = new Promise<void>(resolve => { notify = resolve; });
    const proceed = new Promise<void>(resolve => { release = resolve; });
    const mutation = inTransaction(fixture!.resource, async tx => {
      await mongoCollections(tx.db).users.findOne({ _id: account.user.id }, { session: tx.session });
      notify(); await proceed;
      await requireActiveUser(tx, account.user.id);
      await mongoCollections(tx.db).users.updateOne({ _id: account.user.id }, { $set: { displayName: "must not persist" } }, { session: tx.session });
    });
    const rejected = expect(mutation).rejects.toMatchObject({ statusCode: 401 });
    await seen;
    try { await mongoCollections(fixture!.resource.db).users.updateOne({ _id: account.user.id }, { $set: { deletionRequestedAt: new Date() } }); } finally { release(); }
    await rejected;
    expect((await mongoCollections(fixture!.resource.db).users.findOne({ _id: account.user.id }))?.displayName).toBe("Guard");
  });
});
}
