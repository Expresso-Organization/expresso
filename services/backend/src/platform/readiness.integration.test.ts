import { afterAll, describe, expect, it } from "vitest";

import { inspectReadiness } from "../modules/system/readiness.js";
import { createMysqlResource } from "./mysql.js";
import { createRedisResource } from "./redis.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const describeWithInfrastructure = databaseUrl && redisUrl
  ? describe
  : describe.skip;

describeWithInfrastructure("infrastructure readiness", () => {
  const database = createMysqlResource(
    databaseUrl ?? "mysql://127.0.0.1:1/unused",
  );
  const redis = createRedisResource(redisUrl ?? "redis://127.0.0.1:1");

  afterAll(async () => {
    await Promise.all([database.close(), redis.close()]);
  });

  it("checks the real MySQL and Redis instances", async () => {
    await expect(
      inspectReadiness([database.readinessCheck, redis.readinessCheck]),
    ).resolves.toEqual({
      status: "ready",
      checks: { mysql: "up", redis: "up" },
    });
  });
});
