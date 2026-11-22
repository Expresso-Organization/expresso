import { API_PREFIX, UuidSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import {
  HttpStatusError,
  requireAuth,
} from "../../api/plugins/auth-context.js";
import type { MatchModelService } from "./service.js";

export function registerMatchModelRoutes(
  app: FastifyInstance,
  service: MatchModelService,
  preHandler: preHandlerHookHandler,
) {
  const input = z.strictObject({ external: z.boolean().default(false) });
  const external = (body: unknown) => {
    const parsed = input.safeParse(body ?? {});
    if (!parsed.success)
      throw new HttpStatusError(400, "invalid model options");
    return parsed.data.external;
  };
  app.get(
    API_PREFIX + "/jobs/model/status",
    { preHandler },
    async (request) => {
      requireAuth(request);
      return service.access();
    },
  );
  app.post(
    API_PREFIX + "/jobs/model/recommendations",
    { preHandler },
    async (request) =>
      service.view(requireAuth(request).user.id, external(request.body)),
  );
  app.post(
    API_PREFIX + "/jobs/postings/:id/model-evidence",
    { preHandler },
    async (request) => {
      const id = z.object({ id: UuidSchema }).safeParse(request.params);
      if (!id.success) throw new HttpStatusError(400, "invalid job id");
      return service.view(
        requireAuth(request).user.id,
        external(request.body),
        id.data.id,
      );
    },
  );
}
