import {
  API_PREFIX,
  GrantConsentSchema,
  RevokeConsentParamsSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { ConsentPolicyMismatch, type ConsentService } from "./service.js";

/** 10d 온보딩에서 묻고, 09 설정에서 끈다. */
export function registerConsentRoutes(
  app: FastifyInstance,
  options: { service: ConsentService; authenticateRequest: preHandlerHookHandler },
): void {
  const preHandler = options.authenticateRequest;

  app.get(`${API_PREFIX}/consents`, { preHandler }, async (request) =>
    options.service.list(requireAuth(request).user.id));

  app.post(`${API_PREFIX}/consents`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const body = GrantConsentSchema.safeParse(request.body);
    if (!body.success) throw new HttpStatusError(400, "invalid consent grant");
    try {
      return await options.service.grant(
        principal.user.id, body.data.scopes, body.data.policyVersion,
      );
    } catch (error) {
      if (error instanceof ConsentPolicyMismatch) {
        throw new HttpStatusError(error.statusCode, error.message);
      }
      throw error;
    }
  });

  app.delete(`${API_PREFIX}/consents/:scope`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = RevokeConsentParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid consent scope");
    return options.service.revoke(principal.user.id, params.data.scope);
  });
}
