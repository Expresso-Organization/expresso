import {
  API_PREFIX,
  IdempotencyKeySchema,
  SaveInterviewAnswerSchema,
} from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { type InterviewApi } from "./index.js";
import { BrewJobError, type BrewJobApi } from "../brew-jobs/index.js";

const IdParamsSchema = z.strictObject({ id: z.uuid() });
const QuestionParamsSchema = z.strictObject({ id: z.uuid(), questionId: z.uuid() });

export interface RegisterInterviewRoutesOptions {
  interviewService: InterviewApi;
  /** 질문 생성은 계약을 부르느라 1분쯤 걸린다. 요청 안에서 돌리지 않는다. */
  brewJobService: BrewJobApi;
  authenticateRequest: preHandlerHookHandler;
}

function idempotencyKey(value: unknown): string {
  const parsed = IdempotencyKeySchema.safeParse(value);
  if (!parsed.success) throw new HttpStatusError(400, "invalid idempotency key");
  return parsed.data;
}

export function registerInterviewRoutes(
  app: FastifyInstance,
  options: RegisterInterviewRoutesOptions,
): void {
  const preHandler = options.authenticateRequest;

  app.post(`${API_PREFIX}/brews/:id/interview-sessions`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid brew ID");
    // 세션은 질문이 다 만들어졌을 때 태어난다. 여기서는 잡만 돌려준다.
    try {
      const job = await options.brewJobService.submit(
        principal.user.id,
        "interview",
        idempotencyKey(request.headers["idempotency-key"]),
        { brewId: params.data.id },
      );
      return reply.code(202).send({ data: job });
    } catch (error) {
      if (error instanceof BrewJobError) throw new HttpStatusError(error.statusCode, error.message);
      throw error;
    }
  });

  app.get(`${API_PREFIX}/interview-sessions/:id`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid session ID");
    return { data: await options.interviewService.getSession(principal.user.id, params.data.id) };
  });

  for (const paused of [true, false]) {
    app.post(
      `${API_PREFIX}/interview-sessions/:id/${paused ? "pause" : "resume"}`,
      { preHandler },
      async (request) => {
        const principal = requireAuth(request);
        const params = IdParamsSchema.safeParse(request.params);
        if (!params.success) throw new HttpStatusError(400, "invalid session ID");
        return {
          data: await options.interviewService.setPaused(
            principal.user.id,
            params.data.id,
            paused,
          ),
        };
      },
    );
  }

  app.post(`${API_PREFIX}/interview-sessions/:id/questions/:questionId/replace`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = QuestionParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid question ID");
    return {
      data: await options.interviewService.replaceQuestion(
        principal.user.id,
        params.data.id,
        params.data.questionId,
      ),
    };
  });

  app.post(`${API_PREFIX}/interview-sessions/:id/questions/:questionId/skip`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = QuestionParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid question ID");
    return {
      data: await options.interviewService.skipQuestion(
        principal.user.id,
        params.data.id,
        params.data.questionId,
      ),
    };
  });

  app.put(`${API_PREFIX}/interview-sessions/:id/answers/:questionId`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = QuestionParamsSchema.safeParse(request.params);
    const input = SaveInterviewAnswerSchema.safeParse(request.body);
    if (!params.success || !input.success) {
      throw new HttpStatusError(400, "invalid interview answer");
    }
    return {
      data: await options.interviewService.saveAnswer(
        principal.user.id,
        params.data.id,
        params.data.questionId,
        idempotencyKey(request.headers["idempotency-key"]),
        input.data,
      ),
    };
  });
}
