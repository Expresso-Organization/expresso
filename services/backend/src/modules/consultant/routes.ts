import { API_PREFIX, ConsultantMemoryResponseSchema, SetConsultantStageSchema, UuidSchema, type ConversationDigest } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { ConsultantApi } from "./index.js";

const IdParams = z.strictObject({ id: UuidSchema });

/**
 * 「내 진행」 화면이 읽고 고치는 컨설턴트의 기억.
 *
 * 지난 대화의 요지는 대화를 가진 모듈이 만든다. 여기서는 배선에서 넘겨받은 `digests`로 읽기만 한다.
 */
export function registerConsultantRoutes(app: FastifyInstance, options: {
  service: Pick<ConsultantApi, "profile" | "setStage" | "removePreference">;
  digests(userId: string): Promise<ConversationDigest[]>;
  authenticateRequest: preHandlerHookHandler;
}) {
  const guard = { preHandler: options.authenticateRequest };
  const memory = async (userId: string) => ConsultantMemoryResponseSchema.parse({ data: { ...(await options.service.profile(userId)), recentConversations: await options.digests(userId) } });
  app.get(`${API_PREFIX}/consultant/memory`, guard, async (request) => memory(requireAuth(request).user.id));
  app.put(`${API_PREFIX}/consultant/stage`, guard, async (request) => {
    const input = SetConsultantStageSchema.safeParse(request.body);
    if (!input.success) throw new HttpStatusError(400, "invalid stage");
    const userId = requireAuth(request).user.id;
    await options.service.setStage(userId, input.data.stage, "user");
    return memory(userId);
  });
  app.delete(`${API_PREFIX}/consultant/preferences/:id`, guard, async (request) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid preference id");
    const userId = requireAuth(request).user.id;
    await options.service.removePreference(userId, params.data.id);
    return memory(userId);
  });
}
