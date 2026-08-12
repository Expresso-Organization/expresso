import {
  API_PREFIX,
  AuthSessionResponseSchema,
  CurrentUserResponseSchema,
  IdentitySessionIdParamsSchema,
  LoginSchema,
  SignupSchema,
} from "@expresso/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  createAuthenticateRequest,
  HttpStatusError,
  requireAuth,
} from "../../api/plugins/auth-context.js";
import type { IdentityService } from "./service.js";

export interface RegisterIdentityRoutesOptions {
  identityService: IdentityService;
}

function parseBody<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  request: FastifyRequest,
): T {
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) throw new HttpStatusError(400, "invalid request body");
  return parsed.data;
}

export function registerIdentityRoutes(
  app: FastifyInstance,
  options: RegisterIdentityRoutesOptions,
): void {
  app.decorateRequest("auth", null);
  const authenticateRequest = createAuthenticateRequest(options.identityService);

  app.post(`${API_PREFIX}/auth/signup`, async (request, reply) => {
    const input = parseBody(SignupSchema, request);
    const result = await options.identityService.signup(input);
    return reply.code(201).send(AuthSessionResponseSchema.parse({ data: result }));
  });

  app.post(`${API_PREFIX}/auth/login`, async (request) => {
    const input = parseBody(LoginSchema, request);
    return AuthSessionResponseSchema.parse({
      data: await options.identityService.login(input),
    });
  });

  app.post(
    `${API_PREFIX}/auth/logout`,
    { preHandler: authenticateRequest },
    async (request, reply) => {
      const principal = requireAuth(request);
      await options.identityService.revokeOwnedSession(
        principal.user.id,
        principal.sessionId,
      );
      return reply.code(204).send();
    },
  );

  app.get(
    `${API_PREFIX}/me`,
    { preHandler: authenticateRequest },
    async (request) => {
      const principal = requireAuth(request);
      return CurrentUserResponseSchema.parse({ data: principal.user });
    },
  );

  app.delete(
    `${API_PREFIX}/identity/sessions/:sessionId`,
    { preHandler: authenticateRequest },
    async (request, reply) => {
      const parsed = IdentitySessionIdParamsSchema.safeParse(request.params);
      if (!parsed.success) throw new HttpStatusError(400, "invalid session ID");

      const principal = requireAuth(request);
      const revoked = await options.identityService.revokeOwnedSession(
        principal.user.id,
        parsed.data.sessionId,
      );
      if (!revoked) throw new HttpStatusError(404, "session not found");
      return reply.code(204).send();
    },
  );
}
