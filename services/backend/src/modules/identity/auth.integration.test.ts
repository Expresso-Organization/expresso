import {
  ApiErrorResponseSchema,
  AuthSessionResponseSchema,
  CareerCategoriesResponseSchema,
  CurrentUserResponseSchema,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { CareerService } from "../career/service.js";
import { IdentityService } from "./service.js";

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
  queuePrefix: "expresso-auth-test",
};

const PASSWORD = "correct-horse-battery";

describeWithDatabase("auth HTTP integration", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1/unused", { max: 2 });
  const identityService = new IdentityService(sql);
  const app = buildApi({
    config,
    identityService,
    careerService: new CareerService(sql),
  });
  const email = `signup-${crypto.randomUUID()}@example.com`;
  const createdEmails: string[] = [email];

  beforeAll(async () => {
    await sql`
      insert into plan (code, generation_quota)
      values ('free', 3)
      on conflict (code) do update set generation_quota = plan.generation_quota
    `;
    await app.ready();
  });

  afterAll(async () => {
    await sql`delete from "user" where email in ${sql(createdEmails)}`;
    await app.close();
    await sql.end({ timeout: 5 });
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
    const stored = await sql<{ password_hash: string | null }[]>`
      select password_hash from "user" where email = ${email}
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

    const rows = await sql`select 1 from "user" where email = ${shortPassword}`;
    expect(rows).toHaveLength(0);
  });
});
