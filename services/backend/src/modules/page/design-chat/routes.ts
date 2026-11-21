import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { z } from "zod";
import { API_PREFIX, DesignChatQuerySchema, OpenDesignChatSchema, RetryDesignChatSchema, SelectDesignSnippetSchema, SendDesignMessageSchema, UuidSchema } from "@expresso/contracts";

import { HttpStatusError, requireAuth } from "../../../api/plugins/auth-context.js";
import { DesignChatError, type DesignChatService } from "./service.js";

/**
 * 디자인을 정하는 대화의 라우트. 제작(brew) 아래에 둔다.
 *
 * 답을 만드는 요청(`open` · `messages` · `retry`)은 202로 바로 돌아간다. 화면은 `GET`을 `since=<판>`으로 다시 불러
 * 진행을 읽는다. AI가 꺼진 서버에서는 모든 요청이 503이고, 화면은 그것을 보고 기존 카탈로그 화면을 연다.
 */
export function registerDesignChatRoutes(app: FastifyInstance, options: { service: DesignChatService | null; authenticateRequest: preHandlerHookHandler }): void {
  const base = `${API_PREFIX}/brews/:id/design-chat`;
  const route = { preHandler: options.authenticateRequest };
  /** 계약에 맞지 않는 입력은 400이다. 그대로 던지면 오류 처리기가 500으로 답한다. */
  const read = <Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new HttpStatusError(400, "invalid design chat request");
    return parsed.data;
  };
  const brewId = (params: unknown) => read(UuidSchema, (params as { id?: string }).id);
  const service = () => {
    if (!options.service) throw new HttpStatusError(503, "design chat AI is off", undefined, "디자인 대화를 쓸 수 없는 서버입니다.");
    return options.service;
  };
  const lift = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof DesignChatError) throw new HttpStatusError(error.statusCode, error.message, undefined, error.publicMessage);
      throw error;
    }
  };

  app.get(base, route, async (request) => {
    const { since } = read(DesignChatQuerySchema, request.query);
    return { data: await lift(() => service().get(requireAuth(request).user.id, brewId(request.params), since)) };
  });
  app.post(`${base}/open`, route, async (request, reply) => {
    const { requestId } = read(OpenDesignChatSchema, request.body);
    return reply.code(202).send({ data: await lift(() => service().open(requireAuth(request).user.id, brewId(request.params), requestId)) });
  });
  app.post(`${base}/messages`, route, async (request, reply) => {
    const input = read(SendDesignMessageSchema, request.body);
    return reply.code(202).send({ data: await lift(() => service().send(requireAuth(request).user.id, brewId(request.params), input)) });
  });
  app.post(`${base}/retry`, route, async (request, reply) => {
    const { requestId } = read(RetryDesignChatSchema, request.body);
    return reply.code(202).send({ data: await lift(() => service().retry(requireAuth(request).user.id, brewId(request.params), requestId)) });
  });
  app.post(`${base}/selection`, route, async (request) => {
    const { snippetId } = read(SelectDesignSnippetSchema, request.body);
    return { data: await lift(() => service().select(requireAuth(request).user.id, brewId(request.params), snippetId)) };
  });

  // 서버가 내려갈 때 돌리던 답을 끊긴 것으로 적는다. DB 연결이 닫히기 전에 해야 한다.
  if (options.service) app.addHook("preClose", async () => options.service?.close());
}
