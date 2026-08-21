import { randomUUID } from "node:crypto";
import { createMysqlResource } from "../../src/platform/mysql.js";

import { migrate } from "@expresso/database";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/build-app.js";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";
import { CareerService } from "../../src/modules/career/service.js";
import { IdentityService } from "../../src/modules/identity/service.js";

const rootDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = rootDatabaseUrl ? describe : describe.skip;

interface IdRow {
  id: string;
}

describeWithDatabase("career authenticated vertical slice", () => {
  const databaseName = `expresso_e2e_${randomUUID().replaceAll("-", "")}`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  let app: ReturnType<typeof buildApi>;
  let origin: string;
  let firstAccessToken: string;
  let secondAccessToken: string;
  let firstUserId: string;

  beforeAll(async () => {
    const rootUrl = new URL(rootDatabaseUrl ?? "mysql://127.0.0.1:1/unused");
    const adminUrl = new URL(rootUrl);
    adminUrl.pathname = "/postgres";
    admin = createMysqlResource(adminUrl.toString().sql, { max: 1 });
    await admin.unsafe(`create database "${databaseName}"`);

    const isolatedUrl = new URL(rootUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    await migrate({ databaseUrl: isolatedUrl.toString() });
    sql = createMysqlResource(isolatedUrl.toString().sql, { max: 4 });

    const plans = await sql<IdRow[]>`select id from plan where code = 'free'`;
    const planId = plans[0]?.id;
    if (!planId) throw new Error("fresh database did not seed the free plan");
    const users = await sql<IdRow[]>`
      insert into \`user\` (email, display_name, plan_id)
      values
        ('vertical-a@example.com', 'Vertical A', ${planId}),
        ('vertical-b@example.com', 'Vertical B', ${planId})
      returning id
    `;
    const [first, second] = users;
    if (!first || !second) throw new Error("vertical slice users were not created");
    firstUserId = first.id;

    const identityService = new IdentityService(sql);
    const careerService = new CareerService(sql);
    firstAccessToken = (await identityService.issueSession({ userId: first.id })).accessToken;
    secondAccessToken = (await identityService.issueSession({ userId: second.id })).accessToken;
    const config: RuntimeConfig = {
      nodeEnv: "test",
      host: "127.0.0.1",
      port: 0,
      logLevel: "silent",
      databaseUrl: isolatedUrl.toString(),
      redisUrl: "redis://127.0.0.1:1",
      outboxPollIntervalMs: 1_000,
      outboxBatchSize: 25,
      outboxMaxAttempts: 5,
      queuePrefix: `expresso-${databaseName}`,
    };
    app = buildApi({ config, identityService, careerService });
    origin = await app.listen({ host: "127.0.0.1", port: 0 });
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (sql) await sql.end({ timeout: 5 });
    if (admin) {
      await admin`
        select pg_terminate_backend(pid)
        from pg_stat_activity
        where datname = ${databaseName} and pid <> pg_backend_pid()
      `;
      await admin.unsafe(`drop database if exists "${databaseName}"`);
      await admin.end({ timeout: 5 });
    }
  }, 30_000);

  async function api(
    path: string,
    options: {
      method?: string;
      token?: string;
      headers?: Record<string, string>;
      body?: unknown;
    } = {},
  ): Promise<Response> {
    return fetch(`${origin}${path}`, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${options.token ?? firstAccessToken}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  }

  it("runs user creation through record evidence and cross-user isolation over HTTP", async () => {
    const categoriesResponse = await api("/v1/career/categories");
    expect(categoriesResponse.status).toBe(200);
    const categories = (await categoriesResponse.json()) as {
      data: Array<{ id: string; key: string }>;
    };
    expect(categories.data.map(({ key }) => key)).toEqual([
      "experience",
      "project",
      "education_history",
      "certification_award",
      "academic_writing",
      "activity_leadership",
      "skill_tool",
    ]);
    const experienceId = categories.data.find(({ key }) => key === "experience")?.id;
    if (!experienceId) throw new Error("experience category missing from HTTP response");

    const recordBody = {
      categoryId: experienceId,
      title: "Production platform",
      properties: { role: "Backend engineer", achievements: ["stable migration"] },
      bodyMd: "Built PostgreSQL migrations and verified PostgreSQL rollback paths.",
    };
    const idempotencyKey = "vertical-career-record-0001";
    const createdResponse = await api("/v1/career/records", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: recordBody,
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      data: { id: string; version: number; bodyMd: string };
    };
    const firstEtag = createdResponse.headers.get("etag");
    expect(firstEtag).toBe('"v1"');

    const replayResponse = await api("/v1/career/records", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: recordBody,
    });
    expect(replayResponse.status).toBe(200);
    expect(((await replayResponse.json()) as { data: { id: string } }).data.id).toBe(
      created.data.id,
    );

    const updatedBody = `${recordBody.bodyMd}\nNo downtime was observed.`;
    const updatedResponse = await api(`/v1/career/records/${created.data.id}`, {
      method: "PATCH",
      headers: { "if-match": firstEtag ?? "" },
      body: { bodyMd: updatedBody },
    });
    expect(updatedResponse.status).toBe(200);
    expect(updatedResponse.headers.get("etag")).toBe('"v2"');

    const staleResponse = await api(`/v1/career/records/${created.data.id}`, {
      method: "PATCH",
      headers: { "if-match": firstEtag ?? "" },
      body: { title: "stale overwrite" },
    });
    expect(staleResponse.status).toBe(412);

    const quote = "PostgreSQL";
    const start = updatedBody.indexOf(quote);
    const skillResponse = await api("/v1/career/skills/recompute", {
      method: "POST",
      body: {
        name: "Postgres",
        evidence: [{
          recordId: created.data.id,
          span: { source: "body_md", start, end: start + quote.length, quote },
        }],
      },
    });
    expect(skillResponse.status).toBe(200);
    const skill = (await skillResponse.json()) as {
      data: { id: string; name: string; evidenceCount: number; strength: string };
    };
    expect(skill.data).toMatchObject({
      name: "postgresql",
      evidenceCount: 1,
      strength: "weak",
    });

    const evidenceResponse = await api(
      `/v1/career/skills/${skill.data.id}/evidence`,
    );
    expect(evidenceResponse.status).toBe(200);
    expect((await evidenceResponse.json()) as unknown).toMatchObject({
      data: [{ recordId: created.data.id, span: { quote: "PostgreSQL" } }],
    });

    const crossUserResponse = await api(`/v1/career/records/${created.data.id}`, {
      token: secondAccessToken,
    });
    expect(crossUserResponse.status).toBe(404);
    const count = await sql<{ count: number }[]>`
      select count(*) as count from record where user_id = ${firstUserId}
    `;
    expect(count[0]?.count).toBe(1);
  }, 30_000);
});
