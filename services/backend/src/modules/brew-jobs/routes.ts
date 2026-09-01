import { API_PREFIX, BrewJobResponseSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import { writeDraftStream } from "../../platform/draft-stream.js";
import type { RecipeStream } from "../recipe/stream.js";
import { BrewJobError, type BrewJobApi } from "./index.js";

const ParamsSchema = z.strictObject({ id: z.uuid() });

/** 01b · 02b가 진행 상태를 읽는 자리. */
export function registerBrewJobRoutes(
  app: FastifyInstance,
  options: { service: BrewJobApi; recipeStream?: RecipeStream | null; authenticateRequest: preHandlerHookHandler },
): void {
  app.get(`${API_PREFIX}/brew-jobs/:id`, { preHandler: options.authenticateRequest },
    async (request) => {
      const principal = requireAuth(request);
      const params = ParamsSchema.safeParse(request.params);
      if (!params.success) throw new HttpStatusError(400, "invalid brew job ID");
      try {
        return BrewJobResponseSchema.parse({
          data: await options.service.getStatus(principal.user.id, params.data.id),
        });
      } catch (error) {
        if (error instanceof BrewJobError) throw new HttpStatusError(error.statusCode, error.message);
        throw error;
      }
    });

  /**
   * 짜이는 레시피를 따라 읽는 자리.
   *
   * **잡으로 연다.** 02 대기 화면이 열릴 때 존재하는 것은 이 잡뿐이다 — 레시피는
   * 모델이 다 쓴 뒤에야 생기고, 그때는 이미 2분쯤 지나 있다.
   *
   * 소유 확인은 `getStatus`가 한다 — 남의 잡이면 거기서 걸린다.
   */
  app.get(`${API_PREFIX}/brew-jobs/:id/recipe-stream`, { preHandler: options.authenticateRequest },
    async (request, reply) => {
      const principal = requireAuth(request);
      const params = ParamsSchema.safeParse(request.params);
      if (!params.success) throw new HttpStatusError(400, "invalid brew job ID");
      if (!options.recipeStream) throw new HttpStatusError(503, "레시피 스트림이 꺼져 있습니다");
      try {
        await options.service.getStatus(principal.user.id, params.data.id);
      } catch (error) {
        if (error instanceof BrewJobError) throw new HttpStatusError(error.statusCode, error.message);
        throw error;
      }
      await writeDraftStream(request, reply, options.recipeStream, params.data.id);
    });
}
