import {
  ApiErrorResponseSchema,
  AuthSessionResponseSchema,
  CareerCategoriesResponseSchema,
  CurrentUserResponseSchema,
  SESSION_POLICY,
  TERMS_VERSION,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/legacy-mysql.js";
import { createMysqlResource } from "../../platform/legacy-mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { MongoCareerService } from "../career/index.js";
import { CareerService } from "../career/legacy-mysql-service.js";
import { IdentityService } from "./legacy-mysql-service.js";
import { MongoIdentityService, type IdentityApi } from "./index.js";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { mongoCollections } from "@expresso/database";
import { inTransaction } from "../../platform/mongo-transaction.js";
import type { MailMessage, Mailer } from "../../platform/mail/client.js";
import type { PublishingApi } from "../publishing/index.js";
import { requireActiveUser } from "./mongo-user-guard.js";

/** 보낸 메일을 쌓아 두는 메일러. 테스트가 본문에서 링크의 토큰을 꺼내 쓴다. */
class RecordingMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) { this.sent.push(message); return { id: `mail-${this.sent.length}` }; }
  /** 이 주소로 간 마지막 메일 본문에서 `?token=` 값을 꺼낸다. 다른 테스트가 보낸 메일과 섞이지 않게 수신자로 고른다. */
  lastTokenFor(to: string): string {
    const text = this.sent.filter((mail) => mail.to === to).at(-1)?.text ?? "";
    const match = /[?&]token=([^\s&]+)/.exec(text);
    if (!match?.[1]) throw new Error("mail has no token link");
    return decodeURIComponent(match[1]);
  }
}

/** 발행 라우트의 인증 게이트만 본다. 서비스는 성공 응답 하나를 돌려주는 대역이다. */
const publishingStub = { publish: async () => ({ id: "deployment", version: 1, slug: "gate-check" }) } as unknown as PublishingApi;

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
  const mailer = new RecordingMailer();
  const email = `signup-${crypto.randomUUID()}@example.com`;
  const createdEmails: string[] = [email];

  beforeAll(async () => {
    if (engine === "mongodb") {
      fixture = await createMongoFixture("auth");
      identityService = new MongoIdentityService(fixture.resource, { mailer, appBaseUrl: "http://app.test" });
      app = buildApi({ config, identityService, careerService: new MongoCareerService(fixture.resource), publishingService: publishingStub });
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
      termsVersion: TERMS_VERSION,
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
      termsVersion: TERMS_VERSION,
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
      termsVersion: TERMS_VERSION,
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

  it.skipIf(engine !== "mongodb")("issues a 12-hour session when the client opts out of staying signed in", async () => {
    const before = Date.now();
    const response = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PASSWORD, persistent: false } });
    expect(response.statusCode).toBe(200);
    const { session } = AuthSessionResponseSchema.parse(response.json()).data;
    expect(session.persistent).toBe(false);
    const expiresIn = new Date(session.expiresAt).getTime() - before;
    expect(expiresIn).toBeGreaterThan(SESSION_POLICY.ephemeral.idleMs - 60_000);
    expect(expiresIn).toBeLessThanOrEqual(SESSION_POLICY.ephemeral.idleMs + 60_000);

    const stored = await mongoCollections(fixture!.resource.db).identitySessions.findOne({ _id: session.sessionId });
    expect(stored?.idleTtlMs).toBe(SESSION_POLICY.ephemeral.idleMs);
    expect(stored?.absoluteExpiresAt?.getTime()).toBeGreaterThan(before + SESSION_POLICY.absoluteMs - 60_000);
  });

  it.skipIf(engine !== "mongodb")("extends an active session from the last request and stops at the absolute cap", async () => {
    const collections = mongoCollections(fixture!.resource.db);
    const { session } = AuthSessionResponseSchema.parse(
      (await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PASSWORD } })).json(),
    ).data;
    expect(session.persistent).toBe(true);
    const authorization = `Bearer ${session.accessToken}`;
    const me = async () => (await app.inject({ method: "GET", url: "/v1/me", headers: { authorization } })).statusCode;

    // 만료가 한 시간 뒤인 세션도 한 번의 요청으로 30일 뒤로 밀린다.
    await collections.identitySessions.updateOne({ _id: session.sessionId }, { $set: { expiresAt: new Date(Date.now() + 3_600_000) } });
    const before = Date.now();
    expect(await me()).toBe(200);
    const extended = await collections.identitySessions.findOne({ _id: session.sessionId });
    expect(extended!.expiresAt.getTime()).toBeGreaterThan(before + SESSION_POLICY.persistent.idleMs - 60_000);
    expect(extended!.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(before - 1_000);

    // 절대 상한이 두 시간 뒤면 만료는 그 값에서 멈춘다.
    const cap = new Date(Date.now() + 2 * 3_600_000);
    await collections.identitySessions.updateOne({ _id: session.sessionId }, { $set: { absoluteExpiresAt: cap } });
    expect(await me()).toBe(200);
    const capped = await collections.identitySessions.findOne({ _id: session.sessionId });
    expect(capped!.expiresAt.getTime()).toBe(cap.getTime());

    // 상한을 지나면 어떤 활동도 살리지 못한다.
    await collections.identitySessions.updateOne({ _id: session.sessionId }, { $set: { absoluteExpiresAt: new Date(0), expiresAt: new Date(0) } });
    expect(await me()).toBe(401);
  });

  it.skipIf(engine !== "mongodb")("treats sessions issued before the sliding-expiry fields as persistent", async () => {
    const collections = mongoCollections(fixture!.resource.db);
    const { session } = AuthSessionResponseSchema.parse(
      (await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PASSWORD } })).json(),
    ).data;
    // 배포 전 문서 모양: 두 필드가 없고 만료가 발급 뒤 30일로 고정돼 있다.
    const createdAt = new Date(Date.now() - 10 * 86_400_000);
    await collections.identitySessions.updateOne(
      { _id: session.sessionId },
      { $set: { createdAt, expiresAt: new Date(createdAt.getTime() + 30 * 86_400_000) }, $unset: { idleTtlMs: "", absoluteExpiresAt: "" } },
    );
    const before = Date.now();
    const me = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${session.accessToken}` } });
    expect(me.statusCode).toBe(200);
    const legacy = await collections.identitySessions.findOne({ _id: session.sessionId });
    expect(legacy!.expiresAt.getTime()).toBeGreaterThan(before + SESSION_POLICY.persistent.idleMs - 60_000);
    expect(legacy!.expiresAt.getTime()).toBeLessThanOrEqual(createdAt.getTime() + SESSION_POLICY.absoluteMs);
  });

  it("rejects a signup that does not accept the current terms", async () => {
    const response = await signup({ email: `terms-${crypto.randomUUID()}@example.com`, password: PASSWORD, displayName: "미동의" });
    expect(response.statusCode).toBe(400);
    const stale = await signup({ email: `terms-${crypto.randomUUID()}@example.com`, password: PASSWORD, displayName: "옛 판", termsVersion: TERMS_VERSION + 1 });
    expect(stale.statusCode).toBe(400);
  });

  it.skipIf(engine !== "mongodb")("records the accepted terms and sends one verification mail on signup", async () => {
    const collections = mongoCollections(fixture!.resource.db);
    const account = await collections.users.findOne({ email });
    expect(account?.termsVersion).toBe(TERMS_VERSION);
    expect(account?.termsAcceptedAt).toBeInstanceOf(Date);
    expect(account?.emailVerifiedAt).toBeNull();

    const verification = mailer.sent.filter((mail) => mail.to === email && mail.subject.includes("이메일 주소 확인"));
    expect(verification).toHaveLength(1);
    expect(verification[0]!.text).toContain("http://app.test/verify-email?token=exvt_");
    expect(verification[0]!.idempotencyKey).toBeTruthy();
    // 해시만 저장한다. 원문 토큰은 어디에도 없다.
    const token = /token=([^\s]+)/.exec(verification[0]!.text)![1]!;
    expect(await collections.identityTokens.countDocuments({ tokenHash: token })).toBe(0);
    expect(await collections.identityTokens.countDocuments({ userId: account!._id, kind: "email_verification" })).toBe(1);
  });

  it.skipIf(engine !== "mongodb")("blocks publishing until the email is verified, then confirms through the mailed link", async () => {
    const { session } = AuthSessionResponseSchema.parse(
      (await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PASSWORD } })).json(),
    ).data;
    const authorization = `Bearer ${session.accessToken}`;
    const publish = () => app.inject({ method: "POST", url: `/v1/portfolios/${crypto.randomUUID()}/deployments`, headers: { authorization }, payload: { slug: "gate-check" } });

    const blocked = await publish();
    expect(blocked.statusCode).toBe(403);
    expect(ApiErrorResponseSchema.parse(blocked.json()).error.details).toEqual({ reason: "email_verification_required" });

    // 가입 직후 보낸 메일이 60초 안이라 재발송은 429다.
    const tooSoon = await app.inject({ method: "POST", url: "/v1/auth/email-verification", headers: { authorization } });
    expect(tooSoon.statusCode).toBe(429);

    const confirmed = await app.inject({ method: "POST", url: "/v1/auth/email-verification/confirm", payload: { token: mailer.lastTokenFor(email) } });
    expect(confirmed.statusCode).toBe(200);
    expect(CurrentUserResponseSchema.parse(confirmed.json()).data.emailVerifiedAt).not.toBeNull();

    // 같은 링크를 두 번 쓸 수 없다.
    const reused = await app.inject({ method: "POST", url: "/v1/auth/email-verification/confirm", payload: { token: mailer.lastTokenFor(email) } });
    expect(reused.statusCode).toBe(400);

    const me = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization } });
    expect(CurrentUserResponseSchema.parse(me.json()).data.emailVerifiedAt).not.toBeNull();
    expect((await publish()).statusCode).toBe(201);

    // 인증이 끝난 계정의 재발송은 409다.
    const already = await app.inject({ method: "POST", url: "/v1/auth/email-verification", headers: { authorization } });
    expect(already.statusCode).toBe(409);
  });

  it.skipIf(engine !== "mongodb")("resets the password through a one-time link and revokes every other session", async () => {
    const before = mailer.sent.length;
    const unknown = await app.inject({ method: "POST", url: "/v1/auth/password-reset", payload: { email: `absent-${crypto.randomUUID()}@example.com` } });
    expect(unknown.statusCode).toBe(202);
    expect(mailer.sent).toHaveLength(before);

    const existing = AuthSessionResponseSchema.parse(
      (await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PASSWORD } })).json(),
    ).data;

    const requested = await app.inject({ method: "POST", url: "/v1/auth/password-reset", payload: { email } });
    expect(requested.statusCode).toBe(202);
    expect(mailer.sent).toHaveLength(before + 1);
    expect(mailer.sent.at(-1)!.text).toContain("http://app.test/login/reset?token=exrt_");
    // 60초 안의 재요청은 같은 202이고 메일은 더 가지 않는다.
    expect((await app.inject({ method: "POST", url: "/v1/auth/password-reset", payload: { email } })).statusCode).toBe(202);
    expect(mailer.sent).toHaveLength(before + 1);

    const token = mailer.lastTokenFor(email);
    // 인증 토큰을 재설정 자리에 넣을 수 없다.
    expect((await app.inject({ method: "POST", url: "/v1/auth/password-reset/confirm", payload: { token: token.replace(/^exrt_/, "exvt_"), password: `${PASSWORD}-new` } })).statusCode).toBe(400);

    const newPassword = `${PASSWORD}-new`;
    const confirmed = await app.inject({ method: "POST", url: "/v1/auth/password-reset/confirm", payload: { token, password: newPassword, persistent: false } });
    expect(confirmed.statusCode).toBe(200);
    const fresh = AuthSessionResponseSchema.parse(confirmed.json()).data;
    expect(fresh.session.persistent).toBe(false);

    // 이전 세션은 전부 끊기고 새 세션만 산다.
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${existing.session.accessToken}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${fresh.session.accessToken}` } })).statusCode).toBe(200);
    // 링크는 한 번만 쓰인다.
    expect((await app.inject({ method: "POST", url: "/v1/auth/password-reset/confirm", payload: { token, password: newPassword } })).statusCode).toBe(400);
    // 옛 비밀번호는 더 이상 열리지 않고 새 비밀번호로 들어온다.
    expect((await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PASSWORD } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: newPassword } })).statusCode).toBe(200);
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
