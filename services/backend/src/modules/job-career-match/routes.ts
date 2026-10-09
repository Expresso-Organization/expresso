import {
  API_PREFIX,
  AnalyzeJobCareerMatchSchema,
  AnalyzeJobCareerMatchResponseSchema,
  GetJobCareerMatchResponseSchema,
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
import type { JobCareerMatchApi } from "./index.js";

const ParamsSchema = z.strictObject({
  sessionId: z.uuid(),
});

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new HttpStatusError(
      400,
      "invalid career match request",
    );
  }

  return parsed.data;
}

export function registerJobCareerMatchRoutes(
  app: FastifyInstance,
  options: {
    jobCareerMatchService: JobCareerMatchApi;
    authenticateRequest: preHandlerHookHandler;
  },
): void {
  const path =
    `${API_PREFIX}/job-chat/sessions/:sessionId/career-match`;

  const routeOptions = {
    preHandler: options.authenticateRequest,
    bodyLimit: 16 * 1024,
  };

  // 마지막으로 완료된 분석 결과 조회
  app.get(path, routeOptions, async (request) => {
    const principal = requireAuth(request);
    const params = validate(ParamsSchema, request.params);

    const result =
      await options.jobCareerMatchService.getLatest(
        principal.user.id,
        params.sessionId,
      );

    return GetJobCareerMatchResponseSchema.parse({
      data: result,
    });
  });

  // 분석 실행 또는 같은 요청 재시도
  app.post(path, routeOptions, async (request) => {
    const principal = requireAuth(request);
    const params = validate(ParamsSchema, request.params);
    const input = validate(
      AnalyzeJobCareerMatchSchema,
      request.body,
    );

    const result =
      await options.jobCareerMatchService.analyze(
        principal.user.id,
        params.sessionId,
        input,
      );

    return AnalyzeJobCareerMatchResponseSchema.parse({
      data: result,
    });
  });
}