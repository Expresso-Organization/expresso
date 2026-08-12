import { API_PREFIX, BrewJobResponseSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { BrewJobError, type BrewJobService } from "./service.js";

const ParamsSchema = z.strictObject({ id: z.uuid() });

/** 01b · 02b가 진행 상태를 읽는 자리. */
export function registerBrewJobRoutes(
  app: FastifyInstance,
  options: { service: BrewJobService; authenticateRequest: preHandlerHookHandler },
): void {
  app.get(`${API_PREFIX}/brew-jobs/:id`, { preHandler: options.authenticateRequest },
    async (request) => {
      const principal = requireAuth(request);
      const params = ParamsSchema.safeParse(request.params);
      if (!params.success) throw new HttpStatusError(400, "invalid brew job ID");
      try {
        return BrewJobResponseSchema.parse({
          data: await options.service.getStatus(principal.user.id, params.data.id),
        });
      } catch (error) {
        if (error instanceof BrewJobError) throw new HttpStatusError(error.statusCode, error.message);
        throw error;
      }
    });
}
