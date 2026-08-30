import { API_PREFIX, SaveDesignSelectionSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import {
  HttpStatusError,
  requireAuth,
} from "../../api/plugins/auth-context.js";
import { DesignSystemError, DesignSystemService } from "./service.js";

export function registerDesignSystemRoutes(
  app: FastifyInstance,
  options: {
    service: DesignSystemService;
    authenticateRequest: preHandlerHookHandler;
  },
) {
  const preHandler = options.authenticateRequest;
  app.get(`${API_PREFIX}/design-systems`, { preHandler }, async () => ({
    data: { items: options.service.list() },
  }));
  app.get(
    `${API_PREFIX}/design-systems/:id`,
    { preHandler },
    async (request) => {
      const params = z.strictObject({ id: z.uuid() }).safeParse(request.params);
      if (!params.success)
        throw new HttpStatusError(400, "invalid design system ID");
      try {
        return { data: options.service.get(params.data.id) };
      } catch (error) {
        if (error instanceof DesignSystemError)
          throw new HttpStatusError(error.statusCode, error.message);
        throw error;
      }
    },
  );
  app.get(
    `${API_PREFIX}/design-system-revisions/:id`,
    { preHandler },
    async (request) => {
      const params = z.strictObject({ id: z.uuid() }).safeParse(request.params);
      if (!params.success)
        throw new HttpStatusError(400, "invalid revision ID");
      try {
        return { data: options.service.getRevision(params.data.id) };
      } catch (error) {
        if (error instanceof DesignSystemError)
          throw new HttpStatusError(error.statusCode, error.message);
        throw error;
      }
    },
  );
  app.post(
    `${API_PREFIX}/brews/:id/design-selection`,
    { preHandler },
    async (request) => {
      const principal = requireAuth(request);
      const params = z.strictObject({ id: z.uuid() }).safeParse(request.params);
      const input = SaveDesignSelectionSchema.safeParse(request.body);
      if (!params.success || !input.success)
        throw new HttpStatusError(400, "invalid design selection");
      try {
        return {
          data: await options.service.selectForBrew(
            principal.user.id,
            params.data.id,
            input.data,
          ),
        };
      } catch (error) {
        if (error instanceof DesignSystemError)
          throw new HttpStatusError(error.statusCode, error.message);
        throw error;
      }
    },
  );
}
