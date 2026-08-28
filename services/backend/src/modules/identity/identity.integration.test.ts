import { randomUUID } from "node:crypto";
import {
  ApiErrorResponseSchema,
  CurrentUserResponseSchema,
  IssuedIdentitySessionSchema,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";
import { createMysqlResource } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "./service.js";
import { MongoIdentityService, type IdentityApi } from "./index.js";
import { createMongoFixture } from "../../../test/support/mongodb.js";

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
  queuePrefix: "expresso-identity-test",
};

interface IdRow {
  id: string;
}

interface TokenHashRow {
  token_hash: string;
}

for (const engine of ["mysql", "mongodb"] as const) {
describe.skipIf(engine === "mysql" ? !databaseUrl : !(process.env.TEST_MONGODB_URL ?? process.env.TEST_MONGODB_ADMIN_URL))(`identity HTTP integration (${engine})`, () => {
  let sql: SqlTag;
  let fixture: Awaited<ReturnType<typeof createMongoFixture>> | undefined;
  let identityService: IdentityApi;
  let app: ReturnType<typeof buildApi>;
  let firstUserId: string;
  let secondUserId: string;

  beforeAll(async () => {
    if (engine === "mongodb") {
      fixture = await createMongoFixture("identity");
      identityService = new MongoIdentityService(fixture.resource);
      firstUserId = (await identityService.signup({ email: `first-${randomUUID()}@example.com`, displayName: "First", password: "correct-horse-battery" })).user.id;
      secondUserId = (await identityService.signup({ email: `second-${randomUUID()}@example.com`, displayName: "Second", password: "correct-horse-battery" })).user.id;
      app = buildApi({ config, identityService });
      await app.ready();
      return;
    }
    sql = createMysqlResource(databaseUrl!).sql;
    identityService = new IdentityService(sql);
    app = buildApi({ config, identityService });
    const plans = await sql<IdRow[]>`select id from plan where code = 'free'`;
    const planId = plans[0]?.id;
    if (!planId) throw new Error("test plan was not available");

    const users: IdRow[] = [{ id: randomUUID() }, { id: randomUUID() }];
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values
        (${users[0]!.id}, ${`identity-a-${crypto.randomUUID()}@example.com`}, 'Identity A', ${planId}),
        (${users[1]!.id}, ${`identity-b-${crypto.randomUUID()}@example.com`}, 'Identity B', ${planId})
    `;
    const [first, second] = users;
    if (!first || !second) throw new Error("test users were not persisted");
    firstUserId = first.id;
    secondUserId = second.id;
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (fixture) { await fixture.dispose(); return; }
    if (sql && firstUserId && secondUserId) {
      await sql`delete from \`user\` where id in (${firstUserId}, ${secondUserId})`;
    }
    await sql?.end({ timeout: 5 });
  });

  it("requires authentication and prevents user A from revoking user B's UUID", async () => {
    const firstSession = IssuedIdentitySessionSchema.parse(
      await identityService.issueSession({ userId: firstUserId }),
    );
    const secondSession = IssuedIdentitySessionSchema.parse(
      await identityService.issueSession({ userId: secondUserId }),
    );

    const missingAuth = await app.inject({ method: "GET", url: "/v1/me" });
    expect(missingAuth.statusCode).toBe(401);
    expect(ApiErrorResponseSchema.parse(missingAuth.json()).error.code).toBe(
      "AUTH_REQUIRED",
    );

    const firstMe = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${firstSession.accessToken}` },
    });
    expect(firstMe.statusCode).toBe(200);
    expect(CurrentUserResponseSchema.parse(firstMe.json()).data.id).toBe(
      firstUserId,
    );

    const storedToken = fixture ? [{ token_hash: (await fixture.resource.db.collection("identity_sessions").findOne({ _id: firstSession.sessionId as never }))?.tokenHash }] : await sql<TokenHashRow[]>`
      select token_hash from identity_session where id = ${firstSession.sessionId}
    `;
    expect(storedToken[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(storedToken[0]?.token_hash).not.toBe(firstSession.accessToken);

    const crossUserRevoke = await app.inject({
      method: "DELETE",
      url: `/v1/identity/sessions/${secondSession.sessionId}`,
      headers: { authorization: `Bearer ${firstSession.accessToken}` },
    });
    expect(crossUserRevoke.statusCode).toBe(404);
    expect(
      ApiErrorResponseSchema.parse(crossUserRevoke.json()).error.code,
    ).toBe("NOT_FOUND");

    const secondStillAuthenticated = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${secondSession.accessToken}` },
    });
    expect(secondStillAuthenticated.statusCode).toBe(200);
    expect(
      CurrentUserResponseSchema.parse(secondStillAuthenticated.json()).data.id,
    ).toBe(secondUserId);

    const ownRevoke = await app.inject({
      method: "DELETE",
      url: `/v1/identity/sessions/${firstSession.sessionId}`,
      headers: { authorization: `Bearer ${firstSession.accessToken}` },
    });
    expect(ownRevoke.statusCode).toBe(204);

    const revokedCredential = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${firstSession.accessToken}` },
    });
    expect(revokedCredential.statusCode).toBe(401);
  });
});
}
