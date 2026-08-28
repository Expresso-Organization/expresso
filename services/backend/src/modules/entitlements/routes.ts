import {
  API_PREFIX,
  EntitlementCapabilityParamsSchema,
  EntitlementDecisionResponseSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import {
  HttpStatusError,
  requireAuth,
} from "../../api/plugins/auth-context.js";
import { type EntitlementApi } from "./index.js";

export interface RegisterEntitlementRoutesOptions {
  entitlementService: EntitlementApi;
  authenticateRequest: preHandlerHookHandler;
}

export function registerEntitlementRoutes(
  app: FastifyInstance,
  options: RegisterEntitlementRoutesOptions,
): void {
  app.get(
    `${API_PREFIX}/entitlements/:capability`,
    { preHandler: options.authenticateRequest },
    async (request) => {
      const parsed = EntitlementCapabilityParamsSchema.safeParse(request.params);
      if (!parsed.success) throw new HttpStatusError(400, "invalid capability");
      const principal = requireAuth(request);
      const decision = await options.entitlementService.check(
        principal.user.id,
        parsed.data.capability,
      );
      return EntitlementDecisionResponseSchema.parse({ data: decision });
    },
  );
}
