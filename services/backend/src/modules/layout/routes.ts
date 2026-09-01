import {
  API_PREFIX,
  LayoutSelectionParamsSchema,
  PortfolioIdParamsSchema,
  RemixLayoutSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { LayoutError, type LayoutApi } from "./index.js";

export interface RegisterLayoutRoutesOptions {
  service: LayoutApi;
  authenticateRequest: preHandlerHookHandler;
}

/** 03 지면 고르기. 후보를 읽고, 하나를 붙인다. */
export function registerLayoutRoutes(
  app: FastifyInstance,
  options: RegisterLayoutRoutesOptions,
): void {
  const preHandler = options.authenticateRequest;

  app.get(`${API_PREFIX}/portfolios/:id/layouts`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = PortfolioIdParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid route parameters");
    return lift(() => options.service.candidates(principal.user.id, params.data.id));
  });

  // §8.3 지면 변형. `:layoutId` 자리와 겹치지 않게 먼저 건다.
  app.post(`${API_PREFIX}/portfolios/:id/layouts/remix`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = PortfolioIdParamsSchema.safeParse(request.params);
    const body = RemixLayoutSchema.safeParse(request.body);
    if (!params.success) throw new HttpStatusError(400, "invalid route parameters");
    if (!body.success) throw new HttpStatusError(400, "invalid remix instruction");
    return lift(() =>
      options.service.remix(principal.user.id, params.data.id, body.data.instruction));
  });

  app.post(
    `${API_PREFIX}/portfolios/:id/layouts/:layoutId/select`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
      const params = LayoutSelectionParamsSchema.safeParse(request.params);
      if (!params.success) throw new HttpStatusError(400, "invalid route parameters");
      return lift(() =>
        options.service.select(principal.user.id, params.data.id, params.data.layoutId));
    },
  );
}

/** 서비스의 상태 코드를 HTTP로 올린다. */
async function lift<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof LayoutError) throw new HttpStatusError(error.statusCode, error.message);
    throw error;
  }
}
