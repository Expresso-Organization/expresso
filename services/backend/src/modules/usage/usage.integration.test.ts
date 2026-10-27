import { randomUUID } from "node:crypto";

import { MonthlyUsageResponseSchema, PlanListResponseSchema } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { UsageService } from "./index.js";

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  databaseUrl: "mysql://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-usage-test",
};

describe.skipIf(!(process.env.TEST_MONGODB_URL ?? process.env.TEST_MONGODB_ADMIN_URL))("usage integration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: UsageService;
  let userId = "";

  const event = (input: { contract: string; model: string; tokens: [number, number, number, number]; createdAt: string; userId?: string | null }) =>
    mongoCollections(fixture.resource.db).aiUsageEvents.insertOne({
      _id: randomUUID(),
      userId: input.userId === undefined ? userId : input.userId,
      contract: input.contract,
      model: input.model,
      inputTokens: input.tokens[0],
      outputTokens: input.tokens[1],
      cacheCreationTokens: input.tokens[2],
      cacheReadTokens: input.tokens[3],
      costUsd: null,
      durationMs: 100,
      createdAt: new Date(input.createdAt),
    });

  beforeAll(async () => {
    fixture = await createMongoFixture("usage");
    service = new UsageService(fixture.resource);
    userId = (await new MongoIdentityService(fixture.resource).signup({ email: `usage-${randomUUID()}@example.com`, displayName: "Usage", password: "correct-horse-battery" })).user.id;
    // 10월 1일 0시(한국 시각) 직전 · 직후, 그리고 같은 날 두 건.
    await event({ contract: "page_generation", model: "claude-opus-4-5", tokens: [9, 9, 9, 9], createdAt: "2026-09-30T14:59:59.000Z" });
    await event({ contract: "page_generation", model: "claude-opus-4-5", tokens: [8, 16_647, 136_562, 81_423], createdAt: "2026-09-30T15:00:00.000Z" });
    await event({ contract: "search_interpret", model: "claude-haiku-5-5", tokens: [1_000, 200, 0, 0], createdAt: "2026-10-03T02:00:00.000Z" });
    await event({ contract: "agent_chat", model: "claude-sonnet-5", tokens: [500, 1_500, 3_000, 5_000], createdAt: "2026-10-03T14:30:00.000Z" });
    // 남의 호출과 사용자가 없는 호출은 잡히지 않는다.
    await event({ contract: "job_facts", model: "claude-sonnet-5", tokens: [1, 1, 1, 1_000_000], createdAt: "2026-10-03T02:00:00.000Z", userId: null });
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("sums the month in KST and turns tokens into credits once", async () => {
    const usage = await service.monthly(userId, new Date("2026-10-05T03:00:00.000Z"));
    expect(usage).toMatchObject({
      periodStart: "2026-10-01",
      planCode: "free",
      tokensPerCredit: 10_000,
      calls: 3,
      tokens: { inputTokens: 1_508, outputTokens: 18_347, cacheReadTokens: 86_423 },
      // 캐시 생성(139,562)은 빼고 106,278 토큰 → 10.6278 → 11
      creditsUsed: 11,
      creditLimit: 100,
      creditsRemaining: 89,
    });
    expect(usage.byContract.map(({ key }) => key)).toEqual(["page_generation", "agent_chat", "search_interpret"]);
    expect(usage.byModel).toEqual([
      { key: "claude-opus-4-5", totalTokens: 98_078, calls: 1 },
      { key: "claude-sonnet-5", totalTokens: 7_000, calls: 1 },
      { key: "claude-haiku-5-5", totalTokens: 1_200, calls: 1 },
    ]);
  });

  it("lists every day from the first of the month to today, with KST day boundaries", async () => {
    const usage = await service.monthly(userId, new Date("2026-10-05T03:00:00.000Z"));
    expect(usage.daily.map(({ date }) => date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
    expect(usage.daily[0]).toMatchObject({ calls: 1, outputTokens: 16_647 });
    expect(usage.daily[1]).toMatchObject({ calls: 0, outputTokens: 0 });
    // 10월 3일 14:30 UTC는 한국 시각으로 10월 3일 23:30이다.
    expect(usage.daily[2]).toMatchObject({ calls: 2, inputTokens: 1_500 });
  });

  it("serves the month and the plan list through authenticated routes", async () => {
    const identity = new MongoIdentityService(fixture.resource);
    const app = buildApi({ config, identityService: identity, usageService: service });
    await app.ready();
    try {
      const session = await identity.issueSession({ userId });
      const headers = { authorization: `Bearer ${session.accessToken}` };
      const usage = await app.inject({ method: "GET", url: "/v1/me/usage", headers });
      expect(usage.statusCode).toBe(200);
      expect(MonthlyUsageResponseSchema.parse(usage.json()).data.planCode).toBe("free");
      const plans = await app.inject({ method: "GET", url: "/v1/plans", headers });
      expect(plans.statusCode).toBe(200);
      expect(PlanListResponseSchema.parse(plans.json()).data.map(({ code, displayName, monthlyCredits }) => ({ code, displayName, monthlyCredits }))).toEqual([
        { code: "free", displayName: "Single Shot", monthlyCredits: 100 },
        { code: "pro", displayName: "Double Shot", monthlyCredits: 1_000 },
        { code: "team", displayName: "Extra Shot", monthlyCredits: 2_500 },
      ]);
      expect((await app.inject({ method: "GET", url: "/v1/me/usage" })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
