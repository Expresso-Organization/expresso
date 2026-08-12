import type { FastifyRequest, preHandlerHookHandler } from "fastify";

import type { IdentityPrincipal } from "../../modules/identity/service.js";
import { parseBearerAuthorization } from "../../modules/identity/token.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: IdentityPrincipal | null;
  }
}

export interface AccessTokenVerifier {
  verifyAccessToken(accessToken: string): Promise<IdentityPrincipal | null>;
}

export class HttpStatusError extends Error {
  readonly statusCode: number;
  readonly publicDetails: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    message: string,
    publicDetails?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpStatusError";
    this.statusCode = statusCode;
    this.publicDetails = publicDetails;
  }
}

export function createAuthenticateRequest(
  verifier: AccessTokenVerifier,
): preHandlerHookHandler {
  return async (request) => {
    const accessToken = parseBearerAuthorization(request.headers.authorization);
    if (!accessToken) throw new HttpStatusError(401, "missing bearer token");

    const principal = await verifier.verifyAccessToken(accessToken);
    if (!principal) throw new HttpStatusError(401, "invalid bearer token");
    request.auth = principal;
  };
}

export function requireAuth(request: FastifyRequest): IdentityPrincipal {
  if (!request.auth) throw new HttpStatusError(401, "authentication required");
  return request.auth;
}
