import { API_PREFIX } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { JobAnalysisService } from "./service.js";

const ParamsSchema = z.strictObject({ id: z.uuid() });

export interface RegisterJobAnalysisRoutesOptions {
  jobAnalysisService: JobAnalysisService;
  authenticateRequest: preHandlerHookHandler;
}

export function registerJobAnalysisRoutes(
  app: FastifyInstance,
  options: RegisterJobAnalysisRoutesOptions,
): void {
  const preHandler = options.authenticateRequest;

  app.get(`${API_PREFIX}/job-analyses/:id`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid analysis ID");
    return {
      data: await options.jobAnalysisService.getResult(
        principal.user.id,
        params.data.id,
      ),
    };
  });

  app.post(`${API_PREFIX}/job-analyses/:id/reanalyze`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid analysis ID");
    return reply.code(202).send({
      data: await options.jobAnalysisService.requestReanalysis(
        principal.user.id,
        params.data.id,
      ),
    });
  });
}
