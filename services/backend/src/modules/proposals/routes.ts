import { API_PREFIX, UuidSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { ProposalApi } from "./index.js";

const IdParams = z.strictObject({ id: UuidSchema });

export function registerProposalRoutes(app: FastifyInstance, options: { service: Pick<ProposalApi, "feed" | "enable" | "disable" | "refresh" | "dismiss">; authenticateRequest: preHandlerHookHandler }) {
  const guard = { preHandler: options.authenticateRequest };
  app.get(`${API_PREFIX}/proposals`, guard, async (request) => ({ data: await options.service.feed(requireAuth(request).user.id) }));
  app.post(`${API_PREFIX}/proposals/enable`, guard, async (request) => ({ data: await options.service.enable(requireAuth(request).user.id) }));
  app.post(`${API_PREFIX}/proposals/disable`, guard, async (request) => ({ data: await options.service.disable(requireAuth(request).user.id) }));
  app.post(`${API_PREFIX}/proposals/refresh`, guard, async (request) => ({ data: await options.service.refresh(requireAuth(request).user.id) }));
  app.post(`${API_PREFIX}/proposals/:id/dismiss`, guard, async (request) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid proposal id");
    return { data: await options.service.dismiss(requireAuth(request).user.id, params.data.id) };
  });
}
