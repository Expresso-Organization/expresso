import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { expect,it,vi } from "vitest";
import { registerCareerWorkflowRoutes } from "./routes.js";
import type { CareerWorkflowService } from "./service.js";
it("requires authentication for every workflow endpoint",async()=>{
 const app=Fastify();const service={list:vi.fn(),options:vi.fn(),create:vi.fn(),review:vi.fn(),advance:vi.fn(),cancel:vi.fn()};
 registerCareerWorkflowRoutes(app,service as unknown as CareerWorkflowService,async(_req,reply)=>{await reply.code(401).send({error:"unauthorized"});});
 const base=`/v1/agent/conversations/${randomUUID()}/workflows`;
 for(const [method,url] of [["GET",base],["GET",`${base}/options`],["POST",base],["POST",`${base}/${randomUUID()}/review`],["POST",`${base}/${randomUUID()}/advance`],["POST",`${base}/${randomUUID()}/cancel`]] as const)expect((await app.inject({method,url,...(method==="POST"?{payload:{}}:{})})).statusCode).toBe(401);
 Object.values(service).forEach(method=>expect(method).not.toHaveBeenCalled());await app.close();
});
