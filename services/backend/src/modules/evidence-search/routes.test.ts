import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { registerEvidenceSearchRoutes } from "./routes.js";
import type { EvidenceSearchService } from "./service.js";
it("세 API 모두 인증 전에 서비스를 호출하지 않는다", async () => {
 const app = Fastify(); const service = { search: vi.fn(), sync: vi.fn(), searchJobs: vi.fn() };
 registerEvidenceSearchRoutes(app, service as unknown as EvidenceSearchService, async (_req, reply) => { await reply.code(401).send({ error: "unauthorized" }); });
 for (const url of ["/v1/career/evidence-search", "/v1/career/evidence-search/sync", "/v1/jobs/semantic-search"]) expect((await app.inject({ method: "POST", url, payload: {} })).statusCode).toBe(401);
 Object.values(service).forEach(fn => expect(fn).not.toHaveBeenCalled()); await app.close();
});

it("정합성·재색인 API도 인증 전에 서비스를 호출하지 않는다", async () => {
 const app = Fastify(); const service = { health: vi.fn(), requestSync: vi.fn() };
 registerEvidenceSearchRoutes(app, service as unknown as EvidenceSearchService, async (_req, reply) => { await reply.code(401).send({ error: "unauthorized" }); });
 expect((await app.inject({ method: "GET", url: "/v1/career/evidence-search/health" })).statusCode).toBe(401);
 expect((await app.inject({ method: "POST", url: "/v1/career/evidence-search/reindex", payload: {} })).statusCode).toBe(401);
 expect(service.health).not.toHaveBeenCalled(); expect(service.requestSync).not.toHaveBeenCalled(); await app.close();
});
