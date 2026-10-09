import {
  API_PREFIX,
  ApproveChatFactSchema,
  ChatFactListResponseSchema,
  ChatFactResponseSchema,
  CreateChatFactSchema,
} from "@expresso/contracts";

import type {
  FastifyInstance,
  preHandlerHookHandler,
} from "fastify";
import { z } from "zod";

import {
  HttpStatusError,
  requireAuth,
} from "../../api/plugins/auth-context.js";

import type { JobChatFactService } from "./fact-service.js";

const SessionParamsSchema = z.strictObject({
  sessionId: z.uuid(),
});

const FactParamsSchema = z.strictObject({
  sessionId: z.uuid(),
  factId: z.uuid(),
});

function validate<T>(
  schema: z.ZodType<T>,
  value: unknown,
): T {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new HttpStatusError(400, "invalid fact request");
  }

  return parsed.data;
}

export function registerJobChatFactRoutes(
  app: FastifyInstance,
  options: {
    service: JobChatFactService;
    authenticateRequest: preHandlerHookHandler;
  },
) {
  const base =
    `${API_PREFIX}/job-chat/sessions/:sessionId/facts`;

  const routeOptions = {
    preHandler: options.authenticateRequest,
    bodyLimit: 128 * 1024,
  };

  app.get(base, routeOptions, async (request) => {
    const principal = requireAuth(request);
    const params = validate(
      SessionParamsSchema,
      request.params,
    );

    const data = await options.service.list(
      principal.user.id,
      params.sessionId,
    );

    return ChatFactListResponseSchema.parse({ data });
  });

  app.post(base, routeOptions, async (request) => {
    const principal = requireAuth(request);
    const params = validate(
      SessionParamsSchema,
      request.params,
    );
    const input = validate(
      CreateChatFactSchema,
      request.body,
    );

    const data = await options.service.create(
      principal.user.id,
      params.sessionId,
      input,
    );

    return ChatFactResponseSchema.parse({ data });
  });

  app.post(
    `${base}/:factId/approve`,
    routeOptions,
    async (request) => {
      const principal = requireAuth(request);
      const params = validate(
        FactParamsSchema,
        request.params,
      );
      const input = validate(
        ApproveChatFactSchema,
        request.body,
      );

      const data = await options.service.approve(
        principal.user.id,
        params.sessionId,
        params.factId,
        input,
      );

      return ChatFactResponseSchema.parse({ data });
    },
  );

  app.post(
    `${base}/:factId/reject`,
    routeOptions,
    async (request) => {
      const principal = requireAuth(request);
      const params = validate(
        FactParamsSchema,
        request.params,
      );

      const data = await options.service.reject(
        principal.user.id,
        params.sessionId,
        params.factId,
      );

      return ChatFactResponseSchema.parse({ data });
    },
  );
}