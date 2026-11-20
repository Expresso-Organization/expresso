import { API_PREFIX, ListActivitiesQuerySchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { HttpStatusError } from "../../api/plugins/auth-context.js";
import type { ActivityApi } from "./index.js";

export function registerActivityRoutes(app: FastifyInstance, options: { service: Pick<ActivityApi, "page">; authenticateRequest: preHandlerHookHandler }) {
  app.get(`${API_PREFIX}/activities`, { preHandler: options.authenticateRequest }, async (request) => {
    const query = ListActivitiesQuerySchema.safeParse(request.query);
    if (!query.success) throw new HttpStatusError(400, "invalid activity query");
    const { data, total } = await options.service.page(query.data);
    return { data, summary: { total } };
  });
}
