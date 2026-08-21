import { afterEach, describe, expect, it } from "vitest";

import { buildApi } from "./build-app.js";
import type { RuntimeConfig } from "../config/runtime-config.js";

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  databaseUrl: "mysql://localhost/expresso_test",
  redisUrl: "redis://localhost:6379",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-test",
};

const apps: ReturnType<typeof buildApi>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("system routes", () => {
  it("reports liveness without checking infrastructure", async () => {
    const app = buildApi({ config });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "alive" });
  });

  it("returns 503 when a readiness dependency is down", async () => {
    const app = buildApi({
      config,
      readinessChecks: [
        {
          name: "postgres",
          run: async () => {
            throw new Error("unavailable");
          },
        },
      ],
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "not_ready",
      checks: { postgres: "down" },
    });
  });

  it("propagates a request ID without exposing internal error messages", async () => {
    const app = buildApi({ config });
    apps.push(app);
    app.get("/boom", async () => {
      throw new Error("password=secret-value");
    });

    const response = await app.inject({
      method: "GET",
      url: "/boom",
      headers: { "x-request-id": "req_external_1234" },
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers["x-request-id"]).toBe("req_external_1234");
    expect(response.json()).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        requestId: "req_external_1234",
      },
    });
    expect(response.body).not.toContain("secret-value");
  });

  it("uses the shared error envelope for missing routes", async () => {
    const app = buildApi({ config });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/missing" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Resource not found",
        requestId: response.headers["x-request-id"],
      },
    });
  });
});
