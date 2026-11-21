import { API_PREFIX, PortfolioIdParamsSchema, PortfolioTrashListResponseSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { PortfolioTrashService } from "./trash.js";

export interface RegisterPortfolioTrashRoutesOptions {
  service: Pick<PortfolioTrashService, "trash" | "restore" | "list">;
  authenticateRequest: preHandlerHookHandler;
}

/** 포트폴리오 휴지통. 옮기기 · 되살리기는 본문 없이 204다. */
export function registerPortfolioTrashRoutes(app: FastifyInstance, options: RegisterPortfolioTrashRoutesOptions): void {
  const preHandler = options.authenticateRequest;
  const portfolioId = (params: unknown) => {
    const parsed = PortfolioIdParamsSchema.safeParse(params);
    if (!parsed.success) throw new HttpStatusError(400, "invalid route parameters");
    return parsed.data.id;
  };

  app.get(`${API_PREFIX}/portfolios/trash`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    return PortfolioTrashListResponseSchema.parse(await options.service.list(principal.user.id));
  });

  app.delete(`${API_PREFIX}/portfolios/:id`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    await options.service.trash(principal.user.id, portfolioId(request.params));
    return reply.code(204).send();
  });

  app.post(`${API_PREFIX}/portfolios/trash/:id/restore`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    await options.service.restore(principal.user.id, portfolioId(request.params));
    return reply.code(204).send();
  });
}
