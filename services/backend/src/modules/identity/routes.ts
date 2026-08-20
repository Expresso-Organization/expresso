import {
  API_PREFIX,
  AuthSessionResponseSchema,
  CurrentUserResponseSchema,
  GoogleLinkSchema,
  GoogleSignInSchema,
  IdentitySessionIdParamsSchema,
  LoginSchema,
  SignupSchema,
  SocialAuthSessionResponseSchema,
} from "@expresso/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  createAuthenticateRequest,
  HttpStatusError,
  requireAuth,
} from "../../api/plugins/auth-context.js";
import type { GoogleIdentity, GoogleIdTokenVerifier } from "./google.js";
import {
  GoogleIdTokenError,
  GoogleSignInUnavailableError,
  UnavailableGoogleIdTokenVerifier,
} from "./google.js";
import type { IdentityService } from "./service.js";

export interface RegisterIdentityRoutesOptions {
  identityService: IdentityService;
  /** 없으면 Google 경로는 503으로 답한다. 검증 없이 통과하는 길은 만들지 않는다. */
  googleIdTokenVerifier?: GoogleIdTokenVerifier;
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
  const googleIdTokenVerifier =
    options.googleIdTokenVerifier ?? new UnavailableGoogleIdTokenVerifier();

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

  /**
   * 소셜 로그인. 웹이 인가 코드와 바꿔 온 Google ID 토큰을 받는다.
   *
   * 왜 토큰만 받고 코드는 안 받나 — 코드 교환에는 client secret이 필요하고,
   * 그건 웹 한 곳에만 둔다. 여기는 "이 토큰이 진짜 Google이 우리 앱에 발급한
   * 것인가"만 판단하면 된다. 그래서 나중에 다른 클라이언트(모바일)가 붙어도
   * 같은 문 하나를 쓴다.
   */
  async function readGoogleIdentity(
    request: FastifyRequest,
    input: { idToken: string; nonce: string },
  ): Promise<GoogleIdentity> {
    try {
      return await googleIdTokenVerifier.verify(input.idToken, input.nonce);
    } catch (error) {
      if (error instanceof GoogleSignInUnavailableError) {
        throw new HttpStatusError(503, "google sign-in is not configured");
      }
      if (error instanceof GoogleIdTokenError) {
        // 거절 사유는 로그에만 남긴다. 어디서 걸렸는지 알려 주면 위조를 도와준다.
        request.log.warn({ reason: error.reason }, "google id token rejected");
        throw new HttpStatusError(401, "google sign-in failed");
      }
      throw error;
    }
  }

  app.post(`${API_PREFIX}/auth/google`, async (request) => {
    const input = parseBody(GoogleSignInSchema, request);
    const identity = await readGoogleIdentity(request, input);
    return SocialAuthSessionResponseSchema.parse({
      data: await options.identityService.signInWithGoogle(identity),
    });
  });

  app.post(`${API_PREFIX}/auth/google/link`, async (request) => {
    const input = parseBody(GoogleLinkSchema, request);
    const identity = await readGoogleIdentity(request, input);
    return SocialAuthSessionResponseSchema.parse({
      data: await options.identityService.linkGoogle(identity, input.password),
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
