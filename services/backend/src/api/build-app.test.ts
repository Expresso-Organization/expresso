import { get } from "node:http";
import type { AddressInfo } from "node:net";

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

describe("portfolio · brew trash routes", () => {
  // 휴지통 되살리기는 편집 모듈의 스냅숏 되돌리기(`POST /portfolios/:id/restore`)와 주소가 겹치지 않아야 한다.
  it("registers next to the portfolio editing routes and answers without a body", async () => {
    const userId = "00000000-0000-4000-8000-0000000000aa";
    const targetId = "00000000-0000-4000-8000-0000000000bb";
    const calls: string[] = [];
    const trashService = (kind: string) => ({
      trash: async (_user: string, id: string) => { calls.push(`${kind}:trash:${id}`); },
      restore: async (_user: string, id: string) => { calls.push(`${kind}:restore:${id}`); },
      list: async () => ({ data: [] }),
    });
    const app = buildApi({
      config,
      identityService: { verifyAccessToken: async () => ({ user: { id: userId }, sessionId: "session" }) } as never,
      portfolioEditingService: {} as never,
      portfolioReadService: {} as never,
      materialsService: {} as never,
      portfolioTrashService: trashService("portfolio"),
      brewTrashService: trashService("brew"),
    });
    apps.push(app);
    const headers = { authorization: `Bearer exps_${"a".repeat(43)}` };

    expect((await app.inject({ method: "DELETE", url: `/v1/portfolios/${targetId}`, headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "POST", url: `/v1/portfolios/trash/${targetId}/restore`, headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/v1/portfolios/trash", headers })).json()).toEqual({ data: [] });
    expect((await app.inject({ method: "DELETE", url: `/v1/brews/${targetId}`, headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "POST", url: `/v1/brews/trash/${targetId}/restore`, headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/v1/brews/trash", headers })).json()).toEqual({ data: [] });
    expect(calls).toEqual([`portfolio:trash:${targetId}`, `portfolio:restore:${targetId}`, `brew:trash:${targetId}`, `brew:restore:${targetId}`]);
  });
});

describe("shutdown", () => {
  it("closes promptly while an SSE stream is still open", async () => {
    const app = buildApi({ config });
    // 끝나지 않는 SSE. 잡 상태 흐름처럼 응답을 넘겨받아(hijack) 열어 둔다.
    app.get("/test/stream", async (_request, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, { "content-type": "text/event-stream" });
      reply.raw.flushHeaders();
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const { port } = app.server.address() as AddressInfo;
    const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
      get({ host: "127.0.0.1", port, path: "/test/stream" }, resolve).on("error", reject);
    });
    expect(response.statusCode).toBe(200);
    const ended = new Promise<void>((resolve) => response.on("close", () => resolve()));

    const started = Date.now();
    await app.close();

    expect(Date.now() - started).toBeLessThan(1_000);
    await ended;
  });
});
