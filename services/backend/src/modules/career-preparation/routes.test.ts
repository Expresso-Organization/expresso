import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { registerPreparationRoutes } from "./routes.js";
import type { PreparationService } from "./service.js";
import { CreatePreparationSchema } from "@expresso/contracts";
describe("Preparation request boundary", () => {
  it("rejects missing gaps, repeated IDs and invalid availability", () => {
    const id = randomUUID(); const base = { requestId: randomUUID(), gapResultId: randomUUID(), gapIds: [id], settings: { weeklyHours: 3, weeks: 4, startDate: "2026-10-14" } };
    expect(CreatePreparationSchema.safeParse({ ...base, gapIds: [] }).success).toBe(false);
    expect(CreatePreparationSchema.safeParse({ ...base, gapIds: [id, id] }).success).toBe(false);
    expect(CreatePreparationSchema.safeParse({ ...base, settings: { ...base.settings, weeklyHours: 0 } }).success).toBe(false);
  });
  it("requires authentication before list/create/approve/reject", async () => {
    const app = Fastify(); const methods = { list: vi.fn(), create: vi.fn(), approve: vi.fn(), reject: vi.fn() };
    registerPreparationRoutes(app, { service: methods as unknown as PreparationService, authenticateRequest: async (_req, reply) => { await reply.code(401).send({ error: "unauthorized" }); } });
    const base = `/v1/agent/conversations/${randomUUID()}/preparation-plans`;
    for (const [method, url] of [["GET", base], ["POST", base], ["POST", `${base}/${randomUUID()}/approve`], ["POST", `${base}/${randomUUID()}/reject`]] as const) {
      expect((await app.inject({ method, url, ...(method === "POST" ? { payload: {} } : {}) })).statusCode).toBe(401);
    }
    Object.values(methods).forEach((method) => expect(method).not.toHaveBeenCalled()); await app.close();
  });
});
