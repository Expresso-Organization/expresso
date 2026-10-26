import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/build-app.js";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";
import { MongoCareerService } from "../../src/modules/career/index.js";
import { MongoIdentityService } from "../../src/modules/identity/index.js";
import { ISOLATED_DATABASE_TIMEOUT_MS } from "../support/timeouts.js";
import { createMongoFixture } from "../support/mongodb.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB career authenticated vertical slice", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let app: ReturnType<typeof buildApi>;
  let origin = "";
  let firstAccessToken = "";
  let secondAccessToken = "";
  let firstUserId = "";

  beforeAll(async () => {
    fixture = await createMongoFixture("career-e2e");
    const identityService = new MongoIdentityService(fixture.resource);
    const careerService = new MongoCareerService(fixture.resource);
    const first = await identityService.signup({ email: `career-e2e-${randomUUID()}@example.com`, displayName: "Vertical A", password: "correct-horse-battery" });
    const second = await identityService.signup({ email: `career-e2e-${randomUUID()}@example.com`, displayName: "Vertical B", password: "correct-horse-battery" });
    firstUserId = first.user.id;
    firstAccessToken = first.session.accessToken;
    secondAccessToken = second.session.accessToken;
    const config: RuntimeConfig = { nodeEnv: "test", host: "127.0.0.1", port: 0, logLevel: "silent", databaseUrl: "mysql://127.0.0.1:1/unused", redisUrl: "redis://127.0.0.1:1", outboxPollIntervalMs: 1_000, outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: `mongo-career-${randomUUID()}` };
    app = buildApi({ config, identityService, careerService });
    origin = await app.listen({ host: "127.0.0.1", port: 0 });
  }, ISOLATED_DATABASE_TIMEOUT_MS);

  afterAll(async () => { if (app) await app.close(); await fixture?.dispose(); }, ISOLATED_DATABASE_TIMEOUT_MS);

  async function api(path: string, options: { method?: string; token?: string; headers?: Record<string, string>; body?: unknown } = {}) {
    return fetch(`${origin}${path}`, { method: options.method ?? "GET", headers: { authorization: `Bearer ${options.token ?? firstAccessToken}`, ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...options.headers }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
  }

  it("runs record evidence, optimistic locking, and cross-user isolation over HTTP", async () => {
    const categories = await (await api("/v1/career/categories")).json() as { data: Array<{ id: string; key: string }> };
    const categoryId = categories.data.find(({ key }) => key === "experience")?.id;
    if (!categoryId) throw new Error("experience category missing");
    const body = { categoryId, title: "Production platform", properties: { period: { type: "date", value: { start: "2025-01-01", end: null, timezone: null } } }, bodyMd: "Built MongoDB migrations and verified MongoDB rollback paths." };
    const createdResponse = await api("/v1/career/records", { method: "POST", headers: { "idempotency-key": "mongo-vertical-record-0001" }, body });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { data: { id: string } };
    const etag = createdResponse.headers.get("etag") ?? "";
    expect((await api("/v1/career/records", { method: "POST", headers: { "idempotency-key": "mongo-vertical-record-0001" }, body })).status).toBe(200);
    const updatedBody = `${body.bodyMd}\nNo downtime was observed.`;
    expect((await api(`/v1/career/records/${created.data.id}`, { method: "PATCH", headers: { "if-match": etag }, body: { bodyMd: updatedBody } })).status).toBe(200);
    expect((await api(`/v1/career/records/${created.data.id}`, { method: "PATCH", headers: { "if-match": etag }, body: { title: "stale overwrite" } })).status).toBe(412);
    const quote = "MongoDB"; const start = updatedBody.indexOf(quote);
    const skillResponse = await api("/v1/career/skills/recompute", { method: "POST", body: { name: "MongoDB", evidence: [{ recordId: created.data.id, span: { source: "body_md", start, end: start + quote.length, quote } }] } });
    expect(skillResponse.status).toBe(200);
    const skill = await skillResponse.json() as { data: { id: string } };
    expect(await (await api(`/v1/career/skills/${skill.data.id}/evidence`)).json()).toMatchObject({ data: [{ recordId: created.data.id, span: { quote } }] });
    expect((await api(`/v1/career/records/${created.data.id}`, { token: secondAccessToken })).status).toBe(404);
    expect(await mongoCollections(fixture.resource.db).careerRecords.countDocuments({ userId: firstUserId })).toBe(1);
  }, 30_000);
});
