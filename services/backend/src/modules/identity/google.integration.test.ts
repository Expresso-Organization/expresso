import { generateKeyPairSync, sign as signWith } from "node:crypto";

import { ApiErrorResponseSchema, SocialAuthSessionResponseSchema } from "@expresso/contracts";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { RemoteGoogleIdTokenVerifier } from "./google.js";
import { IdentityService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const CLIENT_ID = "expresso-test.apps.googleusercontent.com";
const NONCE = "nonce-from-the-start-step";

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
  queuePrefix: "expresso-google-test",
};

const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/** Google인 척하는 발급기. 서명만 우리 키로 하고 나머지는 진짜와 같은 모양이다. */
function issueIdToken(claims: {
  sub: string;
  email: string;
  emailVerified?: boolean;
  name?: string | null;
  nonce?: string;
}): string {
  const nowSec = Math.floor(Date.now() / 1_000);
  const header = { alg: "RS256", kid: "test-key", typ: "JWT" };
  const payload = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: claims.sub,
    email: claims.email,
    email_verified: claims.emailVerified ?? true,
    ...(claims.name === undefined ? {} : { name: claims.name }),
    nonce: claims.nonce ?? NONCE,
    iat: nowSec - 10,
    exp: nowSec + 3_500,
  };
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = signWith("RSA-SHA256", Buffer.from(signingInput, "utf8"), keyPair.privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
}

interface IdRow {
  id: string;
}

describeWithDatabase("Google 로그인 HTTP 통합", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1/unused", { max: 2 });
  const identityService = new IdentityService(sql);
  const app = buildApi({
    config,
    identityService,
    googleIdTokenVerifier: new RemoteGoogleIdTokenVerifier({
      clientId: CLIENT_ID,
      fetchJwks: async () => ({
        keys: [
          {
            ...(keyPair.publicKey.export({ format: "jwk" }) as object),
            kid: "test-key",
            alg: "RS256",
            use: "sig",
          },
        ],
      }),
    }),
  });

  const suffix = crypto.randomUUID();
  const freshEmail = `google-new-${suffix}@example.com`;
  const passwordEmail = `google-existing-${suffix}@example.com`;
  const createdEmails = [freshEmail, passwordEmail];

  beforeAll(async () => {
    await sql`
      insert into plan (code, generation_quota) values ('free', 3)
      on conflict (code) do update set generation_quota = plan.generation_quota
    `;
    await app.ready();

    // 비밀번호로 먼저 가입해 둔 계정. 연결 경로의 상대다.
    const signup = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      payload: {
        email: passwordEmail,
        password: "correct-horse-battery",
        displayName: "이미 있는 사람",
      },
    });
    expect(signup.statusCode).toBe(201);
  });

  afterAll(async () => {
    await sql`delete from "user" where email = any(${createdEmails})`;
    await app.close();
    await sql.end({ timeout: 5 });
  });

  it("처음 오는 Google 계정으로 가입하고 세션을 받는다", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: issueIdToken({ sub: `sub-${suffix}`, email: freshEmail, name: "새 사람" }), nonce: NONCE },
    });

    expect(response.statusCode).toBe(200);
    const body = SocialAuthSessionResponseSchema.parse(response.json());
    expect(body.data.created).toBe(true);
    expect(body.data.user.email).toBe(freshEmail);
    expect(body.data.user.displayName).toBe("새 사람");

    // 비밀번호 없는 계정이어야 한다.
    const rows = await sql<{ password_hash: string | null }[]>`
      select password_hash from "user" where email = ${freshEmail}
    `;
    expect(rows[0]?.password_hash).toBeNull();
  });

  it("두 번째부터는 같은 계정으로 들어오고 created는 거짓이다", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: issueIdToken({ sub: `sub-${suffix}`, email: freshEmail }), nonce: NONCE },
    });

    expect(response.statusCode).toBe(200);
    const body = SocialAuthSessionResponseSchema.parse(response.json());
    expect(body.data.created).toBe(false);
  });

  it("Google 쪽 이메일이 바뀌어도 sub가 같으면 같은 사람이다", async () => {
    const renamed = `google-renamed-${suffix}@example.com`;
    createdEmails.push(renamed);
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: issueIdToken({ sub: `sub-${suffix}`, email: renamed }), nonce: NONCE },
    });

    expect(response.statusCode).toBe(200);
    const body = SocialAuthSessionResponseSchema.parse(response.json());
    // 계정은 처음 만든 그것 — 새로 만들지 않았다.
    expect(body.data.created).toBe(false);
    expect(body.data.user.email).toBe(freshEmail);
  });

  it("이메일이 비밀번호 계정과 겹치면 세션을 주지 않고 409로 되돌린다", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: issueIdToken({ sub: `sub-other-${suffix}`, email: passwordEmail }), nonce: NONCE },
    });

    expect(response.statusCode).toBe(409);
    const body = ApiErrorResponseSchema.parse(response.json());
    expect(body.error.details).toEqual({
      reason: "password_confirmation_required",
      email: passwordEmail,
    });
  });

  it("Google이 이메일을 보증하지 않으면 계정을 만들지 않는다", async () => {
    const unverified = `google-unverified-${suffix}@example.com`;
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: {
        idToken: issueIdToken({ sub: `sub-unverified-${suffix}`, email: unverified, emailVerified: false }),
        nonce: NONCE,
      },
    });

    expect(response.statusCode).toBe(401);
    const rows = await sql`select 1 from "user" where email = ${unverified}`;
    expect(rows).toHaveLength(0);
  });

  it("틀린 비밀번호로는 잇지 못한다", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google/link",
      payload: {
        idToken: issueIdToken({ sub: `sub-other-${suffix}`, email: passwordEmail }),
        nonce: NONCE,
        password: "wrong-password-entirely",
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it("맞는 비밀번호를 확인하면 잇고, 다음부터는 Google만으로 들어온다", async () => {
    const link = await app.inject({
      method: "POST",
      url: "/v1/auth/google/link",
      payload: {
        idToken: issueIdToken({ sub: `sub-other-${suffix}`, email: passwordEmail }),
        nonce: NONCE,
        password: "correct-horse-battery",
      },
    });

    expect(link.statusCode).toBe(200);
    expect(SocialAuthSessionResponseSchema.parse(link.json()).data.created).toBe(false);

    // 이제 비밀번호 없이 들어온다.
    const again = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: issueIdToken({ sub: `sub-other-${suffix}`, email: passwordEmail }), nonce: NONCE },
    });
    expect(again.statusCode).toBe(200);
    expect(SocialAuthSessionResponseSchema.parse(again.json()).data.user.email).toBe(passwordEmail);
  });

  it("nonce가 다른 토큰은 401이다 — 주워 온 토큰을 밀어 넣을 수 없다", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: issueIdToken({ sub: `sub-${suffix}`, email: freshEmail }), nonce: "다른-nonce" },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("검증기가 없을 때", () => {
  it("Google 경로는 503으로 답한다 — 조용히 통과시키지 않는다", async () => {
    const sql = postgres("postgres://127.0.0.1:1/unused", { max: 1 });
    const app = buildApi({ config, identityService: new IdentityService(sql) });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: "a.b.c", nonce: "n" },
    });
    expect(response.statusCode).toBe(503);

    await app.close();
    await sql.end({ timeout: 1 });
  });
});
