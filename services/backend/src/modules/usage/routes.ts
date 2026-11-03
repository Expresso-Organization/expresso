import { API_PREFIX, MonthlyUsageResponseSchema, PlanListResponseSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { UsageSubjectNotFoundError, type UsageApi } from "./index.js";

export interface RegisterUsageRoutesOptions {
  usageService: UsageApi;
  authenticateRequest: preHandlerHookHandler;
}

export function registerUsageRoutes(app: FastifyInstance, options: RegisterUsageRoutesOptions): void {
  app.get(`${API_PREFIX}/me/usage`, { preHandler: options.authenticateRequest }, async (request) => {
    const principal = requireAuth(request);
    try {
      return MonthlyUsageResponseSchema.parse({ data: await options.usageService.monthly(principal.user.id) });
    } catch (error) {
      if (error instanceof UsageSubjectNotFoundError) throw new HttpStatusError(404, error.message);
      throw error;
    }
  });

  app.get(`${API_PREFIX}/plans`, { preHandler: options.authenticateRequest }, async () =>
    PlanListResponseSchema.parse({ data: await options.usageService.plans() }));
}
