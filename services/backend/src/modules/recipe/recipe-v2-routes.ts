import { API_PREFIX, RecipeV2EditSchema, RecipeV2ReorderSchema } from "@expresso/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { HttpStatusError, requireAuth } from "../../api/plugins/auth-context.js";
import type { RecipeV2Service } from "./recipe-v2-service.js";
import { RecipeError } from "./public.js";

/**
 * 02 레시피 v2 경로.
 *
 * 기획서 §11.3 은 이 자리를 `/v1/recipes/:id` 로 그렸지만 그 주소는 v1 레시피가
 * 이미 쓰고 있다. 두 판이 나란히 사는 동안 v2 는 `/v1/recipe-v2/:id` 를 쓴다.
 */

const IdParamsSchema = z.strictObject({ id: z.uuid() });

function fail(error: unknown): never {
  if (error instanceof RecipeError) throw new HttpStatusError(error.statusCode, error.message);
  throw error;
}

export function registerRecipeV2Routes(
  app: FastifyInstance,
  options: { service: RecipeV2Service; authenticateRequest: preHandlerHookHandler },
): void {
  const preHandler = options.authenticateRequest;

  // 없으면 만들고, v1 초안이 있으면 데려와 돌려준다. 02 화면이 열릴 때 부른다.
  app.post(`${API_PREFIX}/brews/:id/recipe-v2`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid brew ID");
    try {
      return { data: await options.service.open(principal.user.id, params.data.id) };
    } catch (error) { fail(error); }
  });

  app.get(`${API_PREFIX}/recipe-v2/:id`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpStatusError(400, "invalid recipe ID");
    try {
      return { data: await options.service.get(principal.user.id, params.data.id) };
    } catch (error) { fail(error); }
  });

  app.patch(`${API_PREFIX}/recipe-v2/:id`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    const edit = RecipeV2EditSchema.safeParse(request.body);
    if (!params.success || !edit.success) throw new HttpStatusError(400, "invalid recipe edit");
    try {
      return { data: await options.service.edit(principal.user.id, params.data.id, edit.data) };
    } catch (error) { fail(error); }
  });

  app.post(`${API_PREFIX}/recipe-v2/:id/reorder`, { preHandler }, async (request) => {
    const principal = requireAuth(request);
    const params = IdParamsSchema.safeParse(request.params);
    const input = RecipeV2ReorderSchema.safeParse(request.body);
    if (!params.success || !input.success) throw new HttpStatusError(400, "invalid recipe reorder");
    try {
      return { data: await options.service.reorder(principal.user.id, params.data.id, input.data) };
    } catch (error) { fail(error); }
  });
}
