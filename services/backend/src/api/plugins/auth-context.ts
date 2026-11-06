import type { FastifyRequest, preHandlerHookHandler } from "fastify";

import { type IdentityPrincipal } from "../../modules/identity/index.js";
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
  /** 사용자에게 그대로 보여 줄 문장. 없으면 오류 처리기가 상태 코드의 공통 문구를 쓴다. */
  readonly publicMessage: string | undefined;

  constructor(
    statusCode: number,
    message: string,
    publicDetails?: Record<string, unknown>,
    publicMessage?: string,
  ) {
    super(message);
    this.name = "HttpStatusError";
    this.statusCode = statusCode;
    this.publicDetails = publicDetails;
    this.publicMessage = publicMessage;
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
