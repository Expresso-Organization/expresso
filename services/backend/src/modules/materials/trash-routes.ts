import { API_PREFIX, BrewTrashListResponseSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { BrewTrashService } from "./trash.js";

const ParamsSchema = z.strictObject({ id: z.uuid() });

export interface RegisterBrewTrashRoutesOptions {
  service: Pick<BrewTrashService, "trash" | "restore" | "list">;
  authenticateRequest: preHandlerHookHandler;
}

/** 만들던 포트폴리오 휴지통. 옮기기 · 되살리기는 본문 없이 204다. 생성 중이면 옮기기가 409다. */
export function registerBrewTrashRoutes(app: FastifyInstance, options: RegisterBrewTrashRoutesOptions): void {
  const preHandler = options.authenticateRequest;
  const brewId = (params: unknown) => {
    const parsed = ParamsSchema.safeParse(params);
    if (!parsed.success) throw new HttpStatusError(400, "invalid route parameters");
    return parsed.data.id;
  };

  app.get(`${API_PREFIX}/brews/trash`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    return BrewTrashListResponseSchema.parse(await options.service.list(principal.user.id));
  });

  app.delete(`${API_PREFIX}/brews/:id`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    await options.service.trash(principal.user.id, brewId(request.params));
    return reply.code(204).send();
  });

  app.post(`${API_PREFIX}/brews/:id/restore`, { preHandler }, async (request, reply) => {
    const principal = requireAuth(request);
    await options.service.restore(principal.user.id, brewId(request.params));
    return reply.code(204).send();
  });
}
