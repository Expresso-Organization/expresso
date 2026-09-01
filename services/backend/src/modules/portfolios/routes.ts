import {
  API_PREFIX,
  ListPortfolioRevisionsQuerySchema,
  ListPortfoliosQuerySchema,
  PortfolioDetailResponseSchema,
  PortfolioIdParamsSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { type PortfolioReadApi } from "./index.js";

export interface RegisterPortfolioRoutesOptions {
  service: PortfolioReadApi;
  authenticateRequest: preHandlerHookHandler;
}

export function registerPortfolioRoutes(
  app: FastifyInstance,
  options: RegisterPortfolioRoutesOptions,
): void {
  const preHandler = options.authenticateRequest;

  app.get(`${API_PREFIX}/portfolios`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const query = ListPortfoliosQuerySchema.safeParse(request.query);
    if (!query.success) throw new HttpStatusError(400, "invalid query parameters");
    return options.service.list(principal.user.id, query.data);
  });

  app.get(
    `${API_PREFIX}/portfolios/:id`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
      const params = PortfolioIdParamsSchema.safeParse(request.params);
      if (!params.success) throw new HttpStatusError(400, "invalid route parameters");
      return PortfolioDetailResponseSchema.parse({
        data: await options.service.get(principal.user.id, params.data.id),
      });
    },
  );

  app.get(
    `${API_PREFIX}/portfolios/:id/revisions`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
      const params = PortfolioIdParamsSchema.safeParse(request.params);
      if (!params.success) throw new HttpStatusError(400, "invalid route parameters");
      const query = ListPortfolioRevisionsQuerySchema.safeParse(request.query);
      if (!query.success) throw new HttpStatusError(400, "invalid query parameters");
      return options.service.revisions(
        principal.user.id,
        params.data.id,
        query.data,
      );
    },
  );
}
