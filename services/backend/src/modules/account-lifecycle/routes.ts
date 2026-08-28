import { API_PREFIX, CancelDeletionSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { type AccountLifecycleApi } from "./index.js";

export function registerAccountLifecycleRoutes(app: FastifyInstance, options: { service: AccountLifecycleApi; authenticateRequest: preHandlerHookHandler }) {
  app.get(`${API_PREFIX}/account/export`, { preHandler: options.authenticateRequest }, async (request) => ({ data: await options.service.exportData(requireAuth(request).user.id) }));
  app.post(`${API_PREFIX}/account/deletion`, { preHandler: options.authenticateRequest }, async (request, reply) => reply.code(202).send({ data: await options.service.requestDeletion(requireAuth(request).user.id) }));
  app.post(`${API_PREFIX}/account/deletion/cancel`, async (request) => {
    const body = CancelDeletionSchema.safeParse(request.body);
    if (!body.success) throw new HttpStatusError(400, "invalid deletion cancellation token");
    return { data: await options.service.cancelDeletion(body.data.cancellationToken) };
  });
}

