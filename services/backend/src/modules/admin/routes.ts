import { API_PREFIX, DummyAccountKeyParamsSchema, DummyAccountListResponseSchema, DummyAccountResponseSchema } from "@expresso/contracts";
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { IdentityPrincipal } from "../identity/index.js";
import type { AdminService } from "./service.js";

/**
 * 관리 경로. 세션 주인이 관리자가 아니면 404로 답한다 — 일반 사용자에게 이 경로가 있다는 것도
 * 드러내지 않는다. 판단 기준이 `principal.user`가 아니라 `owner`라서, 대신 로그인 중에도 관리
 * 화면을 쓰고 다른 더미 계정으로 바로 옮겨 갈 수 있다.
 */
export function registerAdminRoutes(
  app: FastifyInstance,
  options: { service: AdminService; authenticateRequest: preHandlerHookHandler },
): void {
  const preHandler = [options.authenticateRequest];
  const admin = (request: FastifyRequest): IdentityPrincipal => {
    const principal = requireAuth(request);
    if (principal.owner.role !== "admin") throw new HttpStatusError(404, "not found");
    return principal;
  };
  const key = (request: FastifyRequest) => {
    const parsed = DummyAccountKeyParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new HttpStatusError(400, "invalid dummy account key");
    return parsed.data.key;
  };

  app.get(`${API_PREFIX}/admin/dummy-accounts`, { preHandler }, async (request) => {
    admin(request);
    return DummyAccountListResponseSchema.parse({ data: await options.service.listDummies() });
  });

  app.post(`${API_PREFIX}/admin/dummy-accounts/:key`, { preHandler }, async (request, reply) => {
    const principal = admin(request);
    return reply.code(201).send(DummyAccountResponseSchema.parse({ data: await options.service.createDummy(principal, key(request)) }));
  });

  app.post(`${API_PREFIX}/admin/dummy-accounts/:key/refill`, { preHandler }, async (request) => {
    const principal = admin(request);
    return DummyAccountResponseSchema.parse({ data: await options.service.refillDummy(principal, key(request)) });
  });

  app.delete(`${API_PREFIX}/admin/dummy-accounts/:key`, { preHandler }, async (request) => {
    const principal = admin(request);
    return DummyAccountResponseSchema.parse({ data: await options.service.deleteDummy(principal, key(request)) });
  });

  app.post(`${API_PREFIX}/admin/dummy-accounts/:key/impersonation`, { preHandler }, async (request, reply) => {
    const principal = admin(request);
    await options.service.startImpersonation(principal, key(request));
    return reply.code(204).send();
  });

  app.delete(`${API_PREFIX}/admin/impersonation`, { preHandler }, async (request, reply) => {
    await options.service.endImpersonation(admin(request));
    return reply.code(204).send();
  });
}
