import { API_PREFIX } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { type TemplateApi } from "./index.js";

const ParamsSchema = z.strictObject({ id: z.uuid() });
const QuerySchema = z.strictObject({
  useCompanyColors: z.enum(["true", "false"]).optional().default("false"),
});

export function registerTemplateRoutes(
  app: FastifyInstance,
  options: { templateService: TemplateApi; authenticateRequest: preHandlerHookHandler },
) {
  app.get(`${API_PREFIX}/recipes/:id/template-previews`, { preHandler: options.authenticateRequest }, async (request) => {
    const principal = requireAuth(request);
    const params = ParamsSchema.safeParse(request.params);
    const query = QuerySchema.safeParse(request.query);
    if (!params.success || !query.success) throw new HttpStatusError(400, "invalid template preview request");
    return { data: await options.templateService.previews(principal.user.id, params.data.id, query.data.useCompanyColors === "true") };
  });
}
