import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerCareerGapRoutes } from "./routes.js";
import type { CareerGapService } from "./service.js";
import { randomUUID } from "node:crypto";
describe("Gap route authentication", () => {
  it("blocks unauthenticated reads and writes before calling the service", async () => {
    const app = Fastify(); const getLatest = vi.fn(); const analyze = vi.fn();
    registerCareerGapRoutes(app, { service: { getLatest, analyze } as unknown as CareerGapService, authenticateRequest: async (_req, reply) => { await reply.code(401).send({ error: "unauthorized" }); } });
    for (const method of ["GET", "POST"] as const) {
      const response = await app.inject({ method, url: `/v1/agent/conversations/${randomUUID()}/career-gap`, ...(method === "POST" ? { payload: { requestId: randomUUID(), messageIds: [] } } : {}) });
      expect(response.statusCode).toBe(401);
    }
    expect(getLatest).not.toHaveBeenCalled(); expect(analyze).not.toHaveBeenCalled(); await app.close();
  });
});
