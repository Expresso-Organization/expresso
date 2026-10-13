import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { registerPreparationProgressRoutes } from "./routes.js";
import type { PreparationProgressService } from "./service.js";
it("blocks every progress endpoint before service access without authentication",async()=>{
 const app=Fastify();const methods={get:vi.fn(),start:vi.fn(),update:vi.fn(),listReplans:vi.fn(),createReplan:vi.fn(),decideReplan:vi.fn()};
 registerPreparationProgressRoutes(app,{service:methods as unknown as PreparationProgressService,authenticateRequest:async(_req,reply)=>{await reply.code(401).send({error:"unauthorized"});}});
 const base=`/v1/agent/conversations/${randomUUID()}/preparation-plans/${randomUUID()}/progress`;
 for(const [method,url] of [["GET",base],["POST",base],["PATCH",`${base}/tasks/${randomUUID()}`],["GET",`${base}/replans`],["POST",`${base}/replans`],["POST",`${base}/replans/${randomUUID()}/approve`],["POST",`${base}/replans/${randomUUID()}/reject`]] as const) expect((await app.inject({method,url,...(method!=="GET"?{payload:{}}:{})})).statusCode).toBe(401);
 Object.values(methods).forEach(method=>expect(method).not.toHaveBeenCalled());await app.close();
});
