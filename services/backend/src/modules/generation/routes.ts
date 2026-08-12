import { API_PREFIX, IdempotencyKeySchema, SubmitGenerationSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { GenerationService } from "./service.js";

const ParamsSchema = z.strictObject({ id: z.uuid() });
export function registerGenerationRoutes(app: FastifyInstance, options: { generationService: GenerationService; authenticateRequest: preHandlerHookHandler }) {
  app.post(`${API_PREFIX}/generation-jobs`, { preHandler: options.authenticateRequest }, async (request, reply) => {
    const principal = requireAuth(request);
    const input = SubmitGenerationSchema.safeParse(request.body);
    const key = IdempotencyKeySchema.safeParse(request.headers["idempotency-key"]);
    if (!input.success || !key.success) throw new HttpStatusError(400, "invalid generation request");
    return reply.code(202).send({ data: await options.generationService.submit(principal.user.id, key.data, input.data) });
  });
  app.get(`${API_PREFIX}/generation-jobs/:id`, { preHandler: options.authenticateRequest }, async (request) => {
    const principal = requireAuth(request);
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid generation job ID");
    return { data: await options.generationService.getStatus(principal.user.id, params.data.id) };
  });
}
