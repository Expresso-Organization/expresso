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

describeWithDatabase("identity HTTP integration", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const identityService = new IdentityService(sql);
  const app = buildApi({ config, identityService });
  let firstUserId: string;
  let secondUserId: string;

  beforeAll(async () => {
    const plans = await sql<IdRow[]>`
      insert into plan (code, generation_quota)
      values ('free', 3)
      as new on duplicate key update generation_quota = plan.generation_quota
      returning id
    `;
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
  });

  afterAll(async () => {
    if (firstUserId && secondUserId) {
      await sql`delete from \`user\` where id in (${firstUserId}, ${secondUserId})`;
    }
    await app.close();
    await sql.end({ timeout: 5 });
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

    const storedToken = await sql<TokenHashRow[]>`
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
