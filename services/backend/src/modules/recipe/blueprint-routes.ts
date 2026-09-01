import { API_PREFIX, BlueprintEditSchema, BlueprintReorderSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { BlueprintService } from "./blueprint-service.js";
import { RecipeError } from "./public.js";

/**
 * 02 레시피 — Recipe v2 블루프린트 경로.
 *
 * 기획서 §11.3 은 이 자리를 `/v1/recipes/:id` 로 그렸지만 그 주소는 v1 레시피가
 * 이미 쓰고 있다. 두 판이 나란히 사는 동안 v2 는 `/v1/blueprints/:id` 를 쓴다.
 */

const IdParamsSchema = z.strictObject({ id: z.uuid() });

function fail(error: unknown): never {
  if (error instanceof RecipeError) throw new HttpStatusError(error.statusCode, error.message);
  throw error;
}

export function registerBlueprintRoutes(
  app: FastifyInstance,
  options: { service: BlueprintService; authenticateRequest: preHandlerHookHandler },
): void {
  const preHandler = options.authenticateRequest;

  // 없으면 만들고 돌려준다. 02 화면이 열릴 때 한 번 부른다.
  app.post(`${API_PREFIX}/brews/:id/blueprint`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid brew ID");
    try {
      return { data: await options.service.open(principal.user.id, params.data.id) };
    } catch (error) { fail(error); }
  });

  app.get(`${API_PREFIX}/blueprints/:id`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid blueprint ID");
    try {
      return { data: await options.service.get(principal.user.id, params.data.id) };
    } catch (error) { fail(error); }
  });

  app.patch(`${API_PREFIX}/blueprints/:id`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    const edit = BlueprintEditSchema.safeParse(request.body);
    if (!params.success || !edit.success) throw new HttpStatusError(400, "invalid blueprint edit");
    try {
      return { data: await options.service.edit(principal.user.id, params.data.id, edit.data) };
    } catch (error) { fail(error); }
  });

  app.post(`${API_PREFIX}/blueprints/:id/reorder`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    const input = BlueprintReorderSchema.safeParse(request.body);
    if (!params.success || !input.success) throw new HttpStatusError(400, "invalid blueprint reorder");
    try {
      return { data: await options.service.reorder(principal.user.id, params.data.id, input.data) };
    } catch (error) { fail(error); }
  });
}
